import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import DashboardLayout from './components/layout/DashboardLayout'
import MissionControlHeader from './components/layout/MissionControlHeader'
import ControlPanel, { SearchField, SatelliteListItem } from './components/layout/ControlPanel'
import AlertsPanel from './components/AlertsPanel'
import CesiumViewer from './components/CesiumViewer'
import GroundStationPanel from './components/GroundStationPanel'
import SpaceWeatherPanel from './components/SpaceWeatherPanel'
import DebrisCloudPanel from './components/DebrisCloudPanel'
import LaunchTimeline from './components/LaunchTimeline'
import ManeuverLog from './components/ManeuverLog'
import AccessIntervals from './components/AccessIntervals'
import SatelliteDetailPanel from './components/SatelliteDetailPanel'
import SatelliteComparePanel from './components/SatelliteComparePanel'
import NotificationPanel from './components/NotificationPanel'
import WatchlistPanel from './components/WatchlistPanel'
import { ManeuverMonitor } from './components/ManeuverMonitor'
import { SimulationProvider, useSimulation } from './context/SimulationContext'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useWorkerPositions } from './hooks/useWorkerPositions'
import { useWatchlist } from './hooks/useWatchlist'
import { useNotifications } from './hooks/useNotifications'
import { playClick, playScan, playAlert, playWarning, toggleAmbient, isAmbientActive } from './services/SoundManager'
import { Database, Zap, Radio, AlertTriangle, Sun, Rocket, Activity, X, Map, Bell, Download, ArrowLeftRight, Star } from 'lucide-react'
import { clsx } from 'clsx'
import { fetchConjunctions, ConjunctionEvent } from './services/conjunctions'
import { fetchSatellites, Satellite, Position } from './services/api'
import { exportConjunctions, exportSatelliteCatalog } from './utils/reportExporter'
import {
    fetchCurrentVisibility,
    fetchNextPasses,
    VisibleSatellite,
    SatellitePass,
} from './services/groundStation'
import { fetchReentryCandidates } from './services/reentry'
import './index.css'

// ── Filter Presets ──
const FILTER_PRESETS = [
    { id: 'all', label: 'ALL', filter: () => true },
    { id: 'starlink', label: 'STARLINK', filter: (s: Satellite) => s.name.toUpperCase().includes('STARLINK') },
    { id: 'debris', label: 'DEBRIS', filter: (s: Satellite) => s.object_type === 'DEBRIS' || s.object_type === 'ROCKET_BODY' || s.name.toUpperCase().includes('DEB') || s.name.toUpperCase().includes('R/B') },
    { id: 'active', label: 'ACTIVE', filter: (s: Satellite) => s.is_active },
    { id: 'payload', label: 'PAYLOAD', filter: (s: Satellite) => s.object_type === 'PAYLOAD' },
] as const;

