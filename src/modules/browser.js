// ==================== BROWSER MODULE ====================
// Tarayici modulu - Coklu sekme destegi ile

const HOME_URL = 'https://www.google.com';

// Sekme yonetimi
let tabs = [];
let activeTabId = null;
let tabIdCounter = 0;
let resizeObserver = null;
let ipcListenersInitialized = false;

// ==================== YER İMLERİ ====================
const BOOKMARKS_STORAGE_KEY = 'taskmaster_browser_bookmarks_v1';
const BOOKMARKS_BAR_STATE_KEY = 'taskmaster_browser_bookmarks_visible_v1';
let bookmarks = [];
let bookmarksBarVisible = true;

function loadBookmarks() {
    try {
        const raw = localStorage.getItem(BOOKMARKS_STORAGE_KEY);
        bookmarks = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(bookmarks)) bookmarks = [];
    } catch {
        bookmarks = [];
    }
    try {
        const visState = localStorage.getItem(BOOKMARKS_BAR_STATE_KEY);
        bookmarksBarVisible = visState === null ? true : visState === '1';
    } catch {
        bookmarksBarVisible = true;
    }
}

function saveBookmarks() {
    try {
        localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(bookmarks));
    } catch (err) {
        console.error('Yer imleri kaydedilemedi:', err);
    }
}

function isBookmarked(url) {
    if (!url) return false;
    return bookmarks.some(b => b.url === url);
}

function addBookmark(url, title, favicon) {
    if (!url || isBookmarked(url)) return false;
    bookmarks.unshift({
        id: `bm_${Date.now()}`,
        url,
        title: title || getDomain(url),
        favicon: favicon || null,
        createdAt: Date.now()
    });
    saveBookmarks();
    renderBookmarks();
    updateBookmarkButton();
    return true;
}

function removeBookmark(url) {
    const before = bookmarks.length;
    bookmarks = bookmarks.filter(b => b.url !== url);
    if (bookmarks.length !== before) {
        saveBookmarks();
        renderBookmarks();
        updateBookmarkButton();
        return true;
    }
    return false;
}

function toggleBookmarkForActiveTab() {
    if (!activeTabId) {
        showToast('Önce bir sayfa açın.', 'error');
        return;
    }
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab) return;
    if (isBookmarked(tab.url)) {
        removeBookmark(tab.url);
        showToast('Yer imi kaldırıldı.', 'info');
    } else {
        addBookmark(tab.url, tab.title, tab.favicon);
        showToast('Yer imlerine eklendi.', 'success');
    }
}

function renderBookmarks() {
    const list = document.getElementById('browserBookmarksList');
    const empty = document.getElementById('browserBookmarksEmpty');
    const bar = document.getElementById('browserBookmarksBar');
    if (!list || !bar) return;

    bar.style.display = bookmarksBarVisible ? '' : 'none';

    list.querySelectorAll('.browser-bookmark-item').forEach(el => el.remove());

    if (!bookmarks.length) {
        if (empty) empty.style.display = '';
        return;
    }
    if (empty) empty.style.display = 'none';

    bookmarks.forEach(bm => {
        const item = document.createElement('div');
        item.className = 'browser-bookmark-item';
        item.title = `${bm.title}\n${bm.url}\n(Sağ tık: kaldır)`;
        item.innerHTML = `
            <span class="browser-bookmark-favicon">
                ${bm.favicon ? `<img src="${bm.favicon}" alt="">` : '<i class="fas fa-globe"></i>'}
            </span>
            <span class="browser-bookmark-title"></span>
            <span class="browser-bookmark-remove" title="Kaldır"><i class="fas fa-times"></i></span>
        `;
        item.querySelector('.browser-bookmark-title').textContent = bm.title || getDomain(bm.url);

        item.addEventListener('click', (e) => {
            if (e.target.closest('.browser-bookmark-remove')) return;
            if (!activeTabId) {
                createTab(bm.url);
            } else {
                navigateTo(bm.url);
            }
        });
        item.querySelector('.browser-bookmark-remove').addEventListener('click', (e) => {
            e.stopPropagation();
            removeBookmark(bm.url);
        });
        item.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            removeBookmark(bm.url);
        });

        list.appendChild(item);
    });
}

function updateBookmarkButton() {
    const btn = document.getElementById('browserBookmarkBtn');
    if (!btn) return;
    const tab = tabs.find(t => t.id === activeTabId);
    const active = tab && isBookmarked(tab.url);
    btn.classList.toggle('active', !!active);
    const icon = btn.querySelector('i');
    if (icon) {
        icon.className = active ? 'fas fa-star' : 'far fa-star';
    }
    btn.title = active ? 'Yer İminden Kaldır' : 'Yer İmlerine Ekle';
}

