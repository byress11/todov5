const { app, BrowserWindow, BrowserView, ipcMain, Tray, Menu, nativeImage, session, clipboard } = require('electron');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

// Tarayici cache'i acik kalsin, ancak disk cache boyutunu sinirla (200MB)
app.commandLine.appendSwitch('disk-cache-size', String(200 * 1024 * 1024));
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Performans modu: config'e gore GPU hizlandirmasini kapat (yeniden baslatma gerekir)
try {
    const earlyConfigPath = require('path').join(app.getPath('userData'), 'config.json');
    const earlyFs = require('fs');
    if (earlyFs.existsSync(earlyConfigPath)) {
        const earlyCfg = JSON.parse(earlyFs.readFileSync(earlyConfigPath, 'utf8'));
        if (earlyCfg.lowPowerMode === true) {
            app.disableHardwareAcceleration();
            app.commandLine.appendSwitch('disable-gpu-compositing');
            console.log('[PERF] Low power mode active: hardware acceleration disabled');
        }
    }
} catch (err) {
    console.error('[PERF] Could not read low-power config:', err.message);
}

let mainWindow;
let tray = null;
let isAlwaysOnTop = false; // Default is off, will be loaded from config
// Multi-tab support
const browserViews = new Map(); // tabId -> BrowserView
const tabMetadata = new Map(); // tabId -> { url, title, favicon, discarded }
const tabIdleTimers = new Map(); // tabId -> timeout
const tabLastActiveAt = new Map(); // tabId -> timestamp
const TAB_IDLE_DISCARD_MS = 3 * 60 * 1000;
const MAX_ACTIVE_BROWSER_VIEWS = 5;
let activeTabId = null;
let browserTabsVisible = false;
let caseMapWindow = null;

function toggleDevTools() {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
    } else {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
    return true;
}

// Simple config storage without electron-store
const configPath = path.join(app.getPath('userData'), 'config.json');

