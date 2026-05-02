// ==================== POMODORO MODULE ====================

import AppState, { setStats } from './state.js';
import { showNotification } from './notifications.js';
import { playNotificationSound } from './sounds.js';
import { saveStatsToFirebase } from './firebase-sync.js';
import { updateStats } from './stats.js';

let pomodoroTimer;

export function initializePomodoro() {
    const workDuration = parseInt(localStorage.getItem('workDuration') || '25');
    const shortBreak = parseInt(localStorage.getItem('shortBreak') || '5');
    const longBreak = parseInt(localStorage.getItem('longBreak') || '15');

    document.getElementById('workDuration').value = workDuration;
    document.getElementById('shortBreak').value = shortBreak;
    document.getElementById('longBreak').value = longBreak;

    AppState.pomodoroState.timeLeft = workDuration * 60;
    updateTimerDisplay();

    document.getElementById('startPomodoroBtn').addEventListener('click', startPomodoro);
    document.getElementById('pausePomodoroBtn').addEventListener('click', pausePomodoro);
    document.getElementById('resetPomodoroBtn').addEventListener('click', resetPomodoro);

    // Save settings on change
    ['workDuration', 'shortBreak', 'longBreak'].forEach(id => {
        document.getElementById(id).addEventListener('change', (e) => {
            localStorage.setItem(id, e.target.value);
            if (!AppState.pomodoroState.isRunning) {
                resetPomodoro();
            }
        });
    });

    updatePomodoroInfo();
}

function startPomodoro() {
    if (AppState.pomodoroState.isPaused) {
        AppState.pomodoroState.isPaused = false;
    } else {
        AppState.pomodoroState.isRunning = true;
    }

    document.getElementById('startPomodoroBtn').style.display = 'none';
    document.getElementById('pausePomodoroBtn').style.display = 'inline-block';

    pomodoroTimer = setInterval(() => {
        AppState.pomodoroState.timeLeft--;
        AppState.pomodoroState.totalTime++;
        updateTimerDisplay();

        if (AppState.pomodoroState.timeLeft <= 0) {
            clearInterval(pomodoroTimer);
            completeSession();
        }
    }, 1000);
}

function pausePomodoro() {
    clearInterval(pomodoroTimer);
    AppState.pomodoroState.isPaused = true;
    document.getElementById('startPomodoroBtn').style.display = 'inline-block';
    document.getElementById('pausePomodoroBtn').style.display = 'none';
}

function resetPomodoro() {
    clearInterval(pomodoroTimer);
    AppState.pomodoroState.isRunning = false;
    AppState.pomodoroState.isPaused = false;
    AppState.pomodoroState.currentSession = 'work';

    const workDuration = parseInt(document.getElementById('workDuration').value);
    AppState.pomodoroState.timeLeft = workDuration * 60;

    document.getElementById('startPomodoroBtn').style.display = 'inline-block';
    document.getElementById('pausePomodoroBtn').style.display = 'none';

    updateTimerDisplay();
}

function completeSession() {
    playNotificationSound();

    if (AppState.pomodoroState.currentSession === 'work') {
        AppState.pomodoroState.completedPomodoros++;
        AppState.stats.totalPomodoros++;
        AppState.stats.totalMinutes += parseInt(document.getElementById('workDuration').value);
        setStats(AppState.stats);
        saveStatsToFirebase();
        updateStats();
        updatePomodoroInfo();

        showNotification('Pomodoro Tamamlandı!', 'Harika iş çıkardınız! Mola zamanı.');

        if (AppState.pomodoroState.completedPomodoros % 4 === 0) {
            AppState.pomodoroState.currentSession = 'longBreak';
            AppState.pomodoroState.timeLeft = parseInt(document.getElementById('longBreak').value) * 60;
        } else {
            AppState.pomodoroState.currentSession = 'shortBreak';
            AppState.pomodoroState.timeLeft = parseInt(document.getElementById('shortBreak').value) * 60;
        }
    } else {
        showNotification('Mola Bitti!', 'Çalışmaya geri dönme zamanı.');
        AppState.pomodoroState.currentSession = 'work';
        AppState.pomodoroState.timeLeft = parseInt(document.getElementById('workDuration').value) * 60;
    }

    AppState.pomodoroState.isRunning = false;
    document.getElementById('startPomodoroBtn').style.display = 'inline-block';
    document.getElementById('pausePomodoroBtn').style.display = 'none';
    updateTimerDisplay();
}

function updateTimerDisplay() {
    const minutes = Math.floor(AppState.pomodoroState.timeLeft / 60);
    const seconds = AppState.pomodoroState.timeLeft % 60;

    document.getElementById('timerTime').textContent =
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    const sessionText = {
        'work': 'Çalışma Zamanı',
        'shortBreak': 'Kısa Mola',
        'longBreak': 'Uzun Mola'
    };

    document.getElementById('timerSession').textContent = sessionText[AppState.pomodoroState.currentSession];

    // Update progress circle
    const totalTime = AppState.pomodoroState.currentSession === 'work'
        ? parseInt(document.getElementById('workDuration').value) * 60
        : AppState.pomodoroState.currentSession === 'shortBreak'
        ? parseInt(document.getElementById('shortBreak').value) * 60
        : parseInt(document.getElementById('longBreak').value) * 60;

    const progress = (totalTime - AppState.pomodoroState.timeLeft) / totalTime;
    const circumference = 2 * Math.PI * 90;
    const offset = circumference * (1 - progress);

    document.getElementById('timerProgress').style.strokeDashoffset = offset;
}

function updatePomodoroInfo() {
    document.getElementById('completedPomodoros').textContent = AppState.pomodoroState.completedPomodoros;
    document.getElementById('totalTime').textContent = Math.floor(AppState.pomodoroState.totalTime / 60) + ' dk';
}