function toggleBookmarksBar() {
    bookmarksBarVisible = !bookmarksBarVisible;
    try {
        localStorage.setItem(BOOKMARKS_BAR_STATE_KEY, bookmarksBarVisible ? '1' : '0');
    } catch {}
    renderBookmarks();
}

// ==================== GEÇMİŞ TEMİZLEME ====================
async function clearBrowsingHistory() {
    const confirmed = window.confirm(
        'Tarayıcı geçmişi, çerezler, önbellek ve oturum bilgileri silinecek.\n\nDevam etmek istiyor musunuz?'
    );
    if (!confirmed) return;

    try {
        if (window.electronAPI?.browserClearHistory) {
            const result = await window.electronAPI.browserClearHistory();
            if (result && result.success) {
                showToast('Geçmiş başarıyla temizlendi.', 'success');
            } else {
                showToast('Geçmiş temizlenirken bir hata oluştu.', 'error');
            }
        }
    } catch (err) {
        console.error('Geçmiş temizleme hatası:', err);
        showToast('Geçmiş temizlenemedi.', 'error');
    }
}

function generateTabId() {
    return `tab_${++tabIdCounter}_${Date.now()}`;
}

function getBrowserBounds() {
    const container = document.getElementById('browserContainer');
    if (!container) return null;
    
    // Tarayıcı gizliyse bounds hesaplama (sıfır boyut hatasını önler)
    if (container.offsetWidth === 0 || container.offsetHeight === 0) {
        return null;
    }
    
    const rect = container.getBoundingClientRect();
    
    // 0x0 boyutlarını main processe gönderme
    if (rect.width === 0 || rect.height === 0) {
        return null;
    }
    
    return {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
    };
}

function ensureBoundsObserver() {
    if (resizeObserver) return;
    const container = document.getElementById('browserContainer');
    if (!container) return;

    resizeObserver = new ResizeObserver(() => {
        if (!activeTabId || !window.electronAPI?.updateBrowserTabBounds) return;
        const bounds = getBrowserBounds();
        if (bounds) {
            window.electronAPI.updateBrowserTabBounds(bounds);
        }
    });
    resizeObserver.observe(container);

    window.addEventListener('resize', () => {
        if (!activeTabId || !window.electronAPI?.updateBrowserTabBounds) return;
        const bounds = getBrowserBounds();
        if (bounds) {
            window.electronAPI.updateBrowserTabBounds(bounds);
        }
    });
}

// URL formatini duzelt
function formatUrl(input) {
    if (!input) return HOME_URL;
    input = input.trim();

    if (input.startsWith('http://') || input.startsWith('https://')) {
        return input;
    }

    if (input.startsWith('localhost') || /^\d+\.\d+\.\d+\.\d+/.test(input)) {
        return 'http://' + input;
    }

    if (input.includes('.') && !input.includes(' ')) {
        return 'https://' + input;
    }

    return `https://www.google.com/search?q=${encodeURIComponent(input)}`;
}

// URL'den domain cikart
function getDomain(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname.replace('www.', '');
    } catch {
        return url;
    }
}

// Sekme HTML'i olustur
function createTabElement(tab) {
    const tabEl = document.createElement('div');
    tabEl.className = `browser-tab${tab.id === activeTabId ? ' active' : ''}`;
    tabEl.dataset.tabId = tab.id;

    tabEl.innerHTML = `
        <span class="browser-tab-favicon">
            ${tab.favicon ? `<img src="${tab.favicon}" alt="">` : '<i class="fas fa-globe"></i>'}
        </span>
        <span class="browser-tab-title">${tab.title || getDomain(tab.url)}</span>
        <span class="browser-tab-close" title="Sekmeyi Kapat">
            <i class="fas fa-times"></i>
        </span>
    `;

    // Sekmeye tikla
    tabEl.addEventListener('click', (e) => {
        if (!e.target.closest('.browser-tab-close')) {
            switchToTab(tab.id);
        }
    });

    // Kapat butonuna tikla
    tabEl.querySelector('.browser-tab-close').addEventListener('click', (e) => {
        e.stopPropagation();
        closeTab(tab.id);
    });

    return tabEl;
}