function getConfig() {
    try {
        if (fs.existsSync(configPath)) {
            return JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
    } catch (error) {
        console.error('Error reading config:', error);
    }
    return {};
}

function saveConfig(config) {
    try {
        const dir = path.dirname(configPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    } catch (error) {
        console.error('Error saving config:', error);
    }
}

// YouTube Reklam Engelleme ve Sponsor Atlama Fonksiyonu
function injectYouTubeAdBlocker(webContents) {
    const adBlockerScript = `
    (function() {
        'use strict';
        
        // Daha önce çalıştırıldıysa çık
        if (window.__ytAdBlockerInjected) return;
        window.__ytAdBlockerInjected = true;
        
        console.log('[YT AdBlocker] YouTube reklam engelleyici aktif');
        
        // CSS ile reklam elementlerini gizle
        const adBlockerCSS = \`
            /* Video reklamları */
            .ytp-ad-module,
            .ytp-ad-overlay-container,
            .ytp-ad-text-overlay,
            .ytp-ad-player-overlay,
            .ytp-ad-image-overlay,
            .ytp-ad-overlay-slot,
            .ytp-ad-progress,
            .ytp-ad-progress-list,
            .ad-showing .ytp-ad-skip-button-container,
            
            /* Sayfa reklamları */
            #masthead-ad,
            #player-ads,
            #search-pva,
            .ytd-display-ad-renderer,
            .ytd-companion-slot-renderer,
            .ytd-action-companion-ad-renderer,
            .ytd-promoted-sparkles-text-search-renderer,
            .ytd-promoted-sparkles-web-renderer,
            .ytd-statement-banner-renderer,
            .ytd-in-feed-ad-layout-renderer,
            .ytd-banner-promo-renderer,
            .ytd-video-masthead-ad-v3-renderer,
            .ytd-ad-slot-renderer,
            
            /* Shorts reklamları */
            .ytd-reel-video-renderer .ytd-ad-slot-renderer,
            
            /* Premium promosyon */
            .ytd-mealbar-promo-renderer,
            ytd-popup-container,
            
            /* Sidebar reklamları */
            #related ytd-compact-promoted-video-renderer,
            ytd-promoted-video-renderer,
            
            /* Overlay ve popup */
            .ytp-popup,
            .ytp-ad-overlay-close-button,
            .ytp-ad-overlay-close-container,
            tp-yt-paper-dialog.ytd-popup-container,
            
            /* Diğer reklam elementleri */
            [class*="ad-showing"],
            [class*="ytd-ad-"],
            [layout*="display-ad"] {
                display: none !important;
                visibility: hidden !important;
                opacity: 0 !important;
                pointer-events: none !important;
                height: 0 !important;
                width: 0 !important;
                overflow: hidden !important;
            }
            
            /* Video container'ı reklam sırasında göster */
            .ad-showing video {
                display: block !important;
            }
        \`;
        
        // CSS'i sayfaya ekle
        const styleElement = document.createElement('style');
        styleElement.id = 'yt-adblocker-style';
        styleElement.textContent = adBlockerCSS;
        if (!document.getElementById('yt-adblocker-style')) {
            (document.head || document.documentElement).appendChild(styleElement);
        }
        
        // Video reklamlarını atlama fonksiyonu
        function skipVideoAds() {
            const video = document.querySelector('video');
            if (!video) return;
            
            // Reklam gösteriliyorsa - sadece .ad-showing sınıfını kontrol et (daha güvenilir)
            const adShowing = document.querySelector('.ad-showing');
            
            if (adShowing) {
                console.log('[YT AdBlocker] Video reklamı tespit edildi, atlanıyor...');
                
                // Skip butonuna tıkla
                const skipButton = document.querySelector('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, [class*="skip-button"], .ytp-ad-skip-button-container button');
                if (skipButton) {
                    skipButton.click();
                    console.log('[YT AdBlocker] Skip butonuna tıklandı');
                    return;
                }
                
                // Skip butonu yoksa videoyu sonuna atla (sadece kısa reklamlar için)
                if (video.duration && video.duration > 0 && video.duration < 30) {
                    video.currentTime = video.duration;
                    console.log('[YT AdBlocker] Kısa reklam atlandı');
                }
                
                // NOT: Ses kapatma/açma kaldırıldı - kullanıcı deneyimini bozuyordu
            }
        }
        
        // Overlay reklamlarını kapat
        function closeOverlayAds() {
            const closeButtons = document.querySelectorAll('.ytp-ad-overlay-close-button, .ytp-ad-skip-button, [aria-label="Reklamı kapat"], [aria-label="Close ad"], .ytp-ad-overlay-close-container');
            closeButtons.forEach(btn => {
                if (btn && btn.offsetParent !== null) {
                    btn.click();
                    console.log('[YT AdBlocker] Overlay reklam kapatıldı');
                }
            });
        }
        
        // Popup reklamlarını kapat
        function closePopupAds() {
            const popups = document.querySelectorAll('tp-yt-paper-dialog.ytd-popup-container, ytd-popup-container, .ytd-mealbar-promo-renderer');
            popups.forEach(popup => {
                const closeBtn = popup.querySelector('button, [aria-label="Dismiss"], [aria-label="Kapat"]');
                if (closeBtn) {
                    closeBtn.click();
                } else {
                    popup.remove();
                }
            });
        }
        
        // SponsorBlock benzeri sponsor atlama (basit versiyon)
        function checkForSponsors() {
            const video = document.querySelector('video');
            if (!video) return;
            
            // YouTube'un kendi sponsor/promo segmentleri için chapter'ları kontrol et
            const chapters = document.querySelectorAll('.ytp-chapter-hover-container');
            chapters.forEach(chapter => {
                const title = chapter.textContent.toLowerCase();
                if (title.includes('sponsor') || title.includes('reklam') || title.includes('promo')) {
                    console.log('[YT AdBlocker] Sponsor segment tespit edildi');
                }
            });
        }
        
        // MutationObserver ile sadece gerekli reklam degisikliklerini izle
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    const target = mutation.target;
                    if (target.classList && target.classList.contains('ad-showing')) {
                        skipVideoAds();
                        closeOverlayAds();
                        closePopupAds();
                    }
                }
            }
        });
        
        // Player container'ı izle
        const playerContainer = document.querySelector('#movie_player, #player');
        if (playerContainer) {
            observer.observe(playerContainer, {
                childList: false,
                subtree: false,
                attributes: true,
                attributeFilter: ['class']
            });
            skipVideoAds();
            closeOverlayAds();
            closePopupAds();
        }

        window.addEventListener('beforeunload', () => {
            observer.disconnect();
        });
        
        console.log('[YT AdBlocker] Reklam engelleyici tamamen yüklendi');
    })();
    `;

    webContents.executeJavaScript(adBlockerScript).catch(err => {
        console.error('YouTube AdBlocker injection error:', err);
    });
}

function clearTabIdleTimer(tabId) {
    const timer = tabIdleTimers.get(tabId);
    if (timer) {
        clearTimeout(timer);
        tabIdleTimers.delete(tabId);
    }
}

// Sayfa Görünürlük (Page Visibility) sahteleme scripti.
// BrowserView pencereden çıkarıldığında YouTube ve benzeri siteler
// `visibilitychange` olayını dinleyip videoyu durdurur. Bu script bu
// davranışı bastırır; sayfa daima "visible" olarak raporlanır.
const VISIBILITY_SPOOF_SCRIPT = `
(function() {
    try {
        Object.defineProperty(Document.prototype, 'hidden', {
            configurable: true,
            get: function () { return false; }
        });
        Object.defineProperty(Document.prototype, 'webkitHidden', {
            configurable: true,
            get: function () { return false; }
        });
        Object.defineProperty(Document.prototype, 'visibilityState', {
            configurable: true,
            get: function () { return 'visible'; }
        });
        Object.defineProperty(Document.prototype, 'webkitVisibilityState', {
            configurable: true,
            get: function () { return 'visible'; }
        });

        const blockedEvents = new Set(['visibilitychange', 'webkitvisibilitychange']);

        const origAdd = EventTarget.prototype.addEventListener;
        EventTarget.prototype.addEventListener = function (type, listener, options) {
            if (typeof type === 'string' && blockedEvents.has(type.toLowerCase())) {
                return;
            }
            return origAdd.call(this, type, listener, options);
        };

        ['onvisibilitychange', 'onwebkitvisibilitychange'].forEach(function (prop) {
            try {
                Object.defineProperty(Document.prototype, prop, {
                    configurable: true,
                    set: function () {},
                    get: function () { return null; }
                });
            } catch (_) {}
        });

        document.dispatchEvent(new Event('visibilitychange'));
    } catch (e) {
        console.warn('[Visibility spoof] failed:', e);
    }
})();
`;

function createBrowserTabView(tabId, browserSession) {
    const newView = new BrowserView({
        webPreferences: {
            session: browserSession,
            preload: path.join(__dirname, 'browser-preload.js'),
            sandbox: false,
            contextIsolation: false,
            nodeIntegration: false,
            javascript: true,
            scrollBounce: true,
            webSecurity: true,
            allowRunningInsecureContent: false,
            backgroundThrottling: false
        }
    });

    try {
        newView.webContents.setBackgroundThrottling(false);
    } catch (_) {}

    const injectVisibilitySpoof = () => {
        if (!newView.webContents || newView.webContents.isDestroyed()) return;
        newView.webContents.executeJavaScript(VISIBILITY_SPOOF_SCRIPT, true).catch(() => {});
    };
    newView.webContents.on('dom-ready', injectVisibilitySpoof);
    newView.webContents.on('did-frame-finish-load', (_e, isMainFrame) => {
        if (isMainFrame) injectVisibilitySpoof();
    });

    newView.webContents.on('did-navigate', (e, navUrl) => {
        const metadata = tabMetadata.get(tabId) || {};
        metadata.url = navUrl;
        metadata.discarded = false;
        tabMetadata.set(tabId, metadata);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('browser-tab-url-changed', { tabId, url: navUrl });
        }
    });

    newView.webContents.on('did-navigate-in-page', (e, navUrl) => {
        const metadata = tabMetadata.get(tabId) || {};
        metadata.url = navUrl;
        metadata.discarded = false;
        tabMetadata.set(tabId, metadata);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('browser-tab-url-changed', { tabId, url: navUrl });
        }
    });

    newView.webContents.on('page-title-updated', (e, title) => {
        const metadata = tabMetadata.get(tabId) || {};
        metadata.title = title;
        tabMetadata.set(tabId, metadata);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('browser-tab-title-changed', { tabId, title });
        }
    });

    newView.webContents.on('page-favicon-updated', (e, favicons) => {
        if (favicons.length > 0) {
            const metadata = tabMetadata.get(tabId) || {};
            metadata.favicon = favicons[0];
            tabMetadata.set(tabId, metadata);
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('browser-tab-favicon-changed', { tabId, favicon: favicons[0] });
            }
        }
    });

    // Popup/yeni-pencere isteklerini yeni sekmede ac (Gmail eki, OAuth vb.)
    newView.webContents.setWindowOpenHandler(({ url, disposition }) => {
        try {
            if (!url || url === 'about:blank') return { action: 'deny' };

            // about:blank veya javascript: gibi sahte URL'leri engelle
            if (url.startsWith('javascript:') || url.startsWith('data:')) {
                return { action: 'deny' };
            }

            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('browser-open-new-tab', { url });
            }
        } catch (e) {
            console.error('window-open handler hatasi:', e);
        }
        return { action: 'deny' };
    });

    // Popup hala bir sekilde olusursa (eski API), onu da yakala
    newView.webContents.on('did-create-window', (childWindow) => {
        try { childWindow.close(); } catch (_) {}
    });

    return newView;
}

