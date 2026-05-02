// ==================== SOUND EFFECTS ====================

import AppState from './state.js';

let sharedAudioContext = null;

function getAudioContext() {
    if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
        sharedAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (sharedAudioContext.state === 'suspended') {
        sharedAudioContext.resume();
    }
    return sharedAudioContext;
}

export function playSound(type) {
    if (!AppState.soundEnabled) return;

    try {
        const ctx = getAudioContext();
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        const sounds = {
            'add': { freq: 800, duration: 0.1 },
            'complete': { freq: 1000, duration: 0.15 },
            'delete': { freq: 400, duration: 0.1 },
            'move': { freq: 600, duration: 0.08 },
            'success': { freq: 1200, duration: 0.2 }
        };

        const sound = sounds[type] || sounds.add;

        oscillator.frequency.value = sound.freq;
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + sound.duration);

        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + sound.duration);

        oscillator.onended = () => {
            oscillator.disconnect();
            gainNode.disconnect();
        };
    } catch (error) {
        console.error('Error playing sound:', error);
    }
}

export function playNotificationSound() {
    if (!AppState.soundEnabled) return;

    try {
        const ctx = getAudioContext();
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.frequency.value = 800;
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.5);

        oscillator.onended = () => {
            oscillator.disconnect();
            gainNode.disconnect();
        };
    } catch (error) {
        console.error('Error playing notification sound:', error);
    }
}
