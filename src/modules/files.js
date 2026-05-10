// ==================== FILES MODULE ====================
// Dosya gezgini modülü

const FILES_SAVED_PATH_KEY = 'files_saved_path';
const FILES_SORT_KEY = 'files_sort_order';
const FILES_CUSTOM_SHORTCUT_KEY = 'files_custom_shortcut';
const FILES_CUSTOM_SHORTCUT_NAME_KEY = 'files_custom_shortcut_name';
const FILES_CUSTOM_SHORTCUT_KEY_2 = 'files_custom_shortcut_2';
const FILES_CUSTOM_SHORTCUT_NAME_KEY_2 = 'files_custom_shortcut_name_2';
const FILES_CUSTOM_SHORTCUT_KEY_3 = 'files_custom_shortcut_3';
const FILES_CUSTOM_SHORTCUT_NAME_KEY_3 = 'files_custom_shortcut_name_3';
const FILES_VIEW_MODE_KEY = 'files_view_mode';

let currentPath = '';
let currentContents = [];
let sortOrder = 'name-asc';
let searchQuery = '';
let selectedItem = null;
let viewMode = 'list'; // 'list' or 'grid'

// Pano (clipboard) durumu - kes/kopyala/yapıştır için
let clipboardItem = null;
let clipboardAction = null; // 'copy' veya 'cut'

async function syncSystemClipboard(filePath, action) {
    if (!window.electronAPI?.setFileClipboard) return;
    try {
        const result = await window.electronAPI.setFileClipboard(filePath, action);
        if (!result?.success) {
            console.warn('System clipboard update failed:', result?.error);
            showToast('Sistem panosu güncellenemedi');
            return;
        }
        if (result?.fallback) {
            return;
        }
        if (result?.formats && !result.formats.includes('CF_HDROP')) {
            console.warn('System clipboard missing CF_HDROP:', result.formats);
            showToast('Sistem panosu formatı eksik');
        }
    } catch (error) {
        console.warn('System clipboard update failed:', error);
        showToast('Sistem panosu güncellenemedi');
    }
}

// Dosya türüne göre ikon getir
function getFileIcon(item) {
    if (item.isDirectory) {
        return '<i class="fas fa-folder file-icon folder-icon"></i>';
    }

    const ext = item.extension;
    const iconMap = {
        '.jpg': 'fa-file-image', '.jpeg': 'fa-file-image', '.png': 'fa-file-image', '.gif': 'fa-file-image',
        '.bmp': 'fa-file-image', '.svg': 'fa-file-image', '.webp': 'fa-file-image', '.ico': 'fa-file-image',
        '.mp4': 'fa-file-video', '.avi': 'fa-file-video', '.mkv': 'fa-file-video', '.mov': 'fa-file-video',
        '.mp3': 'fa-file-audio', '.wav': 'fa-file-audio', '.flac': 'fa-file-audio', '.m4a': 'fa-file-audio',
        '.pdf': 'fa-file-pdf', '.doc': 'fa-file-word', '.docx': 'fa-file-word',
        '.xls': 'fa-file-excel', '.xlsx': 'fa-file-excel', '.ppt': 'fa-file-powerpoint', '.pptx': 'fa-file-powerpoint',
        '.txt': 'fa-file-lines', '.rtf': 'fa-file-lines',
        '.js': 'fa-file-code', '.ts': 'fa-file-code', '.html': 'fa-file-code', '.css': 'fa-file-code',
        '.json': 'fa-file-code', '.py': 'fa-file-code', '.java': 'fa-file-code',
        '.zip': 'fa-file-zipper', '.rar': 'fa-file-zipper', '.7z': 'fa-file-zipper',
        '.lnk': 'fa-arrow-up-right-from-square', '.url': 'fa-link',
        '.exe': 'fa-file-circle-play', '.msi': 'fa-file-circle-play', '.bat': 'fa-file-circle-play'
    };

    const iconClass = iconMap[ext] || 'fa-file';
    return `<i class="fas ${iconClass} file-icon"></i>`;
}

