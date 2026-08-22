"""
Authoritative Realtime Location, Geofencing & Service Request Subsystem for SilverHands
Provides:
- WebSocket connection gateway with session authentication
- Coordinate & outlier validation and rate limiting
- Ephemeral active-location store with TTL (30s auto-eviction)
- Spatial indexing & Haversine distance calculations
- Realtime cross-user Service Request Dispatch (Consumer -> Provider -> Consumer)
- Targeted realtime fan-out of incremental nearby deltas
"""

import os
import json
import math
import time
import asyncio
import logging
from typing import Dict, List, Optional, Set, Tuple
from dataclasses import dataclass
from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger("SilverHandsLocation")
logger.setLevel(logging.INFO)
if not logger.handlers:
    ch = logging.StreamHandler()
    ch.setFormatter(logging.Formatter("[%(asctime)s] [%(levelname)s] [LocationService] %(message)s"))
    logger.addHandler(ch)

# ── Geospatial Haversine Formula (Meters) ───────────────────────────────────

def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates great-circle distance between two points on Earth in meters."""
    R = 6371000.0  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * (math.sin(delta_lambda / 2.0) ** 2))
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return round(R * c, 2)


@dataclass
class PublishedService:
    service_id: str
    provider_id: str
    provider_name: str
    service_name: str
    category: str
    description: str
    delivery_type: str
    pricing: str
    duration: str
    availability: str
    status: str  # 'PUBLISHED' | 'PAUSED'
    latitude: float
    longitude: float
    accuracy: float
    locality: str
    created_at: float
    updated_at: float

    def to_dict(self) -> dict:
        return {
            "serviceId": self.service_id,
            "providerId": self.provider_id,
            "providerName": self.provider_name,
            "serviceName": self.service_name,
            "category": self.category,
            "description": self.description,
            "deliveryType": self.delivery_type,
            "pricing": self.pricing,
            "duration": self.duration,
            "availability": self.availability,
            "status": self.status,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "accuracy": self.accuracy,
            "locality": self.locality,
            "createdAt": int(self.created_at * 1000),
            "updatedAt": int(self.updated_at * 1000),
        }


@dataclass
class ActiveLocation:
    user_id: str
    display_name: str
    role: str
    skill: str
    latitude: float
    longitude: float
    accuracy: float
    heading: Optional[float]
    speed: Optional[float]
    last_updated: float
    sharing_enabled: bool
    radius_meters: float
    services: Optional[List[str]] = None
    websocket: Optional[WebSocket] = None
    known_nearby_ids: Optional[Set[str]] = None


@dataclass
class ActiveServiceRequest:
    id: str
    consumer_id: str
    consumer_name: str
    consumer_distance_meters: float
    provider_id: str
    provider_name: str
    service_name: str
    preferred_time: str
    message: str
    status: str  # 'REQUESTED' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED'
    timestamp: float

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "consumerId": self.consumer_id,
            "consumerName": self.consumer_name,
            "consumerDistanceMeters": self.consumer_distance_meters,
            "providerId": self.provider_id,
            "providerName": self.provider_name,
            "serviceName": self.service_name,
            "preferredTime": self.preferred_time,
            "message": self.message,
            "status": self.status,
            "timestamp": int(self.timestamp * 1000) if self.timestamp < 1e11 else int(self.timestamp)
        }


class LocationValidator:
    """Validates GPS coordinates, timestamp freshness, rate limits, and outliers."""

    @staticmethod
    def validate_coordinates(lat: float, lon: float, accuracy: float) -> Tuple[bool, Optional[str]]:
        if math.isnan(lat) or math.isinf(lat) or math.isnan(lon) or math.isinf(lon):
            return False, "Coordinates cannot be NaN or Infinity."
        if not (-90.0 <= lat <= 90.0):
            return False, f"Latitude {lat} out of valid range [-90, 90]."
        if not (-180.0 <= lon <= 180.0):
            return False, f"Longitude {lon} out of valid range [-180, 180]."
        if accuracy < 0 or accuracy > 5000:
            return False, f"Accuracy {accuracy}m out of reasonable bounds [0, 5000]."
        return True, None

    @staticmethod
    def validate_movement_outlier(
        prev_lat: float, prev_lon: float, prev_time: float,
        new_lat: float, new_lon: float, new_time: float, accuracy: float
    ) -> Tuple[bool, Optional[str]]:
        time_diff = new_time - prev_time
        if time_diff <= 0.05:
            # Throttle updates faster than 50ms
            return False, "Update frequency throttled."

        dist = haversine_distance_meters(prev_lat, prev_lon, new_lat, new_lon)
        calc_speed_mps = dist / time_diff

        # Max plausible civilian ground speed: 120 m/s (~430 km/h)
        if calc_speed_mps > 120.0 and dist > 500.0 and accuracy > 50.0:
            return False, f"Plausible movement exceeded: {calc_speed_mps:.1f} m/s jump detected."

        return True, None


class ActiveLocationStore:
    """
    Ephemeral in-memory geospatial index for active user locations.
    Enforces automatic 30-second TTL eviction. Zero permanent GPS logging.
    """

    def __init__(self, ttl_seconds: float = 30.0):
        self._users: Dict[str, ActiveLocation] = {}
        self._ttl_seconds = ttl_seconds
        self._lock = asyncio.Lock()

    async def put_location(self, loc: ActiveLocation) -> None:
        async with self._lock:
            if loc.known_nearby_ids is None:
                existing = self._users.get(loc.user_id)
                loc.known_nearby_ids = existing.known_nearby_ids if existing else set()
            self._users[loc.user_id] = loc

    async def get_location(self, user_id: str) -> Optional[ActiveLocation]:
        async with self._lock:
            return self._users.get(user_id)

    async def remove_user(self, user_id: str) -> Optional[ActiveLocation]:
        async with self._lock:
            return self._users.pop(user_id, None)

    async def get_all_active_users(self) -> List[ActiveLocation]:
        now = time.time()
        async with self._lock:
            return [
                loc for loc in self._users.values()
                if (now - loc.last_updated) <= self._ttl_seconds and loc.sharing_enabled
            ]

    async def query_nearby(self, user_id: str, lat: float, lon: float, radius_meters: float) -> List[Tuple[ActiveLocation, float]]:
        """
        Finds all active, sharing-enabled users within radius_meters of (lat, lon).
        Returns list of (ActiveLocation, distance_meters).
        """
        now = time.time()
        results: List[Tuple[ActiveLocation, float]] = []

        async with self._lock:
            for uid, candidate in self._users.items():
                if uid == user_id:
                    continue
                if not candidate.sharing_enabled:
                    continue
                if (now - candidate.last_updated) > self._ttl_seconds:
                    continue

                dist = haversine_distance_meters(lat, lon, candidate.latitude, candidate.longitude)
                if dist <= radius_meters:
                    results.append((candidate, dist))

        # Sort by distance ascending
        return sorted(results, key=lambda x: x[1])

    async def evict_expired(self) -> List[str]:
        """Evicts locations older than TTL and returns list of expired user_ids."""
        now = time.time()
        expired: List[str] = []

        async with self._lock:
            for uid, loc in list(self._users.items()):
                if (now - loc.last_updated) > self._ttl_seconds:
                    expired.append(uid)
                    del self._users[uid]

        return expired


class ActiveRequestStore:
    """Ephemeral in-memory store for active realtime service requests."""

    def __init__(self):
        self._requests: Dict[str, ActiveServiceRequest] = {}
        self._lock = asyncio.Lock()

    async def put_request(self, req: ActiveServiceRequest):
        async with self._lock:
            self._requests[req.id] = req

    async def get_request(self, req_id: str) -> Optional[ActiveServiceRequest]:
        async with self._lock:
            return self._requests.get(req_id)

    async def update_status(self, req_id: str, status: str) -> Optional[ActiveServiceRequest]:
        async with self._lock:
            req = self._requests.get(req_id)
            if req:
                req.status = status
            return req

    async def get_for_provider(self, provider_id: str) -> List[ActiveServiceRequest]:
        async with self._lock:
            return [r for r in self._requests.values() if r.provider_id == provider_id]

    async def get_for_consumer(self, consumer_id: str) -> List[ActiveServiceRequest]:
        async with self._lock:
            return [r for r in self._requests.values() if r.consumer_id == consumer_id]


class PublishedServiceStore:
    """
    Authoritative shared store for published provider services.
    Persists published services with their fixed service location for cross-browser discovery.
    Persisted to a local JSON file in sessions/published_services.json so services
    survive restarts.
    """
    def __init__(self, persistence_file: str = "sessions/published_services.json"):
        self._services: Dict[str, PublishedService] = {}
        self._persistence_file = persistence_file
        self._lock = asyncio.Lock()
        self._load_from_disk()

    def _load_from_disk(self):
        try:
            if os.path.exists(self._persistence_file):
                with open(self._persistence_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    for item in data:
                        svc = PublishedService(
                            service_id=item.get("serviceId", item.get("service_id", "")),
                            provider_id=item.get("providerId", item.get("provider_id", "")),
                            provider_name=item.get("providerName", item.get("provider_name", "Senior Provider")),
                            service_name=item.get("serviceName", item.get("service_name", item.get("title", "Service"))),
                            category=item.get("category", "cooking"),
                            description=item.get("description", ""),
                            delivery_type=item.get("deliveryType", item.get("delivery_type", "HOME_SERVICE")),
                            pricing=item.get("pricing", "₹800"),
                            duration=item.get("duration", "2 hours"),
                            availability=item.get("availability", "Weekdays 10 AM - 6 PM"),
                            status=item.get("status", "PUBLISHED"),
                            latitude=float(item.get("latitude", item.get("lat", 0.0))),
                            longitude=float(item.get("longitude", item.get("lng", 0.0))),
                            accuracy=float(item.get("accuracy", 10.0)),
                            locality=item.get("locality", "Mylapore, Chennai"),
                            created_at=float(item.get("createdAt", item.get("created_at", time.time()))),
                            updated_at=float(item.get("updatedAt", item.get("updated_at", time.time()))),
                        )
                        if svc.service_id:
                            self._services[svc.service_id] = svc
                logger.info(f"Loaded {len(self._services)} published services from {self._persistence_file}")
        except Exception as e:
            logger.warn(f"Failed loading published services from disk: {e}")

    def _save_to_disk(self):
        try:
            os.makedirs(os.path.dirname(self._persistence_file) or ".", exist_ok=True)
            with open(self._persistence_file, "w", encoding="utf-8") as f:
                json.dump([s.to_dict() for s in self._services.values()], f, indent=2)
        except Exception as e:
            logger.warn(f"Failed saving published services to disk: {e}")

    async def put_service(self, svc: PublishedService) -> None:
        async with self._lock:
            self._services[svc.service_id] = svc
            self._save_to_disk()
            logger.info(f"Published Service Stored: '{svc.service_name}' ({svc.service_id}) by {svc.provider_name} ({svc.provider_id}) at ({svc.latitude}, {svc.longitude})")

    async def get_service(self, service_id: str) -> Optional[PublishedService]:
        async with self._lock:
            return self._services.get(service_id)

    async def get_services_by_provider(self, provider_id: str) -> List[PublishedService]:
        async with self._lock:
            return [s for s in self._services.values() if s.provider_id == provider_id]

    async def get_all_published(self) -> List[PublishedService]:
        async with self._lock:
            return [s for s in self._services.values() if s.status == "PUBLISHED"]

    async def query_nearby_services(self, lat: float, lon: float, radius_meters: float) -> List[Tuple[PublishedService, float]]:
        results: List[Tuple[PublishedService, float]] = []
        async with self._lock:
            for s in self._services.values():
                if s.status != "PUBLISHED":
                    continue
                if s.latitude == 0.0 or s.longitude == 0.0:
                    continue
                dist = haversine_distance_meters(lat, lon, s.latitude, s.longitude)
                if dist <= radius_meters:
                    results.append((s, dist))
        return sorted(results, key=lambda x: x[1])


class RealtimeLocationManager:
    """
    Orchestrates WebSocket connections, message decoding, validation,
    spatial updates, cross-user service requests, and targeted fan-out.
    """

    def __init__(self):
        self.store = ActiveLocationStore(ttl_seconds=30.0)
        self.service_store = PublishedServiceStore()
        self.request_store = ActiveRequestStore()
        self.active_connections: Dict[str, WebSocket] = {}
        self._bg_cleanup_task: Optional[asyncio.Task] = None

    def start_background_tasks(self):
        if self._bg_cleanup_task is None or self._bg_cleanup_task.done():
            self._bg_cleanup_task = asyncio.create_task(self._cleanup_loop())

    async def _cleanup_loop(self):
        """Periodically sweeps expired locations and notifies neighbors."""
        while True:
            try:
                await asyncio.sleep(5.0)
                expired_ids = await self.store.evict_expired()
                if expired_ids:
                    logger.info(f"Evicted {len(expired_ids)} expired location(s): {expired_ids}")
                    for expired_uid in expired_ids:
                        await self._fanout_user_left(expired_uid, reason="EXPIRED")
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in cleanup loop: {e}", exc_info=True)

    async def handle_connection(self, websocket: WebSocket):
        await websocket.accept()
        user_id: Optional[str] = None
        last_update_time = 0.0

        try:
            while True:
                data = await websocket.receive_json()
                msg_type = data.get("type")

                if msg_type == "AUTHENTICATE":
                    # Authenticate session
                    token = data.get("token", "")
                    uid = data.get("userId", "").strip()
                    name = data.get("displayName", "User").strip()
                    role = data.get("role", "consumer")
                    skill = data.get("skill", "")
                    services = data.get("services", [])

                    if not uid:
                        await websocket.send_json({"type": "AUTH_ERROR", "message": "Missing userId."})
                        continue

                    user_id = uid
                    self.active_connections[user_id] = websocket

                    # Initial placeholder location until client sends coordinates
                    existing = await self.store.get_location(user_id)
                    init_loc = ActiveLocation(
                        user_id=user_id,
                        display_name=name,
                        role=role,
                        skill=skill,
                        latitude=existing.latitude if existing else 0.0,
                        longitude=existing.longitude if existing else 0.0,
                        accuracy=existing.accuracy if existing else 999.0,
                        heading=None,
                        speed=None,
                        last_updated=time.time(),
                        sharing_enabled=False,
                        radius_meters=existing.radius_meters if existing else 2000.0,
                        services=services if services else (existing.services if existing else []),
                        websocket=websocket,
                        known_nearby_ids=existing.known_nearby_ids if existing else set()
                    )
                    await self.store.put_location(init_loc)

                    logger.info(f"User authenticated: {user_id} ({name}, {role}) with services: {services}")
                    await websocket.send_json({
                        "type": "AUTH_SUCCESS",
                        "userId": user_id,
                        "serverTime": int(time.time() * 1000)
                    })

                    # If provider, deliver any active pending requests
                    if role == "senior":
                        existing_requests = await self.request_store.get_for_provider(user_id)
                        for r in existing_requests:
                            if r.status == "REQUESTED":
                                await websocket.send_json({
                                    "type": "SERVICE_REQUEST_RECEIVED",
                                    "request": {
                                        "id": r.id,
                                        "consumerId": r.consumer_id,
                                        "consumerName": r.consumer_name,
                                        "consumerDistanceMeters": r.consumer_distance_meters,
                                        "providerId": r.provider_id,
                                        "providerName": r.provider_name,
                                        "serviceName": r.service_name,
                                        "preferredTime": r.preferred_time,
                                        "message": r.message,
                                        "status": r.status,
                                        "timestamp": int(r.timestamp * 1000)
                                    }
                                })

                elif msg_type == "LOCATION_UPDATE":
                    if not user_id:
                        await websocket.send_json({"type": "ERROR", "code": "UNAUTHORIZED", "message": "Authenticate first."})
                        continue

                    coords = data.get("coordinates", {})
                    sharing_enabled = bool(data.get("sharingEnabled", True))
                    radius_meters = float(data.get("radiusMeters", 2000.0))

                    lat = float(coords.get("latitude", 0.0))
                    lon = float(coords.get("longitude", 0.0))
                    accuracy = float(coords.get("accuracy", 10.0))
                    heading = coords.get("heading")
                    speed = coords.get("speed")

                    # 1. Validate coordinates
                    valid, err_msg = LocationValidator.validate_coordinates(lat, lon, accuracy)
                    if not valid:
                        await websocket.send_json({
                            "type": "LOCATION_ACK",
                            "accepted": False,
                            "serverTimestamp": int(time.time() * 1000),
                            "reason": err_msg
                        })
                        continue

                    # 2. Outlier / Rate limiting check
                    now = time.time()
                    existing = await self.store.get_location(user_id)
                    if existing and existing.latitude != 0.0:
                        mov_valid, mov_err = LocationValidator.validate_movement_outlier(
                            existing.latitude, existing.longitude, existing.last_updated,
                            lat, lon, now, accuracy
                        )
                        if not mov_valid:
                            # Send throttled ack
                            await websocket.send_json({
                                "type": "LOCATION_ACK",
                                "accepted": True,
                                "serverTimestamp": int(now * 1000),
                                "reason": mov_err
                            })
                            continue

                    last_update_time = now

                    # 3. Update active location
                    current_loc = ActiveLocation(
                        user_id=user_id,
                        display_name=existing.display_name if existing else "User",
                        role=existing.role if existing else "consumer",
                        skill=existing.skill if existing else "",
                        latitude=lat,
                        longitude=lon,
                        accuracy=accuracy,
                        heading=float(heading) if heading is not None else None,
                        speed=float(speed) if speed is not None else None,
                        last_updated=now,
                        sharing_enabled=sharing_enabled,
                        radius_meters=radius_meters,
                        services=existing.services if existing else [],
                        websocket=websocket,
                        known_nearby_ids=existing.known_nearby_ids if existing else set()
                    )
                    await self.store.put_location(current_loc)

                    # 4. Respond with Ack
                    await websocket.send_json({
                        "type": "LOCATION_ACK",
                        "accepted": True,
                        "serverTimestamp": int(now * 1000)
                    })

                    # 5. Recompute and Fan-out nearby updates
                    await self._process_nearby_fanout(current_loc)

                elif msg_type == "SERVICE_REQUEST_CREATE":
                    # Consumer requesting a provider's service
                    if not user_id:
                        continue

                    req_id = data.get("requestId", f"req_{int(time.time()*1000)}")
                    prov_id = data.get("providerId", "")
                    service_name = data.get("serviceName", "Service")
                    preferred_time = data.get("preferredTime", "As soon as possible")
                    msg = data.get("message", "")

                    consumer_loc = await self.store.get_location(user_id)
                    prov_loc = await self.store.get_location(prov_id)

                    consumer_name = consumer_loc.display_name if consumer_loc else "Consumer"
                    prov_name = prov_loc.display_name if prov_loc else "Provider"

                    dist = 0.0
                    if consumer_loc and prov_loc and consumer_loc.latitude != 0 and prov_loc.latitude != 0:
                        dist = haversine_distance_meters(
                            consumer_loc.latitude, consumer_loc.longitude,
                            prov_loc.latitude, prov_loc.longitude
                        )

                    req_obj = ActiveServiceRequest(
                        id=req_id,
                        consumer_id=user_id,
                        consumer_name=consumer_name,
                        consumer_distance_meters=dist,
                        provider_id=prov_id,
                        provider_name=prov_name,
                        service_name=service_name,
                        preferred_time=preferred_time,
                        message=msg,
                        status="REQUESTED",
                        timestamp=time.time()
                    )
                    await self.request_store.put_request(req_obj)
                    logger.info(f"Service Request Created: {req_id} from {consumer_name} ({user_id}) to {prov_name} ({prov_id}) for {service_name}")

                    # 1. Send Ack to Consumer
                    await websocket.send_json({
                        "type": "SERVICE_REQUEST_ACK",
                        "requestId": req_id,
                        "status": "REQUESTED",
                        "message": f"Request delivered to {prov_name}."
                    })

                    # 2. Realtime dispatch to Provider if connected
                    prov_ws = self.active_connections.get(prov_id)
                    if prov_ws:
                        try:
                            await prov_ws.send_json({
                                "type": "SERVICE_REQUEST_RECEIVED",
                                "request": {
                                    "id": req_id,
                                    "consumerId": user_id,
                                    "consumerName": consumer_name,
                                    "consumerDistanceMeters": dist,
                                    "providerId": prov_id,
                                    "providerName": prov_name,
                                    "serviceName": service_name,
                                    "preferredTime": preferred_time,
                                    "message": msg,
                                    "status": "REQUESTED",
                                    "timestamp": int(req_obj.timestamp * 1000)
                                }
                            })
                            logger.info(f"Realtime request delivered to provider {prov_id}")
                        except Exception as ex:
                            logger.warn(f"Failed sending request to provider WS: {ex}")

                elif msg_type == "SERVICE_REQUEST_RESPOND":
                    # Provider accepting or rejecting request
                    req_id = data.get("requestId", "")
                    action = data.get("action", "REJECT")  # 'ACCEPT' | 'REJECT'
                    new_status = "ACCEPTED" if action == "ACCEPT" else "REJECTED"

                    updated_req = await self.request_store.update_status(req_id, new_status)
                    if updated_req:
                        logger.info(f"Provider {user_id} responded to {req_id} with {new_status}")
                        payload = {
                            "type": "SERVICE_REQUEST_UPDATED",
                            "request": {
                                "id": updated_req.id,
                                "consumerId": updated_req.consumer_id,
                                "consumerName": updated_req.consumer_name,
                                "consumerDistanceMeters": updated_req.consumer_distance_meters,
                                "providerId": updated_req.provider_id,
                                "providerName": updated_req.provider_name,
                                "serviceName": updated_req.service_name,
                                "preferredTime": updated_req.preferred_time,
                                "message": updated_req.message,
                                "status": updated_req.status,
                                "timestamp": int(updated_req.timestamp * 1000)
                            }
                        }

                        # Intimate Consumer in realtime
                        consumer_ws = self.active_connections.get(updated_req.consumer_id)
                        if consumer_ws:
                            try:
                                await consumer_ws.send_json(payload)
                            except Exception:
                                pass

                        # Intimate Provider
                        await websocket.send_json(payload)

                elif msg_type == "SERVICE_PUBLISH":
                    # Provider publishing a service with their service GPS location
                    svc_id = data.get("serviceId") or f"svc_{int(time.time()*1000)}"
                    prov_id = data.get("providerId") or user_id or "usr_prov_senior"
                    existing_loc = await self.store.get_location(prov_id)
                    prov_name = data.get("providerName") or (existing_loc.display_name if existing_loc else "Senior Master")
                    svc_name = data.get("serviceName") or data.get("title") or "Service"
                    cat = data.get("category") or "cooking"
                    desc = data.get("description") or ""
                    deliv = data.get("deliveryType") or "HOME_SERVICE"
                    pricing = data.get("pricing") or "₹800"
                    duration = data.get("duration") or "2 hours"
                    avail = data.get("availability") or "Weekdays 10 AM - 6 PM"
                    status = data.get("status") or "PUBLISHED"
                    s_lat = float(data.get("latitude") or (existing_loc.latitude if existing_loc else 0.0))
                    s_lng = float(data.get("longitude") or (existing_loc.longitude if existing_loc else 0.0))
                    s_acc = float(data.get("accuracy") or (existing_loc.accuracy if existing_loc else 10.0))
                    locality = data.get("locality") or (existing_loc.skill if existing_loc else "Mylapore, Chennai")
                    now = time.time()

                    pub_svc = PublishedService(
                        service_id=svc_id,
                        provider_id=prov_id,
                        provider_name=prov_name,
                        service_name=svc_name,
                        category=cat,
                        description=desc,
                        delivery_type=deliv,
                        pricing=pricing,
                        duration=duration,
                        availability=avail,
                        status=status,
                        latitude=s_lat,
                        longitude=s_lng,
                        accuracy=s_acc,
                        locality=locality,
                        created_at=now,
                        updated_at=now
                    )
                    await self.service_store.put_service(pub_svc)

                    # 1. Ack back to provider
                    await websocket.send_json({
                        "type": "SERVICE_PUBLISH_ACK",
                        "serviceId": svc_id,
                        "status": "PUBLISHED",
                        "message": f"Service '{svc_name}' is now published and discoverable to nearby consumers."
                    })

                    # 2. Fan out to all connected consumers within radius
                    await self._fanout_new_service(pub_svc)

                elif msg_type == "SET_RADIUS":
                    if user_id:
                        r = float(data.get("radiusMeters", 2000.0))
                        loc = await self.store.get_location(user_id)
                        if loc:
                            loc.radius_meters = r
                            await self.store.put_location(loc)
                            await self._process_nearby_fanout(loc)

                elif msg_type == "TOGGLE_SHARING":
                    if user_id:
                        enabled = bool(data.get("enabled", True))
                        loc = await self.store.get_location(user_id)
                        if loc:
                            loc.sharing_enabled = enabled
                            await self.store.put_location(loc)
                            if not enabled:
                                await self._fanout_user_left(user_id, reason="SHARING_DISABLED")
                            else:
                                await self._process_nearby_fanout(loc)

                elif msg_type == "HEARTBEAT":
                    now = time.time()
                    if user_id:
                        loc = await self.store.get_location(user_id)
                        if loc:
                            loc.last_updated = now
                            await self.store.put_location(loc)
                    await websocket.send_json({
                        "type": "HEARTBEAT_ACK",
                        "timestamp": int(now * 1000)
                    })

        except WebSocketDisconnect:
            logger.info(f"WebSocket disconnected: {user_id}")
        except Exception as e:
            logger.error(f"WebSocket handler error for {user_id}: {e}", exc_info=True)
        finally:
            if user_id:
                self.active_connections.pop(user_id, None)
                await self.store.remove_user(user_id)
                await self._fanout_user_left(user_id, reason="DISCONNECTED")

    async def _process_nearby_fanout(self, user_loc: ActiveLocation):
        """
        Computes all published services and live users within radius for `user_loc`
        and performs targeted fan-out to `user_loc` and neighboring users.
        Enforces strict role-awareness:
          - Consumer sees nearby Senior Service Providers & their published services.
          - Senior Service Provider sees nearby Consumers who need help.
          - The current user is NEVER returned in their own nearby results.
        """
        nearby_services = await self.service_store.query_nearby_services(
            user_loc.latitude, user_loc.longitude, user_loc.radius_meters
        )
        nearby_candidates = await self.store.query_nearby(
            user_loc.user_id, user_loc.latitude, user_loc.longitude, user_loc.radius_meters
        )

        current_nearby_ids: Set[str] = set()
        snapshot_payload: List[dict] = []
        seen_provider_service_keys: Set[str] = set()

        if user_loc.role == "consumer":
            # ─── CONSUMER VIEWER: Discover Senior Service Providers ───
            # 1. Add all published services from senior providers (exclude self)
            for svc, dist in nearby_services:
                if svc.provider_id == user_loc.user_id:
                    continue  # NEVER display current user
                current_nearby_ids.add(svc.provider_id)
                seen_provider_service_keys.add(f"{svc.provider_id}:{svc.service_name}")
                is_live_connected = svc.provider_id in self.active_connections

                snapshot_payload.append({
                    "userId": svc.provider_id,
                    "displayName": svc.provider_name,
                    "role": "senior",
                    "skill": svc.service_name,
                    "services": [svc.service_name],
                    "serviceId": svc.service_id,
                    "serviceName": svc.service_name,
                    "category": svc.category,
                    "pricing": svc.pricing,
                    "duration": svc.duration,
                    "deliveryType": svc.delivery_type,
                    "description": svc.description,
                    "availability": svc.availability,
                    "locality": svc.locality,
                    "latitude": svc.latitude,
                    "longitude": svc.longitude,
                    "accuracy": svc.accuracy,
                    "distanceMeters": dist,
                    "heading": None,
                    "speed": None,
                    "isLive": is_live_connected,
                    "lastUpdated": int(svc.updated_at * 1000)
                })

            # 2. Add live connected senior providers who haven't published a formal service yet
            for candidate, dist in nearby_candidates:
                if candidate.user_id == user_loc.user_id:
                    continue  # NEVER display current user
                if candidate.role != "senior":
                    continue  # Consumers ONLY see senior providers

                primary_svc = (candidate.services and candidate.services[0]) if candidate.services else (candidate.skill or "Crafts & Services")
                if f"{candidate.user_id}:{primary_svc}" not in seen_provider_service_keys:
                    current_nearby_ids.add(candidate.user_id)
                    services_list = candidate.services if (candidate.services and len(candidate.services) > 0) else ([candidate.skill] if candidate.skill else [])
                    snapshot_payload.append({
                        "userId": candidate.user_id,
                        "displayName": candidate.display_name,
                        "role": "senior",
                        "skill": candidate.skill or primary_svc,
                        "services": services_list,
                        "serviceId": f"svc_live_{candidate.user_id}",
                        "serviceName": primary_svc,
                        "category": "cooking" if ("cook" in primary_svc.lower() or "food" in primary_svc.lower()) else "crafts",
                        "pricing": "₹800",
                        "duration": "2 hours",
                        "deliveryType": "HOME_SERVICE",
                        "description": f"Live verified senior service provider: {primary_svc}",
                        "availability": "Available Now",
                        "locality": "Nearby area",
                        "latitude": candidate.latitude,
                        "longitude": candidate.longitude,
                        "accuracy": candidate.accuracy,
                        "distanceMeters": dist,
                        "heading": candidate.heading,
                        "speed": candidate.speed,
                        "isLive": True,
                        "lastUpdated": int(candidate.last_updated * 1000)
                    })

        else:
            # ─── SENIOR PROVIDER VIEWER: Discover Consumers Needing Help ───
            for candidate, dist in nearby_candidates:
                if candidate.user_id == user_loc.user_id:
                    continue  # NEVER display current user
                if candidate.role != "consumer":
                    continue  # Senior providers ONLY see consumers

                current_nearby_ids.add(candidate.user_id)
                snapshot_payload.append({
                    "userId": candidate.user_id,
                    "displayName": candidate.display_name,
                    "role": "consumer",
                    "skill": "Learner",
                    "services": [],
                    "serviceId": f"usr_cons_{candidate.user_id}",
                    "serviceName": "Looking for nearby services",
                    "category": "inquiry",
                    "pricing": "",
                    "duration": "",
                    "deliveryType": "IN_PERSON",
                    "description": f"Consumer {candidate.display_name} is nearby",
                    "availability": "Online",
                    "locality": "Nearby area",
                    "latitude": candidate.latitude,
                    "longitude": candidate.longitude,
                    "accuracy": candidate.accuracy,
                    "distanceMeters": dist,
                    "heading": candidate.heading,
                    "speed": candidate.speed,
                    "isLive": True,
                    "lastUpdated": int(candidate.last_updated * 1000)
                })

        # Sort combined snapshot by distance ascending
        snapshot_payload.sort(key=lambda x: x["distanceMeters"])

        # Send full snapshot to the current user
        if user_loc.websocket:
            try:
                await user_loc.websocket.send_json({
                    "type": "NEARBY_SNAPSHOT",
                    "radiusMeters": user_loc.radius_meters,
                    "users": snapshot_payload,
                    "serverTimestamp": int(time.time() * 1000)
                })
            except Exception:
                pass

        # Calculate delta for current user
        prev_nearby_ids = user_loc.known_nearby_ids or set()
        user_loc.known_nearby_ids = current_nearby_ids

        # 3. Targeted fan-out: Notify other active users if this user is within THEIR radius
        if user_loc.sharing_enabled and user_loc.latitude != 0.0:
            all_active = await self.store.get_all_active_users()
            for neighbor in all_active:
                if neighbor.user_id == user_loc.user_id or not neighbor.websocket:
                    continue

                # Enforce role direction: Consumer only receives Senior updates, Senior only receives Consumer updates
                if neighbor.role == "consumer" and user_loc.role != "senior":
                    continue
                if neighbor.role == "senior" and user_loc.role != "consumer":
                    continue

                dist_to_neighbor = haversine_distance_meters(
                    neighbor.latitude, neighbor.longitude, user_loc.latitude, user_loc.longitude
                )

                neighbor_known = neighbor.known_nearby_ids or set()
                was_in_radius = user_loc.user_id in neighbor_known
                is_in_radius = dist_to_neighbor <= neighbor.radius_meters

                user_services = user_loc.services if (user_loc.services and len(user_loc.services) > 0) else ([user_loc.skill] if user_loc.skill else [])
                user_payload = {
                    "userId": user_loc.user_id,
                    "displayName": user_loc.display_name,
                    "role": user_loc.role,
                    "skill": user_loc.skill,
                    "services": user_services,
                    "latitude": user_loc.latitude,
                    "longitude": user_loc.longitude,
                    "accuracy": user_loc.accuracy,
                    "distanceMeters": dist_to_neighbor,
                    "heading": user_loc.heading,
                    "speed": user_loc.speed,
                    "isLive": True,
                    "lastUpdated": int(user_loc.last_updated * 1000)
                }

                try:
                    if is_in_radius:
                        neighbor_known.add(user_loc.user_id)
                        neighbor.known_nearby_ids = neighbor_known
                        if was_in_radius:
                            await neighbor.websocket.send_json({
                                "type": "USER_MOVED",
                                "user": user_payload
                            })
                        else:
                            await neighbor.websocket.send_json({
                                "type": "USER_JOINED_RADIUS",
                                "user": user_payload
                            })
                    elif was_in_radius:
                        neighbor_known.remove(user_loc.user_id)
                        neighbor.known_nearby_ids = neighbor_known
                        await neighbor.websocket.send_json({
                            "type": "USER_LEFT_RADIUS",
                            "userId": user_loc.user_id,
                            "reason": "OUT_OF_RANGE"
                        })
                except Exception:
                    pass

    async def _fanout_new_service(self, pub_svc: PublishedService):
        """When a new service is published, notify all active connected consumer users whose radius contains it."""
        all_active = await self.store.get_all_active_users()
        for neighbor in all_active:
            if neighbor.user_id == pub_svc.provider_id or not neighbor.websocket:
                continue
            if neighbor.role != "consumer":
                continue  # Only consumers receive published senior service updates

            dist = haversine_distance_meters(
                neighbor.latitude, neighbor.longitude, pub_svc.latitude, pub_svc.longitude
            )
            if dist <= neighbor.radius_meters:
                user_payload = {
                    "userId": pub_svc.provider_id,
                    "displayName": pub_svc.provider_name,
                    "role": "senior",
                    "skill": pub_svc.service_name,
                    "services": [pub_svc.service_name],
                    "serviceId": pub_svc.service_id,
                    "serviceName": pub_svc.service_name,
                    "category": pub_svc.category,
                    "pricing": pub_svc.pricing,
                    "duration": pub_svc.duration,
                    "deliveryType": pub_svc.delivery_type,
                    "description": pub_svc.description,
                    "availability": pub_svc.availability,
                    "locality": pub_svc.locality,
                    "latitude": pub_svc.latitude,
                    "longitude": pub_svc.longitude,
                    "accuracy": pub_svc.accuracy,
                    "distanceMeters": dist,
                    "heading": None,
                    "speed": None,
                    "isLive": pub_svc.provider_id in self.active_connections,
                    "lastUpdated": int(pub_svc.updated_at * 1000)
                }
                try:
                    await neighbor.websocket.send_json({
                        "type": "USER_JOINED_RADIUS",
                        "user": user_payload
                    })
                except Exception:
                    pass

    async def _fanout_user_left(self, user_id: str, reason: str):
        """Notifies any clients that had user_id in their nearby set that user_id has left."""
        all_active = await self.store.get_all_active_users()
        for neighbor in all_active:
            if neighbor.known_nearby_ids and user_id in neighbor.known_nearby_ids:
                neighbor.known_nearby_ids.remove(user_id)
                if neighbor.websocket:
                    try:
                        await neighbor.websocket.send_json({
                            "type": "USER_LEFT_RADIUS",
                            "userId": user_id,
                            "reason": reason
                        })
                    except Exception:
                        pass


# Global singleton instance
location_manager = RealtimeLocationManager()
