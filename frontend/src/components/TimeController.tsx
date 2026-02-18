import React from 'react';
import { useSimulation } from '../context/SimulationContext';
import { Play, Pause, FastForward, Rewind, Clock } from 'lucide-react';
import { clsx } from 'clsx';

const TimeController: React.FC = () => {
    const { currentTime, isPlaying, togglePlay, setMultiplier, multiplier, setCurrentTime } = useSimulation();

    const formatTime = (date: Date) => {
        return date.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
    };

    const handleSpeedChange = (speed: number) => {
        setMultiplier(speed);
    };

    const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
        // Scrub within +/- 24 hours of "now" base? 
        // Or absolute scrub? 
        // For simplicity let's do a +/- 24h slider centered on initial load time?
        // Actually, let's just create a slider that represents "Hours Offset from NOW"
        // But the simulation time drifts.
        // Let's simple use a date picker or just button controls for now, plus a slider for fine-tuning.
        // A slider for "Time of Day" might be intuitive.

        // Simpler: Just display time and controls.
    };

    // Jump to Now
    const resetToNow = () => {
        setCurrentTime(new Date());
        setMultiplier(1);
    };

    return (
        <div className="absolute bottom-6 md:bottom-8 left-1/2 -translate-x-1/2 bg-panel/90 border border-white/10 backdrop-blur-xl rounded-lg p-2 md:p-3 flex flex-col md:flex-row items-center gap-2 md:gap-4 shadow-2xl z-50 animate-in slide-in-from-bottom-6 w-[calc(100%-2rem)] md:w-auto overflow-hidden">

            {/* Time Display */}
            <div className="flex items-center gap-3 px-2 md:border-r border-white/10 md:pr-4 w-full md:w-auto justify-center md:justify-start pb-2 md:pb-0 border-b md:border-b-0 border-white/5">
                <Clock className="text-cyber-blue hidden xs:block" size={16} />
                <div className="flex flex-col items-center md:items-start">
                    <span className="text-[8px] md:text-[10px] font-bold text-white/40 uppercase tracking-widest hidden md:block">Simulation Time</span>
                    <span className="text-xs md:text-sm font-mono font-bold text-white whitespace-nowrap">{formatTime(currentTime)}</span>
                </div>
            </div>

            <div className="flex items-center gap-2 md:gap-4 w-full md:w-auto justify-center">
                {/* Playback Controls */}
                <div className="flex items-center gap-1 md:gap-2">
                    <button
                        onClick={() => handleSpeedChange(-60)}
                        className={clsx("p-1.5 md:p-2 rounded hover:bg-white/10 transition-colors", multiplier === -60 && "text-cyber-amber")}
                        title="Rewind 60x"
                    >
                        <Rewind size={16} className="w-3.5 h-3.5 md:w-4 md:h-4" />
                    </button>

                    <button
                        onClick={togglePlay}
                        className="p-2.5 md:p-3 bg-cyber-blue text-black rounded-full hover:bg-cyber-blue/80 transition-colors shadow-[0_0_15px_rgba(0,209,255,0.3)]"
                    >
                        {isPlaying ? <Pause className="w-4 h-4 md:w-[18px] md:h-[18px]" fill="currentColor" /> : <Play className="w-4 h-4 md:w-[18px] md:h-[18px] ml-0.5" fill="currentColor" />}
                    </button>

                    <button
                        onClick={() => handleSpeedChange(60)}
                        className={clsx("p-1.5 md:p-2 rounded hover:bg-white/10 transition-colors", multiplier === 60 && "text-cyber-amber")}
                        title="Fast Forward 60x"
                    >
                        <FastForward size={16} className="w-3.5 h-3.5 md:w-4 md:h-4" />
                    </button>
                </div>

                {/* Speed Selection */}
                <div className="flex items-center gap-1 border-l border-white/10 pl-2 md:pl-4">
                    {[1, 10, 100].map(speed => (
                        <button
                            key={speed}
                            onClick={() => handleSpeedChange(speed)}
                            className={clsx(
                                "px-1.5 md:px-2 py-0.5 md:py-1 text-[9px] md:text-[10px] font-bold font-mono rounded transition-colors border border-transparent",
                                multiplier === speed
                                    ? "bg-cyber-blue/20 text-cyber-blue border-cyber-blue/30"
                                    : "text-white/40 hover:text-white hover:bg-white/5"
                            )}
                        >
                            {speed}x
                        </button>
                    ))}
                    {/* Hide 1000x on mobile to save space */}
                    <button
                        onClick={() => handleSpeedChange(1000)}
                        className={clsx(
                            "hidden md:block px-2 py-1 text-[10px] font-bold font-mono rounded transition-colors border border-transparent",
                            multiplier === 1000
                                ? "bg-cyber-blue/20 text-cyber-blue border-cyber-blue/30"
                                : "text-white/40 hover:text-white hover:bg-white/5"
                        )}
                    >
                        1000x
                    </button>
                </div>

                <div className="border-l border-white/10 pl-2 md:pl-4">
                    <button
                        onClick={resetToNow}
                        className="text-[9px] md:text-[10px] uppercase font-bold text-cyber-blue/70 hover:text-cyber-blue"
                    >
                        LIVE
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TimeController;