// Dosya boyutunu formatla
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Dosyaları sırala
function sortContents(contents, order) {
    const sorted = [...contents];

    sorted.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;

        switch (order) {
            case 'name-asc':
                return a.name.localeCompare(b.name, 'tr');
            case 'name-desc':
                return b.name.localeCompare(a.name, 'tr');
            case 'date-desc':
                return new Date(b.modified) - new Date(a.modified);
            case 'date-asc':
                return new Date(a.modified) - new Date(b.modified);
            default:
                return a.name.localeCompare(b.name, 'tr');
        }
    });

    return sorted;
}

// Dosyaları filtrele
function filterContents(contents, query) {
    if (!query) return contents;
    const lowerQuery = query.toLowerCase();
    return contents.filter(item => item.name.toLowerCase().includes(lowerQuery));
}

// Dosyaları render et
function renderContents() {
    const filesList = document.getElementById('filesList');
    if (!filesList) return;

    let contents = filterContents(currentContents, searchQuery);
    contents = sortContents(contents, sortOrder);

    if (contents.length === 0) {
        if (searchQuery) {
            filesList.innerHTML = '<div class="files-empty"><i class="fas fa-search"></i><span>Sonuç bulunamadı</span></div>';
        } else {
            filesList.innerHTML = '<div class="files-empty"><i class="fas fa-folder-open"></i><span>Bu klasör boş</span></div>';
        }
        return;
    }

    filesList.innerHTML = contents.map(item => `
        <div class="file-item ${item.isDirectory ? 'is-folder' : ''}" 
             data-path="${item.path}" 
             data-is-dir="${item.isDirectory}" 
             data-name="${item.name}" 
             tabindex="0"
             draggable="true">
            ${getFileIcon(item)}
            <span class="file-name" title="${item.name}">${item.name}</span>
            <span class="file-size">${item.isDirectory ? '' : formatFileSize(item.size)}</span>
            <div class="file-actions">
                <button class="file-action-btn rename-btn" title="Yeniden Adlandır"><i class="fas fa-pen"></i></button>
                <button class="file-action-btn delete-btn" title="Sil"><i class="fas fa-trash"></i></button>
            </div>
        </div>
    `).join('');

    // Event listener'ları ekle
    filesList.querySelectorAll('.file-item').forEach(item => {
        // Tek tıklama - seçim
        item.addEventListener('click', (e) => {
            if (e.target.closest('.file-action-btn')) return;
            handleItemSelect(item);
        });

        // Çift tıklama - aç
        item.addEventListener('dblclick', handleItemDoubleClick);

        // Yeniden adlandır butonu
        const renameBtn = item.querySelector('.rename-btn');
        if (renameBtn) {
            renameBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                handleRename(item.dataset.path, item.dataset.name);
            });
        }

        // Sil butonu
        const deleteBtn = item.querySelector('.delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                handleDelete(item.dataset.path, item.dataset.name, item.dataset.isDir === 'true');
            });
        }

        // Sürükleme başlangıcı - Native drag out
        item.addEventListener('dragstart', (e) => {
            e.dataTransfer.effectAllowed = 'copyMove';
            e.dataTransfer.setData('text/plain', item.dataset.path);
            e.dataTransfer.setData('application/x-file-path', item.dataset.path);
            item.classList.add('dragging');

            // Native file drag için Electron API'yi çağır
            if (window.electronAPI?.startDrag) {
                window.electronAPI.startDrag(item.dataset.path);
            }
        });

        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
        });

        // Sağ tık menüsü
        item.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleItemSelect(item);
            showContextMenu(e.clientX, e.clientY, item.dataset.path, item.dataset.name, item.dataset.isDir === 'true');
        });
    });
}

// Dosya/klasör seç
function handleItemSelect(item) {
    // Önceki seçimi kaldır
    const filesList = document.getElementById('filesList');
    filesList.querySelectorAll('.file-item.selected').forEach(el => {
        el.classList.remove('selected');
    });

    // Yeni seçimi uygula
    item.classList.add('selected');
    item.focus();
    selectedItem = {
        path: item.dataset.path,
        name: item.dataset.name,
        isDir: item.dataset.isDir === 'true'
    };
}