function AppContent() {
    const { currentTime, setCurrentTime } = useSimulation()

    // ── Satellite Catalog ──
    const [satellites, setSatellites] = useState<Satellite[]>([])
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedNoradId, setSelectedNoradId] = useState<number | null>(null)
    const [activeFilter, setActiveFilter] = useState('all')

    // ── Conjunctions ──
    const [conjunctions, setConjunctions] = useState<ConjunctionEvent[]>([])
    const [selectedConjunction, setSelectedConjunction] = useState<ConjunctionEvent | null>(null)

    // ── Ground Station ──
    const [visibleSats, setVisibleSats] = useState<VisibleSatellite[]>([])
    const [passes, setPasses] = useState<SatellitePass[]>([])

    // ── WebWorker (SGP4 client-side propagation + maneuver detection) ──
    const { maneuvers } = useWorkerPositions(3000)

    // ── Watchlist ──
    const { watchlist, toggleWatchlist } = useWatchlist()
    const memoizedWatchlist = useMemo(() => new Set(watchlist), [watchlist])

    // ── Notifications ──
    const {
        notifications, unreadCount, addNotification,
        markAsRead, markAllRead, clearAll: clearAllNotifications,
    } = useNotifications()

    // ── Debris State ──
    const [debrisFragments, setDebrisFragments] = useState<{ id: string, fragments: any[], color: string }[]>([])

    // ── Satellite Detail Panel ──
    const [detailSat, setDetailSat] = useState<Position | null>(null)

    // ── Comparison Mode ──
    const [compareSatA, setCompareSatA] = useState<Position | null>(null)
    const [compareSatB, setCompareSatB] = useState<Position | null>(null)
    const [compareMode, setCompareMode] = useState(false)

    // ── UI State ──
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
    const [leftOpen, setLeftOpen] = useState(!isMobile)
    const [cinematicMode, setCinematicMode] = useState(false)
    const [soundEnabled, setSoundEnabled] = useState(false)
    const [showLaunches, setShowLaunches] = useState(true)
    const [showHeatmap, setShowHeatmap] = useState(false)
    const [activePanelId, setActivePanelId] = useState<string | null>(isMobile ? null : 'catalog')
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
    const [flyToTarget, setFlyToTarget] = useState<{ lat: number, lon: number, alt: number } | null>(null)
    const [showWatchlist, setShowWatchlist] = useState(false)
    const [isMaximized, setIsMaximized] = useState(false)

    // ── Mobile Navigation ──
    const MOBILE_MODULES = [
        { id: 'catalog', label: 'Orbital Catalog', icon: <Database size={16} /> },
        { id: 'alerts', label: 'Conjunction Alerts', icon: <AlertTriangle size={16} /> },
        { id: 'notifications', label: 'Notifications', icon: <Bell size={16} /> },
        { id: 'weather', label: 'Space Weather', icon: <Sun size={16} /> },
        { id: 'station', label: 'Ground Station', icon: <Radio size={16} /> },
        { id: 'debris', label: 'Debris Analysis', icon: <Zap size={16} /> },
        { id: 'intervals', label: 'Access Intervals', icon: <Radio size={16} /> },
        { id: 'maneuvers', label: 'Maneuver Detection', icon: <Activity size={16} /> },
    ]

    // ── Refs ──
    const focusSatRef = useRef<((noradId: number) => void) | null>(null)
    const searchInputRef = useRef<HTMLInputElement>(null)
    const timeRef = useRef(currentTime)
    useEffect(() => { timeRef.current = currentTime }, [currentTime])

    const togglePanel = (id: string) => {
        const isCurrentlyActive = activePanelId === id
        if (isCurrentlyActive) {
            setActivePanelId(null)
            // On desktop, keep the sidebar open with headers
            if (isMobile) {
                setLeftOpen(false)
            }
        } else {
            setActivePanelId(id)
            setLeftOpen(true)
            setIsMaximized(false) // Un-maximize if a panel is opened
        }
        setIsMobileMenuOpen(false)
        if (soundEnabled) playClick()
    }

    const handleToggleMaximize = () => {
        const targetState = !isMaximized;
        setIsMaximized(targetState);

        if (targetState) {
            setLeftOpen(false);
            // Trigger Browser Fullscreen
            if (document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen().catch(e => {
                    console.error(`Error attempting to enable full-screen mode: ${e.message}`);
                });
            }
        } else {
            // Exit Browser Fullscreen
            if (document.exitFullscreen && document.fullscreenElement) {
                document.exitFullscreen().catch(e => {
                    console.error(`Error attempting to exit full-screen mode: ${e.message}`);
                });
            }
        }
    }

    const toggleMobileMenu = () => {
        const targetMenuState = !isMobileMenuOpen
        setIsMobileMenuOpen(targetMenuState)

        // On mobile, if we're opening the menu, we must open the drawer
        if (targetMenuState) {
            setLeftOpen(true)
            setIsMaximized(false)
        } else if (!activePanelId) {
            // If we are closing the menu and no module is selected, hide the drawer
            setLeftOpen(false)
        }
    }

    const handleMobileModuleSelect = (id: string) => {
        setActivePanelId(id)
        setLeftOpen(true)
        setIsMobileMenuOpen(false)
        if (soundEnabled) playClick()
    }

    // ── Fullscreen Sync ──
    useEffect(() => {
        const handleFullscreenChange = () => {
            const isActuallyFullscreen = !!document.fullscreenElement;
            if (isActuallyFullscreen !== isMaximized) {
                setIsMaximized(isActuallyFullscreen);
            }
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, [isMaximized]);

    // ═══════════════════════════════════════════════════
    // Keyboard Shortcuts
    // ═══════════════════════════════════════════════════
    useKeyboardShortcuts({
        onSearch: () => {
            setLeftOpen(true)
            setActivePanelId('catalog')
            setTimeout(() => searchInputRef.current?.focus(), 100)
            if (soundEnabled) playClick()
        },
        onResetTime: () => {
            setCurrentTime(new Date())
            if (soundEnabled) playScan()
        },
        onToggleHUD: () => {
            setLeftOpen(prev => !prev)
            setIsMaximized(false) // Un-maximize when toggling HUD
            if (soundEnabled) playClick()
        },
        onEscape: () => {
            setSelectedNoradId(null)
            setSelectedConjunction(null)
            if (soundEnabled) playClick()
        },
        onToggleCinematic: () => {
            setCinematicMode(prev => !prev)
            if (soundEnabled) playScan()
        },
        onToggleSound: () => {
            const isActive = toggleAmbient()
            setSoundEnabled(isActive)
        },
        onToggleFilter: () => {
            const currentIdx = FILTER_PRESETS.findIndex(f => f.id === activeFilter)
            const nextIdx = (currentIdx + 1) % FILTER_PRESETS.length
            setActiveFilter(FILTER_PRESETS[nextIdx].id)
            if (soundEnabled) playClick()
        }
    })
    // ═══════════════════════════════════════════════════
    // Data Fetching & Notifications
    // ═══════════════════════════════════════════════════

    // Track notified entities to avoid spam
    const notifiedReentryIds = useRef<Set<number>>(new Set())
    const notifiedPassIds = useRef<Set<string>>(new Set()) // key: norad-aosTime

    useEffect(() => {
        const loadSatellites = async () => {
            const data = await fetchSatellites(2000)
            setSatellites(data)
        }
        loadSatellites()
    }, [])

    // Conjunctions
    useEffect(() => {
        const loadRisks = async () => {
            const now = timeRef.current
            const start = now.toISOString()
            const end = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString()
            const data = await fetchConjunctions(start, end, 500)
            setConjunctions(prev => {
                const prevIds = new Set(prev.map(c => `${c.sat1_norad}-${c.sat2_norad}`))
                data.forEach(c => {
                    const key = `${c.sat1_norad}-${c.sat2_norad}`
                    if (!prevIds.has(key) && c.distance < 5) {
                        addNotification(
                            'conjunction',
                            c.distance < 1 ? 'critical' : 'warning',
                            `Conjunction Alert: ${c.sat1_name || c.sat1_norad}`,
                            `Close approach with ${c.sat2_name || c.sat2_norad}: ${c.distance.toFixed(2)} km`,
                            c.sat1_norad,
                        )
                    }
                })
                return data
            })
        }
        loadRisks()
        const interval = setInterval(loadRisks, 30000)
        return () => clearInterval(interval)
    }, [])

    // Ground Station & Visibility
    useEffect(() => {
        const loadVisibility = async () => {
            const ts = timeRef.current.toISOString()
            const data = await fetchCurrentVisibility(ts)
            setVisibleSats(data.satellites)
        }
        const loadPasses = async () => {
            const ts = timeRef.current.toISOString()
            const data = await fetchNextPasses(ts, 24)
            setPasses(data.passes)

            // Check for upcoming passes (within 15 mins)
            data.passes.forEach(pass => {
                const aosTime = new Date(pass.aos).getTime();
                const nowTime = new Date().getTime(); // Use system time for alerts, not sim time
                const timeToAos = (aosTime - nowTime) / 1000 / 60; // minutes

                const key = `${pass.norad_id}-${pass.aos}`;

                // Notify if 10-15 mins out, hasn't been notified yet
                if (timeToAos > 0 && timeToAos <= 15 && !notifiedPassIds.current.has(key)) {
                    addNotification(
                        'visibility',
                        'info',
                        `Satellite Pass: ${pass.name}`,
                        `Acquisition of Signal in ${Math.round(timeToAos)} mins. Max El: ${pass.max_elevation.toFixed(1)}°`,
                        pass.norad_id
                    );
                    notifiedPassIds.current.add(key);
                }
            })
        }

        loadVisibility()
        loadPasses()
        const visInterval = setInterval(loadVisibility, 10000)
        const passInterval = setInterval(loadPasses, 60000)
        return () => {
            clearInterval(visInterval)
            clearInterval(passInterval)
        }
    }, [])

    // Reentry Scan
    useEffect(() => {
        const checkReentries = async () => {
            const candidates = await fetchReentryCandidates(250); // < 250km perigee is decent risk check
            candidates.forEach(c => {
                if ((c.reentry_risk === 'imminent' || c.reentry_risk === 'high') && !notifiedReentryIds.current.has(c.norad_id)) {
                    addNotification(
                        'reentry',
                        c.reentry_risk === 'imminent' ? 'critical' : 'warning',
                        `Reentry Warning: ${c.name}`,
                        `Est. Reentry: ${c.estimated_reentry_date ? new Date(c.estimated_reentry_date).toLocaleDateString() : 'Unknown'} (${c.estimated_days_remaining} days)`,
                        c.norad_id
                    );
                    notifiedReentryIds.current.add(c.norad_id);
                }
            });
        };

        checkReentries();
        const interval = setInterval(checkReentries, 5 * 60 * 1000); // Check every 5 mins
        return () => clearInterval(interval);
    }, []);

    // ═══════════════════════════════════════════════════
    // Derived State
    // ═══════════════════════════════════════════════════
    const visibleSatNoradIds = useMemo(
        () => new Set(visibleSats.map((s) => s.norad_id)),
        [visibleSats]
    )

    const filteredSatellites = useMemo(() => {
        const filterFn = FILTER_PRESETS.find(f => f.id === activeFilter)?.filter || (() => true)
        let filtered = satellites.filter(filterFn)

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase()
            filtered = filtered.filter(s =>
                s.name.toLowerCase().includes(q) ||
                s.norad_id.toString().includes(q)
            )
        }

        return filtered
    }, [satellites, searchQuery, activeFilter])

    // ═══════════════════════════════════════════════════
    // Handlers
    // ═══════════════════════════════════════════════════
    const handleSatelliteClick = useCallback((noradId: number) => {
        setSelectedNoradId(prev => prev === noradId ? null : noradId)
        if (focusSatRef.current) {
            focusSatRef.current(noradId)
        }
        if (soundEnabled) playScan()
    }, [soundEnabled])

    const handleToggleDebris = useCallback((fieldId: string, fragments: any[], color: string, visible: boolean) => {
        setDebrisFragments(prev => {
            if (visible) {
                return [...prev, { id: fieldId, fragments, color }]
            } else {
                return prev.filter(f => f.id !== fieldId)
            }
        })
        if (soundEnabled) playClick()
    }, [soundEnabled])

    return (
        <DashboardLayout
            header={
                <MissionControlHeader
                    riskCount={conjunctions.length}
                    onToggleMenu={toggleMobileMenu}
                    isMenuOpen={isMobileMenuOpen}
                />
            }
            leftOpen={leftOpen}
            setLeftOpen={setLeftOpen}
            isMaximized={isMaximized}
            onToggleMaximize={handleToggleMaximize}
            leftPanel={
                <div className="flex flex-col h-full gap-2 overflow-y-auto scrollbar-thin pb-4">
                    {/* Mobile Navigation Overlay */}
                    {isMobileMenuOpen && (
                        <div className="md:hidden flex flex-col gap-1 p-4 bg-background/95 backdrop-blur-xl border-b border-white/10 z-[60] animate-in slide-in-from-top duration-300">
                            <div className="text-[10px] font-bold text-cyber-blue mb-2 uppercase tracking-widest font-mono opactiy-50">System Navigation</div>
                            {MOBILE_MODULES.map(module => (
                                <button
                                    key={module.id}
                                    onClick={() => handleMobileModuleSelect(module.id)}
                                    className={`flex items-center gap-3 p-3 rounded-lg border transition-all duration-200 ${activePanelId === module.id
                                        ? 'bg-cyber-blue/20 border-cyber-blue text-cyber-blue shadow-[0_0_15px_rgba(0,243,255,0.2)]'
                                        : 'bg-white/5 border-white/5 text-white/70 hover:bg-white/10'
                                        }`}
                                >
                                    <span className={activePanelId === module.id ? 'text-cyber-blue' : 'text-white/40'}>{module.icon}</span>
                                    <span className="text-sm font-bold uppercase tracking-wider">{module.label}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Orbital Catalog */}
                    <div className={clsx(activePanelId === 'catalog' ? 'block' : 'hidden md:block', "h-full")}>
                        <ControlPanel
                            title="Orbital Catalog"
                            icon={<Database size={18} className="text-cyber-blue" />}
                            isCollapsible
                            isOpen={activePanelId === 'catalog'}
                            onToggle={() => togglePanel('catalog')}
                        >
                            <SearchField
                                placeholder="Search NORAD ID or Name..."
                                value={searchQuery}
                                onChange={setSearchQuery}
                                inputRef={searchInputRef}
                            />

                            {/* Filter Presets */}
                            <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-white/5">
                                {FILTER_PRESETS.map(preset => (
                                    <button
                                        key={preset.id}
                                        onClick={() => {
                                            setActiveFilter(preset.id)
                                            if (soundEnabled) playClick()
                                        }}
                                        className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider transition-all duration-200 ${activeFilter === preset.id
                                            ? 'bg-cyber-blue/20 text-cyber-blue border border-cyber-blue/40'
                                            : 'bg-white/5 text-white/30 border border-transparent hover:text-white/50 hover:bg-white/10'
                                            }`}
                                    >
                                        {preset.label}
                                    </button>
                                ))}
                            </div>

                            <div className="flex flex-col">
                                {filteredSatellites.length === 0 ? (
                                    <div className="px-4 py-8 text-center">
                                        <p className="text-[10px] text-white/30 font-mono uppercase">
                                            {satellites.length === 0 ? 'LOADING_CATALOG...' : 'NO_MATCH_FOUND'}
                                        </p>
                                    </div>
                                ) : (
                                    filteredSatellites.slice(0, 500).map(sat => (
                                        <SatelliteListItem
                                            key={sat.norad_id}
                                            id={sat.norad_id.toString()}
                                            name={sat.name}
                                            type={sat.object_type}
                                            selected={selectedNoradId === sat.norad_id}
                                            onClick={() => handleSatelliteClick(sat.norad_id)}
                                        />
                                    ))
                                )}
                                {filteredSatellites.length > 500 && (
                                    <div className="px-4 py-2 text-center border-t border-white/5">
                                        <p className="text-[8px] text-white/20 font-mono uppercase">
                                            + {filteredSatellites.length - 500} more matches (Refine search)
                                        </p>
                                    </div>
                                )}
                            </div>
                        </ControlPanel>
                    </div>

                    {/* Conjunction Alerts */}
                    <div className={clsx(activePanelId === 'alerts' ? 'block' : 'hidden md:block', "h-full")}>
                        <ControlPanel
                            title="Conjunction Alerts"
                            icon={<AlertTriangle size={18} className="text-cyber-red" />}
                            isCollapsible
                            isOpen={activePanelId === 'alerts'}
                            onToggle={() => togglePanel('alerts')}
                        >
                            <AlertsPanel
                                alerts={conjunctions}
                                onSelectAlert={(alert) => {
                                    setSelectedConjunction(alert)
                                    if (focusSatRef.current) {
                                        focusSatRef.current(alert.sat1_norad)
                                    }
                                    if (soundEnabled) playWarning()
                                }}
                            />
                            {conjunctions.length > 0 && (
                                <div className="px-3 py-2 border-t border-white/5">
                                    <button
                                        onClick={() => { exportConjunctions(conjunctions); if (soundEnabled) playClick() }}
                                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider bg-white/5 text-white/40 border border-white/10 hover:text-white/60 hover:bg-white/10 transition-all w-full justify-center"
                                    >
                                        <Download size={12} /> Export CSV
                                    </button>
                                </div>
                            )}
                        </ControlPanel>
                    </div>

                    {/* Notifications */}
                    <div className={clsx(activePanelId === 'notifications' ? 'block' : 'hidden md:block', "h-full")}>
                        <ControlPanel
                            title={`Notifications${unreadCount > 0 ? ` (${unreadCount})` : ''}`}
                            icon={<Bell size={18} className="text-amber-400" />}
                            isCollapsible
                            isOpen={activePanelId === 'notifications'}
                            onToggle={() => togglePanel('notifications')}
                        >
                            <NotificationPanel
                                notifications={notifications}
                                unreadCount={unreadCount}
                                onMarkRead={markAsRead}
                                onMarkAllRead={markAllRead}
                                onClearAll={clearAllNotifications}
                                onFocusSat={(noradId) => {
                                    setSelectedNoradId(noradId)
                                    if (focusSatRef.current) focusSatRef.current(noradId)
                                }}
                            />
                        </ControlPanel>
                    </div>

                    {/* Space Weather */}
                    <div className={clsx(activePanelId === 'weather' ? 'block' : 'hidden md:block', "h-full")}>
                        <ControlPanel
                            title="Space Weather"
                            icon={<Sun size={18} className="text-yellow-400" />}
                            isCollapsible
                            isOpen={activePanelId === 'weather'}
                            onToggle={() => togglePanel('weather')}
                        >
                            <SpaceWeatherPanel />
                        </ControlPanel>
                    </div>

                    {/* Ground Station */}
                    <div className={clsx(activePanelId === 'station' ? 'block' : 'hidden md:block', "h-full")}>
                        <ControlPanel
                            title="Ground Station"
                            icon={<Radio size={18} className="text-cyber-green" />}
                            isCollapsible
                            isOpen={activePanelId === 'station'}
                            onToggle={() => togglePanel('station')}
                        >
                            <GroundStationPanel
                                visibleSats={visibleSats}
                                passes={passes}
                                onFocusSat={(noradId) => {
                                    setSelectedNoradId(noradId)
                                    if (focusSatRef.current) {
                                        focusSatRef.current(noradId)
                                    }
                                }}
                            />
                        </ControlPanel>
                    </div>

                    {/* Debris Clouds */}
                    <div className={clsx(activePanelId === 'debris' ? 'block' : 'hidden md:block', "h-full")}>
                        <ControlPanel
                            title="Debris Analysis"
                            icon={<Zap size={18} className="text-orange-400" />}
                            isCollapsible
                            isOpen={activePanelId === 'debris'}
                            onToggle={() => togglePanel('debris')}
                        >
                            <DebrisCloudPanel onToggleDebrisField={handleToggleDebris} />
                        </ControlPanel>
                    </div>

                    {/* Access Intervals */}
                    <div className={clsx(activePanelId === 'intervals' ? 'block' : 'hidden md:block', "h-full")}>
                        <ControlPanel
                            title="Access Intervals"
                            icon={<Radio size={18} className="text-purple-400" />}
                            isCollapsible
                            isOpen={activePanelId === 'intervals'}
                            onToggle={() => togglePanel('intervals')}
                        >
                            <AccessIntervals noradId={selectedNoradId} />
                        </ControlPanel>
                    </div>

                    {/* Maneuver Detection */}
                    <div className={clsx(activePanelId === 'maneuvers' ? 'block' : 'hidden md:block', "h-full")}>
                        <ControlPanel
                            title="Maneuver Detection"
                            icon={<Activity size={18} className="text-red-400" />}
                            isCollapsible
                            isOpen={activePanelId === 'maneuvers'}
                            onToggle={() => togglePanel('maneuvers')}
                        >
                            <ManeuverLog
                                maneuvers={maneuvers}
                                onFocusSat={(noradId) => {
                                    setSelectedNoradId(noradId)
                                    if (focusSatRef.current) {
                                        focusSatRef.current(noradId)
                                    }
                                }}
                            />
                        </ControlPanel>
                    </div>
                </div>
            }
        >
            <ManeuverMonitor watchedSatellites={Array.from(watchlist)} />

            <CesiumViewer
                conjunctions={conjunctions}
                selectedConjunction={selectedConjunction}
                visibleSatNoradIds={visibleSatNoradIds}
                onFocusSatRef={focusSatRef}
                cinematicMode={cinematicMode}
                filterPreset={activeFilter}
                debrisFragments={debrisFragments}
                showHeatmap={showHeatmap}
                watchedNoradIds={memoizedWatchlist}
                flyToTarget={flyToTarget}
                onSelectSat={(sat) => {
                    if (sat) {
                        if (compareMode && !compareSatA) {
                            setCompareSatA(sat)
                        } else if (compareMode && compareSatA && !compareSatB) {
                            setCompareSatB(sat)
                            setCompareMode(false)
                        } else {
                            setDetailSat(sat)
                        }
                        if (soundEnabled) playScan()
                    }
                }}
            />

            {/* Toolbar (top-right) */}
            <div className="absolute top-16 right-4 z-[60] flex gap-2 pointer-events-auto">
                <button
                    onClick={() => { setShowWatchlist(!showWatchlist); if (soundEnabled) playClick() }}
                    className={clsx(
                        "p-2 rounded-lg border backdrop-blur-md transition-all duration-200",
                        showWatchlist
                            ? "bg-yellow-500/20 border-yellow-500/50 text-yellow-400 shadow-lg shadow-yellow-500/10"
                            : "bg-black/40 border-white/10 text-white/40 hover:text-white/60 hover:border-white/20"
                    )}
                    title={showWatchlist ? "Hide Watchlist" : "Show Watchlist"}
                >
                    <Star size={18} className={showWatchlist ? "fill-yellow-400" : ""} />
                </button>
                <button
                    onClick={() => { setShowHeatmap(!showHeatmap); if (soundEnabled) playClick() }}
                    className={clsx(
                        "p-2 rounded-lg border backdrop-blur-md transition-all duration-200",
                        showHeatmap
                            ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-400 shadow-lg shadow-cyan-500/10"
                            : "bg-black/40 border-white/10 text-white/40 hover:text-white/60 hover:border-white/20"
                    )}
                    title={showHeatmap ? "Hide Density Heatmap" : "Show Density Heatmap"}
                >
                    <Map size={18} />
                </button>
                <button
                    onClick={() => {
                        setCompareMode(!compareMode)
                        setCompareSatA(null)
                        setCompareSatB(null)
                        if (soundEnabled) playClick()
                    }}
                    className={clsx(
                        "p-2 rounded-lg border backdrop-blur-md transition-all duration-200",
                        compareMode
                            ? "bg-purple-500/20 border-purple-500/50 text-purple-400 shadow-lg shadow-purple-500/10"
                            : "bg-black/40 border-white/10 text-white/40 hover:text-white/60 hover:border-white/20"
                    )}
                    title={compareMode ? "Cancel Comparison" : "Compare Two Satellites"}
                >
                    <ArrowLeftRight size={18} />
                </button>
            </div>

            {/* Compare Mode Selection Banner */}
            {compareMode && !compareSatB && (
                <div className="absolute top-28 right-4 z-40 bg-purple-500/20 border border-purple-500/30 backdrop-blur-md rounded-lg px-4 py-2 text-[10px] font-mono text-purple-300">
                    {compareSatA
                        ? `Selected: #${compareSatA.norad_id} — Click second satellite to compare`
                        : 'Click first satellite to begin comparison'}
                </div>
            )}

            {/* Satellite Detail Panel (right side overlay) */}
            {detailSat && !compareSatA && (
                <div className="absolute top-16 right-4 bottom-4 w-[380px] z-40 animate-in slide-in-from-right duration-300">
                    <div className="h-full rounded-lg border border-white/10 overflow-hidden shadow-2xl">
                        <SatelliteDetailPanel
                            noradId={detailSat.norad_id}
                            currentLat={detailSat.lat}
                            currentLon={detailSat.lon}
                            currentAlt={detailSat.alt}
                            currentVelocity={detailSat.velocity}
                            onClose={() => setDetailSat(null)}
                            watchlist={watchlist}
                            onToggleWatchlist={toggleWatchlist}
                        />
                    </div>
                </div>
            )}

            {/* Satellite Comparison Panel */}
            {compareSatA && compareSatB && (
                <div className="absolute top-16 right-4 bottom-4 w-[420px] z-40 animate-in slide-in-from-right duration-300">
                    <div className="h-full rounded-lg border border-white/10 overflow-hidden shadow-2xl">
                        <SatelliteComparePanel
                            satA={{ noradId: compareSatA.norad_id, lat: compareSatA.lat, lon: compareSatA.lon, alt: compareSatA.alt, velocity: compareSatA.velocity }}
                            satB={{ noradId: compareSatB.norad_id, lat: compareSatB.lat, lon: compareSatB.lon, alt: compareSatB.alt, velocity: compareSatB.velocity }}
                            onClose={() => { setCompareSatA(null); setCompareSatB(null) }}
                        />
                    </div>
                </div>
            )}

            {/* Watchlist Panel */}
            {showWatchlist && (
                <div className="absolute top-16 right-4 bottom-4 w-[320px] z-40 animate-in slide-in-from-right duration-300">
                    <div className="h-full rounded-lg border border-white/10 overflow-hidden shadow-2xl">
                        <WatchlistPanel
                            watchlist={new Set(watchlist)}
                            onToggleWatchlist={toggleWatchlist}
                            onSelectSat={(sat) => {
                                // Fly to satellite using the ref exposed by CesiumViewer
                                if (focusSatRef.current) {
                                    focusSatRef.current(sat.norad_id);
                                }
                                // Also open detail panel if we have position?
                                // The Viewer's onFocusSatRef usually sets selectedSat internally,
                                // which triggers onSelectSat prop, which sets detailSat.
                                // So just calling focusSatRef should be enough!
                                if (soundEnabled) playScan();
                            }}
                            onClose={() => setShowWatchlist(false)}
                        />
                    </div>
                </div>
            )}

            {/* Launch Timeline (bottom-centered, limited to 3 cards visible) */}
            {showLaunches && (
                <div className={clsx(
                    "absolute bottom-4 left-1/2 -translate-x-1/2 z-30 w-full max-w-[calc(100%-2rem)] md:max-w-[640px] px-4 pointer-events-none transition-opacity duration-300",
                    leftOpen ? "opacity-0 invisible md:opacity-100 md:visible" : "opacity-100 visible"
                )}>
                    <div className="bg-panel/40 backdrop-blur-md border border-white/5 rounded-lg p-2 pointer-events-auto shadow-2xl">
                        <LaunchTimeline onLaunchSelect={(launch) => {
                            if (launch.pad_lat && launch.pad_lon) {
                                // Close detail panel if open
                                setDetailSat(null);
                                // Fly to launch site
                                if (soundEnabled) playScan();
                                // Assuming CesiumViewer exposes a way or we pass it via prop
                                // We'll add a 'flyToLoc' prop to CesiumViewer
                                setFlyToTarget({ lat: launch.pad_lat, lon: launch.pad_lon, alt: 500 });
                            }
                        }} />
                    </div>
                </div>
            )}

            {/* Keyboard Shortcuts Legend (bottom-right) */}
            <div className="absolute bottom-4 right-4 z-50 hidden lg:flex items-center gap-3 text-[10px] font-mono text-white/30 uppercase tracking-wider">
                <span className="flex items-center gap-1.5"><span className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-cyber-blue">/</span> search</span>
                <span className="flex items-center gap-1.5"><span className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-cyber-blue">R</span> reset</span>
                <span className="flex items-center gap-1.5"><span className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-cyber-blue">H</span> hud</span>
                <span className="flex items-center gap-1.5"><span className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-cyber-blue">C</span> cinema</span>
                <span className="flex items-center gap-1.5"><span className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-cyber-blue">M</span> sound</span>
                <span className="flex items-center gap-1.5"><span className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-cyber-blue">F</span> filter</span>
            </div>
        </DashboardLayout>
    )
}

function App() {
    return (
        <SimulationProvider>
            <AppContent />
        </SimulationProvider>
    )
}

export default App
