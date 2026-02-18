/**
 * TLE (Two-Line Element) Parser
 * Extracts real orbital parameters from standard TLE format.
 * 
 * Reference: https://celestrak.org/columns/v04n03/
 * All values are REAL — derived directly from the TLE data.
 */

export interface OrbitalElements {
    // From TLE Line 1
    satelliteNumber: number;
    classification: string;
    internationalDesignator: string;
    epochYear: number;
    epochDay: number;
    epochDate: Date;
    meanMotionDot: number;     // rev/day²
    bstar: number;             // drag term (1/earth-radii)

    // From TLE Line 2
    inclination: number;       // degrees
    raan: number;              // Right Ascension of Ascending Node (degrees)
    eccentricity: number;      // dimensionless (0-1)
    argOfPerigee: number;      // degrees
    meanAnomaly: number;       // degrees
    meanMotion: number;        // revolutions per day
    revNumber: number;         // revolution number at epoch

    // Derived parameters
    period: number;            // minutes
    semiMajorAxis: number;     // km
    apogee: number;            // km (above Earth surface)
    perigee: number;           // km (above Earth surface)
    velocity: number;          // km/s (approximate circular orbit velocity)
    orbitType: string;         // LEO, MEO, GEO, HEO
}

const EARTH_RADIUS_KM = 6378.137;
const MU_EARTH = 398600.4418; // km³/s² (gravitational parameter)

/**
 * Parse a TLE two-line element set into orbital parameters.
 */
export function parseTLE(line1: string, line2: string): OrbitalElements {
    // ── Line 1 Parsing ──
    const satelliteNumber = parseInt(line1.substring(2, 7).trim());
    const classification = line1.charAt(7);
    const internationalDesignator = line1.substring(9, 17).trim();

    // Epoch: YY + DDD.DDDDDDDD
    const epochYearShort = parseInt(line1.substring(18, 20).trim());
    const epochDay = parseFloat(line1.substring(20, 32).trim());
    const epochYear = epochYearShort >= 57 ? 1900 + epochYearShort : 2000 + epochYearShort;

    // Compute actual epoch date
    const epochDate = new Date(Date.UTC(epochYear, 0, 1));
    epochDate.setTime(epochDate.getTime() + (epochDay - 1) * 86400000);

    // Mean motion derivative (rev/day²)
    const meanMotionDot = parseFloat(line1.substring(33, 43).trim());

    // BSTAR drag term
    const bstarStr = line1.substring(53, 61).trim();
    const bstarMantissa = parseFloat(bstarStr.substring(0, bstarStr.length - 2).replace(' ', '+'));
    const bstarExp = parseInt(bstarStr.substring(bstarStr.length - 2));
    const bstar = bstarMantissa * Math.pow(10, bstarExp);

    // ── Line 2 Parsing ──
    const inclination = parseFloat(line2.substring(8, 16).trim());
    const raan = parseFloat(line2.substring(17, 25).trim());

    // Eccentricity has an implied leading decimal point
    const eccentricity = parseFloat('0.' + line2.substring(26, 33).trim());

    const argOfPerigee = parseFloat(line2.substring(34, 42).trim());
    const meanAnomaly = parseFloat(line2.substring(43, 51).trim());
    const meanMotion = parseFloat(line2.substring(52, 63).trim());
    const revNumber = parseInt(line2.substring(63, 68).trim()) || 0;

    // ── Derived Parameters ──
    // Period in minutes
    const period = 1440.0 / meanMotion;

    // Semi-major axis from Kepler's 3rd law
    // T = 2π√(a³/μ) → a = (μ (T/2π)²)^(1/3)
    const periodSeconds = period * 60;
    const semiMajorAxis = Math.pow(
        MU_EARTH * Math.pow(periodSeconds / (2 * Math.PI), 2),
        1 / 3
    );

    // Apogee and Perigee (above Earth surface)
    const apogee = semiMajorAxis * (1 + eccentricity) - EARTH_RADIUS_KM;
    const perigee = semiMajorAxis * (1 - eccentricity) - EARTH_RADIUS_KM;

    // Approximate velocity (vis-viva for circular orbit at semi-major axis)
    const velocity = Math.sqrt(MU_EARTH / semiMajorAxis);

    // Classify orbit type
    let orbitType: string;
    if (perigee < 2000) {
        if (eccentricity > 0.25) {
            orbitType = 'HEO'; // Highly Elliptical Orbit
        } else {
            orbitType = 'LEO'; // Low Earth Orbit
        }
    } else if (perigee < 35000) {
        orbitType = 'MEO'; // Medium Earth Orbit
    } else {
        orbitType = 'GEO'; // Geostationary/Geosynchronous
    }

    return {
        satelliteNumber,
        classification,
        internationalDesignator,
        epochYear,
        epochDay,
        epochDate,
        meanMotionDot,
        bstar,
        inclination,
        raan,
        eccentricity,
        argOfPerigee,
        meanAnomaly,
        meanMotion,
        revNumber,
        period,
        semiMajorAxis,
        apogee,
        perigee,
        velocity,
        orbitType,
    };
}

/**
 * Format a number with specified decimal places and optional unit.
 */
export function formatOrbital(value: number, decimals: number = 2, unit: string = ''): string {
    return `${value.toFixed(decimals)}${unit ? ` ${unit}` : ''}`;
}

/**
 * Get TLE age in hours from epoch.
 */
export function getTLEAge(epochDate: Date): number {
    return (Date.now() - epochDate.getTime()) / (1000 * 60 * 60);
}

/**
 * Get human-readable TLE age string.
 */
export function getTLEAgeString(epochDate: Date): string {
    const hours = getTLEAge(epochDate);
    if (hours < 1) return `${Math.round(hours * 60)}m ago`;
    if (hours < 24) return `${Math.round(hours)}h ago`;
    if (hours < 168) return `${Math.round(hours / 24)}d ago`;
    return `${Math.round(hours / 168)}w ago`;
}
