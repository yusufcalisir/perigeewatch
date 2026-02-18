/**
 * SoundManager — Procedural sci-fi sound engine using Web Audio API
 * No external audio files needed. All sounds are mathematically generated.
 */

let audioCtx: AudioContext | null = null;
let ambientOsc: OscillatorNode | null = null;
let ambientGain: GainNode | null = null;
let isAmbientPlaying = false;

function getContext(): AudioContext {
    if (!audioCtx) {
        audioCtx = new AudioContext();
    }
    return audioCtx;
}

// ── UI Click Sound ──
// Short sine wave blip at 800Hz, 50ms duration
export function playClick(): void {
    try {
        const ctx = getContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.05);

        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.1);
    } catch (e) {
        // Audio not supported or blocked
    }
}

// ── Alert Sound ──
// Rising frequency sweep from 400Hz to 1600Hz, 300ms
export function playAlert(): void {
    try {
        const ctx = getContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(400, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1600, ctx.currentTime + 0.15);
        osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.3);

        gain.gain.setValueAtTime(0.06, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.35);
    } catch (e) {
        // Audio not supported or blocked
    }
}

// ── Scan / Select Sound ──
// Two-tone blip (military radar ping)
export function playScan(): void {
    try {
        const ctx = getContext();

        // First tone
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(1200, ctx.currentTime);
        gain1.gain.setValueAtTime(0.06, ctx.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(ctx.currentTime);
        osc1.stop(ctx.currentTime + 0.08);

        // Second tone (slightly higher, delayed)
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1600, ctx.currentTime + 0.1);
        gain2.gain.setValueAtTime(0.001, ctx.currentTime);
        gain2.gain.setValueAtTime(0.06, ctx.currentTime + 0.1);
        gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(ctx.currentTime + 0.1);
        osc2.stop(ctx.currentTime + 0.2);
    } catch (e) {
        // Audio not supported or blocked
    }
}

// ── Ambient Hum ──
// Low-frequency layered drone (60Hz + 90Hz sub harmonics)
export function toggleAmbient(): boolean {
    try {
        const ctx = getContext();

        if (isAmbientPlaying && ambientOsc && ambientGain) {
            ambientGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
            ambientOsc.stop(ctx.currentTime + 0.5);
            ambientOsc = null;
            ambientGain = null;
            isAmbientPlaying = false;
            return false;
        }

        // Create layered drone
        ambientOsc = ctx.createOscillator();
        ambientGain = ctx.createGain();

        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();

        // Layer 1: Deep 60Hz
        ambientOsc.type = 'sine';
        ambientOsc.frequency.setValueAtTime(60, ctx.currentTime);
        ambientGain.gain.setValueAtTime(0.015, ctx.currentTime);
        ambientOsc.connect(ambientGain);
        ambientGain.connect(ctx.destination);

        // Layer 2: Subtle 90Hz harmonic
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(90, ctx.currentTime);
        gain2.gain.setValueAtTime(0.008, ctx.currentTime);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);

        ambientOsc.start(ctx.currentTime);
        osc2.start(ctx.currentTime);
        isAmbientPlaying = true;
        return true;
    } catch (e) {
        return false;
    }
}

export function isAmbientActive(): boolean {
    return isAmbientPlaying;
}

// ── Warning / Conjunction Alert ──
// Three rapid high-pitched beeps
export function playWarning(): void {
    try {
        const ctx = getContext();

        for (let i = 0; i < 3; i++) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'square';
            osc.frequency.setValueAtTime(1800, ctx.currentTime + i * 0.12);

            gain.gain.setValueAtTime(0.001, ctx.currentTime);
            gain.gain.setValueAtTime(0.04, ctx.currentTime + i * 0.12);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.06);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(ctx.currentTime + i * 0.12);
            osc.stop(ctx.currentTime + i * 0.12 + 0.06);
        }
    } catch (e) {
        // Audio not supported or blocked
    }
}
