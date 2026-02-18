import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';

export interface Satellite {
    norad_id: number;
    name: string;
    int_designator: string;
    object_type: string;
    is_active: boolean;
    owner?: string;
    country_code?: string;
    launch_date?: string;
    launch_site?: string;
    purpose?: string;
    orbit_class?: string;
}

export interface Position {
    norad_id: number;
    sat_id: number;
    name?: string;
    lat: number;
    lon: number;
    alt: number;
    velocity: number;
    timestamp: string;
    object_type?: string;
    eclipsed?: boolean;
}

export interface TLEData {
    line1: string;
    line2: string;
    epoch: string;
    source: string;
    fetched_at: string;
}

export interface SatelliteDetail {
    satellite: Satellite;
    tle: TLEData;
}

export const fetchSatellites = async (limit: number = 100, skip: number = 0): Promise<Satellite[]> => {
    try {
        const response = await axios.get(`${API_URL}/satellites/`, { params: { limit, skip } });
        return response.data;
    } catch (error) {
        console.error("Failed to fetch satellites", error);
        return [];
    }
};

export const fetchAllPositions = async (timestamp?: string): Promise<Position[]> => {
    try {
        const params: any = {};
        if (timestamp) params.timestamp = timestamp;

        const response = await axios.get(`${API_URL}/positions/all`, { params });
        return response.data;
    } catch (error) {
        console.error("Failed to fetch positions", error);
        return [];
    }
};

export const connectToPositionStream = (
    onMessage: (data: Position[]) => void,
    interval: number = 2
): WebSocket => {
    let wsUrl = API_URL.replace('http', 'ws');
    if (wsUrl.endsWith('/api/v1')) {
        wsUrl = wsUrl.replace('/api/v1', '/ws/positions');
    } else {
        wsUrl = wsUrl + '/ws/positions';
    }

    console.log(`Connecting to WebSocket: ${wsUrl}`);
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('Connected to position stream');
        ws.send(JSON.stringify({
            interval: interval,
            limit: 15000
        }));
    };

    ws.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            if (message.type === 'positions') {
                onMessage(message.data);
            }
        } catch (e) {
            console.error('Error parsing WS message', e);
        }
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };

    return ws;
};

export interface OrbitPoint {
    time: string;
    lat: number;
    lon: number;
    alt: number;
    velocity: number;
}

export const fetchSatelliteOrbit = async (noradId: number, minutes: number = 90, pastMinutes: number = 0): Promise<OrbitPoint[]> => {
    try {
        const response = await axios.get(`${API_URL}/satellites/${noradId}/orbit`, {
            params: { minutes, past_minutes: pastMinutes }
        });
        return response.data;
    } catch (error) {
        console.error("Failed to fetch orbit", error);
        return [];
    }
};

/**
 * Fetch full satellite detail (metadata + TLE)
 */
export const fetchSatelliteDetail = async (noradId: number): Promise<SatelliteDetail | null> => {
    try {
        const [satRes, tleRes] = await Promise.all([
            axios.get(`${API_URL}/satellites/${noradId}`),
            axios.get(`${API_URL}/satellites/${noradId}/tle`)
        ]);
        return {
            satellite: satRes.data,
            tle: tleRes.data
        };
    } catch (error) {
        console.error("Failed to fetch satellite detail", error);
        return null;
    }
};

/**
 * Fetch access intervals for a satellite
 */
export const fetchAccessIntervals = async (noradId: number, hours: number = 24) => {
    try {
        const response = await axios.get(`${API_URL}/satellites/${noradId}/access-intervals`, { params: { hours } });
        return response.data;
    } catch (error) {
        console.error("Failed to fetch access intervals", error);
        return null;
    }
};

/**
 * Fetch reentry prediction for a satellite (uses real TLE-based decay model)
 */
export interface ReentryPrediction {
    norad_id: number;
    name: string;
    reentry_risk: string;
    estimated_days_remaining: number | null;
    estimated_reentry_date: string | null;
    perigee_alt_km: number;
    apogee_alt_km: number;
    current_alt_km: number;
    bstar: number;
}

export const fetchReentryPrediction = async (noradId: number): Promise<ReentryPrediction | null> => {
    try {
        const response = await axios.get(`${API_URL}/reentry/${noradId}`);
        return response.data;
    } catch (error) {
        console.error("Failed to fetch reentry prediction", error);
        return null;
    }
};

export const fetchReentryCandidates = async (maxPerigee: number = 400, limit: number = 20) => {
    try {
        const response = await axios.get(`${API_URL}/reentry/candidates/scan`, {
            params: { max_perigee_km: maxPerigee, limit }
        });
        return response.data;
    } catch (error) {
        console.error("Failed to fetch reentry candidates", error);
        return { count: 0, candidates: [] };
    }
};

/**
 * Fetch catalog statistics (real counts from database)
 */
export interface CatalogStats {
    total_satellites: number;
    active_satellites: number;
    payload_count: number;
    rocket_body_count: number;
    debris_count: number;
    total_tles: number;
    inactive_count: number;
}

export const fetchCatalogStats = async (): Promise<CatalogStats | null> => {
    try {
        const response = await axios.get(`${API_URL}/stats/overview`);
        return response.data;
    } catch (error) {
        console.error("Failed to fetch catalog stats", error);
        return null;
    }
};
export interface LaunchEvent {
    id: string;
    name: string;
    vehicle: string;
    site_name: string;
    pad_name: string;
    pad_lat?: number;
    pad_lon?: number;
    date: string;
    status: string;
    orbit: string;
    description?: string;
}

export const fetchUpcomingLaunches = async (limit: number = 10): Promise<LaunchEvent[]> => {
    try {
        const response = await axios.get(`${API_URL}/launches/upcoming`, { params: { limit } });
        return response.data;
    } catch (error) {
        console.error("Failed to fetch upcoming launches", error);
        return [];
    }
}


export interface AnomalyData {
    status: string;
    anomalies: any[];
    name?: string;
}

export const fetchAnomalyAnalysis = async (noradId: number, zThreshold: number = 3.0): Promise<AnomalyData | null> => {
    try {
        const response = await axios.get(`${API_URL}/analytics/anomaly/${noradId}`, { params: { z_threshold: zThreshold } });
        return response.data;
    } catch (error) {
        console.error("Failed to fetch anomaly analysis", error);
        return null;
    }
};
