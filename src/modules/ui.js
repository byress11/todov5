// ==================== UI UTILITIES ====================

import AppState from './state.js';

// Global variable to track lock state for resize
let isWidgetLocked = false;

// Widget Controls
export function initializeWidgetControls() {
    const container = document.getElementById('widgetContainer');
    const header = document.querySelector('.widget-header');
    const lockBtn = document.getElementById('lockBtn');
    const resizeHandles = document.querySelectorAll('.resize-handle');

    // Drag functionality
    let isDragging = false;
    let currentX, currentY, initialX, initialY;

    header.addEventListener('mousedown', dragStart);

    function dragStart(e) {
        if (AppState.isLocked) return;
        if (e.target.classList.contains('control-btn')) return;
        initialX = e.clientX - container.offsetLeft;
        initialY = e.clientY - container.offsetTop;
        isDragging = true;
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', dragEnd);
    }

    function drag(e) {
        if (!isDragging) return;
        e.preventDefault();
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;
        container.style.position = 'fixed';
        container.style.left = currentX + 'px';
        container.style.top = currentY + 'px';
    }

    function dragEnd() {
        isDragging = false;
        document.removeEventListener('mousemove', drag);
        document.removeEventListener('mouseup', dragEnd);
    }

    // Lock functionality - applies lock state
    function applyLockState(locked) {
        isWidgetLocked = locked;
        AppState.isLocked = locked;
        
        if (locked) {
            // Kilitli durum
            container.classList.add('widget-locked');
            lockBtn.classList.add('active');
            lockBtn.innerHTML = '<i class="fas fa-lock"></i>';
            lockBtn.title = 'Kilidi Aç';
            
            // Resize handle'ları tamamen gizle
            resizeHandles.forEach(handle => {
                handle.style.display = 'none';
                handle.style.pointerEvents = 'none';
                handle.style.visibility = 'hidden';
            });
            
            // Container'ın resize özelliğini kapat
            container.style.resize = 'none';
            
            // Electron'da pencere ayarları (fonksiyonlar varsa)
            if (window.isElectron && window.electronAPI) {
                if (typeof window.electronAPI.setLockMode === 'function') {
                    window.electronAPI.setLockMode(true);
                }
            }
        } else {
            // Kilitsiz durum
            container.classList.remove('widget-locked');
            lockBtn.classList.remove('active');
            lockBtn.innerHTML = '<i class="fas fa-lock-open"></i>';
            lockBtn.title = 'Kilitle';
            
            // Resize handle'ları göster
            resizeHandles.forEach(handle => {
                handle.style.display = '';
                handle.style.pointerEvents = '';
                handle.style.visibility = '';
            });
            
            // Container'ın resize özelliğini aç
            container.style.resize = 'both';
            
            // Electron'da pencere ayarları (fonksiyonlar varsa)
            if (window.isElectron && window.electronAPI) {
                if (typeof window.electronAPI.setLockMode === 'function') {
                    window.electronAPI.setLockMode(false);
                }
            }
        }
        
        localStorage.setItem('isLocked', locked);
    }

    // İlk başlatmada kilitleme durumunu uygula (varsayılan: kilitli)
    applyLockState(AppState.isLocked);

    // Kilitleme butonu click event
    lockBtn.addEventListener('click', () => {
        applyLockState(!AppState.isLocked);
    });

    // Minimize - kilitliyken çalışmaz
    document.getElementById('minimizeBtn').addEventListener('click', () => {
        // Kilitliyken küçültme çalışmasın
        if (AppState.isLocked) {
            return;
        }
        
        if (window.isElectron && window.electronAPI) {
            window.electronAPI.minimizeWindow();
        } else {
            container.classList.toggle('minimized');
        }
    });

    // Close - kilitliyken çalışmaz
    document.getElementById('closeBtn').addEventListener('click', () => {
        // Kilitliyken kapatma çalışmasın
        if (AppState.isLocked) {
            return;
        }
        
        if (window.isElectron && window.electronAPI) {
            window.electronAPI.closeWindow();
        } else {
            if (confirm('Uygulamayı kapatmak istediğinizden emin misiniz?')) {
                window.close();
            }
        }
    });

    // Resize
    initializeResize(container);

    // Apply saved size
    const savedWidth = localStorage.getItem('widgetWidth');
    const savedHeight = localStorage.getItem('widgetHeight');
    if (savedWidth) container.style.width = savedWidth + 'px';
    if (savedHeight) container.style.height = savedHeight + 'px';
    updateWidgetSize();
}