// Sekme listesini guncelle
function renderTabs() {
    const tabsList = document.getElementById('browserTabsList');
    if (!tabsList) return;

    tabsList.innerHTML = '';
    tabs.forEach(tab => {
        tabsList.appendChild(createTabElement(tab));
    });
}

// Yeni sekme olustur
async function createTab(url = HOME_URL) {
    const tabId = generateTabId();
    const formattedUrl = formatUrl(url);
    const bounds = getBrowserBounds();

    const tab = {
        id: tabId,
        url: formattedUrl,
        title: getDomain(formattedUrl),
        favicon: null
    };

    tabs.push(tab);

    // Placeholder'i gizle
    const placeholder = document.getElementById('browserPlaceholder');
    if (placeholder) placeholder.style.display = 'none';

    try {
        await window.electronAPI.createBrowserTab({
            tabId,
            url: formattedUrl,
            bounds
        });

        activeTabId = tabId;
        await window.electronAPI.switchBrowserTab({ tabId, bounds });
        ensureBoundsObserver();

        // URL bar'i guncelle
        updateUrlBar(formattedUrl);
        renderTabs();

        return tabId;
    } catch (err) {
        console.error('Sekme olusturma hatasi:', err);
        tabs = tabs.filter(t => t.id !== tabId);
        return null;
    }
}

// Sekmeye gec
async function switchToTab(tabId) {
    if (tabId === activeTabId) return;

    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;

    const bounds = getBrowserBounds();
    activeTabId = tabId;

    await window.electronAPI.switchBrowserTab({ tabId, bounds });
    updateUrlBar(tab.url);
    updateBookmarkButton();

    // Aktif sekme stilini guncelle
    document.querySelectorAll('.browser-tab').forEach(el => {
        el.classList.toggle('active', el.dataset.tabId === tabId);
    });
}

// Sekme kapat
async function closeTab(tabId) {
    const tabIndex = tabs.findIndex(t => t.id === tabId);
    if (tabIndex === -1) return;

    await window.electronAPI.closeBrowserTab(tabId);
    tabs.splice(tabIndex, 1);

    // Eger aktif sekme kapatildiysa
    if (tabId === activeTabId) {
        if (tabs.length > 0) {
            // Onceki veya sonraki sekmeye gec
            const newIndex = Math.min(tabIndex, tabs.length - 1);
            await switchToTab(tabs[newIndex].id);
        } else {
            activeTabId = null;
            updateUrlBar('');
            const placeholder = document.getElementById('browserPlaceholder');
            if (placeholder) placeholder.style.display = 'flex';
        }
    }

    renderTabs();
}

// URL bar'i guncelle
function updateUrlBar(url) {
    const urlInput = document.getElementById('browserUrlInput');
    if (urlInput) urlInput.value = url || '';

    // Guvenlik ikonu guncelle
    const secureIcon = document.querySelector('.browser-secure-icon');
    if (secureIcon && url) {
        if (url.startsWith('https://')) {
            secureIcon.className = 'fas fa-lock browser-secure-icon';
            secureIcon.style.color = '#10b981';
        } else {
            secureIcon.className = 'fas fa-unlock browser-secure-icon';
            secureIcon.style.color = '#f59e0b';
        }
    }
}

// Aktif sekmede URL'ye git
async function navigateTo(input) {
    if (!activeTabId) {
        // Sekme yoksa yeni sekme olustur
        return createTab(input);
    }

    const url = formatUrl(input);
    const tab = tabs.find(t => t.id === activeTabId);
    if (tab) {
        tab.url = url;
        tab.title = getDomain(url);
    }

    await window.electronAPI.navigateBrowserTab({ tabId: activeTabId, url });
    updateUrlBar(url);
    renderTabs();
}

// Navigasyon fonksiyonlari
function goHome() {
    if (!activeTabId) {
        return createTab(HOME_URL);
    }
    return navigateTo(HOME_URL);
}

function goBack() {
    if (window.electronAPI?.browserTabGoBack) {
        window.electronAPI.browserTabGoBack();
    }
}

function goForward() {
    if (window.electronAPI?.browserTabGoForward) {
        window.electronAPI.browserTabGoForward();
    }
}

function refresh() {
    if (window.electronAPI?.browserTabRefresh) {
        window.electronAPI.browserTabRefresh();
    }
}

// Zoom fonksiyonlari
async function zoomIn() {
    if (window.electronAPI?.browserTabZoomIn) {
        const newZoom = await window.electronAPI.browserTabZoomIn();
        updateZoomDisplay(newZoom);
    }
}

