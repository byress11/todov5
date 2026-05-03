// ==================== TASKMASTER PRO - MAIN APPLICATION ====================
// Modern, modular JavaScript ile yeniden yapılandırılmış

// Import all modules
import { initializeFirebaseAuth } from './modules/firebase-sync.js';
import { initializeTheme } from './modules/theme.js';
import { initializeWidgetControls, initializeTabs } from './modules/ui.js';
import { initializeCaseMap } from './modules/casemap.js';
import { initializeTaskBlasterGame } from './modules/task-blaster-game.js';
import { initializePomodoro } from './modules/pomodoro.js';
import { initializeFiles } from './modules/files.js';
import { initializeNotes } from './modules/notes.js';
import { initializeStats } from './modules/stats.js';
import { initializeSettings } from './modules/settings.js';
import { requestNotificationPermission } from './modules/notifications.js';
import { initializeBrowser } from './modules/browser.js';
import { initializeBots } from './modules/bots.js';
// Terminal modulu lazy: ilk kez Terminal sekmesi acildiginda yuklenir

// Note: Event handlers are now managed via event delegation in the modules
// No longer exposing functions to window to comply with CSP

let terminalInitialized = false;
function setupLazyTerminal() {
    const terminalNavBtn = document.querySelector('.nav-btn[data-tab="terminal"]');
    if (!terminalNavBtn) return;

    const loadTerminal = async () => {
        if (terminalInitialized) return;
        terminalInitialized = true;
        try {
            // xterm.css'i lazy inject et (terminal goruntusu icin gerekli)
            if (!document.getElementById('xterm-css-lazy')) {
                const link = document.createElement('link');
                link.id = 'xterm-css-lazy';
                link.rel = 'stylesheet';
                link.href = 'node_modules/@xterm/xterm/css/xterm.css';
                document.head.appendChild(link);
            }
            const mod = await import('./modules/terminal.js');
            await mod.initializeTerminal();
            console.log('✅ Terminal module loaded on demand');
        } catch (err) {
            console.error('Terminal lazy load error:', err);
            terminalInitialized = false;
        }
    };

    terminalNavBtn.addEventListener('click', loadTerminal, { once: false });
}

// ==================== APPLICATION INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 TaskMaster Pro başlatılıyor...');

    try {
        // Initialize Firebase first
        initializeFirebaseAuth();
        console.log('✅ Firebase auth initialized');

        // Initialize UI components
        initializeTheme();
        console.log('✅ Theme initialized');

        initializeTabs();
        console.log('✅ Tabs initialized');

        initializeWidgetControls();
        console.log('✅ Widget controls initialized');

        // Initialize features
        initializeCaseMap();
        console.log('✅ Case Map (Olay Haritası) initialized');

        initializeTaskBlasterGame();
        console.log('✅ Görev Avcısı (retro oyun) initialized');

        initializePomodoro();
        console.log('✅ Pomodoro module initialized');

        initializeFiles();
        console.log('✅ Files module initialized');

        initializeNotes();
        console.log('✅ Notes module initialized');

        initializeStats();
        console.log('✅ Stats module initialized');

        initializeSettings();
        console.log('✅ Settings module initialized');

        // Terminal modulu, kullanici Terminal sekmesine ilk gectiginde yuklenir.
        setupLazyTerminal();
        console.log('✅ Terminal lazy-load configured');

        // Initialize Browser
        initializeBrowser();
        console.log('✅ Browser module initialized');

        // Initialize Bots (Notlar alanı)
        initializeBots();
        console.log('✅ Bots module initialized');

        // Initialize notifications
        requestNotificationPermission();
        console.log('✅ Notification permission requested');

        // File explorer is ready
        console.log('✅ File explorer ready');

        console.log('✨ TaskMaster Pro başarıyla yüklendi!');
    } catch (error) {
        console.error('❌ Initialization error:', error);
        alert('Uygulama başlatılırken bir hata oluştu: ' + error.message);
    }

    // Listen for window position save from Electron
    if (window.isElectron && window.electronAPI) {
        window.electronAPI.onSaveWindowPosition((event, position) => {
            localStorage.setItem('windowX', position.x);
            localStorage.setItem('windowY', position.y);
        });
        console.log('✅ Electron API connected');
    }
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
});

// Log app info
console.log('%cTaskMaster Pro', 'font-size: 24px; font-weight: bold; color: #6366f1;');
console.log('%cVersion: 1.0.0', 'font-size: 12px; color: #888;');
console.log('%cModular Architecture ✨', 'font-size: 12px; color: #10b981;');
