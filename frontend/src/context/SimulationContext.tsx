import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { JulianDate, Clock, ClockRange, ClockStep } from 'cesium';

interface SimulationContextType {
    currentTime: Date;
    isPlaying: boolean;
    multiplier: number;
    togglePlay: () => void;
    setMultiplier: (speed: number) => void;
    setCurrentTime: (time: Date) => void;
    cesiumClock: Clock;
}

const SimulationContext = createContext<SimulationContextType | undefined>(undefined);

export const SimulationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const clockRef = useRef(new Clock({
        startTime: JulianDate.fromIso8601("2020-01-01T00:00:00Z"),
        currentTime: JulianDate.now(),
        stopTime: JulianDate.fromIso8601("2030-01-01T00:00:00Z"),
        clockRange: ClockRange.UNBOUNDED,
        clockStep: ClockStep.SYSTEM_CLOCK_MULTIPLIER,
        multiplier: 1,
        shouldAnimate: true
    }));

    const [currentTime, setCurrentTimeState] = useState<Date>(new Date());
    const [isPlaying, setIsPlaying] = useState(true);
    const [multiplier, setMultiplierState] = useState(1);

    // Drive the clock with requestAnimationFrame so it actually ticks
    useEffect(() => {
        const clock = clockRef.current;
        let frameId: number;
        let lastSyncTime = 0;

        const tick = (timestamp: number) => {
            // Tick the Cesium clock to advance simulation time
            clock.tick();

            // Update React state at ~4 fps to avoid excessive re-renders
            if (timestamp - lastSyncTime > 250) {
                lastSyncTime = timestamp;
                const jsDate = JulianDate.toDate(clock.currentTime);
                setCurrentTimeState(jsDate);
            }

            frameId = requestAnimationFrame(tick);
        };

        frameId = requestAnimationFrame(tick);

        return () => {
            cancelAnimationFrame(frameId);
        };
    }, []);

    const togglePlay = useCallback(() => {
        const clock = clockRef.current;
        clock.shouldAnimate = !clock.shouldAnimate;
        setIsPlaying(clock.shouldAnimate);
    }, []);

    const setMultiplier = useCallback((speed: number) => {
        const clock = clockRef.current;
        clock.multiplier = speed;
        clock.shouldAnimate = true;
        setMultiplierState(speed);
        setIsPlaying(true);
    }, []);

    const setCurrentTime = useCallback((time: Date) => {
        const clock = clockRef.current;
        clock.currentTime = JulianDate.fromDate(time);
        setCurrentTimeState(time);
    }, []);

    return (
        <SimulationContext.Provider value={{
            currentTime,
            isPlaying,
            multiplier,
            togglePlay,
            setMultiplier,
            setCurrentTime,
            cesiumClock: clockRef.current
        }}>
            {children}
        </SimulationContext.Provider>
    );
};

export const useSimulation = () => {
    const context = useContext(SimulationContext);
    if (!context) {
        throw new Error('useSimulation must be used within a SimulationProvider');
    }
    return context;
};