async function zoomOut() {
    if (window.electronAPI?.browserTabZoomOut) {
        const newZoom = await window.electronAPI.browserTabZoomOut();
        updateZoomDisplay(newZoom);
    }
}

async function zoomReset() {
    if (window.electronAPI?.browserTabZoomReset) {
        const newZoom = await window.electronAPI.browserTabZoomReset();
        updateZoomDisplay(newZoom);
    }
}

function updateZoomDisplay(zoomPercent) {
    const zoomLevel = document.getElementById('browserZoomLevel');
    if (zoomLevel) {
        zoomLevel.textContent = zoomPercent + '%';
    }
}

// Tarayiciyi gizle
function hideBrowser() {
    if (window.electronAPI?.hideAllBrowserTabs) {
        window.electronAPI.hideAllBrowserTabs();
    }
    // Eski single-tab API'si artik kullanilmiyor; cagrildiysa sessizce yut.
}

// Tarayiciyi goster
function showBrowser() {
    if (activeTabId && window.electronAPI?.switchBrowserTab) {
        const bounds = getBrowserBounds();
        if (bounds) {
            window.electronAPI.switchBrowserTab({ tabId: activeTabId, bounds });
        }
    }
}

function isBrowserTabSelected() {
    const activeNavBtn = document.querySelector('.nav-btn.active');
    return activeNavBtn?.dataset.tab === 'browser';
}

// Tab URL degistiginde
function onTabUrlChanged(tabId, url) {
    const tab = tabs.find(t => t.id === tabId);
    if (tab) {
        tab.url = url;
        if (tabId === activeTabId) {
            updateUrlBar(url);
            updateBookmarkButton();
        }
    }
}

// Tab baslik degistiginde
function onTabTitleChanged(tabId, title) {
    const tab = tabs.find(t => t.id === tabId);
    if (tab) {
        tab.title = title || getDomain(tab.url);
        renderTabs();
        // Yer imindeki başlığı da güncelle
        const bm = bookmarks.find(b => b.url === tab.url);
        if (bm && bm.title !== tab.title) {
            bm.title = tab.title;
            saveBookmarks();
            renderBookmarks();
        }
    }
}

// Tab favicon degistiginde
function onTabFaviconChanged(tabId, favicon) {
    const tab = tabs.find(t => t.id === tabId);
    if (tab) {
        tab.favicon = favicon;
        renderTabs();
        const bm = bookmarks.find(b => b.url === tab.url);
        if (bm && bm.favicon !== favicon) {
            bm.favicon = favicon;
            saveBookmarks();
            renderBookmarks();
        }
    }
}

