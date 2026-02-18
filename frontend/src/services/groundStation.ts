import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';

// ── Types ───────────────────────────────────────────

export interface StationInfo {
    name: string;
    latitude: number;
    longitude: number;
    altitude_m: number;
    min_elevation_deg: number;
}

export interface VisibleSatellite {
    norad_id: number;
    name: string;
    azimuth: number;
    elevation: number;
    range_km: number;
}

export interface SatellitePass {
    norad_id: number;
    name: string;
    aos: string;
    los: string;
    duration_s: number;
    max_elevation: number;
    max_el_time: string;
}

export interface VisibilityResponse {
    station: string;
    timestamp: string;
    count: number;
    satellites: VisibleSatellite[];
}

export interface PassesResponse {
    station: string;
    window_start: string;
    window_hours: number;
    count: number;
    passes: SatellitePass[];
}

// ── API Calls ───────────────────────────────────────

export const fetchStationInfo = async (): Promise<StationInfo> => {
    const response = await axios.get(`${API_URL}/ground-station/info`);
    return response.data;
};

export const fetchCurrentVisibility = async (
    timestamp?: string
): Promise<VisibilityResponse> => {
    try {
        const params: any = {};
        if (timestamp) params.timestamp = timestamp;
        const response = await axios.get(`${API_URL}/ground-station/visibility/current`, { params });
        return response.data;
    } catch (error) {
        console.error("Failed to fetch visibility", error);
        return { station: "", timestamp: "", count: 0, satellites: [] };
    }
};

export const fetchNextPasses = async (
    timestamp?: string,
    hours: number = 24
): Promise<PassesResponse> => {
    try {
        const params: any = { hours };
        if (timestamp) params.timestamp = timestamp;
        const response = await axios.get(`${API_URL}/ground-station/passes/next`, { params });
        return response.data;
    } catch (error) {
        console.error("Failed to fetch passes", error);
        return { station: "", window_start: "", window_hours: hours, count: 0, passes: [] };
    }
};
