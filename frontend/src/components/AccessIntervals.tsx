import React, { useEffect, useState } from 'react';
import axios from 'axios';

import { API_URL } from '../services/config';

interface AccessInterval {
    aos: string;
    los: string;
    duration_s: number;
    max_elevation: number;
    max_el_time: string;
}

interface AccessIntervalsData {
    norad_id: number;
    satellite_name: string;
    station: string;
    intervals: AccessInterval[];
    count: number;
}

interface AccessIntervalsProps {
    noradId: number | null;
}

const AccessIntervals: React.FC<AccessIntervalsProps> = ({ noradId }) => {
    const [data, setData] = useState<AccessIntervalsData | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!noradId) {
            setData(null);
            return;
        }

        const load = async () => {
            setLoading(true);
            try {
                const response = await axios.get(
                    `${API_URL}/satellites/${noradId}/access-intervals`,
                    { params: { hours: 24 } }
                );
                setData(response.data);
            } catch (err) {
                console.error('Failed to fetch access intervals:', err);
                setData(null);
            }
            setLoading(false);
        };

        load();
    }, [noradId]);

    if (!noradId) {
        return (
            <div className="p-3 text-[10px] text-white/30 font-mono uppercase tracking-widest">
                Select a satellite to view access intervals
            </div>
        );
    }

    if (loading) {
        return (
            <div className="p-3 text-[10px] text-white/30 font-mono uppercase tracking-widest animate-pulse">
                Computing visibility windows...
            </div>
        );
    }

    if (!data || data.intervals.length === 0) {
        return (
            <div className="p-3 text-[10px] text-white/30 font-mono uppercase">
                No passes found in next 24h for #{noradId}
            </div>
        );
    }

    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between px-1 mb-2">
                <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest">Access_Intervals</span>
                <span className="text-[9px] font-mono text-white/20">
                    {data.satellite_name} → {data.station}
                </span>
            </div>

            {/* Timeline Bar */}
            <div className="bg-black/30 rounded p-2 mb-2">
                <div className="text-[9px] font-mono text-white/20 mb-1">24h Timeline</div>
                <div className="relative h-3 bg-black/40 rounded overflow-hidden">
                    {data.intervals.map((interval, i) => {
                        const start = new Date(interval.aos).getTime();
                        const now = Date.now();
                        const end24h = now + 24 * 60 * 60 * 1000;
                        const leftPercent = ((start - now) / (end24h - now)) * 100;
                        const widthPercent = (interval.duration_s / (24 * 60 * 60)) * 100;

                        return (
                            <div
                                key={i}
                                className="absolute top-0 h-full rounded"
                                style={{
                                    left: `${Math.max(0, leftPercent)}%`,
                                    width: `${Math.max(0.5, widthPercent)}%`,
                                    backgroundColor: interval.max_elevation > 45 ? '#00FF88' :
                                        interval.max_elevation > 20 ? '#FFD700' : '#FF8C00',
                                    opacity: 0.7
                                }}
                                title={`${interval.max_elevation.toFixed(1)}° max el`}
                            />
                        );
                    })}
                </div>
                <div className="flex justify-between text-[8px] font-mono text-white/15 mt-0.5">
                    <span>NOW</span>
                    <span>+6h</span>
                    <span>+12h</span>
                    <span>+18h</span>
                    <span>+24h</span>
                </div>
            </div>

            {/* Pass List */}
            {data.intervals.slice(0, 8).map((interval, i) => {
                const aos = new Date(interval.aos);
                const los = new Date(interval.los);
                const isActive = Date.now() >= aos.getTime() && Date.now() <= los.getTime();

                return (
                    <div
                        key={i}
                        className={`bg-black/20 border rounded p-2 transition-all ${isActive ? 'border-green-500/40 bg-green-500/5' : 'border-white/5'
                            }`}
                    >
                        <div className="flex items-center justify-between mb-1">
                            <span className={`text-[10px] font-bold ${isActive ? 'text-green-400' : 'text-white/60'}`}>
                                {isActive ? '● IN VIEW' : `Pass ${i + 1}`}
                            </span>
                            <span className="text-[9px] font-mono text-white/30">
                                {Math.round(interval.duration_s)}s
                            </span>
                        </div>
                        <div className="grid grid-cols-3 gap-1 text-[9px] font-mono">
                            <div>
                                <span className="text-white/25">AOS </span>
                                <span className="text-white/50">{aos.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <div>
                                <span className="text-white/25">MAX </span>
                                <span className="text-white/50">{interval.max_elevation.toFixed(1)}°</span>
                            </div>
                            <div>
                                <span className="text-white/25">LOS </span>
                                <span className="text-white/50">{los.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                        </div>
                    </div>
                );
            })}

            <div className="text-[8px] font-mono text-white/10 text-right px-1">
                {data.count} passes in 24h window
            </div>
        </div>
    );
};

export default AccessIntervals;
