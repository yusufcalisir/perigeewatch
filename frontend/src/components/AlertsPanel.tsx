import React from 'react';
import { AlertTriangle, Crosshair } from 'lucide-react';
import { ConjunctionEvent, getRiskLevel, getRiskColor, RiskLevel } from '../services/conjunctions';
import { clsx } from 'clsx';

interface AlertsPanelProps {
    alerts: ConjunctionEvent[];
    onSelectAlert: (alert: ConjunctionEvent) => void;
}

const AlertsPanel: React.FC<AlertsPanelProps> = ({ alerts, onSelectAlert }) => {
    // Sort by risk (distance ascending)
    const sortedAlerts = [...alerts].sort((a, b) => a.distance - b.distance);

    if (sortedAlerts.length === 0) {
        return (
            <div className="p-8 text-center opacity-50">
                <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-cyber-blue" />
                <p className="text-xs uppercase tracking-widest">No Active Alerts</p>
                <p className="text-[10px] text-white/50 mt-1">Orbit Safe</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-2 p-2">
            {sortedAlerts.map((alert, idx) => {
                const risk = getRiskLevel(alert.distance);
                const color = getRiskColor(risk);

                return (
                    <div
                        key={idx}
                        onClick={() => onSelectAlert(alert)}
                        className="group relative bg-white/5 border border-white/10 hover:border-white/30 rounded p-3 cursor-pointer transition-all hover:bg-white/10"
                        style={{ borderLeftColor: color, borderLeftWidth: '3px' }}
                    >
                        <div className="flex justify-between items-start mb-1">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-white/90 uppercase truncate w-32" title={alert.sat1_name}>{alert.sat1_name}</span>
                                <span className="text-[10px] font-bold text-white/90 uppercase truncate w-32" title={alert.sat2_name}>{alert.sat2_name}</span>
                            </div>
                            <div className="text-right">
                                <div className="text-xs font-mono font-bold" style={{ color }}>
                                    {alert.distance.toFixed(3)} km
                                </div>
                                <div className="text-[9px] text-white/40 font-mono uppercase">
                                    MIN_DIST
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
                            <span className="text-[9px] font-mono text-white/50">
                                {new Date(alert.timestamp).toLocaleTimeString()} UTC
                            </span>
                            <button className="text-[9px] uppercase font-bold text-cyber-blue flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Crosshair size={10} />
                                Focus
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default AlertsPanel;
