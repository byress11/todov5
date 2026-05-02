// ==================== YOUTUBE PLAYER MODULE ====================
// YouTube oynatici - BrowserView ile uygulama icinde

const STORAGE_KEY_PLAYLIST = 'ytPlaylist';
const STORAGE_KEY_BACKEND = 'youtubeBackend';
const STORAGE_KEY_INVIDIOUS_INSTANCE = 'invidiousInstance';
const STORAGE_KEY_PIPED_INSTANCE = 'pipedInstance';

let playlist = [];
let currentVideo = null;
let currentPlaylistIndex = -1;
let lastYoutubeTabClick = 0; // Double-click detection için

// Backend configuration
const BACKENDS = {
    youtube: {
        name: 'YouTube',
        watch: 'https://www.youtube.com/watch?v=',
        search: 'https://www.youtube.com/results?search_query=',
        home: 'https://www.youtube.com/'
    },
    'youtube-nocookie': {
        name: 'YouTube No-Cookie',
        watch: 'https://www.youtube-nocookie.com/embed/',
        search: 'https://www.youtube.com/results?search_query=',
        home: 'https://www.youtube-nocookie.com/'
    },
    invidious: {
        name: 'Invidious (Reklamsız)',
        watch: (instance) => `${instance}/watch?v=`,
        search: (instance) => `${instance}/search?q=`,
        home: (instance) => `${instance}/`
    },
    piped: {
        name: 'Piped (Reklamsız)',
        watch: (instance) => `${instance}/watch?v=`,
        search: (instance) => `${instance}/results?search_query=`,
        home: (instance) => `${instance}/`
    }
};

// Get current backend configuration
function getCurrentBackend() {
    const backend = localStorage.getItem(STORAGE_KEY_BACKEND) || 'youtube';
    const invidiousInstance = localStorage.getItem(STORAGE_KEY_INVIDIOUS_INSTANCE) || 'https://invidious.snopyta.org';
    const pipedInstance = localStorage.getItem(STORAGE_KEY_PIPED_INSTANCE) || 'https://piped.video';

    const config = BACKENDS[backend];
    if (!config) return BACKENDS.youtube;

    if (backend === 'invidious') {
        return {
            name: config.name,
            watch: config.watch(invidiousInstance),
            search: config.search(invidiousInstance),
            home: config.home(invidiousInstance)
        };
    } else if (backend === 'piped') {
        return {
            name: config.name,
            watch: config.watch(pipedInstance),
            search: config.search(pipedInstance),
            home: config.home(pipedInstance)
        };
    }

    return config;
}

// Playlist yönetimi
function loadPlaylist() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY_PLAYLIST);
        if (saved) {
            playlist = JSON.parse(saved);
        }
    } catch (e) {
        playlist = [];
    }
    updatePlaylistUI();
}

function savePlaylist() {
    localStorage.setItem(STORAGE_KEY_PLAYLIST, JSON.stringify(playlist));
}