// Seçimi temizle
function clearSelection() {
    const filesList = document.getElementById('filesList');
    if (filesList) {
        filesList.querySelectorAll('.file-item.selected').forEach(el => {
            el.classList.remove('selected');
        });
    }
    selectedItem = null;
}

// Sağ tık menüsünü göster
function showContextMenu(x, y, filePath, fileName, isDir) {
    // Mevcut menüyü kaldır
    hideContextMenu();

    const menu = document.createElement('div');
    menu.className = 'files-context-menu';
    menu.innerHTML = `
        <div class="context-menu-item" data-action="copy">
            <i class="fas fa-copy"></i> Kopyala
        </div>
        <div class="context-menu-item" data-action="cut">
            <i class="fas fa-cut"></i> Kes
        </div>
        ${clipboardItem ? `
        <div class="context-menu-item" data-action="paste">
            <i class="fas fa-paste"></i> Yapıştır
        </div>
        ` : ''}
        <div class="context-menu-separator"></div>
        <div class="context-menu-item" data-action="rename">
            <i class="fas fa-pen"></i> Yeniden Adlandır
        </div>
        <div class="context-menu-item context-menu-danger" data-action="delete">
            <i class="fas fa-trash"></i> Sil
        </div>
        <div class="context-menu-separator"></div>
        <div class="context-menu-item" data-action="open-folder">
            <i class="fas fa-folder-open"></i> Konumu Aç
        </div>
    `;

    // Pozisyonu ayarla
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';

    document.body.appendChild(menu);

    // Ekran dışına taşmayı önle
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        menu.style.left = (x - rect.width) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
        menu.style.top = (y - rect.height) + 'px';
    }

    // Menü öğelerine tıklama olayları
    menu.querySelectorAll('.context-menu-item').forEach(item => {
        item.addEventListener('click', async () => {
            const action = item.dataset.action;
            hideContextMenu();

            switch (action) {
                case 'copy':
                    clipboardItem = { path: filePath, name: fileName, isDir };
                    clipboardAction = 'copy';
                    syncSystemClipboard(filePath, 'copy');
                    showToast('Kopyalandı: ' + fileName);
                    break;
                case 'cut':
                    clipboardItem = { path: filePath, name: fileName, isDir };
                    clipboardAction = 'cut';
                    syncSystemClipboard(filePath, 'cut');
                    showToast('Kesildi: ' + fileName);
                    break;
                case 'paste':
                    await pasteFromClipboard();
                    break;
                case 'rename':
                    await handleRename(filePath, fileName);
                    break;
                case 'delete':
                    await handleDelete(filePath, fileName, isDir);
                    break;
                case 'open-folder':
                    if (window.electronAPI?.openFile) {
                        const folderPath = isDir ? filePath : filePath.substring(0, filePath.lastIndexOf('\\'));
                        window.electronAPI.openFile(folderPath);
                    }
                    break;
            }
        });
    });

    // Dışarı tıklayınca menüyü kapat
    setTimeout(() => {
        document.addEventListener('click', hideContextMenu, { once: true });
    }, 10);
}

// Menüyü gizle
function hideContextMenu() {
    const menu = document.querySelector('.files-context-menu');
    if (menu) {
        menu.remove();
    }
}

// Panodan yapıştır
async function pasteFromClipboard() {
    if (!clipboardItem || !currentPath) return;

    try {
        let result;
        if (clipboardAction === 'copy') {
            result = await window.electronAPI.copyFile(clipboardItem.path, currentPath);
        } else if (clipboardAction === 'cut') {
            result = await window.electronAPI.moveFile(clipboardItem.path, currentPath);
            if (result.success) {
                clipboardItem = null;
                clipboardAction = null;
            }
        }

        if (result?.success) {
            showToast('Yapıştırıldı!');
            await loadDirectory(currentPath);
        } else {
            await showAlertModal('Hata', result?.error || 'Yapıştırma başarısız');
        }
    } catch (error) {
        await showAlertModal('Hata', error.message);
    }
}