function discardTab(tabId) {
    if (!tabId || tabId === activeTabId) return false;
    const view = browserViews.get(tabId);
    if (!view) return false;

    try {
        const metadata = tabMetadata.get(tabId) || {};
        if (view.webContents && !view.webContents.isDestroyed()) {
            metadata.url = view.webContents.getURL() || metadata.url;
            metadata.title = view.webContents.getTitle() || metadata.title;
        }
        metadata.discarded = true;
        tabMetadata.set(tabId, metadata);

        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.removeBrowserView(view);
        }
        view.webContents.destroy();
        browserViews.delete(tabId);
        clearTabIdleTimer(tabId);
        return true;
    } catch (error) {
        console.error('Tab discard error:', error);
        return false;
    }
}

function enforceBrowserViewLimit() {
    if (browserViews.size <= MAX_ACTIVE_BROWSER_VIEWS) return;
    const candidates = Array.from(browserViews.keys())
        .filter((id) => id !== activeTabId)
        .sort((a, b) => (tabLastActiveAt.get(a) || 0) - (tabLastActiveAt.get(b) || 0));
    for (const tabId of candidates) {
        if (browserViews.size <= MAX_ACTIVE_BROWSER_VIEWS) break;
        discardTab(tabId);
    }
}

function scheduleTabIdleDiscard(tabId) {
    if (!tabId || tabId === activeTabId) return;
    clearTabIdleTimer(tabId);
    const timeout = setTimeout(() => {
        discardTab(tabId);
    }, TAB_IDLE_DISCARD_MS);
    tabIdleTimers.set(tabId, timeout);
}

function createWindow() {
    // Get saved window bounds or use defaults
    const config = getConfig();
    const savedBounds = config.windowBounds || {
        width: 450,
        height: 650,
        x: null,
        y: null
    };

    // Load lock mode preference from config (default: unlocked)
    const isLocked = config.isLocked !== undefined ? config.isLocked : false;

    // Load always on top preference from config (default: false - normal z-index)
    // Kilitli modda bile her zaman üstte DEĞİL
    isAlwaysOnTop = false;

    // Create app icon from PNG
    let appIcon = null;
    const pngIconPath = path.join(__dirname, 'app_icon.png');
    if (fs.existsSync(pngIconPath)) {
        appIcon = nativeImage.createFromPath(pngIconPath);
        if (appIcon.isEmpty()) {
            appIcon = null;
        }
    }

    mainWindow = new BrowserWindow({
        width: savedBounds.width,
        height: savedBounds.height,
        x: savedBounds.x,
        y: savedBounds.y,
        minWidth: 350,
        minHeight: 400,
        frame: false, // Frameless window for custom UI
        transparent: true,
        resizable: !isLocked, // Kilitliyse boyutlandırılamaz
        movable: true,
        hasShadow: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            sandbox: false,
            webviewTag: false,
            webSecurity: true,
            allowRunningInsecureContent: false,
            experimentalFeatures: false,
            // Cache hatalarını önle
            partition: 'persist:taskmaster'
        },
        icon: appIcon,
        skipTaskbar: false,
        alwaysOnTop: isAlwaysOnTop, // Use saved preference
        backgroundColor: '#00000000', // Transparent background
        roundedCorners: true,
        titleBarStyle: 'hidden',
        show: false, // Don't show until ready
        focusable: true, // Can receive focus when clicked
        acceptFirstMouse: true, // Allow interaction on first click
        minimizable: false, // Widgets don't minimize
        maximizable: false // Widgets don't maximize
    });

    // Position window at bottom-right corner if no saved position
    if (savedBounds.x === null || savedBounds.y === null) {
        const { screen } = require('electron');
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

        const windowWidth = savedBounds.width;
        const windowHeight = savedBounds.height;
        const margin = 20;

        mainWindow.setPosition(
            screenWidth - windowWidth - margin,
            screenHeight - windowHeight - margin
        );
    }

    // ==================== TANI KÖPRÜLERİ (renderer hatalarını terminale yansıt) ====================
    // Renderer console mesajlarını terminale yaz (uyari/hata/log).
    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
        const levels = ['LOG', 'WARN', 'ERROR', 'INFO'];
        const tag = levels[level] || `L${level}`;
        const where = sourceId ? `${sourceId}:${line}` : '';
        // Sadece WARN ve ERROR'u oncelikle goster, LOG cok gurultulu olabilir
        if (level >= 1) {
            console.log(`[RENDERER ${tag}] ${message} ${where}`);
        }
    });

    mainWindow.webContents.on('render-process-gone', (event, details) => {
        console.error('[RENDERER CRASH]', details);
    });

    mainWindow.webContents.on('unresponsive', () => {
        console.warn('[RENDERER UNRESPONSIVE] Renderer process yanit vermiyor');
    });

    mainWindow.webContents.on('responsive', () => {
        console.log('[RENDERER RESPONSIVE] Renderer tekrar yanit veriyor');
    });

    mainWindow.webContents.on('preload-error', (event, preloadPath, error) => {
        console.error('[PRELOAD ERROR]', preloadPath, error);
    });

    // Tum yakalanmamis hatalari main process'te log'la
    process.on('uncaughtException', (err) => {
        console.error('[MAIN uncaughtException]', err);
    });
    process.on('unhandledRejection', (reason) => {
        console.error('[MAIN unhandledRejection]', reason);
    });
    // ==============================================================================================

    // Load the app
    mainWindow.loadFile('index.html');

    // Remove menu bar
    mainWindow.setMenuBarVisibility(false);

    // Handle window close - minimize to tray instead
    mainWindow.on('close', (event) => {
        if (!app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
        return false;
    });

    // Prevent navigation to external URLs
    mainWindow.webContents.on('will-navigate', (event, url) => {
        const appURL = mainWindow.webContents.getURL();
        if (url !== appURL) {
            event.preventDefault();
        }
    });

    // Show window when ready (widget mode - show without stealing focus initially)
    mainWindow.once('ready-to-show', () => {
        mainWindow.showInactive(); // Show without focus for widget mode
        mainWindow.setAlwaysOnTop(isAlwaysOnTop, isAlwaysOnTop ? 'floating' : 'normal');

        // Make window focusable when clicked
        mainWindow.setFocusable(true);
    });

    // Handle focus events - when user clicks on window, it should become active
    mainWindow.on('focus', () => {
        console.log('Window focused');
    });

    mainWindow.on('blur', () => {
        console.log('Window blurred');
    });

    // Save window bounds on move or resize (with debounce)
    let saveTimeout;
    const saveBounds = () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            const bounds = mainWindow.getBounds();
            const config = getConfig();
            config.windowBounds = bounds;
            saveConfig(config);
            console.log('Window bounds saved:', bounds);
        }, 500); // Save after 500ms of no movement
    };

    mainWindow.on('move', saveBounds);
    mainWindow.on('resize', saveBounds);

    // Also save on close
    mainWindow.on('close', () => {
        clearTimeout(saveTimeout);
        const bounds = mainWindow.getBounds();
        const config = getConfig();
        config.windowBounds = bounds;
        saveConfig(config);
    });

    // Set click-through for transparent areas (Windows only)
    if (process.platform === 'win32') {
        mainWindow.setIgnoreMouseEvents(false);
    }

    // DevTools artık otomatik açılmıyor - Ayarlar'dan manuel açılabilir

    // Create system tray icon
    createTray();
}

