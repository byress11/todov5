// ==================== TERMINAL MODULE (xterm.js + node-pty) ====================

import { playSound } from './sounds.js';

const SHORTCUTS_KEY = 'terminal_shortcuts';
const TERMINAL_ID = 'main-terminal';

let term = null;
let fitAddon = null;
let currentCwd = '';
let shortcuts = JSON.parse(localStorage.getItem(SHORTCUTS_KEY) || '[]');
let ptySpawned = false;

function getDefaultShortcuts() {
    return [
        { name: 'Telegram Server', cmd: 'claude --dangerously-load-development-channels', cwd: 'C:\\Users\\RESA\\telegram-channel' },
        { name: 'IP Adresim', cmd: 'ipconfig' },
        { name: 'Disk Alanı', cmd: 'wmic logicaldisk get size,freespace,caption' },
        { name: 'Sistem Bilgisi', cmd: 'systeminfo | findstr /B /C:"OS Name" /C:"OS Version" /C:"Total Physical Memory"' },
        { name: 'Klasör Listesi', cmd: 'dir /B' },
    ];
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export async function initializeTerminal() {
    if (!window.isElectron || !window.electronAPI?.ptySpawn) return;

    const container = document.getElementById('xtermContainer');
    const cwdEl = document.getElementById('terminalCwd');
    const cwdEditBtn = document.getElementById('terminalCwdEditBtn');
    const newBtn = document.getElementById('terminalNewBtn');
    const killBtn = document.getElementById('terminalKillBtn');
    const shortcutsToggle = document.getElementById('terminalShortcutsToggle');
    const shortcutsBody = document.getElementById('terminalShortcutsBody');
    const shortcutList = document.getElementById('terminalShortcutList');
    const shortcutNameInput = document.getElementById('shortcutNameInput');
    const shortcutCmdInput = document.getElementById('shortcutCmdInput');
    const shortcutAddBtn = document.getElementById('shortcutAddBtn');

    if (!container) return;

    // Load shortcuts
    if (shortcuts.length === 0) {
        shortcuts = getDefaultShortcuts();
        localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(shortcuts));
    }

    // Migrate old Telegram shortcut format
    const MIGRATION_KEY = 'terminal_shortcuts_v';
    const CURRENT_VER = 3;
    if (parseInt(localStorage.getItem(MIGRATION_KEY) || '0') < CURRENT_VER) {
        const telegramIdx = shortcuts.findIndex(s => s.name && s.name.includes('Telegram'));
        const correctTelegram = { name: 'Telegram Server', cmd: 'claude --dangerously-load-development-channels', cwd: 'C:\\Users\\RESA\\telegram-channel' };
        if (telegramIdx === -1) {
            shortcuts.unshift(correctTelegram);
        } else {
            shortcuts[telegramIdx] = correctTelegram;
        }
        localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(shortcuts));
        localStorage.setItem(MIGRATION_KEY, String(CURRENT_VER));
    }

    currentCwd = await window.electronAPI.ptyGetHome();
    cwdEl.textContent = currentCwd;
    cwdEl.title = currentCwd;

    // Dynamically import xterm
    const { Terminal } = await import('../../node_modules/@xterm/xterm/lib/xterm.mjs');
    const { FitAddon } = await import('../../node_modules/@xterm/addon-fit/lib/addon-fit.mjs');

    async function spawnTerminal(cwd) {
        if (term) {
            term.dispose();
            term = null;
        }

        term = new Terminal({
            cursorBlink: true,
            cursorStyle: 'bar',
            fontSize: 13,
            fontFamily: "'Cascadia Code', 'Consolas', 'Courier New', monospace",
            theme: {
                background: '#0d1117',
                foreground: '#c9d1d9',
                cursor: '#58a6ff',
                cursorAccent: '#0d1117',
                selectionBackground: 'rgba(56, 139, 253, 0.3)',
                black: '#484f58',
                red: '#ff7b72',
                green: '#3fb950',
                yellow: '#d29922',
                blue: '#58a6ff',
                magenta: '#bc8cff',
                cyan: '#39d2c0',
                white: '#c9d1d9',
                brightBlack: '#6e7681',
                brightRed: '#ffa198',
                brightGreen: '#56d364',
                brightYellow: '#e3b341',
                brightBlue: '#79c0ff',
                brightMagenta: '#d2a8ff',
                brightCyan: '#56d4dd',
                brightWhite: '#f0f6fc'
            },
            allowTransparency: true,
            scrollback: 5000,
            convertEol: true
        });

        fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(container);

        try { fitAddon.fit(); } catch {}

        // Clipboard: Ctrl+C copies if selection exists, Ctrl+V pastes
        term.attachCustomKeyEventHandler((e) => {
            if (e.type !== 'keydown') return true;
            const ctrlOrMeta = e.ctrlKey || e.metaKey;

            if (ctrlOrMeta && e.key === 'c' && term.hasSelection()) {
                navigator.clipboard.writeText(term.getSelection());
                term.clearSelection();
                return false;
            }
            if (ctrlOrMeta && e.key === 'v') {
                navigator.clipboard.readText().then(text => {
                    if (text && ptySpawned) {
                        window.electronAPI.ptyWrite(TERMINAL_ID, text);
                    }
                });
                return false;
            }
            return true;
        });

        // Right-click paste
        container.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            navigator.clipboard.readText().then(text => {
                if (text && ptySpawned) {
                    window.electronAPI.ptyWrite(TERMINAL_ID, text);
                }
            });
        });

        // Send user input to PTY
        term.onData(data => {
            if (ptySpawned) {
                window.electronAPI.ptyWrite(TERMINAL_ID, data);
            }
        });

        // Spawn PTY process
        const result = await window.electronAPI.ptySpawn(TERMINAL_ID, cwd || currentCwd);
        if (result.success) {
            ptySpawned = true;

            // Resize PTY to match terminal dimensions
            const { cols, rows } = term;
            window.electronAPI.ptyResize(TERMINAL_ID, cols, rows);
        } else {
            term.writeln(`\x1b[31mTerminal başlatılamadı: ${result.error}\x1b[0m`);
        }
    }

    // Receive PTY output
    window.electronAPI.onPtyData((id, data) => {
        if (id === TERMINAL_ID && term) {
            term.write(data);
        }
    });

    // PTY exit
    window.electronAPI.onPtyExit((id, code) => {
        if (id === TERMINAL_ID && term) {
            ptySpawned = false;
            term.writeln(`\r\n\x1b[90m[Process sonlandı (kod: ${code})] Yeni terminal için + butonuna tıklayın.\x1b[0m`);
        }
    });

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
        if (fitAddon && term) {
            try {
                fitAddon.fit();
                if (ptySpawned) {
                    const { cols, rows } = term;
                    window.electronAPI.ptyResize(TERMINAL_ID, cols, rows);
                }
            } catch {}
        }
    });
    resizeObserver.observe(container);

    // Tab visibility handling
    const tabObserver = new MutationObserver(() => {
        const termTab = document.getElementById('terminalTab');
        if (termTab && termTab.classList.contains('active') && fitAddon && term) {
            setTimeout(() => {
                try {
                    fitAddon.fit();
                    if (ptySpawned) {
                        window.electronAPI.ptyResize(TERMINAL_ID, term.cols, term.rows);
                    }
                } catch {}
                term.focus();
            }, 50);
        }
    });
    const termTab = document.getElementById('terminalTab');
    if (termTab) {
        tabObserver.observe(termTab, { attributes: true, attributeFilter: ['class'] });
    }

    // New terminal button
    newBtn.addEventListener('click', async () => {
        await spawnTerminal(currentCwd);
        playSound('success');
    });

    // Kill terminal button
    killBtn.addEventListener('click', async () => {
        if (ptySpawned) {
            await window.electronAPI.ptyKill(TERMINAL_ID);
            ptySpawned = false;
            playSound('delete');
        }
    });

    // CWD selection
    async function selectFolder() {
        const selected = await window.electronAPI.ptySelectFolder(currentCwd);
        if (selected) {
            currentCwd = selected;
            cwdEl.textContent = currentCwd;
            cwdEl.title = currentCwd;
            // Spawn new terminal in selected directory
            await spawnTerminal(currentCwd);
        }
    }

    cwdEl.addEventListener('click', selectFolder);
    cwdEditBtn.addEventListener('click', selectFolder);

    // ==================== SHORTCUTS ====================
    let shortcutsOpen = true;
    shortcutsBody.classList.add('open');
    shortcutsToggle.querySelector('.terminal-shortcuts-chevron').style.transform = 'rotate(180deg)';
    shortcutsToggle.addEventListener('click', () => {
        shortcutsOpen = !shortcutsOpen;
        shortcutsBody.classList.toggle('open', shortcutsOpen);
        shortcutsToggle.querySelector('.terminal-shortcuts-chevron').style.transform = shortcutsOpen ? 'rotate(180deg)' : '';
    });

    function renderShortcuts() {
        shortcutList.innerHTML = shortcuts.map((s, i) => `
            <div class="terminal-shortcut-item" data-index="${i}">
                <button class="shortcut-run-btn" data-cmd="${escapeHtml(s.cmd)}" data-cwd="${escapeHtml(s.cwd || '')}" title="${escapeHtml(s.cmd)}">
                    <i class="fas fa-play"></i>
                    <span>${escapeHtml(s.name)}</span>
                    ${s.cwd ? '<i class="fas fa-folder shortcut-bg-icon"></i>' : ''}
                </button>
                <button class="shortcut-delete-btn" data-index="${i}" title="Sil">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `).join('');
    }

    shortcutList.addEventListener('click', async (e) => {
        const runBtn = e.target.closest('.shortcut-run-btn');
        if (runBtn) {
            const cmd = runBtn.dataset.cmd;
            const cwd = runBtn.dataset.cwd || '';

            if (cwd && cwd !== currentCwd) {
                currentCwd = cwd;
                cwdEl.textContent = currentCwd;
                cwdEl.title = currentCwd;
                await spawnTerminal(currentCwd);
                // Wait for shell to be ready, then send command
                setTimeout(() => {
                    if (ptySpawned) {
                        window.electronAPI.ptyWrite(TERMINAL_ID, cmd + '\r');
                    }
                }, 500);
            } else {
                if (!ptySpawned) {
                    await spawnTerminal(currentCwd);
                    setTimeout(() => {
                        window.electronAPI.ptyWrite(TERMINAL_ID, cmd + '\r');
                    }, 500);
                } else {
                    window.electronAPI.ptyWrite(TERMINAL_ID, cmd + '\r');
                }
            }
            if (term) term.focus();
            playSound('success');
            return;
        }

        const delBtn = e.target.closest('.shortcut-delete-btn');
        if (delBtn) {
            const idx = parseInt(delBtn.dataset.index);
            shortcuts.splice(idx, 1);
            localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(shortcuts));
            renderShortcuts();
        }
    });

    shortcutAddBtn.addEventListener('click', () => {
        const name = shortcutNameInput.value.trim();
        const cmd = shortcutCmdInput.value.trim();
        if (!name || !cmd) return;

        shortcuts.push({ name, cmd });
        localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(shortcuts));
        shortcutNameInput.value = '';
        shortcutCmdInput.value = '';
        renderShortcuts();
        playSound('add');
    });

    shortcutCmdInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            shortcutAddBtn.click();
        }
    });

    renderShortcuts();

    // Auto-spawn terminal on load
    await spawnTerminal(currentCwd);
}