export function initializeBrowser() {
    console.log('Browser baslatiliyor...');
    loadBookmarks();
    renderBookmarks();
    updateBookmarkButton();

    // Browser tab'ina tiklandiginda
    const browserNavBtn = document.querySelector('.nav-btn[data-tab="browser"]');

    // Diger sekmelere tiklandiginda tarayiciyi gizle
    document.querySelectorAll('.nav-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            if (tabName !== 'browser') {
                hideBrowser();
            }
        });
    });

    // Browser sekmesine tiklandiginda
    if (browserNavBtn) {
        browserNavBtn.addEventListener('click', () => {
            if (tabs.length === 0) {
                createTab(HOME_URL);
            } else {
                showBrowser();
            }
        });

        // Cift tiklama - ana sayfaya don
        browserNavBtn.addEventListener('dblclick', () => {
            goHome();
        });
    }

    const activeNavBtn = document.querySelector('.nav-btn.active');
    if (!activeNavBtn || activeNavBtn.dataset.tab !== 'browser') {
        hideBrowser();
    }

    document.addEventListener('taskmaster:settings-opened', () => {
        hideBrowser();
    });

    document.addEventListener('taskmaster:settings-closed', () => {
        if (isBrowserTabSelected()) {
            showBrowser();
        }
    });

    // Yeni sekme butonu
    const newTabBtn = document.getElementById('browserNewTabBtn');
    if (newTabBtn) {
        newTabBtn.addEventListener('click', () => {
            createTab(HOME_URL);
        });
    }

    // URL bar event'leri
    const urlInput = document.getElementById('browserUrlInput');
    const goBtn = document.getElementById('browserGoBtn');
    const backBtn = document.getElementById('browserBackBtn');
    const forwardBtn = document.getElementById('browserForwardBtn');
    const refreshBtn = document.getElementById('browserRefreshBtn');
    const homeBtn = document.getElementById('browserHomeBtn');
    const zoomInBtn = document.getElementById('browserZoomInBtn');
    const zoomOutBtn = document.getElementById('browserZoomOutBtn');
    const zoomLevelSpan = document.getElementById('browserZoomLevel');

    // Go butonu
    if (goBtn) {
        goBtn.addEventListener('click', () => {
            const url = urlInput?.value.trim();
            if (url) navigateTo(url);
        });
    }

    // Enter ile git
    if (urlInput) {
        urlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const url = urlInput.value.trim();
                if (url) navigateTo(url);
            }
        });

        // Focus olunca tum metni sec
        urlInput.addEventListener('focus', () => {
            urlInput.select();
        });
    }

    // Navigasyon butonlari
    if (backBtn) backBtn.addEventListener('click', goBack);
    if (forwardBtn) forwardBtn.addEventListener('click', goForward);
    if (refreshBtn) refreshBtn.addEventListener('click', refresh);
    if (homeBtn) homeBtn.addEventListener('click', goHome);

    // Zoom butonlari
    if (zoomInBtn) zoomInBtn.addEventListener('click', zoomIn);
    if (zoomOutBtn) zoomOutBtn.addEventListener('click', zoomOut);

    // Yer imleri butonlari
    const bookmarkBtn = document.getElementById('browserBookmarkBtn');
    const bookmarksToggleBtn = document.getElementById('browserBookmarksToggleBtn');
    const clearHistoryBtn = document.getElementById('browserClearHistoryBtn');
    if (bookmarkBtn) bookmarkBtn.addEventListener('click', toggleBookmarkForActiveTab);
    if (bookmarksToggleBtn) bookmarksToggleBtn.addEventListener('click', toggleBookmarksBar);
    if (clearHistoryBtn) clearHistoryBtn.addEventListener('click', clearBrowsingHistory);
    if (zoomLevelSpan) {
        zoomLevelSpan.addEventListener('dblclick', zoomReset);
        zoomLevelSpan.style.cursor = 'pointer';
        zoomLevelSpan.title = 'Cift tikla: %100\'e sifirla';
    }

    // Tab degisikliklerini dinle (sadece bir kere kayit et)
    if (!ipcListenersInitialized) {
        if (window.electronAPI?.onBrowserTabUrlChanged) {
            window.electronAPI.onBrowserTabUrlChanged((event, data) => {
                onTabUrlChanged(data.tabId, data.url);
            });
        }

        if (window.electronAPI?.onBrowserTabTitleChanged) {
            window.electronAPI.onBrowserTabTitleChanged((event, data) => {
                onTabTitleChanged(data.tabId, data.title);
            });
        }

        if (window.electronAPI?.onBrowserTabFaviconChanged) {
            window.electronAPI.onBrowserTabFaviconChanged((event, data) => {
                onTabFaviconChanged(data.tabId, data.favicon);
            });
        }

        // Sayfa icindeki popup/yeni-pencere isteklerini yeni sekmede ac
        if (window.electronAPI?.onBrowserOpenNewTab) {
            window.electronAPI.onBrowserOpenNewTab((event, data) => {
                if (data && data.url) {
                    createTab(data.url);
                }
            });
        }

        // Bildirim listener'i
        if (window.electronAPI?.onShowNotification) {
            window.electronAPI.onShowNotification((event, data) => {
                showToast(data.message, data.type || 'info');
            });
        }
        
        ipcListenersInitialized = true;
    }

    // Ilk acilista browser sekmesi aktifse ana sayfayi ac
    if (browserNavBtn && browserNavBtn.classList.contains('active')) {
        console.log('Browser tab is active on startup - opening homepage');
        createTab(HOME_URL);
    }

    console.log('Browser initialized with multi-tab support');
}

// Toast bildirim goster
function showToast(message, type = 'info') {
    const existingToast = document.querySelector('.browser-toast');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.className = `browser-toast browser-toast-${type}`;
    toast.innerHTML = `
        <i class="fas ${type === 'info' ? 'fa-info-circle' : type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
        <span>${message}</span>
    `;

    Object.assign(toast.style, {
        position: 'fixed',
        bottom: '80px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: type === 'info' ? 'rgba(59, 130, 246, 0.95)' : type === 'success' ? 'rgba(16, 185, 129, 0.95)' : 'rgba(239, 68, 68, 0.95)',
        color: 'white',
        padding: '12px 20px',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        zIndex: '10000',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        animation: 'fadeIn 0.3s ease'
    });

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

export default { initializeBrowser };