function getAppIcon() {
    const pngIconPath = path.join(__dirname, 'app_icon.png');
    if (!fs.existsSync(pngIconPath)) return null;

    const appIcon = nativeImage.createFromPath(pngIconPath);
    return appIcon && !appIcon.isEmpty() ? appIcon : null;
}

function createCaseMapWindow() {
    if (caseMapWindow && !caseMapWindow.isDestroyed()) {
        caseMapWindow.show();
        if (caseMapWindow.isMinimized()) caseMapWindow.restore();
        caseMapWindow.focus();
        return true;
    }

    caseMapWindow = new BrowserWindow({
        width: 1100,
        height: 760,
        minWidth: 520,
        minHeight: 420,
        frame: true,
        transparent: false,
        resizable: true,
        movable: true,
        hasShadow: true,
        skipTaskbar: false,
        minimizable: true,
        maximizable: true,
        title: 'TaskMaster Pro - Hibrit Harita',
        backgroundColor: '#03040c',
        icon: getAppIcon(),
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            sandbox: false,
            webSecurity: true,
            partition: 'persist:taskmaster'
        }
    });

    caseMapWindow.loadFile('casemap-window.html');
    caseMapWindow.setMenuBarVisibility(false);

    caseMapWindow.once('ready-to-show', () => {
        if (caseMapWindow && !caseMapWindow.isDestroyed()) {
            caseMapWindow.show();
            caseMapWindow.focus();
        }
    });

    caseMapWindow.on('closed', () => {
        caseMapWindow = null;
    });

    return true;
}

// ensureBrowserView kaldırıldı — sadece multi-tab sistemi kullanılıyor

function createTray() {
    try {
        // Create tray icon - try multiple paths
        let trayIcon;
        const iconPaths = [
            path.join(__dirname, 'tray_icon.png'),
            path.join(__dirname, 'icon-32.png'),
            path.join(__dirname, 'app_icon.png'),
            path.join(__dirname, 'app_icon.ico'),
        ];

        for (const iconPath of iconPaths) {
            if (fs.existsSync(iconPath)) {
                trayIcon = nativeImage.createFromPath(iconPath);
                if (!trayIcon.isEmpty()) {
                    console.log('Tray icon loaded from:', iconPath);
                    break;
                }
            }
        }

        // If no icon found, create a simple one
        if (!trayIcon || trayIcon.isEmpty()) {
            console.log('Creating fallback tray icon');
            // Create a 16x16 canvas with a simple icon
            const canvas = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAE3SURBVDiNpZK/SsNQFMZ/596kSWtTaxGhIA46ODko+Ag+gA/g5OYD6KCTo4uTODo5CCKKi6B0cJAiVGuptqbJ/XMckkbQVoSe6XDO+fjOd74jqCp/EfmLOEDgJLlP0/QmSZI1EbkQkVBEDlT1SUQeVfXGGLMN4I7P55s9Ho/7RVFsA2JRVb0GYlV9AvpcVccA7vl4PK4553YBLKrq3Hv/PAyHw4csy3aBQJZlrPV6vZumaZYB3Dm3q6rrAEEURct5ni8BuGVZcgAopZSllLKsqnIRuQRwL6UEgLquq6qqFgDcZVnGRVFc9Xq9h+l0egFgyuVycT6fH3nnbgDcx8fH2Xq9Pk7TdA3AnXObrVZrC8Bdr9fLu93u8Ww2OwVwG43GYDgcHgO4g8Hgstls7gO4w+Hwcrvd3gdwj46O/in/AH8BvgA7z3YeJ8YAAAAASUVORK5CYII=', 'base64');
            trayIcon = nativeImage.createFromBuffer(canvas);
        }

        // Resize to 16x16 for tray
        const resizedIcon = trayIcon.resize({ width: 16, height: 16 });

        if (tray) {
            tray.destroy();
        }

        tray = new Tray(resizedIcon);
        console.log('Tray icon created successfully');

        const contextMenu = Menu.buildFromTemplate([
            {
                label: 'TaskMaster Pro',
                enabled: false
            },
            {
                type: 'separator'
            },
            {
                label: 'Göster',
                click: () => {
                    if (mainWindow) {
                        mainWindow.show();
                        mainWindow.focus();
                        mainWindow.moveTop(); // Bring to front
                    }
                }
            },
            {
                label: 'Gizle',
                click: () => {
                    mainWindow.hide();
                }
            },
            {
                type: 'separator'
            },
            {
                label: 'Her Zaman Üstte',
                type: 'checkbox',
                checked: isAlwaysOnTop,
                click: (menuItem) => {
                    isAlwaysOnTop = menuItem.checked;
                    mainWindow.setAlwaysOnTop(isAlwaysOnTop, isAlwaysOnTop ? 'floating' : 'normal');
                    mainWindow.webContents.send('always-on-top-changed', isAlwaysOnTop);

                    // Save to config
                    const config = getConfig();
                    config.alwaysOnTop = isAlwaysOnTop;
                    saveConfig(config);
                }
            },
            {
                label: 'Widget Modu',
                type: 'checkbox',
                checked: true,
                enabled: false,
                toolTip: 'Uygulama widget modunda çalışıyor'
            },
            {
                label: 'DevTools Aç / Kapat',
                click: () => {
                    toggleDevTools();
                }
            },
            {
                type: 'separator'
            },
            {
                label: 'Çıkış',
                click: () => {
                    app.isQuitting = true;
                    app.quit();
                }
            }
        ]);

        tray.setToolTip('TaskMaster Pro Widget');
        tray.setContextMenu(contextMenu);

        // Single click to show/hide (Windows style)
        tray.on('click', () => {
            if (mainWindow.isVisible()) {
                mainWindow.hide();
            } else {
                mainWindow.show();
                mainWindow.focus();
                mainWindow.moveTop(); // Bring to front
            }
        });

        // Double click to show/hide (alternative)
        tray.on('double-click', () => {
            if (mainWindow.isVisible()) {
                mainWindow.hide();
            } else {
                mainWindow.show();
                mainWindow.focus();
                mainWindow.moveTop(); // Bring to front
            }
        });
    } catch (error) {
        console.error('Error creating tray:', error);
    }
}

