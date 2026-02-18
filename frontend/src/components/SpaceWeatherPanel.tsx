import React, { useEffect, useState } from 'react';
import { fetchAllSpaceWeather, SpaceWeatherData, getStormScale } from '../services/spaceWeather';

const SpaceWeatherPanel: React.FC = () => {
    const [data, setData] = useState<SpaceWeatherData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            const result = await fetchAllSpaceWeather();
            setData(result);
            setLoading(false);
        };

        load();

        // Auto-refresh: solar wind every 60s, full data every 5min
        const fastInterval = setInterval(async () => {
            const result = await fetchAllSpaceWeather();
            setData(result);
        }, 60000);

        return () => clearInterval(fastInterval);
    }, []);

    if (loading || !data) {
        return (
            <div className="p-3 text-[10px] text-white/30 font-mono uppercase tracking-widest animate-pulse">
                Syncing NOAA/SWPC Feed...
            </div>
        );
    }

    const storm = getStormScale(data.kpCurrent);

    // Kp bar chart (last 8 readings)
    const recentKp = data.kpHistory.slice(-8);
    const maxKp = 9;

    return (
        <div className="space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest">Space_Weather</span>
                <span className="text-[9px] font-mono text-white/20">NOAA/SWPC LIVE</span>
            </div>

            {/* Storm Level */}
            <div className="bg-black/40 border rounded p-2.5" style={{ borderColor: storm.color + '40' }}>
                <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ backgroundColor: storm.color }} />
                        <span className="text-xs font-bold" style={{ color: storm.color }}>{storm.level}</span>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: storm.color }}>
                        {storm.label}
                    </span>
                </div>
                <div className="text-[10px] font-mono text-white/40">
                    Kp Index: <span className="text-white/80">{data.kpCurrent.toFixed(1)}</span>
                </div>
            </div>

            {/* Kp Bar Chart */}
            <div className="bg-black/20 rounded p-2">
                <div className="text-[9px] font-mono text-white/30 mb-1.5 uppercase">Kp History (24h)</div>
                <div className="flex items-end gap-0.5 h-10">
                    {recentKp.map((point, i) => {
                        const height = (point.kp / maxKp) * 100;
                        const pointStorm = getStormScale(point.kp);
                        return (
                            <div
                                key={i}
                                className="flex-1 rounded-t transition-all duration-500"
                                style={{
                                    height: `${Math.max(height, 5)}%`,
                                    backgroundColor: pointStorm.color + '80',
                                    minWidth: '3px'
                                }}
                                title={`${point.time}: Kp ${point.kp.toFixed(1)}`}
                            />
                        );
                    })}
                </div>
            </div>

            {/* Solar Wind & Mag Field */}
            <div className="grid grid-cols-2 gap-2">
                <div className="bg-black/20 rounded p-2">
                    <div className="text-[9px] font-mono text-white/30 uppercase mb-1">Solar Wind</div>
                    <div className="text-sm font-bold font-mono" style={{
                        color: data.solarWind.speed > 600 ? '#FF8C00' : data.solarWind.speed > 400 ? '#FFD700' : '#00D1FF'
                    }}>
                        {data.solarWind.speed.toFixed(0)}
                    </div>
                    <div className="text-[9px] text-white/30 font-mono">KM/S</div>
                </div>
                <div className="bg-black/20 rounded p-2">
                    <div className="text-[9px] font-mono text-white/30 uppercase mb-1">Bz (IMF)</div>
                    <div className="text-sm font-bold font-mono" style={{
                        color: data.magField.bz < -5 ? '#FF4500' : data.magField.bz < 0 ? '#FFD700' : '#00FF88'
                    }}>
                        {data.magField.bz > 0 ? '+' : ''}{data.magField.bz.toFixed(1)}
                    </div>
                    <div className="text-[9px] text-white/30 font-mono">nT {data.magField.bz < 0 ? '↓ SOUTH' : '↑ NORTH'}</div>
                </div>
            </div>

            {/* Bt */}
            <div className="flex items-center justify-between text-[10px] font-mono px-1">
                <span className="text-white/30">Bt (Total Field)</span>
                <span className="text-white/60">{data.magField.bt.toFixed(1)} nT</span>
            </div>

            {/* Last Update */}
            <div className="text-[9px] font-mono text-white/15 text-right">
                Updated: {data.solarWind.timestamp ? new Date(data.solarWind.timestamp + 'Z').toLocaleTimeString() : 'N/A'}
            </div>
        </div>
    );
};

export default SpaceWeatherPanel;