// Toast mesajı göster
function showToast(message) {
    const existing = document.querySelector('.files-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'files-toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('show');
    }, 10);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// Klavye olayları (Delete ve Backspace)
function handleKeyboardEvents(e) {
    // Files sekmesi aktif mi kontrol et
    const filesTab = document.getElementById('filesTab');
    if (!filesTab || !filesTab.classList.contains('active')) {
        return; // Files sekmesi aktif değilse çık
    }

    // Input/textarea'da yazarken klavye kısayollarını devre dışı bırak
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
    }

    // Delete tuşu - seçili dosyayı sil
    if (e.key === 'Delete' && selectedItem) {
        e.preventDefault();
        handleDelete(selectedItem.path, selectedItem.name, selectedItem.isDir);
    }

    // Backspace tuşu - üst klasöre git
    if (e.key === 'Backspace') {
        e.preventDefault();
        goToParent();
    }
}

// Görünüm modunu değiştir
function setViewMode(mode) {
    viewMode = mode;
    localStorage.setItem(FILES_VIEW_MODE_KEY, mode);

    const filesList = document.getElementById('filesList');
    const listBtn = document.getElementById('filesViewList');
    const gridBtn = document.getElementById('filesViewGrid');

    if (mode === 'grid') {
        filesList?.classList.add('grid-view');
        listBtn?.classList.remove('active');
        gridBtn?.classList.add('active');
    } else {
        filesList?.classList.remove('grid-view');
        listBtn?.classList.add('active');
        gridBtn?.classList.remove('active');
    }
}

// Dosya/klasör sil
async function handleDelete(filePath, fileName, isDir) {
    const typeText = isDir ? 'klasörü' : 'dosyayı';
    const confirmed = await showConfirmModal(
        'Silme Onayı',
        `"${fileName}" ${typeText} silmek istediğinizden emin misiniz?`,
        true
    );

    if (!confirmed) {
        return;
    }

    try {
        const result = await window.electronAPI.deleteFile(filePath);
        if (result.success) {
            // Listeden kaldır
            currentContents = currentContents.filter(item => item.path !== filePath);
            renderContents();
        } else {
            await showAlertModal('Hata', 'Silme hatası: ' + result.error);
        }
    } catch (error) {
        await showAlertModal('Hata', 'Silme hatası: ' + error.message);
    }
}

// Dosya/klasör yeniden adlandır
async function handleRename(filePath, currentName) {
    const newName = await showRenameModal(currentName);
    if (!newName || newName === currentName) return;

    try {
        const result = await window.electronAPI.renameFile(filePath, newName);
        if (result.success) {
            // Klasörü yeniden yükle
            await loadDirectory(currentPath);
        } else {
            await showAlertModal('Hata', 'Yeniden adlandırma hatası: ' + result.error);
        }
    } catch (error) {
        await showAlertModal('Hata', 'Yeniden adlandırma hatası: ' + error.message);
    }
}

// Custom Modal Helpers

// Rename Modal
function showRenameModal(currentName) {
    return new Promise((resolve) => {
        const modal = document.getElementById('renameModal');
        const input = document.getElementById('renameInput');
        const confirmBtn = document.getElementById('renameConfirmBtn');
        const cancelBtn = document.getElementById('renameCancelBtn');
        const closeBtn = document.getElementById('renameModalClose');

        if (!modal || !input) {
            // Fallback: If modal doesn't exist, return null
            resolve(null);
            return;
        }

        input.value = currentName;
        modal.classList.add('active');

        // Focus input and select text
        setTimeout(() => {
            input.focus();
            input.select();
        }, 100);

        const cleanup = () => {
            modal.classList.remove('active');
            confirmBtn.removeEventListener('click', onConfirm);
            cancelBtn.removeEventListener('click', onCancel);
            closeBtn.removeEventListener('click', onCancel);
            input.removeEventListener('keydown', onKeydown);
        };

        const onConfirm = () => {
            const value = input.value.trim();
            cleanup();
            resolve(value || null);
        };

        const onCancel = () => {
            cleanup();
            resolve(null);
        };

        const onKeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                onConfirm();
            } else if (e.key === 'Escape') {
                onCancel();
            }
        };

        confirmBtn.addEventListener('click', onConfirm);
        cancelBtn.addEventListener('click', onCancel);
        closeBtn.addEventListener('click', onCancel);
        input.addEventListener('keydown', onKeydown);
    });
}

