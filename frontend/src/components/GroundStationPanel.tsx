import React from 'react';
import { Radio, Clock, Eye, ChevronRight, Signal } from 'lucide-react';
import { VisibleSatellite, SatellitePass } from '../services/groundStation';

interface GroundStationPanelProps {
    visibleSats: VisibleSatellite[];
    passes: SatellitePass[];
    onFocusSat?: (noradId: number) => void;
}

const GroundStationPanel: React.FC<GroundStationPanelProps> = ({
    visibleSats,
    passes,
    onFocusSat,
}) => {
    const formatDuration = (seconds: number): string => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}m ${s}s`;
    };

    const formatTime = (iso: string): string => {
        try {
            return new Date(iso).toISOString().substring(11, 19);
        } catch {
            return iso;
        }
    };

    return (
        <div className="flex flex-col gap-0">
            {/* Station Header */}
            <div className="px-4 py-3 border-b border-white/10 bg-cyber-green/5">
                <div className="flex items-center gap-2 mb-1">
                    <Radio className="text-cyber-green" size={14} />
                    <span className="text-[10px] font-bold text-cyber-green uppercase tracking-widest">
                        Ankara Ground Station
                    </span>
                </div>
                <div className="text-[9px] font-mono text-white/30">
                    39.9334°N  32.8597°E  938m ASL  ●  10° MASK
                </div>
            </div>

            {/* Currently Visible */}
            <div className="px-4 py-3 border-b border-white/5">
                <div className="flex items-center gap-2 mb-2">
                    <Eye className="text-cyber-blue" size={12} />
                    <span className="text-[10px] font-bold text-white/60 uppercase tracking-widest">
                        In View ({visibleSats.length})
                    </span>
                </div>

                {visibleSats.length === 0 ? (
                    <div className="text-[9px] text-white/20 font-mono py-2">
                        NO_SATELLITES_ABOVE_MASK
                    </div>
                ) : (
                    <div className="flex flex-col gap-1">
                        {visibleSats.slice(0, 8).map((sat) => (
                            <div
                                key={sat.norad_id}
                                className="flex items-center justify-between px-2 py-1.5 rounded bg-white/[0.03] hover:bg-cyber-blue/10 cursor-pointer transition-colors group"
                                onClick={() => onFocusSat?.(sat.norad_id)}
                            >
                                <div className="flex items-center gap-2">
                                    <Signal className="text-cyber-green" size={10} />
                                    <span className="text-[10px] font-bold text-white/70 group-hover:text-cyber-blue uppercase truncate max-w-[120px]">
                                        {sat.name}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-[9px] font-mono text-cyber-green">
                                        {sat.elevation.toFixed(1)}°
                                    </span>
                                    <span className="text-[9px] font-mono text-white/20">
                                        AZ {sat.azimuth.toFixed(0)}°
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Upcoming Passes */}
            <div className="px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                    <Clock className="text-cyber-amber" size={12} />
                    <span className="text-[10px] font-bold text-white/60 uppercase tracking-widest">
                        Next Passes
                    </span>
                </div>

                {passes.length === 0 ? (
                    <div className="text-[9px] text-white/20 font-mono py-2">
                        COMPUTING_PREDICTIONS...
                    </div>
                ) : (
                    <div className="flex flex-col gap-1">
                        {passes.slice(0, 10).map((pass, i) => (
                            <div
                                key={`${pass.norad_id}-${i}`}
                                className="px-2 py-2 rounded bg-white/[0.03] hover:bg-cyber-amber/10 cursor-pointer transition-colors group border-l-2 border-transparent hover:border-cyber-amber/40"
                                onClick={() => onFocusSat?.(pass.norad_id)}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-[10px] font-bold text-white/70 group-hover:text-cyber-amber uppercase truncate max-w-[130px]">
                                        {pass.name}
                                    </span>
                                    <span className="text-[9px] font-mono text-white/20">
                                        #{pass.norad_id}
                                    </span>
                                </div>
                                <div className="grid grid-cols-3 gap-1 text-[9px] font-mono">
                                    <div>
                                        <span className="text-white/25">AOS </span>
                                        <span className="text-white/50">{formatTime(pass.aos)}</span>
                                    </div>
                                    <div>
                                        <span className="text-white/25">LOS </span>
                                        <span className="text-white/50">{formatTime(pass.los)}</span>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-white/25">DUR </span>
                                        <span className="text-white/50">{formatDuration(pass.duration_s)}</span>
                                    </div>
                                </div>
                                <div className="mt-1 flex items-center gap-2">
                                    <div className="flex-1 bg-white/5 rounded-full h-1 overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-cyber-amber/40 to-cyber-amber rounded-full"
                                            style={{ width: `${Math.min(100, (pass.max_elevation / 90) * 100)}%` }}
                                        />
                                    </div>
                                    <span className="text-[8px] font-mono text-cyber-amber/70">
                                        {pass.max_elevation.toFixed(1)}° MAX
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default GroundStationPanel;
