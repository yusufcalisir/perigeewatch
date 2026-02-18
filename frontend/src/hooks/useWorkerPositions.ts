import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

import { API_URL } from '../services/config';

export interface WorkerPosition {
    norad_id: number;
    name: string;
    lat: number;
    lon: number;
    alt: number;
    velocity: number;
}

export interface ManeuverEvent {
    norad_id: number;
    name: string;
    deltaV: number;
    prevVelocity: number;
    newVelocity: number;
    timestamp: string;
}

interface UseWorkerPositionsReturn {
    positions: WorkerPosition[];
    maneuvers: ManeuverEvent[];
    isReady: boolean;
    satCount: number;
}

/**
 * React hook that manages the SGP4 propagation WebWorker.
 * 
 * 1. Fetches TLEs from the backend
 * 2. Sends them to the WebWorker for initialization
 * 3. Ticks the worker every `intervalMs` to propagate positions
 * 4. Returns positions and maneuver detections
 */
export function useWorkerPositions(intervalMs: number = 2000): UseWorkerPositionsReturn {
    const [positions, setPositions] = useState<WorkerPosition[]>([]);
    const [maneuvers, setManeuvers] = useState<ManeuverEvent[]>([]);
    const [isReady, setIsReady] = useState(false);
    const [satCount, setSatCount] = useState(0);
    const workerRef = useRef<Worker | null>(null);

    // Initialize worker
    useEffect(() => {
        const worker = new Worker(
            new URL('../workers/propagation.worker.ts', import.meta.url),
            { type: 'module' }
        );

        worker.onmessage = (event) => {
            switch (event.data.type) {
                case 'init_complete':
                    setIsReady(true);
                    setSatCount(event.data.count);
                    console.log(`WebWorker initialized with ${event.data.count} satellites`);
                    break;
                case 'positions':
                    setPositions(event.data.data);
                    break;
                case 'maneuvers':
                    setManeuvers(prev => [...event.data.data, ...prev].slice(0, 50)); // Keep last 50
                    break;
            }
        };

        workerRef.current = worker;

        // Fetch TLEs and send to worker
        const loadTLEs = async () => {
            try {
                const response = await axios.get(`${API_URL}/satellites/tles`, {
                    params: { limit: 5000 }
                });
                worker.postMessage({
                    type: 'init',
                    tles: response.data
                });
            } catch (err) {
                console.error('Failed to fetch TLEs for WebWorker:', err);
            }
        };

        loadTLEs();

        return () => {
            worker.terminate();
            workerRef.current = null;
        };
    }, []);

    // Tick worker at interval
    useEffect(() => {
        if (!isReady || !workerRef.current) return;

        const tick = () => {
            workerRef.current?.postMessage({
                type: 'propagate',
                timestamp: new Date().toISOString()
            });
        };

        tick(); // immediate first tick
        const interval = setInterval(tick, intervalMs);
        return () => clearInterval(interval);
    }, [isReady, intervalMs]);

    return { positions, maneuvers, isReady, satCount };
}
