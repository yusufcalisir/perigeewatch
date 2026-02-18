import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';

export type RiskLevel = 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';

export interface Vector3 {
    x: number;
    y: number;
    z: number;
}

export interface ConjunctionEvent {
    sat1_norad: number;
    sat1_name: string;
    sat2_norad: number;
    sat2_name: string;
    timestamp: string;
    distance: number;
    threshold: number;
    risk_level?: string;
    sat1_position: Vector3;
    sat2_position: Vector3;
}

export const fetchConjunctions = async (
    startTime?: string,
    endTime?: string,
    threshold: number = 50
): Promise<ConjunctionEvent[]> => {
    try {
        const params: any = { threshold_km: threshold };
        if (startTime) params.start_time = startTime;
        if (endTime) params.end_time = endTime;

        const response = await axios.get(`${API_URL}/conjunctions/`, { params });
        return response.data;
    } catch (error) {
        console.error("Failed to fetch conjunctions", error);
        return [];
    }
};

export interface PoCResult {
    sat1_norad: number;
    sat2_norad: number;
    tca: string;
    poc: number;
    risk_level: string;
    nominal_miss_distance_km: number;
    monte_carlo_samples: number;
    monte_carlo_hits: number;
}

export const assessCollisionRisk = async (
    sat1: number,
    sat2: number,
    tca: string,
    samples: number = 2000
): Promise<PoCResult | null> => {
    try {
        const response = await axios.get(`${API_URL}/analytics/poc/${sat1}/${sat2}`, {
            params: { tca, samples }
        });
        return response.data;
    } catch (error) {
        console.error("Failed to assess collision risk", error);
        return null;
    }
}

export const getRiskLevel = (distance: number): RiskLevel => {
    if (distance < 1) return 'CRITICAL';
    if (distance < 5) return 'HIGH';
    if (distance < 25) return 'MODERATE';
    return 'LOW';
};

export const getRiskColor = (level: RiskLevel): string => {
    switch (level) {
        case 'CRITICAL': return '#FF3B30';
        case 'HIGH': return '#FF9500';
        case 'MODERATE': return '#FFCC00';
        default: return '#00D1FF';
    }
};
