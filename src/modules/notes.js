// ==================== NOTES MODULE ====================

import AppState, { getNotes, setNotes } from './state.js';
import { playSound } from './sounds.js';
import { saveNoteToFirebase, deleteNoteFromFirebase } from './firebase-sync.js';

let autoSaveTimeout;
let searchQuery = '';
// Per-note font sizes (persisted in localStorage)
let noteFontSizes = JSON.parse(localStorage.getItem('noteFontSizes') || '{}');
// Pinned notes (persisted in localStorage)
let pinnedNotes = JSON.parse(localStorage.getItem('pinnedNotes') || '[]');

function getFontSize(noteId) {
    return noteFontSizes[noteId] || 13;
}

function setFontSize(noteId, size) {
    noteFontSizes[noteId] = size;
    localStorage.setItem('noteFontSizes', JSON.stringify(noteFontSizes));
}

function isPinned(noteId) {
    return pinnedNotes.includes(String(noteId));
}

function togglePin(noteId) {
    noteId = String(noteId);
    if (pinnedNotes.includes(noteId)) {
        pinnedNotes = pinnedNotes.filter(id => id !== noteId);
    } else {
        pinnedNotes.push(noteId);
    }
    localStorage.setItem('pinnedNotes', JSON.stringify(pinnedNotes));
}

// Sort: pinned first, then by updatedAt
function sortNotes(notes) {
    return [...notes].sort((a, b) => {
        const aPinned = isPinned(a.id);
        const bPinned = isPinned(b.id);
        if (aPinned && !bPinned) return -1;
        if (!aPinned && bPinned) return 1;
        return 0; // keep original order within groups
    });
}

export function initializeNotes() {
    const list = document.getElementById('notesList');
    const addBtn = document.getElementById('addNoteBtn');
    const searchInput = document.getElementById('notesSearchInput');

    list.addEventListener('click', (e) => {
        const item = e.target.closest('.note-acc-item');
        if (!item) return;
        const noteId = item.dataset.noteId;

        // Pin button
        const pinBtn = e.target.closest('.note-acc-pin');
        if (pinBtn) {
            e.stopPropagation();
            togglePin(noteId);
            // Save and re-render to reorder
            if (AppState.currentNoteId) saveNote(AppState.currentNoteId);
            renderNotesList();
            return;
        }

        // Delete button -> show modal confirm
        const deleteBtn = e.target.closest('.note-acc-delete');
        if (deleteBtn) {
            e.stopPropagation();
            const notes = getNotes();
            const note = notes.find(n => String(n.id) === String(noteId));
            const title = note ? note.title : 'Bu not';
            showDeleteModal(noteId, title);
            return;
        }

        // Bullet list
        const bulletBtn = e.target.closest('.note-btn-bullet');
        if (bulletBtn) {
            e.stopPropagation();
            applyListFormat(noteId, 'bullet');
            return;
        }

        // Numbered list
        const numberBtn = e.target.closest('.note-btn-number');
        if (numberBtn) {
            e.stopPropagation();
            applyListFormat(noteId, 'number');
            return;
        }

        // Checklist
        const checklistBtn = e.target.closest('.note-btn-checklist');
        if (checklistBtn) {
            e.stopPropagation();
            applyListFormat(noteId, 'checklist');
            return;
        }

        // Indent
        const indentBtn = e.target.closest('.note-btn-indent');
        if (indentBtn) {
            e.stopPropagation();
            applyIndent(noteId, 'indent');
            return;
        }

        // Outdent
        const outdentBtn = e.target.closest('.note-btn-outdent');
        if (outdentBtn) {
            e.stopPropagation();
            applyIndent(noteId, 'outdent');
            return;
        }

        // Font size +
        const zoomIn = e.target.closest('.note-zoom-in');
        if (zoomIn) {
            e.stopPropagation();
            changeFontSize(noteId, 1);
            return;
        }

        // Font size -
        const zoomOut = e.target.closest('.note-zoom-out');
        if (zoomOut) {
            e.stopPropagation();
            changeFontSize(noteId, -1);
            return;
        }

        // Title edit button click
        const titleEditBtn = e.target.closest('.note-title-edit-btn');
        if (titleEditBtn) {
            e.stopPropagation();
            startTitleEdit(noteId);
            return;
        }

        // Title save button click
        const titleSaveBtn = e.target.closest('.note-title-save-btn');
        if (titleSaveBtn) {
            e.stopPropagation();
            saveTitleEdit(noteId);
            return;
        }

        // Don't toggle if clicking inside title input
        if (e.target.closest('.note-title-input')) {
            e.stopPropagation();
            return;
        }

        // Header click -> toggle
        const header = e.target.closest('.note-acc-header');
        if (header) {
            toggleNote(noteId);
        }
    });

    list.addEventListener('keydown', (e) => {
        if (e.target.classList.contains('note-title-input')) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const item = e.target.closest('.note-acc-item');
                if (item) saveTitleEdit(item.dataset.noteId);
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                const item = e.target.closest('.note-acc-item');
                if (item) cancelTitleEdit(item.dataset.noteId);
            }
        }

        if (e.target.classList.contains('note-acc-textarea')) {
            const textarea = e.target;
            const item = textarea.closest('.note-acc-item');
            if (!item) return;
            const noteId = item.dataset.noteId;

            if (e.key === 'Tab') {
                e.preventDefault();
                applyIndent(noteId, e.shiftKey ? 'outdent' : 'indent');
                return;
            }

            if (e.key === 'Enter') {
                const handled = handleListEnter(textarea);
                if (handled) {
                    e.preventDefault();
                    autoSaveNote(noteId);
                    updateCharCount(noteId);
                    autoResizeTextarea(textarea);
                }
            }
        }
    });

    list.addEventListener('dblclick', (e) => {
        if (e.target.classList.contains('note-acc-textarea')) {
            const textarea = e.target;
            const item = textarea.closest('.note-acc-item');
            if (!item) return;
            const noteId = item.dataset.noteId;
            if (handleChecklistClick(textarea, textarea.selectionStart)) {
                e.preventDefault();
                autoSaveNote(noteId);
                updateCharCount(noteId);
            }
        }
    });

    // Auto-save on input (delegated)
    list.addEventListener('input', (e) => {
        const item = e.target.closest('.note-acc-item');
        if (!item) return;
        const noteId = item.dataset.noteId;

        if (e.target.classList.contains('note-acc-textarea')) {
            autoSaveNote(noteId);
            updateCharCount(noteId);
            autoResizeTextarea(e.target);
        }
    });

    addBtn.addEventListener('click', addNote);

    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.trim().toLowerCase();
        renderNotesList();
    });

    renderNotesList();
}

