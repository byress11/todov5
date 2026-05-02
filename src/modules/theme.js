// ==================== THEME MANAGEMENT ====================

import AppState from './state.js';

export function initializeTheme() {
    if (!AppState.isDarkTheme) {
        document.body.classList.add('light-theme');
    }

    const themeBtn = document.getElementById('themeBtn');
    updateThemeIcon();

    themeBtn.addEventListener('click', () => {
        AppState.isDarkTheme = !AppState.isDarkTheme;
        document.body.classList.toggle('light-theme');
        localStorage.setItem('theme', AppState.isDarkTheme ? 'dark' : 'light');
        updateThemeIcon();
    });
}

function updateThemeIcon() {
    const themeBtn = document.getElementById('themeBtn');
    const icon = themeBtn.querySelector('i');
    if (AppState.isDarkTheme) {
        icon.className = 'fas fa-moon';
    } else {
        icon.className = 'fas fa-sun';
    }
}
