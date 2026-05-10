// ==========================================================================
// BROWSER VIEW PRELOAD
// BrowserView sekmelerinde calisir. Google/Gmail gibi siteler Electron'u
// tespit edip giris engelliyor; bu script o tespiti bypass eder.
// ==========================================================================

(function () {
    try {
        // --- 1) navigator.webdriver bayragini kaldir ---
        try {
            Object.defineProperty(navigator, 'webdriver', {
                configurable: true,
                get: () => undefined
            });
        } catch (_) { }

        // --- 2) Chrome runtime mock ---
        try {
            if (!window.chrome) window.chrome = {};
            if (!window.chrome.runtime) {
                window.chrome.runtime = {
                    id: undefined,
                    OnInstalledReason: { CHROME_UPDATE: 'chrome_update', INSTALL: 'install', SHARED_MODULE_UPDATE: 'shared_module_update', UPDATE: 'update' },
                    OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' },
                    PlatformArch: { ARM: 'arm', ARM64: 'arm64', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
                    PlatformOs: { ANDROID: 'android', CROS: 'cros', LINUX: 'linux', MAC: 'mac', OPENBSD: 'openbsd', WIN: 'win' },
                    RequestUpdateCheckStatus: { NO_UPDATE: 'no_update', THROTTLED: 'throttled', UPDATE_AVAILABLE: 'update_available' },
                    connect: function () { return { onMessage: { addListener: () => { } }, postMessage: () => { }, disconnect: () => { } }; },
                    sendMessage: function () { },
                    getManifest: function () { return { name: 'Chrome', version: '131.0.0.0' }; }
                };
            }
            if (!window.chrome.csi) window.chrome.csi = function () { return { startE: Date.now(), onloadT: Date.now(), pageT: 0, tran: 15 }; };
            if (!window.chrome.loadTimes) window.chrome.loadTimes = function () {
                return {
                    requestTime: Date.now() / 1000,
                    startLoadTime: Date.now() / 1000,
                    commitLoadTime: Date.now() / 1000,
                    finishDocumentLoadTime: Date.now() / 1000,
                    finishLoadTime: Date.now() / 1000,
                    firstPaintTime: Date.now() / 1000,
                    firstPaintAfterLoadTime: 0,
                    navigationType: 'Other',
                    wasFetchedViaSpdy: true,
                    wasNpnNegotiated: true,
                    npnNegotiatedProtocol: 'h2',
                    wasAlternateProtocolAvailable: false,
                    connectionInfo: 'h2'
                };
            };
            if (!window.chrome.app) window.chrome.app = { isInstalled: false, InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' }, RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' } };
        } catch (_) { }

        // --- 3) Plugins / mimeTypes mock (Chrome PDF Viewer) ---
        try {
            const mockPlugins = [
                { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
                { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
                { name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
                { name: 'Microsoft Edge PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
                { name: 'WebKit built-in PDF', filename: 'internal-pdf-viewer', description: 'Portable Document Format' }
            ];
            Object.defineProperty(navigator, 'plugins', {
                configurable: true,
                get: () => {
                    const arr = [...mockPlugins];
                    arr.item = (i) => arr[i] || null;
                    arr.namedItem = (n) => arr.find(p => p.name === n) || null;
                    arr.refresh = () => { };
                    return arr;
                }
            });
            Object.defineProperty(navigator, 'mimeTypes', {
                configurable: true,
                get: () => {
                    const arr = [
                        { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format', enabledPlugin: mockPlugins[0] }
                    ];
                    arr.item = (i) => arr[i] || null;
                    arr.namedItem = (n) => arr.find(m => m.type === n) || null;
                    return arr;
                }
            });
        } catch (_) { }

        // --- 4) Diller ---
        try {
            Object.defineProperty(navigator, 'languages', {
                configurable: true,
                get: () => ['tr-TR', 'tr', 'en-US', 'en']
            });
        } catch (_) { }

        // --- 5) Hardware concurrency / device memory mantikli degerler ---
        try {
            Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, get: () => 8 });
        } catch (_) { }
        try {
            Object.defineProperty(navigator, 'deviceMemory', { configurable: true, get: () => 8 });
        } catch (_) { }

        // --- 6) Permissions: Notifications icin tutarli cevap ---
        try {
            const originalQuery = window.navigator.permissions && window.navigator.permissions.query;
            if (originalQuery) {
                window.navigator.permissions.query = (parameters) => (
                    parameters && parameters.name === 'notifications'
                        ? Promise.resolve({ state: (typeof Notification !== 'undefined' ? Notification.permission : 'default') })
                        : originalQuery.call(window.navigator.permissions, parameters)
                );
            }
        } catch (_) { }

        // --- 7) WebGL Vendor / Renderer maskele (Electron yerine Intel/NVIDIA) ---
        try {
            const getParameter = WebGLRenderingContext.prototype.getParameter;
            WebGLRenderingContext.prototype.getParameter = function (parameter) {
                if (parameter === 37445) return 'Intel Inc.';
                if (parameter === 37446) return 'Intel Iris OpenGL Engine';
                return getParameter.call(this, parameter);
            };
            if (window.WebGL2RenderingContext) {
                const getParameter2 = WebGL2RenderingContext.prototype.getParameter;
                WebGL2RenderingContext.prototype.getParameter = function (parameter) {
                    if (parameter === 37445) return 'Intel Inc.';
                    if (parameter === 37446) return 'Intel Iris OpenGL Engine';
                    return getParameter2.call(this, parameter);
                };
            }
        } catch (_) { }

        // --- 8) navigator.userAgentData (Client Hints) ---
        try {
            if (!navigator.userAgentData) {
                Object.defineProperty(navigator, 'userAgentData', {
                    configurable: true,
                    get: () => ({
                        brands: [
                            { brand: 'Google Chrome', version: '131' },
                            { brand: 'Chromium', version: '131' },
                            { brand: 'Not_A Brand', version: '24' }
                        ],
                        mobile: false,
                        platform: 'Windows',
                        getHighEntropyValues: (hints) => Promise.resolve({
                            architecture: 'x86',
                            bitness: '64',
                            brands: [
                                { brand: 'Google Chrome', version: '131' },
                                { brand: 'Chromium', version: '131' },
                                { brand: 'Not_A Brand', version: '24' }
                            ],
                            fullVersionList: [
                                { brand: 'Google Chrome', version: '131.0.6778.86' },
                                { brand: 'Chromium', version: '131.0.6778.86' },
                                { brand: 'Not_A Brand', version: '24.0.0.0' }
                            ],
                            mobile: false,
                            model: '',
                            platform: 'Windows',
                            platformVersion: '15.0.0',
                            uaFullVersion: '131.0.6778.86',
                            wow64: false
                        }),
                        toJSON: () => ({ brands: [{ brand: 'Google Chrome', version: '131' }], mobile: false, platform: 'Windows' })
                    })
                });
            }
        } catch (_) { }

        // --- 9) Sayfa Gorunurlugu (Page Visibility) sahteleme ---
        // BrowserView pencereden kaldirilinca YouTube vb. videoyu durduruyordu;
        // sayfa daima 'visible' raporlar ve visibilitychange dinleyicileri engellenir.
        try {
            Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get: () => false });
            Object.defineProperty(Document.prototype, 'webkitHidden', { configurable: true, get: () => false });
            Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get: () => 'visible' });
            Object.defineProperty(Document.prototype, 'webkitVisibilityState', { configurable: true, get: () => 'visible' });

            const blocked = new Set(['visibilitychange', 'webkitvisibilitychange']);
            const origAdd = EventTarget.prototype.addEventListener;
            EventTarget.prototype.addEventListener = function (type, listener, options) {
                if (typeof type === 'string' && blocked.has(type.toLowerCase())) return;
                return origAdd.call(this, type, listener, options);
            };
        } catch (_) { }

        console.log('[BrowserView Preload] Bypass injected');
    } catch (err) {
        console.error('[BrowserView Preload] failed:', err);
    }
})();
