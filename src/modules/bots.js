// ==================== BOTS MODULE ====================
// Botlar alanı - Serbest not tutma işlevselliği

const BOTS_STORAGE_KEY = 'taskmaster_bots_notes';
let saveTimeout = null;

/**
 * Botlar modülünü başlatır
 */
export function initializeBots() {
    const botsToggleBtn = document.getElementById('botsToggleBtn');
    const botsClearBtn = document.getElementById('botsClearBtn');
    const botsNotes = document.getElementById('botsNotes');
    const botsCharCount = document.getElementById('botsCharCount');
    const botsSaveStatus = document.getElementById('botsSaveStatus');
    const botsSection = document.getElementById('botsSection');

    if (!botsNotes) {
        console.log('Botlar alanı bulunamadı');
        return;
    }

    // Kaydedilmiş notları yükle
    loadBotsNotes();

    // Not alanı değişiklik dinleyicisi
    botsNotes.addEventListener('input', () => {
        updateCharCount();
        saveBotsNotesDebounced();
    });

    // Toggle butonu
    if (botsToggleBtn) {
        botsToggleBtn.addEventListener('click', () => {
            botsSection.classList.toggle('collapsed');
            saveBotsState();
        });
    }

    // Temizle butonu
    if (botsClearBtn) {
        botsClearBtn.addEventListener('click', () => {
            if (confirm('Tüm notları silmek istediğinize emin misiniz?')) {
                botsNotes.value = '';
                updateCharCount();
                saveBotsNotes();
            }
        });
    }

    // Kaydedilmiş durumu yükle
    loadBotsState();

    // Resize divider işlevselliği
    initializeResizeDivider();

    console.log('✅ Bots module initialized');
}

/**
 * Resize divider işlevselliğini başlatır
 */
