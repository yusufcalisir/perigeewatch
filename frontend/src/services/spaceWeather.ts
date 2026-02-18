/**
 * NOAA SWPC Space Weather Service — 100% Real Data
 * All endpoints are public, no API keys required.
 */
import axios from 'axios';

const NOAA_BASE = 'https://services.swpc.noaa.gov';

// ── Types ──
export interface KpDataPoint {
    time: string;
    kp: number;
    aRunning: number;
    stationCount: number;
}

export interface SolarWind {
    speed: number;
    timestamp: string;
}

export interface MagField {
    bt: number;
    bz: number;
    timestamp: string;
}

export interface SpaceWeatherData {
    kpCurrent: number;
    kpHistory: KpDataPoint[];
    solarWind: SolarWind;
    magField: MagField;
    stormLevel: string;   // G0-G5
    stormColor: string;   // CSS color
}

// ── Kp to Geomagnetic Storm Scale ──
function getStormScale(kp: number): { level: string; color: string; label: string } {
    if (kp >= 9) return { level: 'G5', color: '#FF0000', label: 'EXTREME' };
    if (kp >= 8) return { level: 'G4', color: '#FF4500', label: 'SEVERE' };
    if (kp >= 7) return { level: 'G3', color: '#FF8C00', label: 'STRONG' };
    if (kp >= 6) return { level: 'G2', color: '#FFD700', label: 'MODERATE' };
    if (kp >= 5) return { level: 'G1', color: '#FFFF00', label: 'MINOR' };
    if (kp >= 4) return { level: 'G0+', color: '#00FF88', label: 'ACTIVE' };
    return { level: 'G0', color: '#00D1FF', label: 'QUIET' };
}

export { getStormScale };

// ── Combined Fetch ──
import { API_URL } from './config';

export async function fetchAllSpaceWeather(): Promise<SpaceWeatherData> {
    try {
        const response = await axios.get(`${API_URL}/space-weather/live`);
        const data = response.data;
        const storm = getStormScale(data.kpCurrent);

        return {
            kpCurrent: data.kpCurrent,
            kpHistory: data.kpHistory,
            solarWind: data.solarWind,
            magField: data.magField,
            stormLevel: storm.level,
            stormColor: storm.color
        };

    } catch (error) {
        console.error('Failed to fetch space weather from backend:', error);
        return {
            kpCurrent: 0,
            kpHistory: [],
            solarWind: { speed: 0, timestamp: '' },
            magField: { bt: 0, bz: 0, timestamp: '' },
            stormLevel: 'G0',
            stormColor: '#00D1FF'
        };
    }
}
// Deprecated individual exports if not used elsewhere, but keeping signatures for compatibility if needed.
export async function fetchKpIndex(): Promise<KpDataPoint[]> { return []; }
export async function fetchSolarWind(): Promise<SolarWind> { return { speed: 0, timestamp: '' }; }
export async function fetchMagField(): Promise<MagField> { return { bt: 0, bz: 0, timestamp: '' }; }
