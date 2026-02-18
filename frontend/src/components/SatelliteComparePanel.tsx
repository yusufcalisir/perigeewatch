import React, { useState, useEffect } from 'react';
import { X, ArrowLeftRight, Orbit, MapPin, Gauge, ArrowUpRight, ArrowDownRight, ChevronDown, ChevronUp } from 'lucide-react';
import { fetchSatelliteDetail, type SatelliteDetail } from '../services/api';
import { parseTLE, type OrbitalElements, getTLEAgeString } from '../utils/tleParser';

interface CompareData {
    detail: SatelliteDetail;
    elements: OrbitalElements;
    currentLat?: number;
    currentLon?: number;
    currentAlt?: number;
    currentVelocity?: number;
}

interface SatelliteComparePanelProps {
    satA: { noradId: number; lat: number; lon: number; alt: number; velocity: number };
    satB: { noradId: number; lat: number; lon: number; alt: number; velocity: number };
    onClose: () => void;
}

const SatelliteComparePanel: React.FC<SatelliteComparePanelProps> = ({ satA, satB, onClose }) => {
    const [dataA, setDataA] = useState<CompareData | null>(null);
    const [dataB, setDataB] = useState<CompareData | null>(null);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(true);

    useEffect(() => {
        setLoading(true);
        Promise.all([
            fetchSatelliteDetail(satA.noradId),
            fetchSatelliteDetail(satB.noradId),
        ]).then(([detailA, detailB]) => {
            if (detailA?.tle) {
                try {
                    const elemA = parseTLE(detailA.tle.line1, detailA.tle.line2);
                    setDataA({ detail: detailA, elements: elemA, currentLat: satA.lat, currentLon: satA.lon, currentAlt: satA.alt, currentVelocity: satA.velocity });
                } catch { }
            }
            if (detailB?.tle) {
                try {
                    const elemB = parseTLE(detailB.tle.line1, detailB.tle.line2);
                    setDataB({ detail: detailB, elements: elemB, currentLat: satB.lat, currentLon: satB.lon, currentAlt: satB.alt, currentVelocity: satB.velocity });
                } catch { }
            }
            setLoading(false);
        });
    }, [satA.noradId, satB.noradId]);

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center bg-[#0a0e1a]/95">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
                    <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Loading Comparison...</span>
                </div>
            </div>
        );
    }

    if (!dataA || !dataB) {
        return (
            <div className="h-full flex items-center justify-center bg-[#0a0e1a]/95">
                <span className="text-[10px] text-white/40">Failed to load satellite data.</span>
            </div>
        );
    }

    const rows: { label: string; valA: string; valB: string; unit?: string; highlight?: boolean }[] = [
        { label: 'NORAD ID', valA: `${satA.noradId}`, valB: `${satB.noradId}` },
        { label: 'TYPE', valA: dataA.detail.satellite.object_type || 'N/A', valB: dataB.detail.satellite.object_type || 'N/A' },
        { label: 'OWNER', valA: dataA.detail.satellite.owner || '—', valB: dataB.detail.satellite.owner || '—' },
        { label: 'COUNTRY', valA: dataA.detail.satellite.country_code || '—', valB: dataB.detail.satellite.country_code || '—' },
        { label: 'LAUNCH', valA: dataA.detail.satellite.launch_date ? new Date(dataA.detail.satellite.launch_date).getFullYear().toString() : '—', valB: dataB.detail.satellite.launch_date ? new Date(dataB.detail.satellite.launch_date).getFullYear().toString() : '—' },
        { label: 'PURPOSE', valA: dataA.detail.satellite.purpose || '—', valB: dataB.detail.satellite.purpose || '—' },
        { label: 'ORBIT', valA: dataA.elements.orbitType, valB: dataB.elements.orbitType },
        { label: 'ALT', valA: `${(dataA.currentAlt ?? 0).toFixed(1)}`, valB: `${(dataB.currentAlt ?? 0).toFixed(1)}`, unit: 'km', highlight: true },
        { label: 'VEL', valA: `${(dataA.currentVelocity ?? 0).toFixed(3)}`, valB: `${(dataB.currentVelocity ?? 0).toFixed(3)}`, unit: 'km/s' },
        { label: 'INC', valA: `${dataA.elements.inclination.toFixed(4)}`, valB: `${dataB.elements.inclination.toFixed(4)}`, unit: '°' },
        { label: 'ECC', valA: dataA.elements.eccentricity.toFixed(7), valB: dataB.elements.eccentricity.toFixed(7) },
        { label: 'PERIOD', valA: `${dataA.elements.period.toFixed(2)}`, valB: `${dataB.elements.period.toFixed(2)}`, unit: 'min', highlight: true },
        { label: 'APOGEE', valA: `${dataA.elements.apogee.toFixed(1)}`, valB: `${dataB.elements.apogee.toFixed(1)}`, unit: 'km' },
        { label: 'PERIGEE', valA: `${dataA.elements.perigee.toFixed(1)}`, valB: `${dataB.elements.perigee.toFixed(1)}`, unit: 'km' },
        { label: 'SMA', valA: `${dataA.elements.semiMajorAxis.toFixed(1)}`, valB: `${dataB.elements.semiMajorAxis.toFixed(1)}`, unit: 'km' },
        { label: 'RAAN', valA: `${dataA.elements.raan.toFixed(4)}`, valB: `${dataB.elements.raan.toFixed(4)}`, unit: '°' },
        { label: 'M.MOT', valA: `${dataA.elements.meanMotion.toFixed(4)}`, valB: `${dataB.elements.meanMotion.toFixed(4)}`, unit: 'rev/d' },
        { label: 'TLE AGE', valA: getTLEAgeString(dataA.elements.epochDate), valB: getTLEAgeString(dataB.elements.epochDate) },
    ];

    return (
        <div className="h-full flex flex-col bg-[#0a0e1a]/95 text-white overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-gradient-to-r from-purple-500/10 to-cyan-500/10">
                <div className="flex items-center gap-2">
                    <ArrowLeftRight size={14} className="text-purple-400" />
                    <span className="text-[10px] font-bold text-white/60 uppercase tracking-widest">Orbital Comparison</span>
                </div>
                <button onClick={onClose} className="p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors">
                    <X size={16} />
                </button>
            </div>

            {/* Satellite Names Row */}
            <div className="grid grid-cols-[80px_1fr_1fr] px-4 py-2 border-b border-white/5 bg-white/[0.02]">
                <div />
                <div className="text-center">
                    <div className="text-[9px] font-mono text-cyan-400 truncate">{dataA.detail.satellite.name}</div>
                    <div className="text-[8px] text-white/30">#{satA.noradId}</div>
                </div>
                <div className="text-center">
                    <div className="text-[9px] font-mono text-purple-400 truncate">{dataB.detail.satellite.name}</div>
                    <div className="text-[8px] text-white/30">#{satB.noradId}</div>
                </div>
            </div>

            {/* Comparison Table */}
            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="w-full flex items-center gap-2 px-4 py-2 text-[9px] font-bold text-white/40 uppercase tracking-widest hover:bg-white/5"
                >
                    <Orbit size={10} />
                    Orbital Elements
                    {expanded ? <ChevronUp size={10} className="ml-auto" /> : <ChevronDown size={10} className="ml-auto" />}
                </button>

                {expanded && (
                    <div className="divide-y divide-white/5">
                        {rows.map(row => {
                            const isHigher = parseFloat(row.valA) > parseFloat(row.valB);
                            const isLower = parseFloat(row.valA) < parseFloat(row.valB);
                            return (
                                <div key={row.label} className="grid grid-cols-[80px_1fr_1fr] px-4 py-1.5 hover:bg-white/[0.02] transition-colors">
                                    <span className="text-[8px] font-mono text-white/30 uppercase self-center">{row.label}</span>
                                    <span className={`text-[10px] font-mono text-center ${row.highlight ? 'text-cyan-400 font-bold' : 'text-white/70'}`}>
                                        {row.valA}{row.unit ? ` ${row.unit}` : ''}
                                        {isHigher && <span className="text-[7px] text-green-400 ml-1">▲</span>}
                                        {isLower && <span className="text-[7px] text-red-400 ml-1">▼</span>}
                                    </span>
                                    <span className={`text-[10px] font-mono text-center ${row.highlight ? 'text-purple-400 font-bold' : 'text-white/70'}`}>
                                        {row.valB}{row.unit ? ` ${row.unit}` : ''}
                                        {isLower && <span className="text-[7px] text-green-400 ml-1">▲</span>}
                                        {isHigher && <span className="text-[7px] text-red-400 ml-1">▼</span>}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Delta Summary */}
                <div className="px-4 py-3 border-t border-white/10 bg-white/[0.02]">
                    <div className="text-[9px] font-bold text-white/40 uppercase tracking-widest mb-2">Deltas</div>
                    <div className="grid grid-cols-3 gap-2">
                        <DeltaCell
                            label="ΔAlt"
                            value={`${Math.abs((dataA.currentAlt ?? 0) - (dataB.currentAlt ?? 0)).toFixed(1)} km`}
                        />
                        <DeltaCell
                            label="ΔInc"
                            value={`${Math.abs(dataA.elements.inclination - dataB.elements.inclination).toFixed(4)}°`}
                        />
                        <DeltaCell
                            label="ΔPeriod"
                            value={`${Math.abs(dataA.elements.period - dataB.elements.period).toFixed(2)} min`}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

const DeltaCell: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <div className="p-2 bg-white/[0.03] rounded border border-white/5">
        <div className="text-[7px] font-mono text-white/30 uppercase">{label}</div>
        <div className="text-[10px] font-mono text-amber-400 font-bold mt-0.5">{value}</div>
    </div>
);

export default SatelliteComparePanel;