// Video ID'sini URL'den çıkar
function extractVideoId(url) {
    if (!url) return null;
    url = url.trim();

    const patterns = [
        /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
        /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
        /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
        /(?:youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
        /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
        /^([a-zA-Z0-9_-]{11})$/
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
}

// API anahtari kullanilmadan sadece YouTube sayfasini acar

// Harici tarayıcıda aç
function openInBrowser(videoId) {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    
    if (window.electronAPI && window.electronAPI.openExternal) {
        window.electronAPI.openExternal(url);
    } else {
        window.open(url, '_blank');
    }
}

// Video oynat (BrowserView ile)
let browserViewActive = false;
let resizeObserver = null;
let currentVideoId = null;

function setPlayerStatus(message, isError = false) {
    const statusEl = document.getElementById('ytPlayerStatus');
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.classList.toggle('error', isError);
}

async function openYoutubeUrl(url, autoplay = false) {
    if (!window.electronAPI?.openYoutubeView) {
        setPlayerStatus('Electron API bulunamadi', true);
        return false;
    }
    const bounds = getPlayerBounds();
    if (!bounds || bounds.width < 10 || bounds.height < 10) {
        setPlayerStatus('Player boyutu gecersiz', true);
        return false;
    }
    await window.electronAPI.openYoutubeView({ url, autoplay, bounds });
    browserViewActive = true;
    ensureBoundsObserver();
    setPlayerStatus('Hazir', false);
    return true;
}

function openHomepage() {
    const backend = getCurrentBackend();
    return openYoutubeUrl(backend.home);
}

function openSearchQuery(query) {
    const backend = getCurrentBackend();
    const url = `${backend.search}${encodeURIComponent(query)}`;
    return openYoutubeUrl(url);
}

function getPlayerBounds() {
    const container = document.getElementById('ytPlayerContainer');
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    return {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
    };
}

function ensureBoundsObserver() {
    if (resizeObserver) return;
    const container = document.getElementById('ytPlayerContainer');
    if (!container) return;
    resizeObserver = new ResizeObserver(() => {
        if (!browserViewActive || !window.electronAPI?.updateYoutubeViewBounds) return;
        const bounds = getPlayerBounds();
        if (bounds) {
            window.electronAPI.updateYoutubeViewBounds(bounds);
        }
    });
    resizeObserver.observe(container);
    window.addEventListener('resize', () => {
        if (!browserViewActive || !window.electronAPI?.updateYoutubeViewBounds) return;
        const bounds = getPlayerBounds();
        if (bounds) {
            window.electronAPI.updateYoutubeViewBounds(bounds);
        }
    });
}

async function playVideo(videoId, autoplay = true) {
    const backend = getCurrentBackend();
    const placeholder = document.getElementById('ytVideoPlaceholder');
    const embeddedPlayer = document.getElementById('ytEmbeddedPlayer');
    const infoBar = document.getElementById('ytVideoInfoBar');

    if (placeholder) placeholder.style.display = 'none';
    if (embeddedPlayer) embeddedPlayer.style.display = 'block';
    if (infoBar) infoBar.style.display = 'flex';

    setPlayerStatus('Yukleniyor...', false);
    currentVideoId = videoId;

    const url = `${backend.watch}${encodeURIComponent(videoId)}`;
    await openYoutubeUrl(url, autoplay);

    // SponsorBlock otomatik olarak aktif et (ayarlar panelinden kontrol)
    const sponsorBlockEnabled = localStorage.getItem('sponsorBlockEnabled') !== 'false';
    if (sponsorBlockEnabled) {
        // 2 saniye bekle ki video yüklensin
        setTimeout(() => {
            if (window.electronAPI?.skipYoutubeSponsors && currentVideoId) {
                window.electronAPI.skipYoutubeSponsors(currentVideoId);
                console.log('SponsorBlock aktif:', currentVideoId);
            }
        }, 2000);
    }
}

// Videoyu gizle (tab değişiminde)
function hideVideo() {
    if (window.electronAPI?.hideYoutubeView) {
        window.electronAPI.hideYoutubeView();
    } else if (window.electronAPI?.closeYoutubeView) {
        // Fallback: hide yoksa close kullan
        window.electronAPI.closeYoutubeView();
        browserViewActive = false;
    }
}

// Videoyu göster (YouTube tab'ına dönüşte)
function showVideo() {
    if (browserViewActive && window.electronAPI?.showYoutubeView) {
        const bounds = getPlayerBounds();
        if (bounds) {
            window.electronAPI.showYoutubeView(bounds);
        }
    }
}

// Videoyu tamamen durdur ve kapat
function stopVideo() {
    if (window.electronAPI?.closeYoutubeView) {
        window.electronAPI.closeYoutubeView();
    }
    browserViewActive = false;
    currentVideoId = null;
}

// Video seç ve oynat
async function selectAndPlayVideo(videoId) {
    const title = document.getElementById('ytVideoTitle');
    const channel = document.getElementById('ytVideoChannel');
    const views = document.getElementById('ytVideoViews');

    // Loading göster
    if (title) title.textContent = 'Yükleniyor...';
    if (channel) channel.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    try {
        currentVideo = { id: videoId, title: `Video ${videoId}` };
        if (title) title.textContent = `Video ${videoId}`;
        if (channel) channel.innerHTML = `<i class="fas fa-user"></i> YouTube`;
        if (views) views.innerHTML = `<i class="fas fa-eye"></i> -`;

        playVideo(videoId, true);
    } catch (error) {
        console.error('Video seçme hatası:', error);
        if (title) title.textContent = 'Video yüklenemedi';
        if (channel) channel.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${error.message}`;
        playVideo(videoId, true);
    }
}

// Playlist'e ekle
function addToPlaylist(video) {
    if (!video || !video.id) return;

    // Zaten varsa ekleme
    if (playlist.some(item => item.id === video.id)) {
        alert('Bu video zaten listede');
        return;
    }

    playlist.push({
        id: video.id,
        title: video.title,
        channel: video.channel,
        thumbnail: video.thumbnail,
        duration: video.duration
    });

    savePlaylist();
    updatePlaylistUI();
}

// Playlist'ten kaldır
function removeFromPlaylist(videoId) {
    const index = playlist.findIndex(item => item.id === videoId);
    if (index > -1) {
        playlist.splice(index, 1);
        if (currentPlaylistIndex >= index && currentPlaylistIndex > 0) {
            currentPlaylistIndex--;
        }
        savePlaylist();
        updatePlaylistUI();
    }
}

// Playlist'ten oynat
function playFromPlaylist(videoId) {
    const index = playlist.findIndex(item => item.id === videoId);
    if (index > -1) {
        currentPlaylistIndex = index;
        const item = playlist[index];
        
        // Video bilgilerini güncelle
        currentVideo = item;
        const title = document.getElementById('ytVideoTitle');
        const channel = document.getElementById('ytVideoChannel');
        
        if (title) title.textContent = item.title;
        if (channel) channel.innerHTML = `<i class="fas fa-user"></i> ${item.channel}`;
        
        // Videoyu oynat
        playVideo(videoId, true);
        updatePlaylistUI();
    }
}

// Sonraki video
function playNext() {
    if (playlist.length === 0) return;
    
    currentPlaylistIndex = (currentPlaylistIndex + 1) % playlist.length;
    playFromPlaylist(playlist[currentPlaylistIndex].id);
}

// Önceki video
function playPrevious() {
    if (playlist.length === 0) return;
    
    currentPlaylistIndex = currentPlaylistIndex - 1;
    if (currentPlaylistIndex < 0) currentPlaylistIndex = playlist.length - 1;
    playFromPlaylist(playlist[currentPlaylistIndex].id);
}

// Playlist UI güncelle
function updatePlaylistUI() {
    const container = document.getElementById('ytPlaylistItems');
    const countEl = document.getElementById('ytPlaylistCount');

    if (countEl) {
        countEl.textContent = `${playlist.length} video`;
    }

    if (!container) return;

    if (playlist.length === 0) {
        container.innerHTML = `
            <div class="yt-empty-playlist">
                <i class="fas fa-music"></i>
                <p>Oynatma listesi boş</p>
            </div>
        `;
        return;
    }

    container.innerHTML = playlist.map((item, index) => `
        <div class="yt-playlist-item ${index === currentPlaylistIndex ? 'active' : ''}" data-video-id="${item.id}">
            <div class="yt-playlist-item-thumb" onclick="window.ytPlayFromPlaylist('${item.id}')">
                <img src="${item.thumbnail}" alt="${item.title}">
                <span class="yt-playlist-item-duration">${item.duration || ''}</span>
                <div class="yt-playlist-play-icon"><i class="fas fa-play"></i></div>
            </div>
            <div class="yt-playlist-item-info" onclick="window.ytPlayFromPlaylist('${item.id}')">
                <span class="yt-playlist-item-title">${item.title}</span>
                <span class="yt-playlist-item-channel">${item.channel}</span>
            </div>
            <button class="yt-playlist-remove" onclick="window.ytRemoveFromPlaylist('${item.id}')" title="Kaldır">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');
}

// Arama sonuçlarını göster
function showSearchResults(results) {
    const container = document.getElementById('ytSearchResults');
    const list = document.getElementById('ytResultsList');

    if (!container || !list) return;

    if (results.length === 0) {
        list.innerHTML = `
            <div class="yt-no-results">
                <i class="fas fa-search"></i>
                <p>Sonuç bulunamadı</p>
            </div>
        `;
    } else {
        list.innerHTML = results.map(item => `
            <div class="yt-result-item" onclick="window.ytSelectVideo('${item.id}')">
                <div class="yt-result-thumb">
                    <img src="${item.thumbnail}" alt="${item.title}">
                    <span class="yt-result-duration">${item.duration}</span>
                </div>
                <div class="yt-result-info">
                    <span class="yt-result-title">${item.title}</span>
                    <span class="yt-result-channel">${item.channel}</span>
                    <span class="yt-result-views">${item.viewCount} görüntülenme</span>
                </div>
            </div>
        `).join('');
    }

    container.style.display = 'block';
}

// Arama sonuçlarını gizle
function hideSearchResults() {
    const container = document.getElementById('ytSearchResults');
    if (container) container.style.display = 'none';
}

// UI Durumunu güncelle
// YouTube Player'ı başlat
export function initializeYouTubePlayer() {
    console.log('YouTube Player başlatılıyor...');

    // Playlist'i yükle
    loadPlaylist();

    // Tab degisince BrowserView'i gizle/goster
    document.querySelectorAll('.nav-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            if (tabName !== 'youtube') {
                // YouTube dışı sekmeye geçerken sadece gizle, durdurma
                hideVideo();
                lastYoutubeTabClick = 0; // Reset double-click timer
            } else {
                // YouTube sekmesi kontrolü
                const isYoutubeTabActive = btn.classList.contains('active');
                const now = Date.now();
                const timeSinceLastClick = now - lastYoutubeTabClick;

                if (isYoutubeTabActive && timeSinceLastClick < 500) {
                    // YouTube sekmesi zaten aktif ve 500ms içinde tekrar tıklandı
                    // DOUBLE-CLICK: Ana sayfayı yenile
                    console.log('YouTube tab double-clicked - refreshing homepage');
                    stopVideo(); // Mevcut videoyu durdur
                    openHomepage(); // Ana sayfayı aç
                    lastYoutubeTabClick = 0; // Reset
                } else if (isYoutubeTabActive) {
                    // YouTube sekmesi zaten aktif ama double-click değil
                    // SINGLE-CLICK: Hiçbir şey yapma, video devam etsin
                    console.log('YouTube tab already active - doing nothing');
                    lastYoutubeTabClick = now; // Zamanı güncelle
                } else {
                    // YouTube sekmesi aktif değil, sekme değişiyor
                    // Videoyu göster/devam ettir
                    if (browserViewActive && currentVideoId) {
                        // Zaten oynatılmakta olan video varsa sadece göster
                        showVideo();
                    } else if (currentVideoId) {
                        // Video ID var ama BrowserView kapalıysa yeniden başlat
                        playVideo(currentVideoId, false);
                    } else {
                        // Hiç video yoksa ana sayfayı aç
                        openHomepage();
                    }
                    lastYoutubeTabClick = now;
                }
            }
        });
    });

    // Arama işlevi
    const searchInput = document.getElementById('ytSearchInput');
    const searchBtn = document.getElementById('ytSearchBtn');

    async function performSearch() {
        const query = searchInput?.value.trim();
        if (!query) return;

        // Önce link mi kontrol et
        const videoId = extractVideoId(query);
        if (videoId) {
            hideSearchResults();
            await selectAndPlayVideo(videoId);
            if (searchInput) searchInput.value = '';
            return;
        }

        if (searchBtn) {
            searchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            searchBtn.disabled = true;
        }

        try {
            const title = document.getElementById('ytVideoTitle');
            const channel = document.getElementById('ytVideoChannel');
            const views = document.getElementById('ytVideoViews');
            if (title) title.textContent = `Arama: ${query}`;
            if (channel) channel.innerHTML = '<i class="fas fa-search"></i> YouTube Arama';
            if (views) views.innerHTML = '<i class="fas fa-eye"></i> -';
            await openSearchQuery(query);
            setPlayerStatus('Arama sonuclari gosteriliyor', false);
        } finally {
            if (searchBtn) {
                searchBtn.innerHTML = '<i class="fas fa-search"></i>';
                searchBtn.disabled = false;
            }
        }
    }

    if (searchBtn) {
        searchBtn.addEventListener('click', performSearch);
    }

    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') performSearch();
        });
    }

    // Player height resize (dikey)
    const playerContainer = document.getElementById('ytPlayerContainer');
    const resizeHandle = document.getElementById('ytResizeHandle');
    if (playerContainer && resizeHandle) {
        const savedHeight = localStorage.getItem('ytPlayerHeight');
        if (savedHeight) {
            playerContainer.style.height = `${savedHeight}px`;
        }

        let resizing = false;
        let startY = 0;
        let startHeight = 0;

        resizeHandle.addEventListener('mousedown', (e) => {
            resizing = true;
            startY = e.clientY;
            startHeight = playerContainer.offsetHeight;
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!resizing) return;
            const delta = e.clientY - startY;
            const nextHeight = Math.max(180, Math.min(600, startHeight + delta));
            playerContainer.style.height = `${nextHeight}px`;
            if (browserViewActive && window.electronAPI?.updateYoutubeViewBounds) {
                const bounds = getPlayerBounds();
                if (bounds) {
                    window.electronAPI.updateYoutubeViewBounds(bounds);
                }
            }
        });

        document.addEventListener('mouseup', () => {
            if (!resizing) return;
            resizing = false;
            localStorage.setItem('ytPlayerHeight', playerContainer.offsetHeight);
        });
    }

    // Yapıştır butonu
    const pasteBtn = document.getElementById('ytPasteBtn');
    if (pasteBtn) {
        pasteBtn.addEventListener('click', async () => {
            try {
                const text = await navigator.clipboard.readText();
                if (text && searchInput) {
                    searchInput.value = text.trim();
                    performSearch();
                }
            } catch (err) {
                alert('Pano erişimi reddedildi');
            }
        });
    }

    // Sonuçları kapat
    const closeResultsBtn = document.getElementById('ytCloseResults');
    if (closeResultsBtn) {
        closeResultsBtn.addEventListener('click', hideSearchResults);
    }

    // Mouse Wheel Scroll - YouTube sayfasında gezinme
    const playerContainerForScroll = document.getElementById('ytPlayerContainer');
    if (playerContainerForScroll) {
        // Scroll event'ini BrowserView'e ilet
        playerContainerForScroll.addEventListener('wheel', (e) => {
            if (!browserViewActive) return;

            // Scroll'u YouTube sayfasına ilet
            const scrollAmount = e.deltaY;
            if (window.electronAPI?.scrollYoutubePage) {
                window.electronAPI.scrollYoutubePage(scrollAmount);
            }
        }, { passive: true });

        // Container'a tıklandığında BrowserView'e focus ver
        playerContainerForScroll.addEventListener('click', () => {
            if (browserViewActive && window.electronAPI?.focusYoutubeView) {
                window.electronAPI.focusYoutubeView();
            }
        });

        // Mouse enter olduğunda da focus ver
        playerContainerForScroll.addEventListener('mouseenter', () => {
            if (browserViewActive && window.electronAPI?.focusYoutubeView) {
                window.electronAPI.focusYoutubeView();
            }
        });
    }

    // Zoom kontrolleri
    const zoomOutBtn = document.getElementById('ytZoomOut');
    const zoomInBtn = document.getElementById('ytZoomIn');
    if (zoomOutBtn) {
        zoomOutBtn.addEventListener('click', () => {
            if (window.electronAPI?.zoomYoutubeView) {
                window.electronAPI.zoomYoutubeView(-0.1);
            }
        });
    }
    if (zoomInBtn) {
        zoomInBtn.addEventListener('click', () => {
            if (window.electronAPI?.zoomYoutubeView) {
                window.electronAPI.zoomYoutubeView(0.1);
            }
        });
    }

    // Listeye ekle
    const addToPlaylistBtn = document.getElementById('ytAddToPlaylist');
    if (addToPlaylistBtn) {
        addToPlaylistBtn.addEventListener('click', () => {
            if (currentVideo) {
                addToPlaylist(currentVideo);
            } else {
                alert('Önce bir video seçin');
            }
        });
    }

    // Playlist temizle
    const clearPlaylistBtn = document.getElementById('ytClearPlaylist');
    if (clearPlaylistBtn) {
        clearPlaylistBtn.addEventListener('click', () => {
            if (confirm('Oynatma listesini temizlemek istediğinizden emin misiniz?')) {
                playlist = [];
                currentPlaylistIndex = -1;
                savePlaylist();
                updatePlaylistUI();
            }
        });
    }

    // Global fonksiyonlar
    window.ytSelectVideo = async (videoId) => {
        hideSearchResults();
        await selectAndPlayVideo(videoId);
    };

    window.ytPlayFromPlaylist = (videoId) => {
        playFromPlaylist(videoId);
    };

    window.ytRemoveFromPlaylist = (videoId) => {
        removeFromPlaylist(videoId);
    };

    // Ilk acilista YouTube sekmesi aktifse ana sayfayi ac
    const youtubeTabBtn = document.querySelector('.nav-btn[data-tab="youtube"]');
    if (youtubeTabBtn && youtubeTabBtn.classList.contains('active')) {
        openHomepage();
    }

    console.log('✅ YouTube Player initialized');
}

export default { initializeYouTubePlayer };
