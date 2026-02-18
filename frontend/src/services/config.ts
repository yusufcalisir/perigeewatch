const getApiUrl = () => {
    const baseUrl = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || 'http://localhost:3001';
    // Ensure we don't double up on /api/v1 and ensure it's present
    if (baseUrl.includes('/api/v1')) {
        return baseUrl;
    }
    return `${baseUrl.replace(/\/$/, '')}/api/v1`;
};

const getWsUrl = () => {
    const wsUrl = import.meta.env.VITE_WS_URL;
    if (wsUrl) return wsUrl;

    const apiUrl = getApiUrl();
    return apiUrl.replace('http', 'ws').replace('/api/v1', '/ws/positions');
};

export const API_URL = getApiUrl();
export const WS_URL = getWsUrl();