function initializeResizeDivider() {
    const resizeDivider = document.getElementById('resizeDivider');
    const browserSection = document.querySelector('.browser-section');
    const botsSection = document.getElementById('botsSection');
    const mainLayout = document.querySelector('.browser-main-layout');

    if (!resizeDivider || !browserSection || !botsSection || !mainLayout) {
        console.log('Resize divider elemanları bulunamadı');
        return;
    }

    let isDragging = false;
    let startY = 0;
    let startBrowserHeight = 0;
    let startBotsHeight = 0;

    function onDividerMove(e) {
        if (!isDragging) return;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const deltaY = clientY - startY;
        const newBrowserHeight = Math.max(150, startBrowserHeight + deltaY);
        const newBotsHeight = Math.max(100, startBotsHeight - deltaY);

        browserSection.style.flex = 'none';
        browserSection.style.height = newBrowserHeight + 'px';
        botsSection.style.height = newBotsHeight + 'px';
    }

    function stopDragging() {
        if (isDragging) {
            isDragging = false;
            resizeDivider.classList.remove('dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            saveSectionSizes();
        }
        document.removeEventListener('mousemove', onDividerMove);
        document.removeEventListener('mouseup', stopDragging);
        document.removeEventListener('touchmove', onDividerMove);
        document.removeEventListener('touchend', stopDragging);
    }

    resizeDivider.addEventListener('mousedown', (e) => {
        isDragging = true;
        startY = e.clientY;
        startBrowserHeight = browserSection.offsetHeight;
        startBotsHeight = botsSection.offsetHeight;
        resizeDivider.classList.add('dragging');
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', onDividerMove);
        document.addEventListener('mouseup', stopDragging);
        e.preventDefault();
    });

    resizeDivider.addEventListener('touchstart', (e) => {
        isDragging = true;
        startY = e.touches[0].clientY;
        startBrowserHeight = browserSection.offsetHeight;
        startBotsHeight = botsSection.offsetHeight;
        resizeDivider.classList.add('dragging');
        document.addEventListener('touchmove', onDividerMove);
        document.addEventListener('touchend', stopDragging);
        e.preventDefault();
    });

    // Kaydedilmiş boyutları yükle
    loadSectionSizes();
}

/**
 * Bölüm boyutlarını kaydet
 */
function saveSectionSizes() {
    const browserSection = document.querySelector('.browser-section');
    const botsSection = document.getElementById('botsSection');

    if (browserSection && botsSection) {
        localStorage.setItem('taskmaster_browser_height', browserSection.offsetHeight);
        localStorage.setItem('taskmaster_bots_height', botsSection.offsetHeight);
    }
}

/**
 * Bölüm boyutlarını yükle
 */
function loadSectionSizes() {
    const browserSection = document.querySelector('.browser-section');
    const botsSection = document.getElementById('botsSection');

    const savedBrowserHeight = localStorage.getItem('taskmaster_browser_height');
    const savedBotsHeight = localStorage.getItem('taskmaster_bots_height');

    if (savedBrowserHeight && browserSection) {
        browserSection.style.flex = 'none';
        browserSection.style.height = savedBrowserHeight + 'px';
    }

    if (savedBotsHeight && botsSection) {
        botsSection.style.height = savedBotsHeight + 'px';
    }
}

/**
 * Notları localStorage'a kaydet
 */
function saveBotsNotes() {
    const botsNotes = document.getElementById('botsNotes');
    const botsSaveStatus = document.getElementById('botsSaveStatus');

    if (!botsNotes) return;

    // Kaydetme durumunu göster
    if (botsSaveStatus) {
        botsSaveStatus.classList.add('saving');
        botsSaveStatus.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Kaydediliyor...';
    }

    try {
        localStorage.setItem(BOTS_STORAGE_KEY, botsNotes.value);

        // Kaydetme tamamlandı durumunu göster
        setTimeout(() => {
            if (botsSaveStatus) {
                botsSaveStatus.classList.remove('saving');
                botsSaveStatus.innerHTML = '<i class="fas fa-check-circle"></i> Kaydedildi';
            }
        }, 300);
    } catch (error) {
        console.error('Notlar kaydedilemedi:', error);
        if (botsSaveStatus) {
            botsSaveStatus.classList.remove('saving');
            botsSaveStatus.innerHTML = '<i class="fas fa-exclamation-circle"></i> Hata!';
        }
    }
}

/**
 * Debounced kaydetme (performans için)
 */
function saveBotsNotesDebounced() {
    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }

    const botsSaveStatus = document.getElementById('botsSaveStatus');
    if (botsSaveStatus) {
        botsSaveStatus.classList.add('saving');
        botsSaveStatus.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ...';
    }

    saveTimeout = setTimeout(() => {
        saveBotsNotes();
    }, 500);
}

/**
 * Notları localStorage'dan yükle
 */
function loadBotsNotes() {
    const botsNotes = document.getElementById('botsNotes');

    if (!botsNotes) return;

    try {
        const savedNotes = localStorage.getItem(BOTS_STORAGE_KEY);
        if (savedNotes) {
            botsNotes.value = savedNotes;
            updateCharCount();
        }
    } catch (error) {
        console.error('Notlar yüklenemedi:', error);
    }
}

/**
 * Karakter sayısını güncelle
 */
function updateCharCount() {
    const botsNotes = document.getElementById('botsNotes');
    const botsCharCount = document.getElementById('botsCharCount');

    if (!botsNotes || !botsCharCount) return;

    const charCount = botsNotes.value.length;
    botsCharCount.textContent = `${charCount} karakter`;
}

/**
 * Bots alanı durumunu kaydet (açık/kapalı)
 */
function saveBotsState() {
    const botsSection = document.getElementById('botsSection');
    if (botsSection) {
        const isCollapsed = botsSection.classList.contains('collapsed');
        localStorage.setItem('taskmaster_bots_collapsed', isCollapsed ? 'true' : 'false');
    }
}

/**
 * Bots alanı durumunu yükle
 */
function loadBotsState() {
    const botsSection = document.getElementById('botsSection');
    if (botsSection) {
        const isCollapsed = localStorage.getItem('taskmaster_bots_collapsed') === 'true';
        if (isCollapsed) {
            botsSection.classList.add('collapsed');
        }
    }
}
