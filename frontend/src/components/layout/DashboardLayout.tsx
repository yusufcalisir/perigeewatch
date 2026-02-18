import React, { useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface DashboardLayoutProps {
    header: React.ReactNode;
    leftPanel?: React.ReactNode;
    rightPanel?: React.ReactNode;
    children: React.ReactNode; // Globe goes here
    leftOpen: boolean;
    setLeftOpen: (open: boolean) => void;
    rightOpen?: boolean;
    setRightOpen?: (open: boolean) => void;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({
    header,
    leftPanel,
    rightPanel,
    children,
    leftOpen,
    setLeftOpen,
    rightOpen,
    setRightOpen
}) => {
    const [isMaximized, setIsMaximized] = useState(false);

    return (
        <div className="fixed inset-0 w-screen h-screen bg-background overflow-hidden text-white font-sans selection:bg-cyber-blue/30 flex flex-col md:block">
            {/* Globe Layer */}
            <div className={cn(
                "relative md:absolute inset-0 z-0 transition-all duration-500 ease-in-out",
                (leftOpen || rightOpen) && !isMaximized ? "h-[40vh] md:h-full" : "h-full"
            )}>
                {children}

                {/* Maximize Toggle */}
                <button
                    onClick={() => setIsMaximized(!isMaximized)}
                    className="absolute bottom-4 right-4 z-50 bg-background/60 backdrop-blur-md border border-white/10 p-2.5 rounded-full text-white/50 hover:text-cyber-blue shadow-lg transition-all active:scale-95"
                    title={isMaximized ? "Show Panels" : "Maximize Globe"}
                >
                    {isMaximized ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                </button>
            </div>

            {/* Header Layer */}
            <div className="absolute top-0 left-0 right-0 z-50 pointer-events-none">
                <div className="pointer-events-auto">
                    {header}
                </div>
            </div>

            {/* Panels Layer */}
            <div className={cn(
                "relative z-40 transition-all duration-500 ease-in-out md:absolute md:inset-0 pointer-events-none",
                (leftOpen || rightOpen) && !isMaximized ? "flex-1 md:h-full md:opacity-100" : "h-0 md:h-0 md:opacity-0 overflow-hidden"
            )}>
                <div className="flex flex-col md:flex-row justify-between h-full pt-0 md:pt-16 pb-0 md:pb-4 px-0 md:px-4 overflow-hidden gap-0 md:gap-4">
                    {/* Left Panel */}
                    {leftPanel && (
                        <div
                            className={cn(
                                "h-full pointer-events-auto transition-all duration-500 ease-in-out z-50",
                                leftOpen ? "w-full md:w-[420px] translate-y-0 md:translate-x-0 opacity-100" : "h-0 md:w-0 translate-y-full md:-translate-x-full opacity-0 invisible"
                            )}
                        >
                            <div className="h-full bg-background/95 backdrop-blur-xl md:bg-transparent md:backdrop-blur-none rounded-none md:rounded-lg overflow-hidden border-t md:border-none border-white/10 shadow-2xl">
                                {leftPanel}
                            </div>
                        </div>
                    )}

                    {/* Right Panel (Hidden in V2.6.0, but kept for structural compatibility) */}
                    {rightPanel && (
                        <div
                            className={cn(
                                "h-full pointer-events-auto transition-all duration-500 ease-in-out z-50",
                                rightOpen ? "w-full md:w-96 translate-y-0 md:translate-x-0 opacity-100" : "h-0 md:w-0 translate-y-full md:translate-x-full opacity-0 invisible"
                            )}
                        >
                            <div className="h-full bg-background/95 backdrop-blur-xl md:bg-transparent md:backdrop-blur-none rounded-none md:rounded-lg overflow-hidden border-t md:border-none border-white/10 shadow-2xl">
                                {rightPanel}
                            </div>
                        </div>
                    )}
                </div>
            </div>


        </div>
    );
};

export default DashboardLayout;