function buildWindowsFileClipboardBuffer(filePaths) {
    const offset = 20; // DROPFILES struct size
    const normalized = filePaths.map((filePath) => filePath.replace(/\//g, '\\'));
    const fileList = normalized.join('\0') + '\0\0';
    const fileListBuffer = Buffer.from(fileList, 'ucs2');
    const buffer = Buffer.alloc(offset + fileListBuffer.length);

    buffer.writeUInt32LE(offset, 0); // pFiles
    buffer.writeInt32LE(0, 4); // pt.x
    buffer.writeInt32LE(0, 8); // pt.y
    buffer.writeUInt32LE(0, 12); // fNC
    buffer.writeUInt32LE(1, 16); // fWide (Unicode)

    fileListBuffer.copy(buffer, offset);
    return buffer;
}

function setClipboardViaPowerShell(filePaths, action) {
    return new Promise((resolve, reject) => {
        const escaped = filePaths.map((p) => p.replace(/'/g, "''"));
        const fileArray = escaped.map((p) => `'${p}'`).join(',');
        const dropEffect = action === 'cut' ? 2 : 1;
        const script = `
Add-Type -AssemblyName System.Windows.Forms;
$files = New-Object System.Collections.Specialized.StringCollection;
@(${fileArray}) | ForEach-Object { [void]$files.Add($_) };
$data = New-Object System.Windows.Forms.DataObject;
$data.SetFileDropList($files);
$data.SetData('Preferred DropEffect', [byte[]](${dropEffect},0,0,0));
[System.Windows.Forms.Clipboard]::SetDataObject($data, $true);
`;
        const encoded = Buffer.from(script, 'utf16le').toString('base64');
        execFile(
            'powershell.exe',
            ['-NoProfile', '-STA', '-EncodedCommand', encoded],
            { windowsHide: true },
            (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(stderr || error.message));
                    return;
                }
                resolve({ stdout, stderr });
            }
        );
    });
}

function writeWindowsFileClipboard(filePaths, action) {
    clipboard.clear();
    const buffer = buildWindowsFileClipboardBuffer(filePaths);
    clipboard.writeBuffer('CF_HDROP', buffer);

    // Not: writeBuffer birden fazla formatta overwrite edebiliyor.
    // En azindan CF_HDROP'u set edip Windows'ta yapistirmayi aktif ediyoruz.
}

// IPC Handlers
ipcMain.on('minimize-window', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        // In widget mode, minimize means hide
        mainWindow.hide();
    }
});

ipcMain.on('close-window', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.hide();
    }
});

ipcMain.handle('open-casemap-window', () => {
    return createCaseMapWindow();
});

ipcMain.on('open-external', (event, url) => {
    const { shell } = require('electron');
    shell.openExternal(url);
});

ipcMain.handle('toggle-devtools', () => {
    return toggleDevTools();
});

// Performans modu: GPU hizlandirmasini kapat / ac (yeniden baslatma gerekir)
ipcMain.handle('get-low-power-mode', () => {
    const config = getConfig();
    return config.lowPowerMode === true;
});

ipcMain.handle('set-low-power-mode', (event, enabled) => {
    const config = getConfig();
    config.lowPowerMode = !!enabled;
    saveConfig(config);
    return { success: true, enabled: !!enabled };
});

ipcMain.handle('relaunch-app', () => {
    app.relaunch();
    app.exit(0);
});

// Google Login Popup aç
ipcMain.handle('open-google-login', (event, returnUrl) => {
    openGoogleLoginPopup(returnUrl);
    return true;
});

// ==================== BROWSER CACHE TEMIZLEME ====================

// Geçmişi (Cache + Cookies + Storage + History) tamamen temizle
ipcMain.handle('browser-clear-history', async () => {
    try {
        const browserSession = session.fromPartition('persist:browser');
        await browserSession.clearCache();
        await browserSession.clearStorageData({
            storages: [
                'cookies',
                'filesystem',
                'indexdb',
                'localstorage',
                'shadercache',
                'websql',
                'serviceworkers',
                'cachestorage'
            ]
        });
        await browserSession.clearAuthCache();
        if (typeof browserSession.clearHostResolverCache === 'function') {
            await browserSession.clearHostResolverCache();
        }
        // Aktif sekmelerdeki geçmişi de sıfırla
        browserViews.forEach((view) => {
            try {
                if (view.webContents && !view.webContents.isDestroyed()) {
                    view.webContents.clearHistory();
                }
            } catch (_) {}
        });
        console.log('[Browser] Geçmiş tamamen temizlendi');
        return { success: true };
    } catch (error) {
        console.error('[Browser] Geçmiş temizleme hatası:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('browser-clear-cache', async () => {
    try {
        const browserSession = session.fromPartition('persist:browser');
        await browserSession.clearCache();
        await browserSession.clearStorageData({
            storages: ['cachestorage', 'serviceworkers']
        });
        console.log('[Browser] Cache temizlendi');
        return { success: true };
    } catch (error) {
        console.error('[Browser] Cache temizleme hatası:', error);
        return { success: false, error: error.message };
    }
});

// Eski tek-sekme browser IPC handler'lari kaldirildi — sadece multi-tab sistemi kullaniliyor

// ==================== BROWSER TABS IPC HANDLERS ====================

// Yeni sekme oluştur
ipcMain.handle('browser-create-tab', (event, payload) => {
    const { tabId, url, bounds } = payload || {};
    if (!tabId || !mainWindow || mainWindow.isDestroyed()) return false;

    const browserSession = session.fromPartition('persist:browser');
    const newView = createBrowserTabView(tabId, browserSession);
    browserViews.set(tabId, newView);
    tabMetadata.set(tabId, {
        url: url || 'about:blank',
        title: '',
        favicon: null,
        discarded: false
    });
    tabLastActiveAt.set(tabId, Date.now());

    // Bounds ayarla
    if (bounds) {
        newView.setBounds({
            x: Math.max(0, Math.round(bounds.x)),
            y: Math.max(0, Math.round(bounds.y)),
            width: Math.max(1, Math.round(bounds.width)),
            height: Math.max(1, Math.round(bounds.height))
        });
    }

    // URL yükle
    if (url) {
        newView.webContents.loadURL(url);
    }

    enforceBrowserViewLimit();
    return true;
});

// Sekme kapat
ipcMain.handle('browser-close-tab', (event, tabId) => {
    const view = browserViews.get(tabId);
    if (view) {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.removeBrowserView(view);
        }
        view.webContents.destroy();
        browserViews.delete(tabId);
    }
    clearTabIdleTimer(tabId);
    tabMetadata.delete(tabId);
    tabLastActiveAt.delete(tabId);

    if (activeTabId === tabId) {
        activeTabId = null;
        browserTabsVisible = false;
    }

    return true;
});

// Sekme değiştir (aktif sekmeyi göster)
ipcMain.handle('browser-switch-tab', (event, payload) => {
    const { tabId, bounds } = payload || {};
    if (!tabId || !mainWindow || mainWindow.isDestroyed()) return false;

    let view = browserViews.get(tabId);
    if (!view) {
        const metadata = tabMetadata.get(tabId);
        if (!metadata) return false;
        const browserSession = session.fromPartition('persist:browser');
        view = createBrowserTabView(tabId, browserSession);
        browserViews.set(tabId, view);
        metadata.discarded = false;
        tabMetadata.set(tabId, metadata);
        if (metadata.url) {
            view.webContents.loadURL(metadata.url);
        }
    }

    // Önceki aktif view'ı kaldır
    if (activeTabId && activeTabId !== tabId) {
        const oldView = browserViews.get(activeTabId);
        if (oldView) {
            mainWindow.removeBrowserView(oldView);
            if (oldView.webContents && !oldView.webContents.isDestroyed()) {
                oldView.webContents.setAudioMuted(true);
            }
        }
        scheduleTabIdleDiscard(activeTabId);
    }

    // Yeni view'ı ekle
    mainWindow.setBrowserView(view);
    activeTabId = tabId;
    browserTabsVisible = true;
    tabLastActiveAt.set(tabId, Date.now());
    clearTabIdleTimer(tabId);

    if (bounds) {
        view.setBounds({
            x: Math.max(0, Math.round(bounds.x)),
            y: Math.max(0, Math.round(bounds.y)),
            width: Math.max(1, Math.round(bounds.width)),
            height: Math.max(1, Math.round(bounds.height))
        });
    }

    if (view.webContents && !view.webContents.isDestroyed()) {
        view.webContents.setAudioMuted(false);
    }
    view.webContents.focus();
    enforceBrowserViewLimit();
    return true;
});

// Sekme URL'sini güncelle
ipcMain.handle('browser-tab-navigate', (event, payload) => {
    const { tabId, url } = payload || {};
    if (!tabId || !url) return false;

    const view = browserViews.get(tabId);
    if (!view) return false;

    view.webContents.loadURL(url);
    return true;
});

// Tüm sekmeleri gizle
ipcMain.handle('browser-hide-all-tabs', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return false;

    // Tüm BrowserView'ları kaldır
    if (activeTabId) {
        const view = browserViews.get(activeTabId);
        if (view) {
            try {
                const currentBounds = typeof view.getBounds === 'function' ? view.getBounds() : null;
                view.setBounds({
                    x: -32000,
                    y: -32000,
                    width: Math.max(1, Math.round(currentBounds?.width || 800)),
                    height: Math.max(1, Math.round(currentBounds?.height || 600))
                });
                if (view.webContents && !view.webContents.isDestroyed()) {
                    view.webContents.setAudioMuted(false);
                }
            } catch (err) {
                console.error(`Tab ${activeTabId} hide error:`, err.message);
            }
        }
    }
    browserTabsVisible = false;
    return true;
});

