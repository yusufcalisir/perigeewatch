import { useEffect, useCallback } from 'react';

interface KeyboardShortcutHandlers {
    onSearch?: () => void;           // /
    onResetTime?: () => void;        // R
    onToggleHUD?: () => void;        // H
    onEscape?: () => void;           // Esc
    onToggleCinematic?: () => void;  // C
    onToggleSound?: () => void;      // M
    onToggleFilter?: () => void;     // F
}

export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers): void {
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        // Skip if user is typing in an input/textarea
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
            // Only handle Escape in inputs
            if (e.key === 'Escape' && handlers.onEscape) {
                (target as HTMLInputElement).blur();
                handlers.onEscape();
            }
            return;
        }

        switch (e.key) {
            case '/':
                e.preventDefault();
                handlers.onSearch?.();
                break;
            case 'r':
            case 'R':
                handlers.onResetTime?.();
                break;
            case 'h':
            case 'H':
                handlers.onToggleHUD?.();
                break;
            case 'Escape':
                handlers.onEscape?.();
                break;
            case 'c':
            case 'C':
                handlers.onToggleCinematic?.();
                break;
            case 'm':
            case 'M':
                handlers.onToggleSound?.();
                break;
            case 'f':
            case 'F':
                handlers.onToggleFilter?.();
                break;
        }
    }, [handlers]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);
}