// Confirm Modal
function showConfirmModal(title, message, isDanger = false) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirmModal');
        const titleEl = document.getElementById('confirmModalTitle');
        const messageEl = document.getElementById('confirmModalMessage');
        const confirmBtn = document.getElementById('confirmConfirmBtn');
        const cancelBtn = document.getElementById('confirmCancelBtn');
        const header = modal?.querySelector('.confirm-modal-header');

        if (!modal) {
            // Fallback: use native confirm if modal doesn't exist
            resolve(confirm(message));
            return;
        }

        titleEl.textContent = title;
        messageEl.textContent = message;

        // Apply danger styling
        if (isDanger) {
            header?.classList.add('danger');
            confirmBtn?.classList.add('danger');
        } else {
            header?.classList.remove('danger');
            confirmBtn?.classList.remove('danger');
        }

        modal.classList.add('active');

        const cleanup = () => {
            modal.classList.remove('active');
            confirmBtn.removeEventListener('click', onConfirm);
            cancelBtn.removeEventListener('click', onCancel);
        };

        const onConfirm = () => {
            cleanup();
            resolve(true);
        };

        const onCancel = () => {
            cleanup();
            resolve(false);
        };

        confirmBtn.addEventListener('click', onConfirm);
        cancelBtn.addEventListener('click', onCancel);
    });
}

// Alert Modal
function showAlertModal(title, message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('alertModal');
        const titleEl = document.getElementById('alertModalTitle');
        const messageEl = document.getElementById('alertModalMessage');
        const okBtn = document.getElementById('alertOkBtn');

        if (!modal) {
            // Fallback: use native alert if modal doesn't exist
            alert(message);
            resolve();
            return;
        }

        titleEl.textContent = title;
        messageEl.textContent = message;
        modal.classList.add('active');

        const cleanup = () => {
            modal.classList.remove('active');
            okBtn.removeEventListener('click', onOk);
        };

        const onOk = () => {
            cleanup();
            resolve();
        };

        okBtn.addEventListener('click', onOk);
    });
}

// Klasör içeriğini yükle
async function loadDirectory(dirPath) {
    const filesList = document.getElementById('filesList');
    const pathDisplay = document.getElementById('filesCurrentPath');
    const searchInput = document.getElementById('filesSearchInput');

    if (!filesList || !window.electronAPI?.getDirectoryContents) return;

    // Aramayı temizle
    searchQuery = '';
    if (searchInput) searchInput.value = '';

    filesList.innerHTML = '<div class="files-loading"><i class="fas fa-spinner fa-spin"></i><span>Yükleniyor...</span></div>';

    try {
        const result = await window.electronAPI.getDirectoryContents(dirPath);

        if (!result.success) {
            filesList.innerHTML = `<div class="files-error"><i class="fas fa-exclamation-circle"></i><span>Klasör okunamadı</span></div>`;
            return;
        }

        currentPath = result.path;
        currentContents = result.contents;

        const displayPath = currentPath.length > 35 ? '...' + currentPath.slice(-32) : currentPath;
        if (pathDisplay) {
            pathDisplay.textContent = displayPath;
            pathDisplay.title = currentPath;
        }
        localStorage.setItem(FILES_SAVED_PATH_KEY, currentPath);

        renderContents();

    } catch (error) {
        console.error('Directory load error:', error);
        filesList.innerHTML = `<div class="files-error"><i class="fas fa-exclamation-circle"></i><span>Hata oluştu</span></div>`;
    }
}