// Aktif sekme bounds güncelle
ipcMain.handle('browser-update-tab-bounds', (event, bounds) => {
    if (!browserTabsVisible || !activeTabId || !bounds) return false;

    const view = browserViews.get(activeTabId);
    if (!view) return false;

    view.setBounds({
        x: Math.max(0, Math.round(bounds.x)),
        y: Math.max(0, Math.round(bounds.y)),
        width: Math.max(1, Math.round(bounds.width)),
        height: Math.max(1, Math.round(bounds.height))
    });
    return true;
});

// Aktif sekme geri git
ipcMain.handle('browser-tab-go-back', () => {
    if (!activeTabId) return false;
    const view = browserViews.get(activeTabId);
    if (!view) return false;
    if (view.webContents.canGoBack()) {
        view.webContents.goBack();
        return true;
    }
    return false;
});

// Aktif sekme ileri git
ipcMain.handle('browser-tab-go-forward', () => {
    if (!activeTabId) return false;
    const view = browserViews.get(activeTabId);
    if (!view) return false;
    if (view.webContents.canGoForward()) {
        view.webContents.goForward();
        return true;
    }
    return false;
});

// Aktif sekme yenile
ipcMain.handle('browser-tab-refresh', () => {
    if (!activeTabId) return false;
    const view = browserViews.get(activeTabId);
    if (!view) return false;
    view.webContents.reload();
    return true;
});

// Aktif sekme zoom in
ipcMain.handle('browser-tab-zoom-in', () => {
    if (!activeTabId) return 100;
    const view = browserViews.get(activeTabId);
    if (!view) return 100;
    const currentZoom = view.webContents.getZoomFactor();
    const newZoom = Math.min(3, currentZoom + 0.1);
    view.webContents.setZoomFactor(newZoom);
    return Math.round(newZoom * 100);
});

// Aktif sekme zoom out
ipcMain.handle('browser-tab-zoom-out', () => {
    if (!activeTabId) return 100;
    const view = browserViews.get(activeTabId);
    if (!view) return 100;
    const currentZoom = view.webContents.getZoomFactor();
    const newZoom = Math.max(0.25, currentZoom - 0.1);
    view.webContents.setZoomFactor(newZoom);
    return Math.round(newZoom * 100);
});

// Aktif sekme zoom reset
ipcMain.handle('browser-tab-zoom-reset', () => {
    if (!activeTabId) return 100;
    const view = browserViews.get(activeTabId);
    if (!view) return 100;
    view.webContents.setZoomFactor(1);
    return 100;
});

ipcMain.on('toggle-always-on-top', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        isAlwaysOnTop = !isAlwaysOnTop;
        mainWindow.setAlwaysOnTop(isAlwaysOnTop, isAlwaysOnTop ? 'floating' : 'normal');

        // Save to config
        const config = getConfig();
        config.alwaysOnTop = isAlwaysOnTop;
        saveConfig(config);

        // Update tray menu
        if (tray) {
            createTray();
        }
    }
});

// ==================== TERMINAL ====================

// ==================== REAL PTY TERMINAL (node-pty + xterm.js) ====================
let pty;
try {
    pty = require('node-pty');
    console.log('[PTY] node-pty loaded successfully');
} catch (err) {
    console.error('[PTY] Failed to load node-pty:', err.message);
    pty = null;
}
const ptyProcesses = new Map();

ipcMain.handle('pty-spawn', (event, id, cwd) => {
    if (!pty) {
        return { success: false, error: 'node-pty modülü yüklenemedi. Visual Studio Build Tools gerekli olabilir.' };
    }
    try {
        if (ptyProcesses.has(id)) {
            const existing = ptyProcesses.get(id);
            existing.pty.kill();
            ptyProcesses.delete(id);
        }

        const shell = process.platform === 'win32'
            ? (process.env.COMSPEC || 'powershell.exe')
            : (process.env.SHELL || '/bin/bash');

        const ptyProc = pty.spawn(shell, [], {
            name: 'xterm-256color',
            cols: 120,
            rows: 30,
            cwd: cwd || app.getPath('home'),
            env: { ...process.env, TERM: 'xterm-256color' }
        });

        ptyProcesses.set(id, { pty: ptyProc, cwd: cwd || app.getPath('home') });

        ptyProc.onData(data => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('pty-data', id, data);
            }
        });

        ptyProc.onExit(({ exitCode }) => {
            ptyProcesses.delete(id);
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('pty-exit', id, exitCode);
            }
        });

        return { success: true, pid: ptyProc.pid };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.on('pty-write', (event, id, data) => {
    const proc = ptyProcesses.get(id);
    if (proc) proc.pty.write(data);
});

