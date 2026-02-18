import React, { useState } from 'react';

// ── Pre-computed debris field data ──
// Based on real orbital parameters from USSPACECOM tracking data
// Cosmos-1408 ASAT test (Nov 15, 2021): ~1500 tracked fragments at ~480km
// Iridium-33/Cosmos-2251 collision (Feb 10, 2009): ~2000 fragments at ~790km

interface DebrisFragment {
    lat: number;
    lon: number;
    alt: number; // km
    size: 'large' | 'medium' | 'small';
}

// Generate realistic debris cloud using orbital mechanics approximation
// Fragments spread along the original orbital plane
function generateDebrisField(
    inclination: number,
    altitude: number,
    raan: number,
    count: number,
    altSpread: number
): DebrisFragment[] {
    const fragments: DebrisFragment[] = [];
    const sizes: Array<'large' | 'medium' | 'small'> = ['large', 'medium', 'small'];

    for (let i = 0; i < count; i++) {
        // Distribute fragments along the orbital path with some spread
        const trueAnomaly = (i / count) * 360 + (Math.random() - 0.5) * 15;
        const incRad = (inclination + (Math.random() - 0.5) * 2) * Math.PI / 180;
        const raanRad = (raan + (Math.random() - 0.5) * 5) * Math.PI / 180;
        const thetaRad = trueAnomaly * Math.PI / 180;

        // Simplified orbital to geographic conversion
        const lat = Math.asin(Math.sin(incRad) * Math.sin(thetaRad)) * 180 / Math.PI;
        const lon = (raanRad * 180 / Math.PI + Math.atan2(
            Math.cos(incRad) * Math.sin(thetaRad),
            Math.cos(thetaRad)
        ) * 180 / Math.PI + (Math.random() - 0.5) * 10) % 360 - 180;

        const alt = altitude + (Math.random() - 0.5) * altSpread;

        fragments.push({
            lat,
            lon,
            alt,
            size: sizes[Math.floor(Math.random() * 3)]
        });
    }

    return fragments;
}

// Pre-generated debris fields
const DEBRIS_FIELDS = {
    'cosmos-1408': {
        name: 'Cosmos-1408',
        event: 'Russian ASAT Test',
        date: '2021-11-15',
        fragments: generateDebrisField(82.6, 480, 45, 400, 60),
        color: '#FF4500',
        totalTracked: 1632
    },
    'iridium-cosmos': {
        name: 'Iridium-33 / Cosmos-2251',
        event: 'Satellite Collision',
        date: '2009-02-10',
        fragments: generateDebrisField(86.4, 790, 120, 350, 80),
        color: '#FF00FF',
        totalTracked: 2296
    }
};

interface DebrisCloudPanelProps {
    onToggleDebrisField?: (fieldId: string, fragments: DebrisFragment[], color: string, visible: boolean) => void;
}

const DebrisCloudPanel: React.FC<DebrisCloudPanelProps> = ({ onToggleDebrisField }) => {
    const [activeFields, setActiveFields] = useState<Set<string>>(new Set());

    const toggleField = (fieldId: string) => {
        const field = DEBRIS_FIELDS[fieldId as keyof typeof DEBRIS_FIELDS];
        const newActive = new Set(activeFields);
        const isNowVisible = !activeFields.has(fieldId);

        if (isNowVisible) {
            newActive.add(fieldId);
        } else {
            newActive.delete(fieldId);
        }

        setActiveFields(newActive);
        onToggleDebrisField?.(fieldId, field.fragments, field.color, isNowVisible);
    };

    return (
        <div className="space-y-2">
            <div className="text-[10px] font-bold text-white/50 uppercase tracking-widest">Debris_Fields</div>

            {Object.entries(DEBRIS_FIELDS).map(([id, field]) => {
                const isActive = activeFields.has(id);

                return (
                    <button
                        key={id}
                        onClick={() => toggleField(id)}
                        className={`w-full text-left bg-black/30 border rounded p-2.5 transition-all duration-300 ${isActive
                                ? 'border-opacity-60'
                                : 'border-white/10 hover:border-white/20'
                            }`}
                        style={isActive ? { borderColor: field.color + '60', boxShadow: `0 0 10px ${field.color}15` } : {}}
                    >
                        <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                                <div
                                    className={`w-2 h-2 rounded-full ${isActive ? 'animate-pulse' : 'opacity-40'}`}
                                    style={{ backgroundColor: field.color }}
                                />
                                <span className="text-[11px] font-bold text-white/80">{field.name}</span>
                            </div>
                            <span className={`text-[9px] font-mono uppercase ${isActive ? 'text-green-400' : 'text-white/20'}`}>
                                {isActive ? 'ACTIVE' : 'OFF'}
                            </span>
                        </div>
                        <div className="text-[9px] font-mono text-white/30 space-y-0.5">
                            <div>{field.event} — {field.date}</div>
                            <div>{field.totalTracked.toLocaleString()} tracked fragments</div>
                        </div>
                    </button>
                );
            })}

            <div className="text-[8px] font-mono text-white/15 px-1">
                * Fragment positions are approximated from orbital elements
            </div>
        </div>
    );
};

export default DebrisCloudPanel;
export type { DebrisFragment };
