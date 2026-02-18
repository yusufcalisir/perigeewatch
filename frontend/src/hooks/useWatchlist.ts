import { useState, useCallback, useEffect } from 'react';

const WATCHLIST_KEY = 'perigee-watchlist';

/**
 * Hook for managing a satellite watchlist stored in localStorage.
 * Persists across sessions — no auth needed.
 */
export function useWatchlist() {
    const [watchlist, setWatchlist] = useState<Set<number>>(() => {
        try {
            const stored = localStorage.getItem(WATCHLIST_KEY);
            if (stored) {
                return new Set(JSON.parse(stored) as number[]);
            }
        } catch (e) {
            console.error('Failed to load watchlist:', e);
        }
        return new Set();
    });

    // Persist to localStorage whenever the watchlist changes
    useEffect(() => {
        try {
            localStorage.setItem(WATCHLIST_KEY, JSON.stringify([...watchlist]));
        } catch (e) {
            console.error('Failed to save watchlist:', e);
        }
    }, [watchlist]);

    const toggleWatchlist = useCallback((noradId: number) => {
        setWatchlist(prev => {
            const next = new Set(prev);
            if (next.has(noradId)) {
                next.delete(noradId);
            } else {
                next.add(noradId);
            }
            return next;
        });
    }, []);

    const isWatched = useCallback((noradId: number) => watchlist.has(noradId), [watchlist]);

    return { watchlist, toggleWatchlist, isWatched };
}