// Çift tıklama işlemi
async function handleItemDoubleClick(e) {
    const item = e.currentTarget;
    const itemPath = item.dataset.path;
    const isDir = item.dataset.isDir === 'true';

    if (isDir) {
        await loadDirectory(itemPath);
    } else {
        if (window.electronAPI?.openFile) {
            await window.electronAPI.openFile(itemPath);
        }
    }
}

// Arama işlemi
function handleSearch(e) {
    searchQuery = e.target.value;
    renderContents();
}

// Aramayı temizle
function clearSearch() {
    const searchInput = document.getElementById('filesSearchInput');
    if (searchInput) {
        searchInput.value = '';
        searchQuery = '';
        renderContents();
    }
}

// Üst klasöre git
async function goToParent() {
    if (!currentPath || !window.electronAPI?.getParentDirectory) return;
    const parentPath = await window.electronAPI.getParentDirectory(currentPath);
    if (parentPath && parentPath !== currentPath) {
        await loadDirectory(parentPath);
    }
}

// Yenile
async function refresh() {
    if (currentPath) await loadDirectory(currentPath);
}

// Klasör seç
async function selectFolder() {
    if (!window.electronAPI?.selectFolder) return;
    const result = await window.electronAPI.selectFolder();
    if (result.success) await loadDirectory(result.path);
}

// Sıralama değişimi
function handleSortChange(e) {
    sortOrder = e.target.value;
    localStorage.setItem(FILES_SORT_KEY, sortOrder);
    renderContents();
}

// Quick Access - Masaüstü
async function goToDesktop() {
    const path = await window.electronAPI.getDesktopPath();
    if (path) await loadDirectory(path);
}

// Quick Access - Belgelerim
async function goToDocuments() {
    const path = await window.electronAPI.getDocumentsPath();
    if (path) await loadDirectory(path);
}

// Quick Access - Bilgisayar (Sürücüler)
async function goToComputer() {
    const drives = await window.electronAPI.getDrives();

    if (drives && drives.length > 0) {
        const filesList = document.getElementById('filesList');
        const pathDisplay = document.getElementById('filesCurrentPath');
        const searchInput = document.getElementById('filesSearchInput');

        currentPath = '';
        currentContents = drives;
        searchQuery = '';
        if (searchInput) searchInput.value = '';

        if (pathDisplay) {
            pathDisplay.textContent = 'Bilgisayar';
            pathDisplay.title = 'Bilgisayar';
        }

        filesList.innerHTML = drives.map(drive => `
            <div class="file-item is-folder" data-path="${drive.path}" data-is-dir="true" data-name="${drive.name}">
                <i class="fas fa-hdd file-icon folder-icon"></i>
                <span class="file-name" title="${drive.name}">${drive.name}</span>
                <span class="file-size"></span>
            </div>
        `).join('');

        filesList.querySelectorAll('.file-item').forEach(item => {
            item.addEventListener('dblclick', handleItemDoubleClick);
        });
    }
}

// Quick Access - Özel Kısayol
async function goToCustomShortcut() {
    const savedPath = localStorage.getItem(FILES_CUSTOM_SHORTCUT_KEY);
    if (savedPath) {
        await loadDirectory(savedPath);
    } else {
        await changeCustomShortcut();
    }
}

// Özel kısayolu değiştir
async function changeCustomShortcut() {
    if (!window.electronAPI?.selectFolder) return;
    const result = await window.electronAPI.selectFolder();
    if (result.success) {
        localStorage.setItem(FILES_CUSTOM_SHORTCUT_KEY, result.path);
        const folderName = result.path.split(/[\\/]/).pop() || 'Kısayol';
        localStorage.setItem(FILES_CUSTOM_SHORTCUT_NAME_KEY, folderName);
        updateCustomShortcutLabel();
        await loadDirectory(result.path);
    }
}

// Özel kısayol etiketini güncelle
function updateCustomShortcutLabel() {
    const label = document.getElementById('filesQuickCustomLabel');
    const savedName = localStorage.getItem(FILES_CUSTOM_SHORTCUT_NAME_KEY);
    if (label && savedName) {
        label.textContent = savedName.length > 8 ? savedName.substring(0, 8) + '...' : savedName;
    }
}

