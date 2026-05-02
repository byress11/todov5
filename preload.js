const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
    'electronAPI',
    {
        minimizeWindow: () => ipcRenderer.send('minimize-window'),
        closeWindow: () => ipcRenderer.send('close-window'),
        toggleAlwaysOnTop: (state) => ipcRenderer.send('toggle-always-on-top', state),
        setOpacity: (opacity) => ipcRenderer.send('set-opacity', opacity),
        setLockMode: (locked) => ipcRenderer.send('set-lock-mode', locked),
        openExternal: (url) => ipcRenderer.send('open-external', url),
        openCaseMapWindow: () => ipcRenderer.invoke('open-casemap-window'),
        // Browser API'leri
        openBrowserView: (payload) => ipcRenderer.invoke('browser-view-open', payload),
        updateBrowserViewBounds: (bounds) => ipcRenderer.invoke('browser-view-update-bounds', bounds),
        hideBrowserView: () => ipcRenderer.invoke('browser-view-hide'),
        showBrowserView: (bounds) => ipcRenderer.invoke('browser-view-show', bounds),
        browserGoBack: () => ipcRenderer.invoke('browser-go-back'),
        browserGoForward: () => ipcRenderer.invoke('browser-go-forward'),
        browserRefresh: () => ipcRenderer.invoke('browser-refresh'),
        // Zoom API'leri
        browserZoomIn: () => ipcRenderer.invoke('browser-zoom-in'),
        browserZoomOut: () => ipcRenderer.invoke('browser-zoom-out'),
        browserZoomReset: () => ipcRenderer.invoke('browser-zoom-reset'),
        browserGetZoomLevel: () => ipcRenderer.invoke('browser-get-zoom-level'),
        onBrowserUrlChanged: (callback) => ipcRenderer.on('browser-url-changed', callback),
        onBrowserZoomChanged: (callback) => ipcRenderer.on('browser-zoom-changed', callback),
        // Browser Tab API'leri
        createBrowserTab: (payload) => ipcRenderer.invoke('browser-create-tab', payload),
        closeBrowserTab: (tabId) => ipcRenderer.invoke('browser-close-tab', tabId),
        switchBrowserTab: (payload) => ipcRenderer.invoke('browser-switch-tab', payload),
        navigateBrowserTab: (payload) => ipcRenderer.invoke('browser-tab-navigate', payload),
        hideAllBrowserTabs: () => ipcRenderer.invoke('browser-hide-all-tabs'),
        updateBrowserTabBounds: (bounds) => ipcRenderer.invoke('browser-update-tab-bounds', bounds),
        browserTabGoBack: () => ipcRenderer.invoke('browser-tab-go-back'),
        browserTabGoForward: () => ipcRenderer.invoke('browser-tab-go-forward'),
        browserTabRefresh: () => ipcRenderer.invoke('browser-tab-refresh'),
        browserTabZoomIn: () => ipcRenderer.invoke('browser-tab-zoom-in'),
        browserTabZoomOut: () => ipcRenderer.invoke('browser-tab-zoom-out'),
        browserTabZoomReset: () => ipcRenderer.invoke('browser-tab-zoom-reset'),
        onBrowserTabUrlChanged: (callback) => ipcRenderer.on('browser-tab-url-changed', callback),
        onBrowserTabTitleChanged: (callback) => ipcRenderer.on('browser-tab-title-changed', callback),
        onBrowserTabFaviconChanged: (callback) => ipcRenderer.on('browser-tab-favicon-changed', callback),
        toggleDevTools: () => ipcRenderer.invoke('toggle-devtools'),
        onAlwaysOnTopChanged: (callback) => ipcRenderer.on('always-on-top-changed', callback),
        onSaveWindowPosition: (callback) => ipcRenderer.on('save-window-position', callback),
        // File Explorer API'leri
        getDesktopPath: () => ipcRenderer.invoke('get-desktop-path'),
        getDocumentsPath: () => ipcRenderer.invoke('get-documents-path'),
        getDrives: () => ipcRenderer.invoke('get-drives'),
        getDirectoryContents: (path) => ipcRenderer.invoke('get-directory-contents', path),
        openFile: (path) => ipcRenderer.invoke('open-file', path),
        selectFolder: () => ipcRenderer.invoke('select-folder'),
        getParentDirectory: (path) => ipcRenderer.invoke('get-parent-directory', path),
        deleteFile: (path) => ipcRenderer.invoke('delete-file', path),
        renameFile: (oldPath, newName) => ipcRenderer.invoke('rename-file', oldPath, newName),
        copyFile: (sourcePath, destDir) => ipcRenderer.invoke('copy-file', sourcePath, destDir),
        moveFile: (sourcePath, destDir) => ipcRenderer.invoke('move-file', sourcePath, destDir),
        setFileClipboard: (filePaths, action) => ipcRenderer.invoke('set-file-clipboard', filePaths, action),
        startDrag: (filePath) => ipcRenderer.send('ondragstart', filePath),
        // Google Login API
        openGoogleLogin: (returnUrl) => ipcRenderer.invoke('open-google-login', returnUrl),
        onGoogleLoginSuccess: (callback) => ipcRenderer.on('google-login-success', callback),
        onGoogleLoginExternal: (callback) => ipcRenderer.on('google-login-external', callback),
        // Bildirim
        onShowNotification: (callback) => ipcRenderer.on('show-notification', callback),
        // Auto-launch (Windows başlangıç)
        getAutoLaunch: () => ipcRenderer.invoke('get-auto-launch'),
        setAutoLaunch: (enabled) => ipcRenderer.invoke('set-auto-launch', enabled),
        // Performans modu (GPU hizlandirmasi)
        getLowPowerMode: () => ipcRenderer.invoke('get-low-power-mode'),
        setLowPowerMode: (enabled) => ipcRenderer.invoke('set-low-power-mode', enabled),
        relaunchApp: () => ipcRenderer.invoke('relaunch-app'),
        // PTY Terminal (node-pty + xterm.js)
        ptySpawn: (id, cwd) => ipcRenderer.invoke('pty-spawn', id, cwd),
        ptyWrite: (id, data) => ipcRenderer.send('pty-write', id, data),
        ptyResize: (id, cols, rows) => ipcRenderer.send('pty-resize', id, cols, rows),
        ptyKill: (id) => ipcRenderer.invoke('pty-kill', id),
        ptyGetHome: () => ipcRenderer.invoke('pty-get-home'),
        ptySelectFolder: (currentPath) => ipcRenderer.invoke('pty-select-folder', currentPath),
        onPtyData: (callback) => ipcRenderer.on('pty-data', (_, id, data) => callback(id, data)),
        onPtyExit: (callback) => ipcRenderer.on('pty-exit', (_, id, code) => callback(id, code))
    }
);

