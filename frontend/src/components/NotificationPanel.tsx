import React from 'react';
import { X, Bell, AlertTriangle, Info, CheckCircle, Trash2, CheckCheck, AlertOctagon } from 'lucide-react';
import { type AppNotification, type NotificationSeverity } from '../hooks/useNotifications';

interface NotificationPanelProps {
    notifications: AppNotification[];
    unreadCount: number;
    onMarkRead: (id: string) => void;
    onMarkAllRead: () => void;
    onClearAll: () => void;
    onFocusSat?: (noradId: number) => void;
}

const severityConfig: Record<NotificationSeverity, { icon: React.ReactNode; color: string; bg: string }> = {
    critical: { icon: <AlertOctagon size={14} />, color: 'text-red-400', bg: 'bg-red-400/10 border-red-400/20' },
    warning: { icon: <AlertTriangle size={14} />, color: 'text-amber-400', bg: 'bg-amber-400/10 border-amber-400/20' },
    info: { icon: <Info size={14} />, color: 'text-cyan-400', bg: 'bg-cyan-400/10 border-cyan-400/20' },
    success: { icon: <CheckCircle size={14} />, color: 'text-green-400', bg: 'bg-green-400/10 border-green-400/20' },
};

const NotificationPanel: React.FC<NotificationPanelProps> = ({
    notifications,
    unreadCount,
    onMarkRead,
    onMarkAllRead,
    onClearAll,
    onFocusSat,
}) => {
    const formatTime = (date: Date) => {
        const now = new Date();
        const diff = (now.getTime() - date.getTime()) / 1000;
        if (diff < 60) return 'Just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return date.toLocaleDateString();
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
                <div className="flex items-center gap-2">
                    <Bell size={14} className="text-cyan-400" />
                    <span className="text-[10px] font-bold text-white/60 uppercase tracking-widest">
                        Notifications
                    </span>
                    {unreadCount > 0 && (
                        <span className="text-[9px] bg-red-500 text-white font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                            {unreadCount}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={onMarkAllRead}
                        className="p-1 rounded text-white/20 hover:text-white/50 hover:bg-white/5 transition-colors"
                        title="Mark all read"
                    >
                        <CheckCheck size={14} />
                    </button>
                    <button
                        onClick={onClearAll}
                        className="p-1 rounded text-white/20 hover:text-red-400/60 hover:bg-white/5 transition-colors"
                        title="Clear all"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>

            {/* Notifications List */}
            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
                {notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 text-white/20">
                        <Bell size={24} className="mb-2 opacity-50" />
                        <span className="text-[10px] font-mono">No notifications</span>
                    </div>
                ) : (
                    <div className="divide-y divide-white/5">
                        {notifications.map(n => {
                            const config = severityConfig[n.severity];
                            return (
                                <div
                                    key={n.id}
                                    onClick={() => {
                                        if (!n.read) onMarkRead(n.id);
                                        if (n.noradId && onFocusSat) onFocusSat(n.noradId);
                                    }}
                                    className={`px-4 py-2.5 cursor-pointer transition-colors hover:bg-white/[0.03] ${!n.read ? 'bg-white/[0.02] border-l-2 border-l-cyan-400/50' : 'border-l-2 border-l-transparent'
                                        }`}
                                >
                                    <div className="flex items-start gap-2.5">
                                        <div className={`mt-0.5 ${config.color}`}>
                                            {config.icon}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between">
                                                <span className={`text-[10px] font-bold ${!n.read ? 'text-white' : 'text-white/50'}`}>
                                                    {n.title}
                                                </span>
                                                <span className="text-[8px] text-white/20 font-mono flex-shrink-0 ml-2">
                                                    {formatTime(n.timestamp)}
                                                </span>
                                            </div>
                                            <div className="text-[9px] text-white/40 mt-0.5 line-clamp-2">
                                                {n.message}
                                            </div>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className={`text-[7px] font-bold px-1.5 py-0.5 rounded border ${config.bg} ${config.color} uppercase`}>
                                                    {n.type}
                                                </span>
                                                {n.noradId && (
                                                    <span className="text-[7px] font-mono text-white/20">
                                                        #{n.noradId}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default NotificationPanel;