// Quick Access - Özel Kısayol 2
async function goToCustomShortcut2() {
    const savedPath = localStorage.getItem(FILES_CUSTOM_SHORTCUT_KEY_2);
    if (savedPath) {
        await loadDirectory(savedPath);
    } else {
        await changeCustomShortcut2();
    }
}

// Özel kısayol 2'yi değiştir
async function changeCustomShortcut2() {
    if (!window.electronAPI?.selectFolder) return;
    const result = await window.electronAPI.selectFolder();
    if (result.success) {
        localStorage.setItem(FILES_CUSTOM_SHORTCUT_KEY_2, result.path);
        const folderName = result.path.split(/[\\/]/).pop() || 'Kısayol 2';
        localStorage.setItem(FILES_CUSTOM_SHORTCUT_NAME_KEY_2, folderName);
        updateCustomShortcutLabel2();
        await loadDirectory(result.path);
    }
}

// Özel kısayol 2 etiketini güncelle
function updateCustomShortcutLabel2() {
    const label = document.getElementById('filesQuickCustomLabel2');
    const savedName = localStorage.getItem(FILES_CUSTOM_SHORTCUT_NAME_KEY_2);
    if (label && savedName) {
        label.textContent = savedName.length > 8 ? savedName.substring(0, 8) + '...' : savedName;
    }
}

// Quick Access - Özel Kısayol 3
async function goToCustomShortcut3() {
    const savedPath = localStorage.getItem(FILES_CUSTOM_SHORTCUT_KEY_3);
    if (savedPath) {
        await loadDirectory(savedPath);
    } else {
        await changeCustomShortcut3();
    }
}

// Özel kısayol 3'ü değiştir
async function changeCustomShortcut3() {
    if (!window.electronAPI?.selectFolder) return;
    const result = await window.electronAPI.selectFolder();
    if (result.success) {
        localStorage.setItem(FILES_CUSTOM_SHORTCUT_KEY_3, result.path);
        const folderName = result.path.split(/[\\/]/).pop() || 'Kısayol 3';
        localStorage.setItem(FILES_CUSTOM_SHORTCUT_NAME_KEY_3, folderName);
        updateCustomShortcutLabel3();
        await loadDirectory(result.path);
    }
}

// Özel kısayol 3 etiketini güncelle
function updateCustomShortcutLabel3() {
    const label = document.getElementById('filesQuickCustomLabel3');
    const savedName = localStorage.getItem(FILES_CUSTOM_SHORTCUT_NAME_KEY_3);
    if (label && savedName) {
        label.textContent = savedName.length > 8 ? savedName.substring(0, 8) + '...' : savedName;
    }
}

