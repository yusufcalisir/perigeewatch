import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';

export interface ReentryCandidate {
    norad_id: number;
    name: string;
    reentry_risk: 'imminent' | 'high' | 'moderate' | 'low' | 'negligible' | 'none' | 'unknown';
    estimated_days_remaining: number | null;
    estimated_reentry_date: string | null;
    perigee_alt_km: number;
    current_alt_km: number;
    current_velocity_km_s: number;
}

export interface ReentryResponse {
    count: number;
    max_perigee_km: number;
    candidates: ReentryCandidate[];
}

export const fetchReentryCandidates = async (maxPerigee: number = 400): Promise<ReentryCandidate[]> => {
    try {
        const response = await axios.get<ReentryResponse>(`${API_URL}/reentry/candidates/scan`, {
            params: { max_perigee_km: maxPerigee, limit: 50 }
        });
        return response.data.candidates;
    } catch (error) {
        console.error("Failed to fetch reentry candidates", error);
        return [];
    }
};
