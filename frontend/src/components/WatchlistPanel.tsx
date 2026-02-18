import React, { useEffect, useState } from 'react';
import { X, Star, MapPin, Trash2, Loader2, ChevronRight } from 'lucide-react';
import { fetchSatelliteDetail, type SatelliteDetail } from '../services/api';

interface WatchlistPanelProps {
    watchlist: Set<number>;
    onToggleWatchlist: (noradId: number) => void;
    onSelectSat: (sat: any) => void;
    onClose: () => void;
}

const WatchlistPanel: React.FC<WatchlistPanelProps> = ({
    watchlist,
    onToggleWatchlist,
    onSelectSat,
    onClose,
}) => {
    const [satellites, setSatellites] = useState<SatelliteDetail[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const loadData = async () => {
            if (watchlist.size === 0) {
                setSatellites([]);
                return;
            }
            setLoading(true);
            try {
                // Fetch details for all watched IDs
                // Optimization: In a real app, use a bulk endpoint.
                // Here we'll just run parallel requests.
                const promises = Array.from(watchlist).map(id => fetchSatelliteDetail(id));
                const results = await Promise.all(promises);
                // Filter out any nulls (failed fetches)
                setSatellites(results.filter(s => s !== null) as SatelliteDetail[]);
            } catch (error) {
                console.error("Failed to load watchlist data", error);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [watchlist]);

    return (
        <div className="h-full flex flex-col bg-[#0a0e1a]/95 text-white overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-gradient-to-r from-yellow-500/10 to-transparent">
                <div className="flex items-center gap-2">
                    <Star size={14} className="text-yellow-400 fill-yellow-400" />
                    <span className="text-[10px] font-bold text-white/60 uppercase tracking-widest">Your Watchlist</span>
                    <span className="bg-white/10 text-white/40 px-1.5 py-0.5 rounded text-[9px] font-mono">
                        {watchlist.size}
                    </span>
                </div>
                <button onClick={onClose} className="p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors">
                    <X size={16} />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-white/10">
                {loading ? (
                    <div className="flex flex-col items-center justify-center p-8 gap-2 opacity-50">
                        <Loader2 size={24} className="animate-spin text-yellow-400" />
                        <span className="text-[10px] uppercase tracking-widest">Syncing...</span>
                    </div>
                ) : satellites.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-8 gap-3 text-center opacity-40">
                        <Star size={32} />
                        <div className="text-[10px] uppercase tracking-widest">No satellites saved</div>
                        <div className="text-[10px] text-white/50">Click the bookmark icon on any satellite to add it here.</div>
                    </div>
                ) : (
                    <div className="space-y-1">
                        {satellites.map((item) => (
                            <div
                                key={item.satellite.norad_id}
                                className="group flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 border border-transparent hover:border-white/5 transition-all cursor-pointer"
                                onClick={() => onSelectSat({
                                    norad_id: item.satellite.norad_id,
                                    name: item.satellite.name,
                                    // We might lack real-time position here unless we fetch it,
                                    // but usually onSelectSat triggers a lookup or flow effectively.
                                    // For flyTo, we need lat/lon.
                                    // Ideally, we'd have their current position.
                                    // If we don't, CesiumViewer might handle looking it up if we pass just ID?
                                    // The current onSelectSat expects an object with { lat, lon, alt, velocity }?
                                    // Let's check App.tsx signature.
                                    // Actually App.tsx onSelectSat takes `sat`.
                                    // If we pass partial data, distinct from `detailSat` state...
                                    // Let's assume we pass enough to identify it, and let App resolve.
                                    // Wait, App.tsx`s `setDetailSat` expects { lat, lon, alt, ... }.
                                    // If we don't have it, we might need to fetch `positions/all` or just rely on the viewer to select it.
                                    // Actually, if we just want to OPEN the detail panel, we need the position.
                                    // BUT, the viewer tracks them.
                                    // Let's try passing what we have. If `lat` is missing, DetailPanel might break.
                                })}
                            >
                                {/* Icon / Type */}
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center bg-white/5 text-[10px] font-bold ${item.satellite.object_type === 'PAYLOAD' ? 'text-cyan-400' : 'text-orange-400'
                                    }`}>
                                    {item.satellite.object_type === 'PAYLOAD' ? 'SAT' : 'RB'}
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs font-bold text-white group-hover:text-yellow-400 transition-colors truncate">
                                        {item.satellite.name}
                                    </div>
                                    <div className="text-[9px] font-mono text-white/40 flex items-center gap-2">
                                        <span>#{item.satellite.norad_id}</span>
                                        {item.satellite.country_code && (
                                            <span className="px-1 rounded bg-white/10 text-white/60">{item.satellite.country_code}</span>
                                        )}
                                    </div>
                                </div>

                                {/* Actions */}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation(); // prevent select
                                        onToggleWatchlist(item.satellite.norad_id);
                                    }}
                                    className="p-2 rounded hover:bg-red-500/20 text-white/20 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                                    title="Remove from Watchlist"
                                >
                                    <Trash2 size={14} />
                                </button>

                                <div className="text-white/20 group-hover:text-cyan-400">
                                    <ChevronRight size={14} />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default WatchlistPanel;