function startTitleEdit(noteId) {
    const item = document.querySelector(`[data-note-id="${noteId}"]`);
    if (!item) return;
    const titleSpan = item.querySelector('.note-acc-title');
    const titleInput = item.querySelector('.note-title-input');
    const editBtn = item.querySelector('.note-title-edit-btn');
    const saveBtn = item.querySelector('.note-title-save-btn');
    if (!titleSpan || !titleInput) return;

    titleInput.value = titleSpan.textContent;
    titleSpan.classList.add('hidden');
    titleInput.classList.remove('hidden');
    if (editBtn) editBtn.classList.add('hidden');
    if (saveBtn) saveBtn.classList.remove('hidden');
    titleInput.focus();
    titleInput.select();
}

function saveTitleEdit(noteId) {
    const item = document.querySelector(`[data-note-id="${noteId}"]`);
    if (!item) return;
    const titleSpan = item.querySelector('.note-acc-title');
    const titleInput = item.querySelector('.note-title-input');
    const editBtn = item.querySelector('.note-title-edit-btn');
    const saveBtn = item.querySelector('.note-title-save-btn');
    if (!titleSpan || !titleInput) return;

    const newTitle = titleInput.value.trim() || 'Başlıksız Not';
    titleSpan.textContent = newTitle;

    // Update the note data
    const notes = getNotes();
    const note = notes.find(n => String(n.id) === String(noteId));
    if (note) {
        note.title = newTitle;
        note.updatedAt = new Date().toISOString();
        setNotes(notes);
        saveNoteToFirebase(note);
    }

    titleSpan.classList.remove('hidden');
    titleInput.classList.add('hidden');
    if (editBtn) editBtn.classList.remove('hidden');
    if (saveBtn) saveBtn.classList.add('hidden');
}