ipcMain.on('pty-resize', (event, id, cols, rows) => {
    const proc = ptyProcesses.get(id);
    if (proc) {
        try { proc.pty.resize(cols, rows); } catch {}
    }
});

ipcMain.handle('pty-kill', (event, id) => {
    const proc = ptyProcesses.get(id);
    if (!proc) return { success: false };
    try {
        proc.pty.kill();
        ptyProcesses.delete(id);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('pty-get-home', () => {
    return app.getPath('home');
});

ipcMain.handle('pty-select-folder', async (event, currentPath) => {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog(mainWindow, {
        defaultPath: currentPath || app.getPath('home'),
        properties: ['openDirectory']
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
});

// ==================== AUTO-LAUNCH (STARTUP) ====================

ipcMain.handle('get-auto-launch', () => {
    const settings = app.getLoginItemSettings();
    return settings.openAtLogin;
});

ipcMain.handle('set-auto-launch', (event, enabled) => {
    try {
        app.setLoginItemSettings({
            openAtLogin: enabled,
            path: process.execPath,
            args: []
        });
        return { success: true, enabled };
    } catch (error) {
        console.error('Auto-launch error:', error);
        return { success: false, error: error.message };
    }
});

// ==================== FILE EXPLORER IPC HANDLERS ====================

// Masaüstü yolunu al
ipcMain.handle('get-desktop-path', () => {
    return app.getPath('desktop');
});

// Belgelerim yolunu al
ipcMain.handle('get-documents-path', () => {
    return app.getPath('documents');
});

// Bilgisayar (sürücüler) yolunu al - Windows için
ipcMain.handle('get-drives', async () => {
    if (process.platform === 'win32') {
        const drives = [];
        for (let i = 65; i <= 90; i++) {
            const driveLetter = String.fromCharCode(i) + ':\\';
            try {
                fs.accessSync(driveLetter);
                drives.push({
                    name: driveLetter,
                    path: driveLetter,
                    isDirectory: true
                });
            } catch (e) {
                // Drive doesn't exist
            }
        }
        return drives;
    }
    return [{ name: '/', path: '/', isDirectory: true }];
});

// Klasör içeriğini oku
ipcMain.handle('get-directory-contents', async (event, dirPath) => {
    try {
        const items = fs.readdirSync(dirPath, { withFileTypes: true });
        const contents = [];

        for (const item of items) {
            try {
                const fullPath = path.join(dirPath, item.name);
                const stats = fs.statSync(fullPath);

                contents.push({
                    name: item.name,
                    path: fullPath,
                    isDirectory: item.isDirectory(),
                    isFile: item.isFile(),
                    size: stats.size,
                    modified: stats.mtime,
                    extension: item.isFile() ? path.extname(item.name).toLowerCase() : null
                });
            } catch (err) {
                // Erişilemeyen dosyaları atla
                console.log('Skipping inaccessible file:', item.name);
            }
        }

        // Önce klasörler, sonra dosyalar (alfabetik)
        contents.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name, 'tr');
        });

        return { success: true, contents, path: dirPath };
    } catch (error) {
        console.error('Directory read error:', error);
        return { success: false, error: error.message };
    }
});

// Dosyayı varsayılan uygulama ile aç
ipcMain.handle('open-file', async (event, filePath) => {
    try {
        const { shell } = require('electron');
        await shell.openPath(filePath);
        return { success: true };
    } catch (error) {
        console.error('File open error:', error);
        return { success: false, error: error.message };
    }
});

// Klasör seçme dialog'u
ipcMain.handle('select-folder', async () => {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: 'Klasör Seçin'
    });

    if (result.canceled || result.filePaths.length === 0) {
        return { success: false, canceled: true };
    }

    return { success: true, path: result.filePaths[0] };
});

// Üst klasöre git
ipcMain.handle('get-parent-directory', (event, currentPath) => {
    const parentPath = path.dirname(currentPath);
    return parentPath;
});

// Dosya/klasör sil
ipcMain.handle('delete-file', async (event, filePath) => {
    try {
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
            fs.rmSync(filePath, { recursive: true, force: true });
        } else {
            fs.unlinkSync(filePath);
        }
        return { success: true };
    } catch (error) {
        console.error('Delete error:', error);
        return { success: false, error: error.message };
    }
});

// Dosya/klasör yeniden adlandır
ipcMain.handle('rename-file', async (event, oldPath, newName) => {
    try {
        const dir = path.dirname(oldPath);
        const newPath = path.join(dir, newName);

        // Aynı isimde dosya var mı kontrol et
        if (fs.existsSync(newPath)) {
            return { success: false, error: 'Bu isimde bir dosya zaten var' };
        }

        fs.renameSync(oldPath, newPath);
        return { success: true, newPath };
    } catch (error) {
        console.error('Rename error:', error);
        return { success: false, error: error.message };
    }
});

// Sistem panosuna dosya listesi yaz (OS Explorer paste icin)
ipcMain.handle('set-file-clipboard', async (event, filePaths, action) => {
    try {
        const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
        const normalized = paths.filter(Boolean);
        if (normalized.length === 0) {
            return { success: false, error: 'No file paths provided' };
        }
        const missing = normalized.filter((p) => !fs.existsSync(p));
        if (missing.length > 0) {
            return { success: false, error: `Missing paths: ${missing.join(', ')}` };
        }

        if (process.platform === 'win32') {
            console.log('[Clipboard] Setting file clipboard:', normalized);
            writeWindowsFileClipboard(normalized, action);
            const formats = clipboard.availableFormats();
            console.log('[Clipboard] Formats after write:', formats);

            if (!formats.includes('CF_HDROP')) {
                console.log('[Clipboard] Falling back to PowerShell clipboard set');
                await setClipboardViaPowerShell(normalized, action);
                return { success: true, formats: ['CF_HDROP'], fallback: true };
            }
            return { success: true, formats };
        } else {
            // Fallback: at least expose paths for non-Windows platforms
            clipboard.writeText(normalized.join('\n'));
        }

        return { success: true, formats: clipboard.availableFormats() };
    } catch (error) {
        console.error('Set clipboard error:', error);
        return { success: false, error: error.message };
    }
});

// Dosya/klasör kopyala
ipcMain.handle('copy-file', async (event, sourcePath, destDir) => {
    try {
        const fileName = path.basename(sourcePath);
        let destPath = path.join(destDir, fileName);

        // Aynı isimde dosya varsa yeni isim oluştur
        let counter = 1;
        while (fs.existsSync(destPath)) {
            const ext = path.extname(fileName);
            const baseName = path.basename(fileName, ext);
            destPath = path.join(destDir, `${baseName} (${counter})${ext}`);
            counter++;
        }

        const stats = fs.statSync(sourcePath);
        if (stats.isDirectory()) {
            // Klasör kopyalama (recursive)
            fs.cpSync(sourcePath, destPath, { recursive: true });
        } else {
            // Dosya kopyalama
            fs.copyFileSync(sourcePath, destPath);
        }

        return { success: true, destPath };
    } catch (error) {
        console.error('Copy error:', error);
        return { success: false, error: error.message };
    }
});

