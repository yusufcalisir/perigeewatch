/**
 * Orbital Density Heatmap Utility
 * 
 * Computes a density grid from REAL satellite positions.
 * Bins lat/lon into cells and counts satellites per cell.
 * Used to visualize satellite concentration in LEO/MEO/GEO.
 */

export interface DensityCell {
    latMin: number;
    latMax: number;
    lonMin: number;
    lonMax: number;
    count: number;
    intensity: number; // 0-1 normalized
}

export interface PositionInput {
    lat: number;
    lon: number;
    alt: number;
}

/**
 * Compute a density grid from satellite positions.
 * 
 * @param positions - Real satellite positions with lat/lon/alt
 * @param latBins - Number of latitude bins (default 36 = 5° per bin)
 * @param lonBins - Number of longitude bins (default 72 = 5° per bin)
 * @param altFilter - Optional altitude filter [min, max] in km
 * @returns Array of DensityCell with counts and normalized intensity
 */
export function computeDensityGrid(
    positions: PositionInput[],
    latBins: number = 36,
    lonBins: number = 72,
    altFilter?: [number, number]
): DensityCell[] {
    const latStep = 180 / latBins;
    const lonStep = 360 / lonBins;

    // Initialize grid
    const grid: number[][] = Array.from({ length: latBins }, () => Array(lonBins).fill(0));

    // Bin positions
    let filtered = positions;
    if (altFilter) {
        filtered = positions.filter(p => p.alt >= altFilter[0] && p.alt <= altFilter[1]);
    }

    for (const pos of filtered) {
        // Validation
        if (typeof pos.lat !== 'number' || typeof pos.lon !== 'number') continue;

        // Clamp lat to [-90, 90), lon to [-180, 180)
        const lat = Math.max(-90, Math.min(89.999, pos.lat));
        const lon = Math.max(-180, Math.min(179.999, pos.lon));

        const latIdx = Math.floor((lat + 90) / latStep);
        const lonIdx = Math.floor((lon + 180) / lonStep);

        if (latIdx >= 0 && latIdx < latBins && lonIdx >= 0 && lonIdx < lonBins) {
            grid[latIdx][lonIdx]++;
        }
    }

    // Find max count for normalization
    let maxCount = 0;
    for (let i = 0; i < latBins; i++) {
        for (let j = 0; j < lonBins; j++) {
            if (grid[i][j] > maxCount) maxCount = grid[i][j];
        }
    }

    if (maxCount === 0) return [];

    // Build cell array (only non-zero cells)
    const cells: DensityCell[] = [];
    for (let i = 0; i < latBins; i++) {
        for (let j = 0; j < lonBins; j++) {
            if (grid[i][j] === 0) continue;

            cells.push({
                latMin: -90 + i * latStep,
                latMax: -90 + (i + 1) * latStep,
                lonMin: -180 + j * lonStep,
                lonMax: -180 + (j + 1) * lonStep,
                count: grid[i][j],
                intensity: grid[i][j] / maxCount, // 0-1 normalized
            });
        }
    }

    return cells;
}

/**
 * Get a CSS color string for a given intensity (0-1).
 * Uses a cyan → yellow → red gradient.
 */
export function getHeatmapColor(intensity: number): string {
    if (intensity < 0.33) {
        // Cyan to Yellow
        const t = intensity / 0.33;
        const r = Math.round(t * 255);
        const g = Math.round(200 + t * 55);
        const b = Math.round(255 * (1 - t));
        return `rgba(${r}, ${g}, ${b}, ${0.1 + intensity * 0.4})`;
    } else if (intensity < 0.66) {
        // Yellow to Orange
        const t = (intensity - 0.33) / 0.33;
        const r = 255;
        const g = Math.round(255 - t * 100);
        const b = 0;
        return `rgba(${r}, ${g}, ${b}, ${0.2 + intensity * 0.4})`;
    } else {
        // Orange to Red
        const t = (intensity - 0.66) / 0.34;
        const r = 255;
        const g = Math.round(155 - t * 155);
        const b = Math.round(t * 50);
        return `rgba(${r}, ${g}, ${b}, ${0.3 + intensity * 0.5})`;
    }
}
