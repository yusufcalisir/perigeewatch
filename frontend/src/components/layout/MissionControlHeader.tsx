import React from 'react';
import { Shield, Radio, Activity, Globe2, Clock, Play, Pause, FastForward, Rewind, RefreshCw, Menu, X } from 'lucide-react';
import { useSimulation } from '../../context/SimulationContext';
import { clsx } from 'clsx';

interface MissionControlHeaderProps {
    systemStatus?: string;
    networkLoad?: string;
    riskCount?: number;
    onToggleMenu?: () => void;
    isMenuOpen?: boolean;
}

const MissionControlHeader: React.FC<MissionControlHeaderProps> = ({
    systemStatus = "NOMINAL",
    networkLoad = "LIGHT",
    riskCount = 0,
    onToggleMenu,
    isMenuOpen = false
}) => {
    const { currentTime, isPlaying, togglePlay, setMultiplier, multiplier, setCurrentTime } = useSimulation();

    const formatUTC = (date: Date) => {
        return date.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
    };

    const resetToNow = () => {
        setCurrentTime(new Date());
        setMultiplier(1);
    };

    return (
        <header className="h-16 px-4 md:px-6 bg-gradient-to-b from-background to-transparent flex items-center justify-between border-b border-white/5 backdrop-blur-sm z-50 relative pointer-events-auto gap-2 md:gap-4">
            <div className="flex items-center gap-2 md:gap-4 flex-shrink-0">
                <button
                    onClick={onToggleMenu}
                    className="md:hidden bg-cyber-blue/10 p-2 rounded border border-cyber-blue/30 text-cyber-blue hover:bg-cyber-blue/20 transition-colors"
                >
                    {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
                </button>
                <div className="bg-cyber-blue/10 p-1.5 sm:p-2 rounded border border-cyber-blue/30 hidden xs:block">
                    <Shield className="w-4 h-4 sm:w-6 sm:h-6 text-cyber-blue" />
                </div>
                <div className="hidden lg:block">
                    <h1 className="text-xl font-bold tracking-tight text-white uppercase">
                        Perigee<span className="text-cyber-blue">Watch</span>
                    </h1>
                    <div className="flex items-center gap-2 text-[10px] text-white/40 uppercase tracking-widest font-mono">
                        <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-cyber-blue animate-pulse" />
                            <span>Live Operations</span>
                        </span>
                    </div>
                </div>
            </div>

            {/* Simulation Controls - Center */}
            <div className="flex items-center gap-1.5 sm:gap-3 bg-white/5 px-2 sm:px-4 py-1.5 rounded-full border border-white/10 backdrop-blur-md">
                <div className="flex items-center gap-1 border-r border-white/10 pr-1.5 sm:pr-3">
                    <button onClick={() => setMultiplier(-60)} className={clsx("hidden sm:block p-1 rounded hover:bg-white/10 transition-colors", multiplier === -60 && "text-cyber-amber")} title="Rewind 60x">
                        <Rewind size={14} />
                    </button>
                    <button onClick={togglePlay} className="p-1.5 bg-cyber-blue text-black rounded-full hover:bg-cyber-blue/80 transition-colors">
                        {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} className="ml-0.5" fill="currentColor" />}
                    </button>
                    <button onClick={() => setMultiplier(60)} className={clsx("hidden sm:block p-1 rounded hover:bg-white/10 transition-colors", multiplier === 60 && "text-cyber-amber")} title="Fast Forward 60x">
                        <FastForward size={14} />
                    </button>
                </div>

                <div className="flex items-center gap-1.5 sm:gap-3">
                    <div className="flex flex-col items-center">
                        <span className="text-[11px] sm:text-[14px] font-mono font-bold text-white leading-none tabular-nums">
                            {formatUTC(currentTime).split(' ')[1]}
                        </span>
                        <span className="hidden sm:block text-[8px] font-mono text-white/40 leading-none mt-0.5">
                            {formatUTC(currentTime).split(' ')[0]}
                        </span>
                    </div>

                    <div className="hidden sm:flex items-center gap-1 border-l border-white/10 pl-2 sm:pl-3">
                        <span className="text-[9px] sm:text-[10px] font-mono font-bold text-cyber-blue/80 bg-cyber-blue/10 px-1.5 py-0.5 rounded">
                            {multiplier}x
                        </span>
                        <button onClick={resetToNow} className="hidden sm:block p-1 rounded hover:bg-cyber-blue/20 text-cyber-blue/70 hover:text-cyber-blue transition-colors" title="Sync to LIVE">
                            <RefreshCw size={14} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Status Indicators - Right */}
            <div className="flex items-center gap-3 sm:gap-6 flex-shrink-0">
                <div className="hidden sm:flex items-center gap-6">
                    <HUDBox label="Status" value={systemStatus} color="text-cyber-blue" />
                    <HUDBox label="Risks" value={riskCount.toString()} color={riskCount > 0 ? "text-cyber-red" : "text-cyber-blue"} />
                </div>

                {/* Mobile Status Icons */}
                <div className="flex sm:hidden items-center gap-3">
                    <div className="flex flex-col items-center gap-0.5">
                        <div className={clsx("w-2 h-2 rounded-full", riskCount > 0 ? "bg-cyber-red" : "bg-cyber-blue")} />
                        <span className="text-[7px] font-mono font-bold text-white/40 uppercase tracking-widest">Risks</span>
                    </div>
                    <div className="w-px h-6 bg-white/10" />
                    <div className="flex flex-col items-center gap-0.5">
                        <Radio size={10} className="text-cyber-blue" />
                        <span className="text-[7px] font-mono font-bold text-cyber-blue uppercase tracking-widest leading-none">Nominal</span>
                    </div>
                    <div className="w-px h-6 bg-white/10" />
                </div>

                <div className="border-l border-white/10 pl-3 sm:pl-6 h-8 flex items-center">
                    <HeaderIndicator icon={<Activity size={12} />} label="Sensor" status="online" />
                </div>
            </div>
        </header>
    );
};

const HUDBox: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => (
    <div className="bg-white/5 border border-white/10 px-3 py-1.5 rounded backdrop-blur-md min-w-[100px]">
        <div className="text-[8px] uppercase tracking-[0.2em] font-bold text-white/30 mb-0.5">{label}</div>
        <div className={color + " text-[10px] font-bold tracking-widest font-mono"}>{value}</div>
    </div>
);

interface HeaderIndicatorProps {
    icon: React.ReactNode;
    label: string;
    status: string;
}

const HeaderIndicator: React.FC<HeaderIndicatorProps> = ({ icon, label, status }) => (
    <div className="flex flex-col items-end gap-0.5">
        <div className="flex items-center gap-1.5 text-white/50">
            {icon}
            <span className="text-[10px] uppercase tracking-wider font-bold">{label}</span>
        </div>
        <span className="text-[9px] uppercase tracking-widest text-cyber-blue font-mono font-bold leading-none">
            {status}
        </span>
    </div>
);

export default MissionControlHeader;
