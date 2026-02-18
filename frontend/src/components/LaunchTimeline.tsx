import React, { useEffect, useState } from 'react';
import { fetchUpcomingLaunches, LaunchEvent } from '../services/api';

interface LaunchTimelineProps {
    onLaunchSelect?: (launch: LaunchEvent) => void;
}

function getTimeUntilLaunch(dateStr: string): string {
    const launchDate = new Date(dateStr);

    // Check if date is valid
    if (isNaN(launchDate.getTime())) return 'TBD';

    const now = new Date();
    const diff = launchDate.getTime() - now.getTime();

    if (diff < 0) return 'LAUNCHED';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) return `T-${days}d ${hours}h`;
    if (hours > 0) return `T-${hours}h ${minutes}m`;
    return `T-${minutes}m`;
}

function getStatusColor(status: string): string {
    switch (status) {
        case 'GO': return '#00FF88';
        case 'SUCCESS': return '#00D1FF';
        case 'HOLD': return '#FFD700';
        default: return '#FFFFFF40';
    }
}

const LaunchTimeline: React.FC<LaunchTimelineProps> = ({ onLaunchSelect }) => {
    const [launches, setLaunches] = useState<LaunchEvent[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            const data = await fetchUpcomingLaunches(10);
            setLaunches(data);
            setLoading(false);
        };
        load();

        // Refresh every 15 minutes
        const interval = setInterval(load, 15 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    // Tick countdown every minute
    const [, setTick] = useState(0);
    useEffect(() => {
        const timer = setInterval(() => setTick(t => t + 1), 60000);
        return () => clearInterval(timer);
    }, []);

    if (loading) {
        return (
            <div className="text-[10px] text-white/30 font-mono uppercase tracking-widest animate-pulse p-2">
                Fetching launch manifest...
            </div>
        );
    }

    if (launches.length === 0) {
        return (
            <div className="text-[10px] text-white/30 font-mono p-2">
                No upcoming launches found
            </div>
        );
    }

    return (
        <div className="overflow-x-auto scrollbar-none hover:scrollbar-thin transition-all snap-x snap-mandatory">
            <div className="flex gap-2 pb-1" style={{ minWidth: 'max-content' }}>
                {launches.map((launch) => (
                    <div
                        key={launch.id}
                        onClick={() => onLaunchSelect && onLaunchSelect(launch)}
                        className={`flex-shrink-0 w-[calc(100vw-3.5rem)] xs:w-48 bg-black/20 border border-white/5 rounded p-1.5 transition-all duration-200 group relative overflow-hidden snap-center ${onLaunchSelect ? 'cursor-pointer hover:bg-white/5 hover:border-cyber-blue/50 hover:shadow-[0_0_10px_rgba(0,243,255,0.1)]' : ''}`}
                    >
                        {/* Hover Effect Highlight */}
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:animate-shimmer" />

                        {/* Countdown & Status */}
                        <div className="flex items-center justify-between mb-1 relative z-10">
                            <span className="text-[9px] font-bold font-mono" style={{ color: getStatusColor(launch.status) }}>
                                {getTimeUntilLaunch(launch.date)}
                            </span>
                            <span className="text-[8px] font-mono px-1 py-0.5 rounded border border-white/10 text-white/40">
                                {launch.status}
                            </span>
                        </div>

                        {/* Mission Name */}
                        <div className="text-[9px] font-bold text-white/70 mb-1 leading-tight relative z-10 group-hover:text-cyber-blue transition-colors" title={launch.name}>
                            {launch.name}
                        </div>

                        {/* Details */}
                        <div className="flex flex-col gap-0.5 text-[8px] font-mono text-white/20 relative z-10">
                            <div className="flex items-center gap-1.5 min-w-0">
                                <span className="opacity-50">🚀</span>
                                <span className="break-words group-hover:text-white/40 transition-colors">{launch.vehicle}</span>
                            </div>
                            <div className="flex items-center gap-1.5 min-w-0">
                                <span className="opacity-50">📍</span>
                                <span className="break-words group-hover:text-white/40 transition-colors">{launch.site_name}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default LaunchTimeline;