// Make app aware it's running in Electron
contextBridge.exposeInMainWorld('isElectron', true);

// ==========================================
// ADVANCED GOOGLE LOGIN BYPASS (SPOOFING)
// ==========================================
try {
    // 1. Webdriver özelliğini sil (Bot tespitinin bir numaralı nedeni)
    Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
    });

    // 2. Chrome runtime'ı mockla
    // Electron'da window.chrome.runtime eksik olabilir veya farklı çalışabilir
    if (!window.chrome) {
        window.chrome = {};
    }
    if (!window.chrome.runtime) {
        window.chrome.runtime = {
            id: 'mock-runtime-id',
            getManifest: () => ({ name: 'Chrome', version: '131.0.0.0' }),
            connect: () => { },
            sendMessage: () => { }
        };
    }

    // 3. Plugins array'ini taklit et (Chrome varsayılanları)
    const mockPlugins = [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjmm', description: '' },
        { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' }
    ];

    // Plugins ve MimeTypes için proxy kullan (daha güvenli spoofing)
    // Ancak basitlik için getter override yapıyoruz
    Object.defineProperty(navigator, 'plugins', {
        get: () => {
            const plugins = [...mockPlugins];
            plugins.item = (i) => plugins[i];
            plugins.namedItem = (name) => plugins.find(p => p.name === name);
            plugins.refresh = () => { };
            return plugins;
        }
    });

    // 4. Languages (Tutarlılık önemli)
    Object.defineProperty(navigator, 'languages', {
        get: () => ['tr-TR', 'tr', 'en-US', 'en']
    });

    // 5. İzinleri (Permissions) yönet
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
            Promise.resolve({ state: Notification.permission }) :
            originalQuery(parameters)
    );

    console.log('[Preload] Google Login Bypass injected successfully');

} catch (err) {
    console.error('[Preload] Bypass injection failed:', err);
}