// Dosya/klasör taşı
ipcMain.handle('move-file', async (event, sourcePath, destDir) => {
    try {
        const fileName = path.basename(sourcePath);
        let destPath = path.join(destDir, fileName);

        // Aynı isimde dosya varsa yeni isim oluştur
        let counter = 1;
        while (fs.existsSync(destPath)) {
            const ext = path.extname(fileName);
            const baseName = path.basename(fileName, ext);
            destPath = path.join(destDir, `${baseName} (${counter})${ext}`);
            counter++;
        }

        fs.renameSync(sourcePath, destPath);
        return { success: true, destPath };
    } catch (error) {
        console.error('Move error:', error);
        return { success: false, error: error.message };
    }
});

// Native dosya sürükleme (programdan dışarıya)
ipcMain.on('ondragstart', (event, filePath) => {
    try {
        const fileName = path.basename(filePath);
        let icon;

        // Dosya için ikon oluştur
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
            // Klasör ikonu
            icon = nativeImage.createFromPath(path.join(__dirname, 'folder_icon.png'));
        } else {
            // Dosya ikonu
            icon = nativeImage.createFromPath(path.join(__dirname, 'file_icon.png'));
        }

        // Eğer ikon bulunamazsa varsayılan oluştur
        if (!icon || icon.isEmpty()) {
            // Basit 16x16 varsayılan ikon oluştur
            const defaultIconData = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAABpSURBVDiNY2AYBVQDjP///2dgYGD4z8DAwIAuCJNjZGT8D+NjMxjDGpCLkQ1gwOYCkmsYGBgYGEiu4f9/2P8MxNQwMjJgN4SRkRHZEIYBMmDUgFED0A1gYGBgeI9TA4gNPxg1YBgZAABNHy5e8l8q3AAAAABJRU5ErkJggg==', 'base64');
            icon = nativeImage.createFromBuffer(defaultIconData);
        }

        event.sender.startDrag({
            file: filePath,
            icon: icon
        });
    } catch (error) {
        console.error('Drag start error:', error);
    }
});

// Opacity IPC: degisken aynıysa veya kisa surede tekrar geliyorsa atla.
// transparan + frameless pencerede setOpacity her cagrida DWM compositing
// tetikler; spam edildiginde renderer yaniti gecikiyor (kasilma/cokme).
let lastOpacityApplied = null;
let opacityTimer = null;
ipcMain.on('set-opacity', (event, opacity) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const validOpacity = Math.max(0.1, Math.min(1, opacity / 100));
    if (lastOpacityApplied === validOpacity) return;
    if (opacityTimer) clearTimeout(opacityTimer);
    opacityTimer = setTimeout(() => {
        opacityTimer = null;
        if (!mainWindow || mainWindow.isDestroyed()) return;
        try {
            mainWindow.setOpacity(validOpacity);
            lastOpacityApplied = validOpacity;
        } catch (err) {
            console.warn('[setOpacity] hata:', err.message);
        }
    }, 16);
});

ipcMain.handle('get-window-bounds', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return null;
    return mainWindow.getBounds();
});

ipcMain.on('move-window-to', (event, position) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const x = Math.round(Number(position?.x));
    const y = Math.round(Number(position?.y));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    try {
        mainWindow.setPosition(x, y, false);
    } catch (err) {
        console.warn('[moveWindowTo] hata:', err.message);
    }
});

// Lock mode handler - controls resize, move, taskbar visibility
// Kilitli modda: boyutlandırılamaz, taşınamaz, görev çubuğunda görünmez, normal z-index
ipcMain.on('set-lock-mode', (event, locked) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        if (locked) {
            // Kilitli mod: boyutlandırma, taşıma kapalı, görev çubuğunda görünmez
            // Her zaman üstte DEĞİL - normal pencere gibi davranır
            mainWindow.setResizable(false);
            mainWindow.setMovable(true);
            mainWindow.setSkipTaskbar(false);
            mainWindow.setAlwaysOnTop(false); // Normal z-index
            isAlwaysOnTop = false;
        } else {
            // Kilitsiz mod: normal pencere davranışı
            mainWindow.setResizable(true);
            mainWindow.setMovable(true);
            mainWindow.setSkipTaskbar(false);
            mainWindow.setAlwaysOnTop(false);
            isAlwaysOnTop = false;
        }

        // Config'e kaydet
        const config = getConfig();
        config.isLocked = locked;
        config.alwaysOnTop = isAlwaysOnTop;
        saveConfig(config);

        // Tray menüsünü güncelle
        if (tray) {
            createTray();
        }
    }
});

// App lifecycle
app.whenReady().then(async () => {
    // Sadece browser partition'i icin User-Agent ve header override
    const browserSession = session.fromPartition('persist:browser');
    browserSession.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');

    // Başlangıçta eski cache'leri temizle (sorunlu oturumları önler)
    try {
        await browserSession.clearCache();
        await browserSession.clearStorageData({
            storages: ['cachestorage', 'serviceworkers']
        });
        console.log('[Browser] Başlangıç cache temizliği tamamlandı');
    } catch (err) {
        console.error('[Browser] Cache temizleme hatası:', err.message);
    }

    // Google Login icin izin ayarlari
    browserSession.setPermissionRequestHandler((webContents, permission, callback) => {
        callback(true);
    });

    browserSession.webRequest.onHeadersReceived({
        urls: ['http://*/*', 'https://*/*'],
        types: ['mainFrame', 'subFrame']
    }, (details, callback) => {
        const responseHeaders = { ...details.responseHeaders };
        delete responseHeaders['x-frame-options'];
        delete responseHeaders['X-Frame-Options'];
        callback({ responseHeaders });
    });

    // GIDEN istek basliklarini Chrome 131 ile birebir ayarla (Google bot tespiti).
    browserSession.webRequest.onBeforeSendHeaders((details, callback) => {
        const requestHeaders = { ...details.requestHeaders };

        // Electron izlerini sil
        delete requestHeaders['Electron'];
        delete requestHeaders['electron'];

        // User-Agent: Eger Electron string'i icerirse temizle
        if (requestHeaders['User-Agent'] && /Electron/i.test(requestHeaders['User-Agent'])) {
            requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
        }

        // Client Hints (sec-ch-ua) - Google ve Cloudflare bunu kontrol eder
        requestHeaders['sec-ch-ua'] = '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"';
        requestHeaders['sec-ch-ua-mobile'] = '?0';
        requestHeaders['sec-ch-ua-platform'] = '"Windows"';

        callback({ requestHeaders });
    });

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        } else {
            mainWindow.show();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    app.isQuitting = true;
    for (const [, proc] of ptyProcesses) {
        try { proc.pty.kill(); } catch {}
    }
    ptyProcesses.clear();
});

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
    });
}

