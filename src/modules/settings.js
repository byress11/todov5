// ==================== SETTINGS MODULE ====================

import AppState from './state.js';
import { playSound } from './sounds.js';

function clampNumber(value, min, max, fallback) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}

function readStorage(key, fallback = null) {
    try {
        const value = localStorage.getItem(key);
        return value === null ? fallback : value;
    } catch (error) {
        console.warn(`Settings module: could not read "${key}".`, error);
        return fallback;
    }
}

function writeStorage(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (error) {
        console.warn(`Settings module: could not save "${key}".`, error);
        return false;
    }
}

function hexToRgbParts(hex) {
    if (!hex || typeof hex !== 'string') return null;

    const clean = hex.trim().replace('#', '');
    const normalized = clean.length === 3
        ? clean.split('').map(char => char + char).join('')
        : clean;

    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;

    const r = Number.parseInt(normalized.substring(0, 2), 16);
    const g = Number.parseInt(normalized.substring(2, 4), 16);
    const b = Number.parseInt(normalized.substring(4, 6), 16);
    return `${r}, ${g}, ${b}`;
}

function normalizeHexColor(hex, fallback) {
    if (!hex || typeof hex !== 'string') return fallback;

    const clean = hex.trim().replace('#', '');
    const normalized = clean.length === 3
        ? clean.split('').map(char => char + char).join('')
        : clean;

    return /^[0-9a-fA-F]{6}$/.test(normalized)
        ? `#${normalized.toLowerCase()}`
        : fallback;
}

function darkenColorValue(hex, amount) {
    const clean = normalizeHexColor(hex, '#6366f1').replace('#', '');
    let r = Number.parseInt(clean.substring(0, 2), 16);
    let g = Number.parseInt(clean.substring(2, 4), 16);
    let b = Number.parseInt(clean.substring(4, 6), 16);

    r = Math.max(0, Math.floor(r * (1 - amount)));
    g = Math.max(0, Math.floor(g * (1 - amount)));
    b = Math.max(0, Math.floor(b * (1 - amount)));

    return '#' +
        r.toString(16).padStart(2, '0') +
        g.toString(16).padStart(2, '0') +
        b.toString(16).padStart(2, '0');
}

function applyCustomColorVars(primary, secondary, primaryDark = darkenColorValue(primary, 0.1)) {
    document.body.style.setProperty('--custom-primary', primary);
    document.body.style.setProperty('--custom-primary-dark', primaryDark);
    document.body.style.setProperty('--custom-secondary', secondary);

    const primaryRgb = hexToRgbParts(primary);
    const primaryDarkRgb = hexToRgbParts(primaryDark);
    const secondaryRgb = hexToRgbParts(secondary);

    if (primaryRgb) document.body.style.setProperty('--custom-primary-rgb', primaryRgb);
    if (primaryDarkRgb) document.body.style.setProperty('--custom-primary-dark-rgb', primaryDarkRgb);
    if (secondaryRgb) document.body.style.setProperty('--custom-secondary-rgb', secondaryRgb);
}

function updateThemeColorMeta() {
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (!themeColorMeta) return;

    const primary = getComputedStyle(document.body).getPropertyValue('--primary-color').trim();
    if (primary) {
        themeColorMeta.setAttribute('content', primary);
    }
}

// Surekli ateslenen olaylar (slider input) icin rAF throttle.
// Sadece her ekran karesinde bir kez calistirir, geri kalan cagrilari atar.
function rafThrottle(fn) {
    let scheduled = false;
    let lastArgs = null;
    return function (...args) {
        lastArgs = args;
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            try { fn.apply(null, lastArgs); } catch (e) { console.warn(e); }
        });
    };
}

async function callElectronApi(methodName, ...args) {
    if (!window.isElectron || !window.electronAPI || typeof window.electronAPI[methodName] !== 'function') {
        return { success: false, error: 'Electron API is not available.' };
    }

    try {
        const result = await window.electronAPI[methodName](...args);
        return result === undefined ? { success: true } : result;
    } catch (error) {
        console.warn(`Settings module: ${methodName} failed.`, error);
        return { success: false, error: error?.message || String(error) };
    }
}

