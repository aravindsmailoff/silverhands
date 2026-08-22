/**
 * Typed WebSocket Message Protocol for SilverHands Live Location & Realtime Service Request System
 * 
 * Enforces explicit schemas for bidirectional client-server communication.
 */

export interface LocationCoordinates {
  latitude: number;
  longitude: number;
  accuracy: number; // in meters
  altitude?: number | null;
  heading?: number | null;
  speed?: number | null;
  timestamp: number; // Unix timestamp ms
}

export interface NearbyUserPayload {
  userId: string;
  displayName: string;
  role: 'senior' | 'consumer';
  skill?: string;
  services?: string[];
  serviceId?: string;
  serviceName?: string;
  category?: string;
  pricing?: string;
  duration?: string;
  deliveryType?: string;
  description?: string;
  availability?: string;
  locality?: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  distanceMeters: number;
  heading?: number | null;
  speed?: number | null;
  isLive?: boolean;
  lastUpdated: number;
}

export interface ServiceRequestPayload {
  id: string;
  consumerId: string;
  consumerName: string;
  consumerDistanceMeters?: number;
  providerId: string;
  providerName?: string;
  serviceName: string;
  preferredTime?: string;
  message?: string;
  status: 'REQUESTED' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
  timestamp: number;
}

export interface PublishedServicePayload {
  serviceId: string;
  providerId: string;
  providerName?: string;
  serviceName: string;
  category: string;
  description: string;
  deliveryType: string;
  pricing: string;
  duration: string;
  availability: string;
  status: 'PUBLISHED' | 'PAUSED';
  latitude: number;
  longitude: number;
  accuracy: number;
  locality?: string;
}

// ── Client -> Server Messages ───────────────────────────────────────────────

export type ClientLocationMessage =
  | {
      type: 'AUTHENTICATE';
      token: string;
      userId: string;
      displayName: string;
      role: 'senior' | 'consumer';
      skill?: string;
      services?: string[];
    }
  | {
      type: 'LOCATION_UPDATE';
      coordinates: LocationCoordinates;
      sharingEnabled: boolean;
      radiusMeters: number;
    }
  | {
      type: 'SERVICE_PUBLISH';
      serviceId: string;
      providerId: string;
      providerName?: string;
      serviceName: string;
      category?: string;
      description?: string;
      deliveryType?: string;
      pricing?: string;
      duration?: string;
      availability?: string;
      status?: string;
      latitude?: number;
      longitude?: number;
      accuracy?: number;
      locality?: string;
    }
  | {
      type: 'SET_RADIUS';
      radiusMeters: number;
    }
  | {
      type: 'TOGGLE_SHARING';
      enabled: boolean;
    }
  | {
      type: 'HEARTBEAT';
      timestamp: number;
    }
  | {
      type: 'SERVICE_REQUEST_CREATE';
      requestId: string;
      providerId: string;
      serviceName: string;
      preferredTime?: string;
      message?: string;
      timestamp: number;
    }
  | {
      type: 'SERVICE_REQUEST_RESPOND';
      requestId: string;
      action: 'ACCEPT' | 'REJECT';
    }
  | {
      type: 'SERVICE_REQUEST_READ';
      requestId: string;
    };

// ── Server -> Client Messages ───────────────────────────────────────────────

export type ServerLocationMessage =
  | {
      type: 'AUTH_SUCCESS';
      userId: string;
      serverTime: number;
    }
  | {
      type: 'AUTH_ERROR';
      message: string;
    }
  | {
      type: 'SERVICE_PUBLISH_ACK';
      serviceId: string;
      status: string;
      message: string;
    }
  | {
      type: 'LOCATION_ACK';
      accepted: boolean;
      serverTimestamp: number;
      reason?: string;
    }
  | {
      type: 'NEARBY_SNAPSHOT';
      radiusMeters: number;
      users: NearbyUserPayload[];
      serverTimestamp: number;
    }
  | {
      type: 'USER_JOINED_RADIUS';
      user: NearbyUserPayload;
    }
  | {
      type: 'USER_MOVED';
      user: NearbyUserPayload;
    }
  | {
      type: 'USER_LEFT_RADIUS';
      userId: string;
      reason: 'OUT_OF_RANGE' | 'SHARING_DISABLED' | 'DISCONNECTED' | 'EXPIRED';
    }
  | {
      type: 'SERVICE_REQUEST_RECEIVED';
      request: ServiceRequestPayload;
    }
  | {
      type: 'SERVICE_REQUEST_UPDATED';
      request: ServiceRequestPayload;
    }
  | {
      type: 'SERVICE_REQUEST_ACK';
      requestId: string;
      status: 'REQUESTED' | 'ERROR';
      message: string;
    }
  | {
      type: 'PRESENCE_UPDATE';
      activeUserCount: number;
    }
  | {
      type: 'HEARTBEAT_ACK';
      timestamp: number;
    }
  | {
      type: 'ERROR';
      code: string;
      message: string;
    };
