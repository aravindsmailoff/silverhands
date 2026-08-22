/**
 * Realtime Location & Service Request WebSocket Hook for SilverHands
 * 
 * Manages:
 * - Persistent bidirectional WebSocket connection to FastAPI location & service gateway
 * - Session authentication handshake (including provider services)
 * - Exponential backoff reconnection
 * - Stable Map reconciliation for nearby providers & consumers
 * - Cross-user service request dispatching, intimation, and responses
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  LocationCoordinates,
  NearbyUserPayload,
  ServiceRequestPayload,
  ClientLocationMessage,
  ServerLocationMessage,
} from '../location-protocol';
import { authService } from '../auth-service';
import { resolveActiveSession } from '@/lib/session-resolver';

export type ConnectionState = 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED' | 'ERROR';

export interface UseRealtimeLocationParams {
  coordinates: LocationCoordinates | null;
  sharingEnabled: boolean;
  radiusMeters: number;
}

export interface UseRealtimeLocationResult {
  connectionState: ConnectionState;
  nearbyUsers: NearbyUserPayload[];
  activeNearbyCount: number;
  lastServerAck: number | null;
  reconnectAttempts: number;
  errorMessage: string | null;
  incomingRequests: ServiceRequestPayload[];
  sentRequests: ServiceRequestPayload[];
  unreadRequestCount: number;
  reconnectNow: () => void;
  sendServiceRequest: (params: {
    providerId: string;
    serviceName: string;
    preferredTime?: string;
    message?: string;
  }) => string;
  respondServiceRequest: (requestId: string, action: 'ACCEPT' | 'REJECT') => void;
  markRequestsRead: () => void;
}

const WS_URL = process.env.NEXT_PUBLIC_LOCATION_WS_URL || 'ws://localhost:8000/ws/location';

export function useRealtimeLocation({
  coordinates,
  sharingEnabled,
  radiusMeters,
}: UseRealtimeLocationParams): UseRealtimeLocationResult {
  const [connectionState, setConnectionState] = useState<ConnectionState>('DISCONNECTED');
  const [nearbyUsersMap, setNearbyUsersMap] = useState<Map<string, NearbyUserPayload>>(new Map());
  const [lastServerAck, setLastServerAck] = useState<number | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Service Requests state
  const [incomingRequests, setIncomingRequests] = useState<ServiceRequestPayload[]>([]);
  const [sentRequests, setSentRequests] = useState<ServiceRequestPayload[]>([]);
  const [unreadRequestCount, setUnreadRequestCount] = useState<number>(0);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const currentRadiusRef = useRef<number>(radiusMeters);
  const currentSharingRef = useRef<boolean>(sharingEnabled);
  
  const initialSession = typeof window !== 'undefined' ? resolveActiveSession() : null;
  const currentUserIdRef = useRef<string>(initialSession?.userId || '');
  const currentUserRoleRef = useRef<'senior' | 'consumer'>(initialSession?.role || 'consumer');
  const currentUserNameRef = useRef<string>(initialSession?.displayName || '');

  currentRadiusRef.current = radiusMeters;
  currentSharingRef.current = sharingEnabled;

  const connect = useCallback(async () => {
    if (typeof window === 'undefined') return;

    if (
      socketRef.current &&
      (socketRef.current.readyState === WebSocket.OPEN || socketRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    setConnectionState('CONNECTING');
    setErrorMessage(null);

    try {
      const ws = new WebSocket(WS_URL);
      socketRef.current = ws;

      ws.onopen = async () => {
        if (!isMountedRef.current) return;
        setConnectionState('CONNECTED');
        setReconnectAttempts(0);
        setErrorMessage(null);

        // 1. Resolve current user identity and role from authoritative session resolver
        const session = resolveActiveSession();
        currentUserIdRef.current = session.userId;
        currentUserRoleRef.current = session.role;
        currentUserNameRef.current = session.displayName;

        const authMsg: ClientLocationMessage = {
          type: 'AUTHENTICATE',
          token: 'tok_authenticated',
          userId: session.userId,
          displayName: session.displayName,
          role: session.role,
          skill: session.skill,
          services: session.services,
        };
        ws.send(JSON.stringify(authMsg));

        // 2. Start heartbeat (every 15s)
        if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'HEARTBEAT', timestamp: Date.now() }));
          }
        }, 15000);
      };

      ws.onmessage = (event) => {
        if (!isMountedRef.current) return;
        try {
          const msg: ServerLocationMessage = JSON.parse(event.data);

          switch (msg.type) {
            case 'AUTH_SUCCESS':
              if (coordinates) {
                const locMsg: ClientLocationMessage = {
                  type: 'LOCATION_UPDATE',
                  coordinates,
                  sharingEnabled: currentSharingRef.current,
                  radiusMeters: currentRadiusRef.current,
                };
                ws.send(JSON.stringify(locMsg));
              }
              break;

            case 'LOCATION_ACK':
              setLastServerAck(msg.serverTimestamp);
              break;

            case 'NEARBY_SNAPSHOT':
              setNearbyUsersMap(() => {
                const nextMap = new Map<string, NearbyUserPayload>();
                for (const u of msg.users) {
                  nextMap.set(u.userId, u);
                }
                return nextMap;
              });
              break;

            case 'USER_JOINED_RADIUS':
            case 'USER_MOVED':
              setNearbyUsersMap((prev) => {
                const nextMap = new Map(prev);
                nextMap.set(msg.user.userId, msg.user);
                return nextMap;
              });
              break;

            case 'USER_LEFT_RADIUS':
              setNearbyUsersMap((prev) => {
                const nextMap = new Map(prev);
                nextMap.delete(msg.userId);
                return nextMap;
              });
              break;

            case 'SERVICE_REQUEST_RECEIVED':
              // Incoming request for provider
              setIncomingRequests((prev) => {
                const filtered = prev.filter((r) => r.id !== msg.request.id);
                return [msg.request, ...filtered];
              });
              setUnreadRequestCount((c) => c + 1);
              break;

            case 'SERVICE_REQUEST_UPDATED':
              // Update status in both incoming and sent requests
              setIncomingRequests((prev) =>
                prev.map((r) => (r.id === msg.request.id ? { ...r, status: msg.request.status } : r))
              );
              setSentRequests((prev) =>
                prev.map((r) => (r.id === msg.request.id ? { ...r, status: msg.request.status } : r))
              );
              break;

            case 'SERVICE_REQUEST_ACK':
              break;

            case 'AUTH_ERROR':
            case 'ERROR':
              setErrorMessage(msg.message);
              break;
          }
        } catch (parseErr) {
          console.warn('[LocationWS] Error parsing message:', parseErr);
        }
      };

      ws.onclose = () => {
        if (!isMountedRef.current) return;
        setConnectionState('DISCONNECTED');
        if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);

        // Exponential backoff reconnect
        setReconnectAttempts((prev) => {
          const nextAttempt = prev + 1;
          const delay = Math.min(1000 * Math.pow(1.5, nextAttempt), 15000);
          if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = setTimeout(() => {
            if (isMountedRef.current) connect();
          }, delay);
          return nextAttempt;
        });
      };

      ws.onerror = (err) => {
        console.warn('[LocationWS] WebSocket error:', err);
        setConnectionState('ERROR');
        setErrorMessage('Unable to establish realtime connection to location gateway.');
      };
    } catch (e: any) {
      setConnectionState('ERROR');
      setErrorMessage(e.message || 'Failed to initialize WebSocket.');
    }
  }, [coordinates]);

  useEffect(() => {
    isMountedRef.current = true;
    connect();

    return () => {
      isMountedRef.current = false;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [connect]);

  // Transmit location updates when coordinates change
  useEffect(() => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN && coordinates) {
      const msg: ClientLocationMessage = {
        type: 'LOCATION_UPDATE',
        coordinates,
        sharingEnabled,
        radiusMeters,
      };
      socketRef.current.send(JSON.stringify(msg));
    }
  }, [coordinates, sharingEnabled, radiusMeters]);

  // Transmit radius changes
  useEffect(() => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'SET_RADIUS', radiusMeters }));
    }
  }, [radiusMeters]);

  // Transmit sharing toggle
  useEffect(() => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'TOGGLE_SHARING', enabled: sharingEnabled }));
    }
  }, [sharingEnabled]);

  // Immediate HTTP fetch for nearby services to guarantee instant discovery
  useEffect(() => {
    const fetchNearbyRest = async () => {
      const lat = coordinates?.latitude || 13.0820;
      const lng = coordinates?.longitude || 80.1843;
      const backendBase = process.env.NEXT_PUBLIC_API_BACKEND_URL || 'http://localhost:8000';
      const excludeId = currentUserIdRef.current || '';
      const viewerRole = currentUserRoleRef.current || 'consumer';

      try {
        const res = await fetch(
          `${backendBase}/api/services/nearby?lat=${lat}&lng=${lng}&radius=${radiusMeters}&excludeUserId=${encodeURIComponent(
            excludeId
          )}&role=${viewerRole}`
        );
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.services)) {
            setNearbyUsersMap((prev) => {
              const nextMap = new Map(prev);
              for (const s of data.services) {
                const uId = s.userId || s.providerId;
                if (!uId || (excludeId && uId === excludeId)) continue; // NEVER show current user

                const isSenior = s.role === 'senior' || !!s.serviceId;
                nextMap.set(uId, {
                  userId: uId,
                  displayName: s.displayName || s.providerName || (isSenior ? 'Senior Provider' : 'Consumer'),
                  role: s.role || (isSenior ? 'senior' : 'consumer'),
                  skill: s.skill || s.serviceName || (isSenior ? 'Traditional Crafts' : 'Learner'),
                  services: s.services || (s.serviceName ? [s.serviceName] : []),
                  serviceId: s.serviceId || `svc_${uId}`,
                  serviceName: s.serviceName || (isSenior ? 'Traditional Service' : 'Looking for nearby services'),
                  category: s.category || 'general',
                  pricing: s.pricing || '',
                  duration: s.duration || '',
                  deliveryType: s.deliveryType || 'HOME_SERVICE',
                  description: s.description || '',
                  availability: s.availability || 'Available Now',
                  locality: s.locality || 'Nearby area',
                  latitude: s.latitude,
                  longitude: s.longitude,
                  accuracy: s.accuracy || 10,
                  distanceMeters: s.distanceMeters || 0,
                  heading: null,
                  speed: null,
                  isLive: s.isLive ?? false,
                  lastUpdated: s.updatedAt || Date.now(),
                });
              }
              return nextMap;
            });
          }
        }
      } catch (err) {
        console.warn('[RealtimeLocation] REST fallback query notice:', err);
      }
    };

    fetchNearbyRest();
  }, [coordinates?.latitude, coordinates?.longitude, radiusMeters]);

  const sendServiceRequest = useCallback(
    ({
      providerId,
      serviceName,
      preferredTime,
      message,
    }: {
      providerId: string;
      serviceName: string;
      preferredTime?: string;
      message?: string;
    }) => {
      const reqId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const cId = currentUserIdRef.current || 'usr_consumer_guest';
      const cName = currentUserNameRef.current || 'Consumer';

      const newReq: ServiceRequestPayload = {
        id: reqId,
        consumerId: cId,
        consumerName: cName,
        providerId,
        serviceName,
        preferredTime,
        message,
        status: 'REQUESTED',
        timestamp: Date.now(),
      };

      setSentRequests((prev) => [newReq, ...prev]);

      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        const msg: ClientLocationMessage = {
          type: 'SERVICE_REQUEST_CREATE',
          requestId: reqId,
          providerId,
          serviceName,
          preferredTime,
          message,
          timestamp: Date.now(),
        };
        socketRef.current.send(JSON.stringify(msg));
      }

      return reqId;
    },
    []
  );

  const respondServiceRequest = useCallback((requestId: string, action: 'ACCEPT' | 'REJECT') => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      const msg: ClientLocationMessage = {
        type: 'SERVICE_REQUEST_RESPOND',
        requestId,
        action,
      };
      socketRef.current.send(JSON.stringify(msg));
    }

    setIncomingRequests((prev) =>
      prev.map((r) => (r.id === requestId ? { ...r, status: action === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED' } : r))
    );
  }, []);

  const markRequestsRead = useCallback(() => {
    setUnreadRequestCount(0);
  }, []);

  const reconnectNow = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.close();
    }
    setReconnectAttempts(0);
    connect();
  }, [connect]);

  const nearbyUsers = Array.from(nearbyUsersMap.values()).sort((a, b) => a.distanceMeters - b.distanceMeters);

  return {
    connectionState,
    nearbyUsers,
    activeNearbyCount: nearbyUsers.length,
    lastServerAck,
    reconnectAttempts,
    errorMessage,
    incomingRequests,
    sentRequests,
    unreadRequestCount,
    reconnectNow,
    sendServiceRequest,
    respondServiceRequest,
    markRequestsRead,
  };
}