export function initializeSettings() {
    const settingsPanel = document.getElementById('settingsPanel');
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsClose = document.getElementById('settingsClose');
    const opacitySlider = document.getElementById('opacitySlider');
    const opacityValue = document.getElementById('opacityValue');
    const textSizeSlider = document.getElementById('textSizeSlider');
    const textSizeValue = document.getElementById('textSizeValue');
    const boxPaddingSlider = document.getElementById('boxPaddingSlider');
    const boxPaddingValue = document.getElementById('boxPaddingValue');
    const container = document.getElementById('widgetContainer');
    const devToolsBtn = document.getElementById('devToolsBtn');
    const paletteButtons = Array.from(document.querySelectorAll('.palette-btn'));

    if (!settingsPanel || !settingsBtn || !settingsClose || !opacitySlider || !opacityValue || !container) {
        console.error('Settings module: required UI elements are missing.');
        return;
    }

    function setSettingsPanelOpen(open) {
        const wasOpen = settingsPanel.classList.contains('active');
        if (wasOpen === open) return;

        settingsPanel.classList.toggle('active', open);
        document.dispatchEvent(new CustomEvent(open
            ? 'taskmaster:settings-opened'
            : 'taskmaster:settings-closed'
        ));
    }

    const validPalettes = new Set(paletteButtons.map(btn => btn.dataset.palette).filter(Boolean));
    validPalettes.add('custom');
    validPalettes.add('indigo');

    function applyPalette(palette, persist = true) {
        const nextPalette = validPalettes.has(palette) ? palette : 'indigo';
        AppState.currentPalette = nextPalette;

        // Palet degisimi sirasinda transition'lari devre disi birak.
        // Onlarca elementin "transition: all" ile ayni anda animate olmasi
        // transparan+frameless pencerede DWM'i kilitliyor (kasilma/cokme).
        document.body.classList.add('palette-switching');

        document.body.setAttribute('data-palette', nextPalette);
        paletteButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.palette === nextPalette);
        });

        // Bir frame sonra transition'lari geri ac
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                document.body.classList.remove('palette-switching');
            });
        });

        if (persist || nextPalette !== palette) {
            writeStorage('palette', nextPalette);
        }

        updateThemeColorMeta();
    }

    // Apply saved settings
    applyPalette(AppState.currentPalette, false);
    AppState.currentOpacity = clampNumber(AppState.currentOpacity, 50, 100, 100);
    container.style.opacity = AppState.currentOpacity / 100;
    opacitySlider.value = AppState.currentOpacity;
    opacityValue.textContent = AppState.currentOpacity + '%';

    // Apply text size and box padding
    const savedTextSize = clampNumber(readStorage('textSize', '15'), 12, 18, 15);
    const savedBoxPadding = clampNumber(readStorage('boxPadding', '6'), 2, 10, 6);
    document.documentElement.style.setProperty('--todo-text-size', savedTextSize + 'px');
    document.documentElement.style.setProperty('--todo-box-padding', savedBoxPadding + 'px');
    if (textSizeSlider && textSizeValue) {
        textSizeSlider.value = savedTextSize;
        textSizeValue.textContent = savedTextSize + 'px';
    }
    if (boxPaddingSlider && boxPaddingValue) {
        boxPaddingSlider.value = savedBoxPadding;
        boxPaddingValue.textContent = savedBoxPadding + 'px';
    }

    // Toggle settings panel
    settingsBtn.addEventListener('click', () => {
        setSettingsPanelOpen(!settingsPanel.classList.contains('active'));
    });

    settingsClose.addEventListener('click', () => {
        setSettingsPanelOpen(false);
    });

    document.addEventListener('click', (e) => {
        if (!settingsPanel.contains(e.target) && !settingsBtn.contains(e.target)) {
            setSettingsPanelOpen(false);
        }
    });

    // ---- Opacity control ----
    // ONEMLI: mainWindow.setOpacity() + transparent + frameless kombinasyonu
    // Windows DWM'de native renderer/process crash'e yol aciyor. Bu yuzden
    // SURUKLERKEN window-level setOpacity ASLA cagrilmaz; sadece CSS opacity
    // uygulanir (zaten transparan pencere sayesinde masaustu gorulur).
    // Window opacity'i sadece slider BIRAKILDIGINDA (change) tek seferde set ederiz.
    let lastOpacitySent = AppState.currentOpacity;
    const applyOpacityThrottled = rafThrottle((value) => {
        container.style.opacity = value / 100;
        opacityValue.textContent = value + '%';
    });

    opacitySlider.addEventListener('input', (e) => {
        AppState.currentOpacity = clampNumber(e.target.value, 50, 100, 100);
        applyOpacityThrottled(AppState.currentOpacity);
    });
    opacitySlider.addEventListener('change', () => {
        writeStorage('opacity', String(AppState.currentOpacity));
        if (AppState.currentOpacity !== lastOpacitySent) {
            lastOpacitySent = AppState.currentOpacity;
            callElectronApi('setOpacity', AppState.currentOpacity);
        }
    });

    // ---- Text size control ----
    if (textSizeSlider && textSizeValue) {
        let pendingTextSize = savedTextSize;
        const applyTextSizeThrottled = rafThrottle((size) => {
            textSizeValue.textContent = size + 'px';
            document.documentElement.style.setProperty('--todo-text-size', size + 'px');
        });
        textSizeSlider.addEventListener('input', (e) => {
            pendingTextSize = clampNumber(e.target.value, 12, 18, 15);
            applyTextSizeThrottled(pendingTextSize);
        });
        textSizeSlider.addEventListener('change', () => {
            writeStorage('textSize', String(pendingTextSize));
        });
    }

    // ---- Box padding control ----
    if (boxPaddingSlider && boxPaddingValue) {
        let pendingPadding = savedBoxPadding;
        const applyPaddingThrottled = rafThrottle((padding) => {
            boxPaddingValue.textContent = padding + 'px';
            document.documentElement.style.setProperty('--todo-box-padding', padding + 'px');
        });
        boxPaddingSlider.addEventListener('input', (e) => {
            pendingPadding = clampNumber(e.target.value, 2, 10, 6);
            applyPaddingThrottled(pendingPadding);
        });
        boxPaddingSlider.addEventListener('change', () => {
            writeStorage('boxPadding', String(pendingPadding));
        });
    }

    // Color palette selection
    paletteButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            applyPalette(btn.dataset.palette);
        });
    });

    // Custom Color Picker
    const customColorPrimary = document.getElementById('customColorPrimary');
    const customColorSecondary = document.getElementById('customColorSecondary');
    const customColorPreview = document.getElementById('customColorPreview');
    const applyCustomColorBtn = document.getElementById('applyCustomColorBtn');

    const savedCustomPrimary = normalizeHexColor(readStorage('customColorPrimary'), '#6366f1');
    const savedCustomSecondary = normalizeHexColor(readStorage('customColorSecondary'), '#8b5cf6');
    const savedCustomPrimaryDark = normalizeHexColor(
        readStorage('customColorPrimaryDark'),
        darkenColorValue(savedCustomPrimary, 0.1)
    );
    applyCustomColorVars(savedCustomPrimary, savedCustomSecondary, savedCustomPrimaryDark);
    if (AppState.currentPalette === 'custom') {
        updateThemeColorMeta();
    }

    if (customColorPrimary && customColorSecondary && customColorPreview && applyCustomColorBtn) {
        customColorPrimary.value = savedCustomPrimary;
        customColorSecondary.value = savedCustomSecondary;

        function updateColorPreview() {
            const primary = customColorPrimary.value;
            const secondary = customColorSecondary.value;
            customColorPreview.style.background = `linear-gradient(135deg, ${primary}, ${secondary})`;
        }
        const updateColorPreviewThrottled = rafThrottle(updateColorPreview);

        customColorPrimary.addEventListener('input', updateColorPreviewThrottled);
        customColorSecondary.addEventListener('input', updateColorPreviewThrottled);
        updateColorPreview();

        applyCustomColorBtn.addEventListener('click', () => {
            const primary = normalizeHexColor(customColorPrimary.value, '#6366f1');
            const secondary = normalizeHexColor(customColorSecondary.value, '#8b5cf6');
            const primaryDark = darkenColorValue(primary, 0.1);

            writeStorage('customColorPrimary', primary);
            writeStorage('customColorSecondary', secondary);
            writeStorage('customColorPrimaryDark', primaryDark);

            applyCustomColorVars(primary, secondary, primaryDark);
            applyPalette('custom');

            if (AppState.soundEnabled) playSound('success');
            applyCustomColorBtn.innerHTML = '<i class="fas fa-check"></i> Uygulandı!';
            setTimeout(() => {
                applyCustomColorBtn.innerHTML = '<i class="fas fa-check"></i> Özel Rengi Uygula';
            }, 2000);
        });

        // Load custom palette
        if (AppState.currentPalette === 'custom') {
            const savedPrimary = normalizeHexColor(readStorage('customColorPrimary'), savedCustomPrimary);
            const savedSecondary = normalizeHexColor(readStorage('customColorSecondary'), savedCustomSecondary);
            const savedPrimaryDark = normalizeHexColor(readStorage('customColorPrimaryDark'), savedCustomPrimaryDark);

            if (savedPrimary && savedSecondary && savedPrimaryDark) {
                applyCustomColorVars(savedPrimary, savedSecondary, savedPrimaryDark);
                updateThemeColorMeta();
            }
        }
    }

    // Sound toggle
    const soundToggle = document.getElementById('soundEffects');
    if (soundToggle) {
        soundToggle.checked = AppState.soundEnabled;
        soundToggle.addEventListener('change', (e) => {
            AppState.soundEnabled = e.target.checked;
            writeStorage('soundEnabled', String(AppState.soundEnabled));
        });
    }

    // Animations toggle
    const animToggle = document.getElementById('animations');
    if (animToggle) {
        animToggle.checked = AppState.animationsEnabled;
        animToggle.addEventListener('change', (e) => {
            AppState.animationsEnabled = e.target.checked;
            writeStorage('animationsEnabled', String(AppState.animationsEnabled));
            if (!AppState.animationsEnabled) {
                document.body.classList.add('no-animations');
            } else {
                document.body.classList.remove('no-animations');
            }
        });
    }

    if (!AppState.animationsEnabled) {
        document.body.classList.add('no-animations');
    }

    // Auto-launch toggle (Electron only)
    const autoLaunchToggle = document.getElementById('autoLaunchToggle');
    const autoLaunchSection = document.getElementById('autoLaunchSection');

    if (autoLaunchToggle && window.isElectron && window.electronAPI?.getAutoLaunch) {
        callElectronApi('getAutoLaunch').then(enabled => {
            if (typeof enabled === 'boolean') {
                autoLaunchToggle.checked = enabled;
            }
        });

        autoLaunchToggle.addEventListener('change', async (e) => {
            const result = await callElectronApi('setAutoLaunch', e.target.checked);
            if (!result.success) {
                autoLaunchToggle.checked = !e.target.checked;
            } else if (AppState.soundEnabled) {
                playSound('success');
            }
        });
    } else if (autoLaunchSection) {
        autoLaunchSection.style.display = 'none';
    }

    // Performans modu (GPU hizlandirmasi) - Electron only
    const lowPowerToggle = document.getElementById('lowPowerModeToggle');
    const lowPowerSection = document.getElementById('lowPowerModeSection');

    if (lowPowerToggle && window.isElectron && window.electronAPI?.getLowPowerMode) {
        callElectronApi('getLowPowerMode').then(enabled => {
            if (typeof enabled === 'boolean') {
                lowPowerToggle.checked = enabled;
            }
        });

        lowPowerToggle.addEventListener('change', async (e) => {
            const wantsEnabled = e.target.checked;
            const message = wantsEnabled
                ? 'Performans modu açılacak. Etkili olması için uygulama yeniden başlatılmalıdır. Şimdi yeniden başlatılsın mı?'
                : 'Performans modu kapatılacak. Etkili olması için uygulama yeniden başlatılmalıdır. Şimdi yeniden başlatılsın mı?';
            const ok = confirm(message);
            if (!ok) {
                e.target.checked = !wantsEnabled;
                return;
            }
            const result = await callElectronApi('setLowPowerMode', wantsEnabled);
            if (result?.success) {
                if (window.electronAPI.relaunchApp) {
                    callElectronApi('relaunchApp');
                }
            } else {
                e.target.checked = !wantsEnabled;
            }
        });
    } else if (lowPowerSection) {
        lowPowerSection.style.display = 'none';
    }

    // Stats collapsible toggle
    const statsToggle = document.getElementById('settingsStatsToggle');
    const statsBody = document.getElementById('settingsStatsBody');
    if (statsToggle && statsBody) {
        statsToggle.addEventListener('click', () => {
            statsBody.classList.toggle('open');
            const chevron = statsToggle.querySelector('.settings-stats-chevron');
            if (chevron) {
                chevron.style.transform = statsBody.classList.contains('open') ? 'rotate(180deg)' : '';
            }
        });
    }

    // DevTools toggle (Electron only)
    if (devToolsBtn) {
        devToolsBtn.addEventListener('click', async () => {
            if (window.isElectron && window.electronAPI && window.electronAPI.toggleDevTools) {
                const result = await callElectronApi('toggleDevTools');
                if (result !== false && result?.success !== false && AppState.soundEnabled) playSound('success');
            } else {
                alert('DevTools yalnızca masaüstü uygulamasında kullanılabilir.');
            }
        });
    }
}
