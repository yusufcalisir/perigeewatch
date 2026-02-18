import React from 'react';
import { Search, Filter, List, ChevronRight, ChevronDown, Target } from 'lucide-react';

interface ControlPanelProps {
    title: string;
    icon?: React.ReactNode;
    children: React.ReactNode;
    isCollapsible?: boolean;
    isOpen?: boolean;
    onToggle?: () => void;
}

const ControlPanel: React.FC<ControlPanelProps> = ({
    title,
    icon,
    children,
    isCollapsible,
    isOpen = true,
    onToggle
}) => {
    return (
        <div className={`flex flex-col bg-panel border border-white/10 rounded-lg backdrop-blur-md shadow-2xl transition-all duration-300 ${!isOpen && isCollapsible ? 'h-auto' : 'h-full'}`}>
            <div
                className={`p-3 sm:p-4 border-b border-white/10 flex items-center justify-between ${isCollapsible ? 'cursor-pointer hover:bg-white/5 transition-colors' : ''}`}
                onClick={() => isCollapsible && onToggle?.()}
            >
                <div className="flex items-center gap-2">
                    {icon ? (
                        <span className="scale-75 sm:scale-100">{icon}</span>
                    ) : (
                        <Target size={16} className="text-cyber-blue sm:w-[18px] sm:h-[18px]" />
                    )}
                    <h2 className="text-[11px] sm:text-sm font-bold uppercase tracking-widest text-white/90">{title}</h2>
                </div>
                <div className="flex items-center gap-1">
                    {isCollapsible ? (
                        isOpen ? <ChevronDown size={16} className="text-white/30" /> : <ChevronRight size={16} className="text-white/30" />
                    ) : (
                        <div className="w-1.5 h-1.5 rounded-full bg-cyber-blue" />
                    )}
                </div>
            </div>

            {isOpen && (
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {children}
                </div>
            )}

            {!isCollapsible && (
                <div className="p-3 border-t border-white/5 bg-white/5 text-[10px] text-white/30 font-mono">
                    PERIGEEWATCH CORE-SERVICES // LOCAL_SYNC_READY
                </div>
            )}
        </div>
    );
};

export const SearchField: React.FC<{ placeholder: string; value?: string; onChange?: (value: string) => void; inputRef?: React.Ref<HTMLInputElement> }> = ({ placeholder, value, onChange, inputRef }) => (
    <div className="p-4">
        <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={14} />
            <input
                ref={inputRef}
                type="text"
                placeholder={placeholder}
                value={value || ''}
                onChange={(e) => onChange?.(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded py-2 pl-9 pr-4 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-cyber-blue/50 transition-colors"
            />
        </div>
    </div>
);

export const SatelliteListItem: React.FC<{ id: string; name: string; type: string; selected?: boolean; onClick?: () => void }> = ({ id, name, type, selected, onClick }) => (
    <div
        className={`px-4 py-3 border-b border-white/5 hover:bg-white/5 cursor-pointer group transition-colors ${selected ? 'bg-cyber-blue/10 border-l-2 border-l-cyber-blue' : ''}`}
        onClick={onClick}
    >
        <div className="flex items-start justify-between mb-1">
            <span className={`text-xs font-bold group-hover:text-cyber-blue transition-colors uppercase ${selected ? 'text-cyber-blue' : 'text-white/80'}`}>{name}</span>
            <span className="text-[10px] font-mono text-white/30">#{id}</span>
        </div>
        <div className="flex items-center gap-2">
            <span className={`text-[9px] px-1.5 py-0.5 bg-white/5 border border-white/10 rounded uppercase font-bold tracking-tighter ${type === 'DEBRIS' ? 'text-cyber-red' : 'text-cyber-blue'}`}>
                {type}
            </span>
            <span className="text-[9px] text-white/20 font-mono">ORBIT_LOCKED</span>
        </div>
    </div>
);

export default ControlPanel;
