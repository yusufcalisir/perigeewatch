import { useState, useCallback, useEffect, useRef } from 'react';

export type NotificationSeverity = 'critical' | 'warning' | 'info' | 'success';
export type NotificationType = 'conjunction' | 'reentry' | 'visibility' | 'maneuver' | 'system';

export interface AppNotification {
    id: string;
    type: NotificationType;
    severity: NotificationSeverity;
    title: string;
    message: string;
    timestamp: Date;
    read: boolean;
    noradId?: number;
    data?: Record<string, unknown>;
}

const NOTIFICATIONS_KEY = 'perigee-notifications';
const MAX_NOTIFICATIONS = 100;

/**
 * Hook for managing in-app notifications.
 * Supports browser Notification API and persistent history.
 */
export function useNotifications() {
    const [notifications, setNotifications] = useState<AppNotification[]>(() => {
        try {
            const stored = localStorage.getItem(NOTIFICATIONS_KEY);
            if (stored) {
                const parsed = JSON.parse(stored) as AppNotification[];
                return parsed.map(n => ({ ...n, timestamp: new Date(n.timestamp) }));
            }
        } catch { }
        return [];
    });

    const [browserPermission, setBrowserPermission] = useState<NotificationPermission>(
        typeof Notification !== 'undefined' ? Notification.permission : 'denied'
    );

    // Persist to localStorage
    useEffect(() => {
        try {
            localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(notifications.slice(0, MAX_NOTIFICATIONS)));
        } catch { }
    }, [notifications]);

    const requestPermission = useCallback(async () => {
        if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
            const result = await Notification.requestPermission();
            setBrowserPermission(result);
            return result;
        }
        return browserPermission;
    }, [browserPermission]);

    const addNotification = useCallback((
        type: NotificationType,
        severity: NotificationSeverity,
        title: string,
        message: string,
        noradId?: number,
        data?: Record<string, unknown>
    ) => {
        const notification: AppNotification = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type,
            severity,
            title,
            message,
            timestamp: new Date(),
            read: false,
            noradId,
            data,
        };

        setNotifications(prev => [notification, ...prev].slice(0, MAX_NOTIFICATIONS));

        // Browser notification for critical/warning
        if (
            typeof Notification !== 'undefined' &&
            Notification.permission === 'granted' &&
            (severity === 'critical' || severity === 'warning')
        ) {
            try {
                new Notification(`PerigeeWatch: ${title}`, {
                    body: message,
                    icon: '/favicon.ico',
                    tag: notification.id,
                });
            } catch { }
        }

        return notification;
    }, []);

    const markAsRead = useCallback((id: string) => {
        setNotifications(prev =>
            prev.map(n => n.id === id ? { ...n, read: true } : n)
        );
    }, []);

    const markAllRead = useCallback(() => {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    }, []);

    const clearAll = useCallback(() => {
        setNotifications([]);
    }, []);

    const unreadCount = notifications.filter(n => !n.read).length;

    return {
        notifications,
        unreadCount,
        browserPermission,
        requestPermission,
        addNotification,
        markAsRead,
        markAllRead,
        clearAll,
    };
}
