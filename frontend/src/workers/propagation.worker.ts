/**
 * SGP4 Propagation WebWorker
 * 
 * Offloads satellite position calculations to a separate thread.
 * Uses satellite.js for SGP4/SDP4 propagation.
 * 
 * Messages:
 *   IN:  { type: 'init',      tles: [{norad_id, line1, line2}] }
 *   IN:  { type: 'propagate', timestamp: ISO string }
 *   OUT: { type: 'positions', data: [{norad_id, lat, lon, alt, velocity}] }
 */

import {
    twoline2satrec,
    propagate,
    gstime,
    eciToGeodetic,
    degreesLong,
    degreesLat,
    SatRec
} from 'satellite.js';

interface TLEInput {
    norad_id: number;
    name: string;
    object_type?: string;
    line1: string;
    line2: string;
}

interface SatRecord {
    norad_id: number;
    name: string;
    object_type: string;
    satrec: SatRec;
    prevVelocity: number | null;
}

let satellites: SatRecord[] = [];

// ── Initialize TLEs ──
function initTLEs(tles: TLEInput[]): void {
    satellites = [];
    for (const tle of tles) {
        try {
            const satrec = twoline2satrec(tle.line1, tle.line2);
            satellites.push({
                norad_id: tle.norad_id,
                name: tle.name,
                object_type: tle.object_type || 'UNKNOWN',
                satrec,
                prevVelocity: null
            });
        } catch (e) {
            // Skip invalid TLEs
        }
    }

    self.postMessage({
        type: 'init_complete',
        count: satellites.length
    });
}

// ── Propagate All ──
function propagateAll(timestamp: string): void {
    const date = new Date(timestamp);
    const gmst = gstime(date);
    const results: any[] = [];
    const maneuvers: any[] = [];

    for (const sat of satellites) {
        try {
            const positionAndVelocity = propagate(sat.satrec, date);

            if (!positionAndVelocity || !positionAndVelocity.position || typeof positionAndVelocity.position === 'boolean') {
                continue;
            }

            if (!positionAndVelocity.velocity || typeof positionAndVelocity.velocity === 'boolean') {
                continue;
            }

            const positionEci = positionAndVelocity.position;
            const velocityEci = positionAndVelocity.velocity;

            const geodetic = eciToGeodetic(positionEci, gmst);

            const lat = degreesLat(geodetic.latitude);
            const lon = degreesLong(geodetic.longitude);
            const alt = geodetic.height; // km

            // Calculate velocity magnitude
            let velocity = 0;
            velocity = Math.sqrt(
                velocityEci.x * velocityEci.x +
                velocityEci.y * velocityEci.y +
                velocityEci.z * velocityEci.z
            );

            // Maneuver detection: velocity change > 0.05 km/s between updates
            if (sat.prevVelocity !== null && velocity > 0) {
                const deltaV = Math.abs(velocity - sat.prevVelocity);
                if (deltaV > 0.05) {
                    maneuvers.push({
                        norad_id: sat.norad_id,
                        name: sat.name,
                        deltaV: deltaV,
                        prevVelocity: sat.prevVelocity,
                        newVelocity: velocity,
                        timestamp
                    });
                }
            }
            sat.prevVelocity = velocity;

            // Filter invalid positions
            if (isNaN(lat) || isNaN(lon) || isNaN(alt)) continue;
            if (alt < 0 || alt > 100000) continue;

            results.push({
                norad_id: sat.norad_id,
                name: sat.name,
                object_type: sat.object_type,
                lat,
                lon,
                alt,
                velocity
            });
        } catch (e) {
            // Skip propagation errors
        }
    }

    self.postMessage({ type: 'positions', data: results });

    if (maneuvers.length > 0) {
        self.postMessage({ type: 'maneuvers', data: maneuvers });
    }
}

// ── Message Handler ──
self.onmessage = (event: MessageEvent) => {
    const { type } = event.data;

    switch (type) {
        case 'init':
            initTLEs(event.data.tles);
            break;
        case 'propagate':
            propagateAll(event.data.timestamp);
            break;
    }
};