// Resize functionality
function initializeResize(container) {
    const handles = document.querySelectorAll('.resize-handle');
    let isResizing = false;
    let currentHandle = null;
    let startX, startY, startWidth, startHeight, startLeft, startTop;

    function onResizeMove(e) {
        if (!isResizing || isWidgetLocked) return;

        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;
        const minWidth = 350;
        const minHeight = 400;
        const maxWidth = window.innerWidth;
        const maxHeight = window.innerHeight;

        switch (currentHandle) {
            case 'right':
                container.style.width = Math.max(minWidth, Math.min(maxWidth, startWidth + deltaX)) + 'px';
                break;
            case 'bottom':
                container.style.height = Math.max(minHeight, Math.min(maxHeight, startHeight + deltaY)) + 'px';
                break;
            case 'left': {
                const nw = Math.max(minWidth, Math.min(maxWidth, startWidth - deltaX));
                if (nw > minWidth) {
                    container.style.width = nw + 'px';
                    container.style.left = (startLeft + deltaX) + 'px';
                }
                break;
            }
            case 'top': {
                const nh = Math.max(minHeight, Math.min(maxHeight, startHeight - deltaY));
                if (nh > minHeight) {
                    container.style.height = nh + 'px';
                    container.style.top = (startTop + deltaY) + 'px';
                }
                break;
            }
            case 'bottom-right':
                container.style.width = Math.max(minWidth, Math.min(maxWidth, startWidth + deltaX)) + 'px';
                container.style.height = Math.max(minHeight, Math.min(maxHeight, startHeight + deltaY)) + 'px';
                break;
            case 'bottom-left': {
                const nw = Math.max(minWidth, Math.min(maxWidth, startWidth - deltaX));
                if (nw > minWidth) {
                    container.style.width = nw + 'px';
                    container.style.left = (startLeft + deltaX) + 'px';
                }
                container.style.height = Math.max(minHeight, Math.min(maxHeight, startHeight + deltaY)) + 'px';
                break;
            }
            case 'top-right': {
                container.style.width = Math.max(minWidth, Math.min(maxWidth, startWidth + deltaX)) + 'px';
                const nh = Math.max(minHeight, Math.min(maxHeight, startHeight - deltaY));
                if (nh > minHeight) {
                    container.style.height = nh + 'px';
                    container.style.top = (startTop + deltaY) + 'px';
                }
                break;
            }
            case 'top-left': {
                const nw = Math.max(minWidth, Math.min(maxWidth, startWidth - deltaX));
                const nh = Math.max(minHeight, Math.min(maxHeight, startHeight - deltaY));
                if (nw > minWidth) {
                    container.style.width = nw + 'px';
                    container.style.left = (startLeft + deltaX) + 'px';
                }
                if (nh > minHeight) {
                    container.style.height = nh + 'px';
                    container.style.top = (startTop + deltaY) + 'px';
                }
                break;
            }
        }

        updateWidgetSize();
    }

    function onResizeEnd() {
        if (isResizing) {
            isResizing = false;
            currentHandle = null;
            localStorage.setItem('widgetWidth', container.offsetWidth);
            localStorage.setItem('widgetHeight', container.offsetHeight);
        }
        document.removeEventListener('mousemove', onResizeMove);
        document.removeEventListener('mouseup', onResizeEnd);
    }

    handles.forEach(handle => {
        handle.addEventListener('mousedown', (e) => {
            if (isWidgetLocked) return;

            isResizing = true;
            currentHandle = handle.dataset.direction;
            startX = e.clientX;
            startY = e.clientY;
            startWidth = container.offsetWidth;
            startHeight = container.offsetHeight;
            startLeft = container.offsetLeft;
            startTop = container.offsetTop;

            document.addEventListener('mousemove', onResizeMove);
            document.addEventListener('mouseup', onResizeEnd);

            e.preventDefault();
            e.stopPropagation();
        });
    });
}

export function updateWidgetSize() {
    const container = document.getElementById('widgetContainer');
    const width = container.offsetWidth;
    const height = container.offsetHeight;

    container.classList.remove('size-small', 'size-medium', 'size-large', 'size-xlarge');

    if (width < 400 || height < 500) {
        container.classList.add('size-small');
    } else if (width < 550 || height < 700) {
        container.classList.add('size-medium');
    } else if (width < 700 || height < 900) {
        container.classList.add('size-large');
    } else {
        container.classList.add('size-xlarge');
    }
}

// Tab Management
export function initializeTabs() {
    const navBtns = document.querySelectorAll('.nav-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;

            navBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(t => t.classList.remove('active'));

            btn.classList.add('active');
            document.getElementById(tabName + 'Tab').classList.add('active');
        });
    });
}
