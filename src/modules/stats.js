// ==================== STATS MODULE ====================

import AppState, { getTodos, setStats } from './state.js';
import { saveStatsToFirebase } from './firebase-sync.js';

export function initializeStats() {
    updateStats();

    document.getElementById('resetStatsBtn').addEventListener('click', () => {
        if (confirm('Tüm istatistikleri sıfırlamak istediğinizden emin misiniz?')) {
            const todos = getTodos();
            const newStats = {
                totalTasks: todos.length,
                completedTasks: todos.filter(t => t.completed).length,
                totalPomodoros: 0,
                totalMinutes: 0
            };
            
            setStats(newStats);
            AppState.pomodoroState.completedPomodoros = 0;
            AppState.pomodoroState.totalTime = 0;
            
            saveStatsToFirebase();
            updateStats();
            updatePomodoroInfo();
        }
    });
}

export function updateStats() {
    const stats = AppState.stats;
    
    document.getElementById('totalTasks').textContent = stats.totalTasks;
    document.getElementById('completedTasks').textContent = stats.completedTasks;
    document.getElementById('totalPomodoros').textContent = stats.totalPomodoros;
    document.getElementById('totalMinutes').textContent = stats.totalMinutes;

    const productivity = stats.totalTasks > 0
        ? Math.round((stats.completedTasks / stats.totalTasks) * 100)
        : 0;

    document.getElementById('productivityPercent').textContent = productivity + '%';
    document.getElementById('productivityProgress').style.width = productivity + '%';
}

function updatePomodoroInfo() {
    document.getElementById('completedPomodoros').textContent = AppState.pomodoroState.completedPomodoros;
    document.getElementById('totalTime').textContent = Math.floor(AppState.pomodoroState.totalTime / 60) + ' dk';
}
