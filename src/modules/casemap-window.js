import AppState from './state.js';
import { initializeCaseMap } from './casemap.js';

document.addEventListener('DOMContentLoaded', () => {
    if (!AppState.isDarkTheme) {
        document.body.classList.add('light-theme');
    }

    initializeCaseMap();
});