// Modülü başlat
export async function initializeFiles() {
    console.log('Files modülü başlatılıyor...');

    if (!window.electronAPI) {
        console.log('Electron API bulunamadı, dosya gezgini devre dışı');
        return;
    }

    // Butonları bağla
    const backBtn = document.getElementById('filesBackBtn');
    const refreshBtn = document.getElementById('filesRefreshBtn');
    const selectFolderBtn = document.getElementById('filesSelectFolderBtn');
    const sortSelect = document.getElementById('filesSortSelect');
    const searchInput = document.getElementById('filesSearchInput');
    const searchClear = document.getElementById('filesSearchClear');

    if (backBtn) backBtn.addEventListener('click', goToParent);
    if (refreshBtn) refreshBtn.addEventListener('click', refresh);
    if (selectFolderBtn) selectFolderBtn.addEventListener('click', selectFolder);

    if (sortSelect) {
        const savedSort = localStorage.getItem(FILES_SORT_KEY);
        if (savedSort) {
            sortOrder = savedSort;
            sortSelect.value = savedSort;
        }
        sortSelect.addEventListener('change', handleSortChange);
    }

    // Arama
    if (searchInput) {
        searchInput.addEventListener('input', handleSearch);
    }
    if (searchClear) {
        searchClear.addEventListener('click', clearSearch);
    }

    // Drop Zone - Dışarıdan dosya alma
    const filesList = document.getElementById('filesList');
    if (filesList) {
        // Sürükleme üzerinde
        filesList.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();

            // Harici dosya mı kontrol et
            if (e.dataTransfer.types.includes('Files')) {
                e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move';
                filesList.classList.add('drag-over');
            }
        });

        filesList.addEventListener('dragleave', (e) => {
            e.preventDefault();
            filesList.classList.remove('drag-over');
        });

        // Dosya bırakma
        filesList.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            filesList.classList.remove('drag-over');

            // Hedef klasör (mevcut dizin)
            if (!currentPath) {
                await showAlertModal('Hata', 'Önce bir klasör açın');
                return;
            }

            // Harici dosyalar (masaüstünden veya file explorer'dan)
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                const files = Array.from(e.dataTransfer.files);
                const isCopy = e.ctrlKey;

                for (const file of files) {
                    const sourcePath = file.path;
                    if (!sourcePath) continue;

                    try {
                        if (isCopy) {
                            // Kopyala
                            const result = await window.electronAPI.copyFile(sourcePath, currentPath);
                            if (!result.success) {
                                await showAlertModal('Kopyalama Hatası', result.error);
                            }
                        } else {
                            // Taşı
                            const result = await window.electronAPI.moveFile(sourcePath, currentPath);
                            if (!result.success) {
                                await showAlertModal('Taşıma Hatası', result.error);
                            }
                        }
                    } catch (error) {
                        await showAlertModal('Hata', error.message);
                    }
                }

                // Klasörü yeniden yükle
                await loadDirectory(currentPath);
            }
        });
    }

    const quickDesktop = document.getElementById('filesQuickDesktop');
    const quickComputer = document.getElementById('filesQuickComputer');
    const quickCustom = document.getElementById('filesQuickCustom');
    const quickCustom2 = document.getElementById('filesQuickCustom2');
    const quickCustom3 = document.getElementById('filesQuickCustom3');

    if (quickDesktop) quickDesktop.addEventListener('click', goToDesktop);
    if (quickComputer) quickComputer.addEventListener('click', goToComputer);
    if (quickCustom) {
        quickCustom.addEventListener('click', goToCustomShortcut);
        quickCustom.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            changeCustomShortcut();
        });
    }
    if (quickCustom2) {
        quickCustom2.addEventListener('click', goToCustomShortcut2);
        quickCustom2.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            changeCustomShortcut2();
        });
    }
    if (quickCustom3) {
        quickCustom3.addEventListener('click', goToCustomShortcut3);
        quickCustom3.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            changeCustomShortcut3();
        });
    }

    // Özel kısayol etiketlerini güncelle
    updateCustomShortcutLabel();
    updateCustomShortcutLabel2();
    updateCustomShortcutLabel3();

    // Görünüm modu butonları
    const viewListBtn = document.getElementById('filesViewList');
    const viewGridBtn = document.getElementById('filesViewGrid');

    if (viewListBtn) {
        viewListBtn.addEventListener('click', () => setViewMode('list'));
    }
    if (viewGridBtn) {
        viewGridBtn.addEventListener('click', () => setViewMode('grid'));
    }

    // Kaydedilmiş görünüm modunu yükle
    const savedViewMode = localStorage.getItem(FILES_VIEW_MODE_KEY);
    if (savedViewMode) {
        viewMode = savedViewMode;
        setViewMode(savedViewMode);
    }

    // Klavye olayları (Delete ve Backspace tuşları) - document seviyesinde dinle
    document.addEventListener('keydown', handleKeyboardEvents);

    // Kaydedilmiş yolu veya masaüstünü yükle
    const savedPath = localStorage.getItem(FILES_SAVED_PATH_KEY);

    try {
        if (savedPath) {
            await loadDirectory(savedPath);
        } else {
            const desktopPath = await window.electronAPI.getDesktopPath();
            await loadDirectory(desktopPath);
        }
    } catch (e) {
        const desktopPath = await window.electronAPI.getDesktopPath();
        await loadDirectory(desktopPath);
    }

    console.log('✅ Files modülü başlatıldı');
}

export default { initializeFiles };