function cancelTitleEdit(noteId) {
    const item = document.querySelector(`[data-note-id="${noteId}"]`);
    if (!item) return;
    const titleSpan = item.querySelector('.note-acc-title');
    const titleInput = item.querySelector('.note-title-input');
    const editBtn = item.querySelector('.note-title-edit-btn');
    const saveBtn = item.querySelector('.note-title-save-btn');
    if (!titleSpan || !titleInput) return;

    titleSpan.classList.remove('hidden');
    titleInput.classList.add('hidden');
    if (editBtn) editBtn.classList.remove('hidden');
    if (saveBtn) saveBtn.classList.add('hidden');
}

function autoResizeTextarea(textarea) {
    if (!textarea) return;

    const bodyInner = textarea.closest('.note-acc-body-inner');
    if (bodyInner) {
        bodyInner.style.minHeight = bodyInner.offsetHeight + 'px';
    }

    textarea.style.height = 'auto';
    const newHeight = Math.max(80, textarea.scrollHeight);
    textarea.style.height = newHeight + 'px';

    if (bodyInner) {
        requestAnimationFrame(() => {
            bodyInner.style.minHeight = '';
        });
    }
}

function autoResizeAllVisible() {
    const openItem = document.querySelector('.note-acc-item.open');
    if (!openItem) return;
    const textarea = openItem.querySelector('.note-acc-textarea');
    if (textarea) {
        autoResizeTextarea(textarea);
    }
}

function changeFontSize(noteId, delta) {
    let size = getFontSize(noteId) + delta;
    size = Math.max(10, Math.min(22, size));
    setFontSize(noteId, size);

    const item = document.querySelector(`[data-note-id="${noteId}"]`);
    if (!item) return;
    const textarea = item.querySelector('.note-acc-textarea');
    const sizeLabel = item.querySelector('.note-font-size-label');
    if (textarea) {
        textarea.style.fontSize = size + 'px';
        // Re-calc height after font size change
        setTimeout(() => autoResizeTextarea(textarea), 10);
    }
    if (sizeLabel) sizeLabel.textContent = size;
}

let deleteModalCleanup = null;

function showDeleteModal(noteId, noteTitle) {
    const overlay = document.getElementById('noteDeleteModal');
    const nameEl = document.getElementById('noteDeleteName');
    const confirmBtn = document.getElementById('noteDeleteConfirm');
    const cancelBtn = document.getElementById('noteDeleteCancel');
    if (!overlay) return;

    nameEl.textContent = `"${noteTitle}"`;
    overlay.classList.add('active');

    if (deleteModalCleanup) deleteModalCleanup();

    function doDelete() {
        cleanup();
        deleteNote(noteId);
    }

    function doCancel() {
        cleanup();
    }

    function onKeydown(e) {
        if (e.key === 'Enter' || e.key === 'Delete') {
            e.preventDefault();
            e.stopPropagation();
            doDelete();
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            doCancel();
        }
    }

    function onOverlayClick(e) {
        if (e.target === overlay) doCancel();
    }

    function cleanup() {
        overlay.classList.remove('active');
        confirmBtn.removeEventListener('click', doDelete);
        cancelBtn.removeEventListener('click', doCancel);
        document.removeEventListener('keydown', onKeydown, true);
        overlay.removeEventListener('click', onOverlayClick);
        deleteModalCleanup = null;
    }

    confirmBtn.addEventListener('click', doDelete);
    cancelBtn.addEventListener('click', doCancel);
    document.addEventListener('keydown', onKeydown, true);
    overlay.addEventListener('click', onOverlayClick);

    deleteModalCleanup = cleanup;
    confirmBtn.focus();
}

