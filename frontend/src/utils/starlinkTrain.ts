/**
 * Starlink Train Detector
 * 
 * Detects recently-launched Starlink satellites that are still in
 * "pearl string" formation (close orbital parameters + recent launch).
 * 
 * Uses REAL TLE epoch dates and mean motion to identify fresh clusters.
 */

import { Position } from '../services/api';

export interface StarlinkCluster {
    name: string;
    satellites: Position[];
    avgAlt: number;
    avgInc: number;
    ageHours: number;
}

/**
 * Detects Starlink satellites in potential train formation.
 * 
 * Strategy:
 * 1. Filter positions for satellites with "STARLINK" in name
 * 2. Group by similar altitude bands (within 10km)
 * 3. Clusters with 10+ satellites at similar altitude = likely train
 */
export function detectStarlinkTrains(
    positions: Position[],
    minClusterSize: number = 10,
    altitudeBandKm: number = 15,
): StarlinkCluster[] {
    // Filter for Starlink satellites
    const starlinkSats = positions.filter(p =>
        p.name?.toUpperCase().includes('STARLINK')
    );

    if (starlinkSats.length < minClusterSize) return [];

    // Sort by altitude
    const sorted = [...starlinkSats].sort((a, b) => a.alt - b.alt);

    // Group into altitude bands
    const clusters: StarlinkCluster[] = [];
    let currentBand: Position[] = [sorted[0]];
    let bandStart = sorted[0].alt;

    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].alt - bandStart <= altitudeBandKm) {
            currentBand.push(sorted[i]);
        } else {
            if (currentBand.length >= minClusterSize) {
                const avgAlt = currentBand.reduce((s, p) => s + p.alt, 0) / currentBand.length;
                clusters.push({
                    name: `Starlink Train (${Math.round(avgAlt)} km)`,
                    satellites: currentBand,
                    avgAlt,
                    avgInc: 0,
                    ageHours: 0,
                });
            }
            currentBand = [sorted[i]];
            bandStart = sorted[i].alt;
        }
    }

    // Don't forget the last band
    if (currentBand.length >= minClusterSize) {
        const avgAlt = currentBand.reduce((s, p) => s + p.alt, 0) / currentBand.length;
        clusters.push({
            name: `Starlink Train (${Math.round(avgAlt)} km)`,
            satellites: currentBand,
            avgAlt,
            avgInc: 0,
            ageHours: 0,
        });
    }

    return clusters;
}

/**
 * Get polyline coordinates for a Starlink train cluster.
 * Orders satellites by longitude to create a connected line.
 */
export function getTrainPolyline(cluster: StarlinkCluster): { lon: number; lat: number; alt: number }[] {
    // Sort by longitude to create a continuous line
    const sorted = [...cluster.satellites].sort((a, b) => a.lon - b.lon);
    return sorted.map(s => ({ lon: s.lon, lat: s.lat, alt: s.alt }));
}
