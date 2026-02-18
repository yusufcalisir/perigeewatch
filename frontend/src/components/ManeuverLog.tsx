import React from 'react';
import { ManeuverEvent } from '../hooks/useWorkerPositions';

interface ManeuverLogProps {
    maneuvers: ManeuverEvent[];
    onFocusSat?: (noradId: number) => void;
}

const ManeuverLog: React.FC<ManeuverLogProps> = ({ maneuvers, onFocusSat }) => {
    if (maneuvers.length === 0) {
        return (
            <div className="p-3 text-[10px] text-white/30 font-mono uppercase tracking-widest">
                No maneuvers detected // Monitoring ΔV anomalies...
            </div>
        );
    }

    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between px-1 mb-2">
                <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest">Maneuver_Log</span>
                <span className="text-[9px] font-mono text-white/20">{maneuvers.length} events</span>
            </div>

            {maneuvers.slice(0, 10).map((m, i) => (
                <button
                    key={`${m.norad_id}-${m.timestamp}-${i}`}
                    onClick={() => onFocusSat?.(m.norad_id)}
                    className="w-full text-left bg-black/30 border border-red-500/20 rounded p-2 hover:border-red-500/40 transition-all duration-200"
                >
                    <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                            <span className="text-[10px] font-bold text-red-400">ΔV DETECTED</span>
                        </div>
                        <span className="text-[9px] font-mono text-white/20">
                            {new Date(m.timestamp).toLocaleTimeString()}
                        </span>
                    </div>
                    <div className="text-[10px] font-mono text-white/60 mb-0.5 truncate">
                        {m.name || `NORAD #${m.norad_id}`}
                    </div>
                    <div className="flex items-center gap-3 text-[9px] font-mono">
                        <span className="text-white/30">
                            ΔV: <span className="text-red-400">{(m.deltaV * 1000).toFixed(1)} m/s</span>
                        </span>
                        <span className="text-white/30">
                            {m.prevVelocity.toFixed(3)} → {m.newVelocity.toFixed(3)} km/s
                        </span>
                    </div>
                </button>
            ))}
        </div>
    );
};

export default ManeuverLog;
