/**
 * WebSocket service for real-time satellite position streaming.
 * Connects to ws://localhost:3001/ws/positions
 */

import { WS_URL } from './config';

export interface WSPositionData {
    norad_id: number;
    lat: number;
    lon: number;
    alt: number;
    velocity: number;
}

export interface WSMessage {
    type: 'positions' | 'error';
    timestamp?: string;
    count?: number;
    data?: WSPositionData[];
    message?: string;
}

type PositionCallback = (data: WSPositionData[], timestamp: string) => void;
type ErrorCallback = (error: string) => void;

export class PositionWebSocket {
    private ws: WebSocket | null = null;
    private onPosition: PositionCallback;
    private onError: ErrorCallback;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private interval: number;
    private limit: number;
    private shouldReconnect = true;

    constructor(
        onPosition: PositionCallback,
        onError: ErrorCallback = console.error,
        interval = 5,
        limit = 500,
    ) {
        this.onPosition = onPosition;
        this.onError = onError;
        this.interval = interval;
        this.limit = limit;
    }

    connect(): void {
        if (this.ws?.readyState === WebSocket.OPEN) return;

        try {
            this.ws = new WebSocket(WS_URL);

            this.ws.onopen = () => {
                console.log('[WS] Connected to position stream');
                // Send config
                this.ws?.send(JSON.stringify({
                    interval: this.interval,
                    limit: this.limit,
                }));
            };

            this.ws.onmessage = (event) => {
                try {
                    const msg: WSMessage = JSON.parse(event.data);
                    if (msg.type === 'positions' && msg.data && msg.timestamp) {
                        this.onPosition(msg.data, msg.timestamp);
                    } else if (msg.type === 'error') {
                        this.onError(msg.message || 'Unknown WS error');
                    }
                } catch (e) {
                    console.error('[WS] Parse error', e);
                }
            };

            this.ws.onclose = () => {
                console.log('[WS] Disconnected');
                if (this.shouldReconnect) {
                    this.scheduleReconnect();
                }
            };

            this.ws.onerror = (err) => {
                console.error('[WS] Error', err);
            };
        } catch (e) {
            console.error('[WS] Connection failed', e);
            this.scheduleReconnect();
        }
    }

    private scheduleReconnect(): void {
        if (this.reconnectTimer) return;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (this.shouldReconnect) {
                console.log('[WS] Reconnecting...');
                this.connect();
            }
        }, 5000);
    }

    disconnect(): void {
        this.shouldReconnect = false;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.ws?.close();
        this.ws = null;
    }
}
