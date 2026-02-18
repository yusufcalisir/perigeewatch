import React, { useState, useEffect } from 'react';
import { X, Orbit, Satellite, MapPin, Clock, Gauge, ArrowUpRight, ArrowDownRight, Activity, Eye, ChevronDown, ChevronUp, Bookmark, BookmarkCheck } from 'lucide-react';
import { fetchSatelliteDetail, fetchSatelliteOrbit, fetchAccessIntervals, type SatelliteDetail, type OrbitPoint } from '../services/api';
import { parseTLE, formatOrbital, getTLEAgeString, type OrbitalElements } from '../utils/tleParser';

interface SatelliteDetailPanelProps {
    noradId: number;
    currentLat: number;
    currentLon: number;
    currentAlt: number;
    currentVelocity: number;
    onClose: () => void;
    onViewOrbit?: () => void;
    watchlist: Set<number>;
    onToggleWatchlist: (noradId: number) => void;
}

const SatelliteDetailPanel: React.FC<SatelliteDetailPanelProps> = ({
    noradId,
    currentLat,
    currentLon,
    currentAlt,
    currentVelocity,
    onClose,
    onViewOrbit,
    watchlist,
    onToggleWatchlist,
}) => {
    const [detail, setDetail] = useState<SatelliteDetail | null>(null);
    const [elements, setElements] = useState<OrbitalElements | null>(null);
    const [loading, setLoading] = useState(true);
    const [showOrbitalElements, setShowOrbitalElements] = useState(true);
    const [accessIntervals, setAccessIntervals] = useState<any>(null);
    const [loadingAccess, setLoadingAccess] = useState(false);

    const isWatched = watchlist.has(noradId);

    // Fetch satellite detail and parse TLE
    useEffect(() => {
        setLoading(true);
        fetchSatelliteDetail(noradId).then((data) => {
            setDetail(data);
            if (data?.tle) {
                try {
                    const parsed = parseTLE(data.tle.line1, data.tle.line2);
                    setElements(parsed);
                } catch (e) {
                    console.error('TLE parse error:', e);
                }
            }
            setLoading(false);
        });
    }, [noradId]);

    // Fetch access intervals
    const loadAccessIntervals = () => {
        setLoadingAccess(true);
        fetchAccessIntervals(noradId, 24).then((data) => {
            setAccessIntervals(data);
            setLoadingAccess(false);
        });
    };

    const getOrbitTypeColor = (type: string) => {
        switch (type) {
            case 'LEO': return 'text-cyan-400';
            case 'MEO': return 'text-yellow-400';
            case 'GEO': return 'text-orange-400';
            case 'HEO': return 'text-red-400';
            default: return 'text-white/60';
        }
    };

    const getObjectTypeLabel = (type: string) => {
        switch (type) {
            case 'PAYLOAD': return { label: 'PAYLOAD', color: 'text-cyan-400', bg: 'bg-cyan-400/10' };
            case 'ROCKET_BODY': return { label: 'R/B', color: 'text-orange-400', bg: 'bg-orange-400/10' };
            case 'DEBRIS': return { label: 'DEBRIS', color: 'text-red-400', bg: 'bg-red-400/10' };
            default: return { label: 'UNKNOWN', color: 'text-white/40', bg: 'bg-white/5' };
        }
    };

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
                    <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Loading Telemetry...</span>
                </div>
            </div>
        );
    }

    const typeInfo = getObjectTypeLabel(detail?.satellite?.object_type || '');

    return (
        <div className="h-full flex flex-col bg-[#0a0e1a]/95 text-white overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-gradient-to-r from-cyan-500/5 to-transparent">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse flex-shrink-0" />
                    <div className="min-w-0">
                        <div className="text-sm font-bold text-white truncate">
                            {detail?.satellite?.name || `NORAD ${noradId}`}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[9px] font-mono text-white/40">#{noradId}</span>
                            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${typeInfo.bg} ${typeInfo.color}`}>
                                {typeInfo.label}
                            </span>
                            {elements && (
                                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded bg-white/5 ${getOrbitTypeColor(elements.orbitType)}`}>
                                    {elements.orbitType}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => onToggleWatchlist(noradId)}
                        className={`p-1.5 rounded-lg transition-colors ${isWatched ? 'text-yellow-400 bg-yellow-400/10' : 'text-white/30 hover:text-white/60 hover:bg-white/5'}`}
                        title={isWatched ? "Remove from Watchlist" : "Add to Watchlist"}
                    >
                        {isWatched ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
                    </button>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors">
                        <X size={16} />
                    </button>
                </div>
            </div>



            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 scrollbar-thin scrollbar-thumb-white/10">

                {/* Satellite Profile (Owner / Mission) */}
                <section>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                        <div className="p-2 bg-white/[0.03] rounded border border-white/5 flex flex-col justify-center">
                            <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest mb-1">Owner / Country</span>
                            <div className="flex items-center gap-2">
                                {/* Simple text for now, could add flag icons later based on country_code */}
                                <span className="text-sm font-bold text-white/90">
                                    {detail?.satellite?.owner || 'Unknown'}
                                </span>
                                {detail?.satellite?.country_code && (
                                    <span className="text-[9px] px-1.5 py-0.5 bg-white/10 rounded text-cyan-400 font-mono">
                                        {detail.satellite.country_code}
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="p-2 bg-white/[0.03] rounded border border-white/5 flex flex-col justify-center">
                            <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest mb-1">Launch Date</span>
                            <div className="text-sm font-bold text-white/90">
                                {detail?.satellite?.launch_date ? new Date(detail.satellite.launch_date).toLocaleDateString() : 'N/A'}
                            </div>
                            <div className="text-[9px] text-white/40 truncate" title={detail?.satellite?.launch_site}>
                                {detail?.satellite?.launch_site || 'Unknown Site'}
                            </div>
                        </div>
                    </div>
                    {detail?.satellite?.purpose && (
                        <div className="px-2 py-1.5 bg-cyan-500/5 border border-cyan-500/20 rounded text-[10px] text-cyan-300">
                            <strong>Mission:</strong> {detail.satellite.purpose}
                        </div>
                    )}
                </section>
                {/* Real-Time Position */}
                <section>
                    <div className="flex items-center gap-2 mb-2">
                        <MapPin size={12} className="text-cyan-400" />
                        <span className="text-[10px] font-bold text-white/60 uppercase tracking-widest">Real-Time Position</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <DataCell label="LAT" value={`${currentLat.toFixed(4)}°`} />
                        <DataCell label="LON" value={`${currentLon.toFixed(4)}°`} />
                        <DataCell label="ALT" value={`${currentAlt.toFixed(1)} km`} highlight />
                        <DataCell label="VEL" value={`${currentVelocity.toFixed(3)} km/s`} />
                    </div>
                </section>

                {/* Orbital Elements (from real TLE) */}
                {elements && (
                    <section>
                        <button
                            onClick={() => setShowOrbitalElements(!showOrbitalElements)}
                            className="flex items-center gap-2 mb-2 w-full group"
                        >
                            <Orbit size={12} className="text-cyan-400" />
                            <span className="text-[10px] font-bold text-white/60 uppercase tracking-widest">Orbital Elements</span>
                            <span className="ml-auto text-white/30 group-hover:text-white/60">
                                {showOrbitalElements ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </span>
                        </button>
                        {showOrbitalElements && (
                            <div className="grid grid-cols-2 gap-2">
                                <DataCell label="INC" value={`${elements.inclination.toFixed(4)}°`} />
                                <DataCell label="RAAN" value={`${elements.raan.toFixed(4)}°`} />
                                <DataCell label="ECC" value={elements.eccentricity.toFixed(7)} />
                                <DataCell label="ARG.P" value={`${elements.argOfPerigee.toFixed(4)}°`} />
                                <DataCell label="M.ANOM" value={`${elements.meanAnomaly.toFixed(4)}°`} />
                                <DataCell label="M.MOT" value={`${elements.meanMotion.toFixed(8)} rev/d`} />
                                <DataCell label="PERIOD" value={`${elements.period.toFixed(2)} min`} highlight />
                                <DataCell label="SMA" value={`${elements.semiMajorAxis.toFixed(1)} km`} />
                                <DataCell label="APOGEE" value={`${elements.apogee.toFixed(1)} km`} icon={<ArrowUpRight size={10} className="text-orange-400" />} />
                                <DataCell label="PERIGEE" value={`${elements.perigee.toFixed(1)} km`} icon={<ArrowDownRight size={10} className="text-green-400" />} />
                                <DataCell label="REV#" value={`${elements.revNumber}`} />
                                <DataCell label="BSTAR" value={elements.bstar.toExponential(4)} />
                            </div>
                        )}
                    </section>
                )}

                {/* TLE Metadata */}
                {detail?.tle && elements && (
                    <section>
                        <div className="flex items-center gap-2 mb-2">
                            <Clock size={12} className="text-cyan-400" />
                            <span className="text-[10px] font-bold text-white/60 uppercase tracking-widest">TLE Data</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <DataCell label="EPOCH" value={elements.epochDate.toISOString().split('T')[0]} />
                            <DataCell label="AGE" value={getTLEAgeString(elements.epochDate)} />
                            <DataCell label="SOURCE" value={detail.tle.source.toUpperCase()} />
                            <DataCell label="INTL.DES" value={elements.internationalDesignator || 'N/A'} />
                        </div>
                        <div className="mt-2 p-2 bg-black/40 rounded border border-white/5 font-mono text-[8px] text-white/30 leading-relaxed overflow-x-auto">
                            <div>{detail.tle.line1}</div>
                            <div>{detail.tle.line2}</div>
                        </div>
                    </section>
                )}

                {/* Access Intervals */}
                <section>
                    <div className="flex items-center gap-2 mb-2">
                        <Eye size={12} className="text-cyan-400" />
                        <span className="text-[10px] font-bold text-white/60 uppercase tracking-widest">Access Intervals</span>
                        {!accessIntervals && (
                            <button
                                onClick={loadAccessIntervals}
                                disabled={loadingAccess}
                                className="ml-auto text-[9px] text-cyan-400 hover:text-cyan-300 font-bold uppercase tracking-wider"
                            >
                                {loadingAccess ? 'Computing...' : 'Calculate'}
                            </button>
                        )}
                    </div>
                    {accessIntervals && (
                        <div className="space-y-1.5">
                            <div className="text-[9px] text-white/40 mb-1">
                                {accessIntervals.count} passes in next {accessIntervals.window_hours}h
                            </div>
                            {accessIntervals.intervals?.slice(0, 5).map((iv: any, i: number) => (
                                <div key={i} className="flex items-center gap-2 p-2 bg-white/5 rounded border border-white/5">
                                    <div className="w-1.5 h-1.5 bg-green-400 rounded-full flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[9px] font-mono text-white/60">
                                            {new Date(iv.start).toLocaleTimeString()} — {new Date(iv.end).toLocaleTimeString()}
                                        </div>
                                        <div className="text-[8px] text-white/30">
                                            Max El: {iv.max_elevation?.toFixed(1)}° · {Math.round(iv.duration_s)}s
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* Action: View Orbit */}
                {onViewOrbit && (
                    <button
                        onClick={onViewOrbit}
                        className="w-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-[10px] font-bold py-2.5 rounded-lg hover:bg-cyan-500/20 transition-colors uppercase tracking-widest flex items-center justify-center gap-2"
                    >
                        <Activity size={14} />
                        Trace Full Orbit
                    </button>
                )}
            </div>
        </div >
    );
};

// ── Data Cell Component ──
const DataCell: React.FC<{
    label: string;
    value: string;
    highlight?: boolean;
    icon?: React.ReactNode;
}> = ({ label, value, highlight, icon }) => (
    <div className="p-2 bg-white/[0.03] rounded border border-white/5">
        <div className="text-[8px] font-mono text-white/30 uppercase tracking-wider flex items-center gap-1">
            {icon}
            {label}
        </div>
        <div className={`text-[11px] font-mono mt-0.5 ${highlight ? 'text-cyan-400 font-bold' : 'text-white/80'}`}>
            {value}
        </div>
    </div>
);

export default SatelliteDetailPanel;