function addNote() {
    const note = {
        id: Date.now().toString(),
        title: 'Başlıksız Not',
        content: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    const notes = getNotes();
    notes.unshift(note);
    setNotes(notes);
    saveNoteToFirebase(note);

    AppState.currentNoteId = note.id;
    renderNotesList();

    setTimeout(() => {
        const textarea = document.querySelector(`[data-note-id="${note.id}"] .note-acc-textarea`);
        if (textarea) {
            autoResizeTextarea(textarea);
            textarea.focus();
        }
    }, 50);

    playSound('add');
}

function toggleNote(id) {
    id = String(id);

    if (AppState.currentNoteId === id) {
        saveNote(id);
        AppState.currentNoteId = null;
        renderNotesList();
        return;
    }

    if (AppState.currentNoteId) {
        saveNote(AppState.currentNoteId);
    }

    AppState.currentNoteId = id;
    renderNotesList();

    setTimeout(() => {
        const item = document.querySelector(`[data-note-id="${id}"]`);
        if (item) {
            item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            const textarea = item.querySelector('.note-acc-textarea');
            if (textarea) {
                autoResizeTextarea(textarea);
                textarea.focus();
            }
        }
    }, 50);
}

export function openNote(id) {
    toggleNote(id);
}

function saveNote(id) {
    id = String(id);
    const notes = getNotes();
    const note = notes.find(n => String(n.id) === id);
    if (!note) return;

    const item = document.querySelector(`[data-note-id="${id}"]`);
    if (!item) return;

    const textarea = item.querySelector('.note-acc-textarea');

    if (textarea) note.content = textarea.value;
    // Title is set from header (not editable inside body anymore)
    note.updatedAt = new Date().toISOString();

    setNotes(notes);
    saveNoteToFirebase(note);
}

function saveCurrentNote() {
    if (AppState.currentNoteId) {
        saveNote(AppState.currentNoteId);
    }
}

function autoSaveNote(noteId) {
    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(() => {
        saveNote(noteId);
    }, 1000);
}

export function deleteNote(id) {
    id = String(id);
    const notes = getNotes();
    setNotes(notes.filter(n => String(n.id) !== id));
    deleteNoteFromFirebase(id);

    // Clean up
    delete noteFontSizes[id];
    localStorage.setItem('noteFontSizes', JSON.stringify(noteFontSizes));
    pinnedNotes = pinnedNotes.filter(pid => pid !== id);
    localStorage.setItem('pinnedNotes', JSON.stringify(pinnedNotes));

    if (AppState.currentNoteId === id) {
        AppState.currentNoteId = null;
    }

    renderNotesList();
    playSound('delete');
}

export function renderNotesList() {
    const notes = getNotes();
    const list = document.getElementById('notesList');

    const filtered = searchQuery
        ? notes.filter(n =>
            n.title.toLowerCase().includes(searchQuery) ||
            (n.content && n.content.toLowerCase().includes(searchQuery))
        )
        : notes;

    if (filtered.length === 0 && !searchQuery) {
        list.innerHTML = `
            <div class="no-notes-message">
                <div class="no-notes-icon">
                    <i class="fas fa-sticky-note"></i>
                </div>
                <p>Henüz not eklenmemiş</p>
                <small>Yeni bir not oluşturmak için + butonuna tıklayın</small>
            </div>
        `;
        return;
    }

    if (filtered.length === 0 && searchQuery) {
        list.innerHTML = `
            <div class="no-notes-message">
                <div class="no-notes-icon">
                    <i class="fas fa-search"></i>
                </div>
                <p>Sonuç bulunamadı</p>
                <small>"${searchQuery}" ile eşleşen not yok</small>
            </div>
        `;
        return;
    }

    const sorted = sortNotes(filtered);

    list.innerHTML = sorted.map(note => {
        const isOpen = String(note.id) === String(AppState.currentNoteId);
        const pinned = isPinned(note.id);
        const date = new Date(note.updatedAt);
        const formattedDate = date.toLocaleDateString('tr-TR', {
            day: '2-digit',
            month: 'short'
        });
        const formattedTime = date.toLocaleTimeString('tr-TR', {
            hour: '2-digit',
            minute: '2-digit'
        });
        const charCount = note.content ? note.content.length : 0;
        const fontSize = getFontSize(note.id);

        const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#f97316'];
        const colorIndex = parseInt(note.id) % colors.length;
        const accentColor = colors[colorIndex];

        return `
            <div class="note-acc-item ${isOpen ? 'open' : ''} ${pinned ? 'pinned' : ''}"
                 data-note-id="${note.id}"
                 style="--note-accent: ${accentColor}">
                <div class="note-acc-header">
                    <div class="note-acc-color"></div>
                    <div class="note-acc-header-content">
                        <span class="note-acc-title">${note.title || 'Başlıksız Not'}</span>
                        <input type="text" class="note-title-input hidden" value="${(note.title || 'Başlıksız Not').replace(/"/g, '&quot;')}" placeholder="Not başlığı..." />
                        <span class="note-acc-date">${formattedDate} ${formattedTime}</span>
                    </div>
                    <div class="note-acc-header-actions">
                        <button class="note-title-edit-btn" title="Başlığı düzenle">
                            <i class="fas fa-pen"></i>
                        </button>
                        <button class="note-title-save-btn hidden" title="Başlığı kaydet">
                            <i class="fas fa-check"></i>
                        </button>
                        <button class="note-acc-pin ${pinned ? 'active' : ''}" title="${pinned ? 'Sabitlemeyi kaldır' : 'Sabitle'}">
                            <i class="fas fa-thumbtack"></i>
                        </button>
                        <button class="note-acc-delete" title="Sil">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                        <i class="fas fa-chevron-down note-acc-chevron"></i>
                    </div>
                </div>
                <div class="note-acc-body">
                    <div class="note-acc-body-inner">
                        <div class="note-acc-editor">
                            <div class="note-acc-toolbar">
                                <div class="note-format-controls">
                                    <button class="note-btn-bullet" title="Madde işareti">
                                        <i class="fas fa-list-ul"></i>
                                    </button>
                                    <button class="note-btn-number" title="Numaralı liste">
                                        <i class="fas fa-list-ol"></i>
                                    </button>
                                    <button class="note-btn-checklist" title="Yapılacaklar listesi">
                                        <i class="fas fa-tasks"></i>
                                    </button>
                                    <div class="note-toolbar-divider"></div>
                                    <button class="note-btn-indent" title="Girinti ekle (Tab)">
                                        <i class="fas fa-indent"></i>
                                    </button>
                                    <button class="note-btn-outdent" title="Girinti azalt (Shift+Tab)">
                                        <i class="fas fa-outdent"></i>
                                    </button>
                                </div>
                                <div class="note-zoom-controls">
                                    <button class="note-zoom-out" title="Yazıyı küçült">
                                        <i class="fas fa-minus"></i>
                                    </button>
                                    <span class="note-font-size-label">${fontSize}</span>
                                    <button class="note-zoom-in" title="Yazıyı büyüt">
                                        <i class="fas fa-plus"></i>
                                    </button>
                                </div>
                            </div>
                            <textarea class="note-acc-textarea"
                                      style="font-size: ${fontSize}px"
                                      placeholder="Notunuzu yazmaya başlayın...">${note.content || ''}</textarea>
                            <div class="note-acc-footer">
                                <span class="note-acc-footer-date">
                                    <i class="far fa-clock"></i> ${formattedDate} ${formattedTime}
                                </span>
                                <span class="note-acc-footer-chars">${charCount} karakter</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ---- List formatting helpers ----

const LIST_PATTERNS = {
    bullet: /^(\s*)• /,
    number: /^(\s*)\d+\. /,
    checklist: /^(\s*)(?:☐|☑) /,
};

function getSelectedLines(textarea) {
    const { selectionStart, selectionEnd, value } = textarea;
    const beforeStart = value.lastIndexOf('\n', selectionStart - 1);
    const afterEnd = value.indexOf('\n', selectionEnd);
    const lineStart = beforeStart + 1;
    const lineEnd = afterEnd === -1 ? value.length : afterEnd;
    const block = value.substring(lineStart, lineEnd);
    return { lineStart, lineEnd, lines: block.split('\n') };
}

function replaceLines(textarea, lineStart, lineEnd, newLines) {
    const newBlock = newLines.join('\n');
    textarea.focus();
    textarea.setSelectionRange(lineStart, lineEnd);
    document.execCommand('insertText', false, newBlock);
}

function applyListFormat(noteId, type) {
    const item = document.querySelector(`[data-note-id="${noteId}"]`);
    if (!item) return;
    const textarea = item.querySelector('.note-acc-textarea');
    if (!textarea) return;

    const { lineStart, lineEnd, lines } = getSelectedLines(textarea);
    const pattern = LIST_PATTERNS[type];

    const allHavePrefix = lines.every(l => pattern.test(l) || l.trim() === '');

    let newLines;
    if (allHavePrefix) {
        newLines = lines.map(l => {
            if (l.trim() === '') return l;
            return l.replace(pattern, '$1');
        });
    } else {
        let counter = 1;
        newLines = lines.map(l => {
            if (l.trim() === '') return l;
            let cleaned = l;
            for (const p of Object.values(LIST_PATTERNS)) {
                cleaned = cleaned.replace(p, '$1');
            }
            const indent = cleaned.match(/^(\s*)/)[1];
            const content = cleaned.trimStart();
            if (type === 'bullet') return `${indent}• ${content}`;
            if (type === 'number') return `${indent}${counter++}. ${content}`;
            if (type === 'checklist') return `${indent}☐ ${content}`;
            return cleaned;
        });
    }

    replaceLines(textarea, lineStart, lineEnd, newLines);
    autoSaveNote(noteId);
    updateCharCount(noteId);
    autoResizeTextarea(textarea);
}

function applyIndent(noteId, direction) {
    const item = document.querySelector(`[data-note-id="${noteId}"]`);
    if (!item) return;
    const textarea = item.querySelector('.note-acc-textarea');
    if (!textarea) return;

    const { lineStart, lineEnd, lines } = getSelectedLines(textarea);
    const INDENT = '    ';

    const newLines = lines.map(l => {
        if (direction === 'indent') {
            return INDENT + l;
        } else {
            if (l.startsWith(INDENT)) return l.substring(INDENT.length);
            if (l.startsWith('\t')) return l.substring(1);
            return l.replace(/^\s{1,4}/, '');
        }
    });

    replaceLines(textarea, lineStart, lineEnd, newLines);
    autoSaveNote(noteId);
    updateCharCount(noteId);
    autoResizeTextarea(textarea);
}

function handleListEnter(textarea) {
    const { value, selectionStart } = textarea;
    const lineStartIdx = value.lastIndexOf('\n', selectionStart - 1) + 1;
    const currentLine = value.substring(lineStartIdx, selectionStart);

    for (const [type, pattern] of Object.entries(LIST_PATTERNS)) {
        const match = currentLine.match(pattern);
        if (match) {
            const indent = match[1];
            const contentAfterPrefix = currentLine.replace(pattern, '').trim();

            if (contentAfterPrefix === '') {
                textarea.setSelectionRange(lineStartIdx, selectionStart);
                document.execCommand('insertText', false, '');
                return true;
            }

            let prefix;
            if (type === 'bullet') prefix = `${indent}• `;
            else if (type === 'number') {
                const prevNum = parseInt(currentLine.match(/(\d+)\./)[1]);
                prefix = `${indent}${prevNum + 1}. `;
            }
            else if (type === 'checklist') prefix = `${indent}☐ `;
            else return false;

            document.execCommand('insertText', false, '\n' + prefix);
            return true;
        }
    }

    return false;
}

// ---- Checklist toggle on click ----

function handleChecklistClick(textarea, clickPos) {
    const { value } = textarea;
    const lineStartIdx = value.lastIndexOf('\n', clickPos - 1) + 1;
    const lineEndIdx = value.indexOf('\n', clickPos);
    const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
    const line = value.substring(lineStartIdx, lineEnd);

    if (/^(\s*)☐ /.test(line)) {
        const newLine = line.replace('☐ ', '☑ ');
        textarea.setSelectionRange(lineStartIdx, lineEnd);
        document.execCommand('insertText', false, newLine);
        return true;
    }
    if (/^(\s*)☑ /.test(line)) {
        const newLine = line.replace('☑ ', '☐ ');
        textarea.setSelectionRange(lineStartIdx, lineEnd);
        document.execCommand('insertText', false, newLine);
        return true;
    }
    return false;
}

function updateCharCount(noteId) {
    const item = document.querySelector(`[data-note-id="${noteId}"]`);
    if (!item) return;
    const textarea = item.querySelector('.note-acc-textarea');
    const charsEl = item.querySelector('.note-acc-footer-chars');
    if (textarea && charsEl) {
        charsEl.textContent = `${textarea.value.length} karakter`;
    }
}
