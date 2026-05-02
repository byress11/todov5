// ==================== FIREBASE SYNC ====================

import AppState, { setCurrentUser, setSyncEnabled, setTodos, setReminders, setNotes, setStats } from './state.js';
import { showSyncStatus, hideSyncStatus } from './notifications.js';
import { playSound } from './sounds.js';
import { getCaseMapSnapshot, applyCaseMapSnapshot } from './casemap.js';
// Olay Haritası geçişi sonrası todo.js kaldırıldı; renderTodos no-op stub.
const renderTodos = () => {};
// Note: Reminders module replaced with Files module
import { renderNotesList } from './notes.js';
import { updateStats } from './stats.js';

// Firebase globals (accessed from firebase-config.js)
let auth = null;
let db = null;
let isFirebaseReady = false;
let authListenerAttached = false;
let uiInitialized = false;
let accountPanelInitialized = false;
let firebaseEventsBound = false;
let caseMapEventsBound = false;
let caseMapSaveTimer = null;

function refreshFirebaseRefs() {
    auth = window.auth || null;
    db = window.db || null;
    isFirebaseReady = !!auth && !!db;
}

function setLoginButtonsEnabled(enabled) {
    const anonymousLoginBtn = document.getElementById('anonymousLoginBtn');
    const emailLoginBtn = document.getElementById('emailLoginBtn');
    if (anonymousLoginBtn) anonymousLoginBtn.disabled = !enabled;
    if (emailLoginBtn) emailLoginBtn.disabled = !enabled;
}

function attachAuthListener() {
    if (!isFirebaseReady || authListenerAttached) return;
    authListenerAttached = true;

    auth.onAuthStateChanged((user) => {
        if (user) {
            setCurrentUser(user);
            setSyncEnabled(true);
            document.getElementById('loginModal').classList.add('hidden');
            showSyncStatus('Senkronize edildi', 'success');
            setTimeout(() => hideSyncStatus(), 2000);

            initializeFirebaseSync();
            updateAccountUI(user);
            console.log('User logged in:', user.uid);
        } else {
            setCurrentUser(null);
            setSyncEnabled(false);
            if (!localStorage.getItem('skipLogin')) {
                document.getElementById('loginModal').classList.remove('hidden');
            }
            updateAccountUI(null);
        }
    });
}

function bindFirebaseEvents() {
    if (firebaseEventsBound) return;
    firebaseEventsBound = true;

    window.addEventListener('firebase-ready', () => {
        refreshFirebaseRefs();
        setLoginButtonsEnabled(true);
        showSyncStatus('Firebase hazır', 'success');
        setTimeout(() => hideSyncStatus(), 1500);
        attachAuthListener();
    });

    window.addEventListener('firebase-error', (event) => {
        const message = event?.detail?.message || 'Firebase bağlantı hatası';
        showSyncStatus(message, 'error');
        setTimeout(() => hideSyncStatus(), 3000);
    });
}

export function initializeFirebaseAuth() {
    const loginModal = document.getElementById('loginModal');
    const anonymousLoginBtn = document.getElementById('anonymousLoginBtn');
    const emailLoginBtn = document.getElementById('emailLoginBtn');
    const skipLoginBtn = document.getElementById('skipLoginBtn');

    refreshFirebaseRefs();
    bindFirebaseEvents();

    // İlk yüklemede skipLogin kontrolü yap
    const hasSkipped = localStorage.getItem('skipLogin');
    if (hasSkipped) {
        loginModal.classList.add('hidden');
    } else {
        loginModal.classList.remove('hidden');
    }

    // Skip login (always available)
    skipLoginBtn.addEventListener('click', () => {
        loginModal.classList.add('hidden');
        localStorage.setItem('skipLogin', 'true');
        showSyncStatus('Yerel modda çalışıyor', 'success');
        setTimeout(() => hideSyncStatus(), 2000);
    });

    // Firebase is not ready: disable cloud login
    if (!isFirebaseReady) {
        console.warn('Firebase hazır değil, yerel mod etkin.');
        setLoginButtonsEnabled(false);
        const initError = window.firebaseInitState?.error;
        showSyncStatus(initError || 'Firebase bağlantısı yok, yerel mod', 'error');
        setTimeout(() => hideSyncStatus(), 3000);
        setupAccountPanel();
        updateAccountUI(null);
        return;
    }

    attachAuthListener();

    // Email input handlers
    const emailInput = document.getElementById('emailInput');
    const passwordInput = document.getElementById('passwordInput');

    emailInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') passwordInput.focus();
    });

    passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') emailLoginBtn.click();
    });

    if (!uiInitialized) {
        uiInitialized = true;

        // Anonymous login
        anonymousLoginBtn.addEventListener('click', async () => {
            refreshFirebaseRefs();
            if (!isFirebaseReady) {
                showSyncStatus('Firebase hazır değil', 'error');
                setTimeout(() => hideSyncStatus(), 2000);
                return;
            }
            try {
                showSyncStatus('Giriş yapılıyor...', 'syncing');
                await auth.signInAnonymously();
                playSound('success');
            } catch (error) {
                console.error('Anonymous login error:', error);
                alert('Anonim giriş başarısız: ' + error.message);
                showSyncStatus('Giriş başarısız', 'error');
                setTimeout(() => hideSyncStatus(), 3000);
            }
        });

        // Email login
        emailLoginBtn.addEventListener('click', async () => {
            refreshFirebaseRefs();
            if (!isFirebaseReady) {
                showSyncStatus('Firebase hazır değil', 'error');
                setTimeout(() => hideSyncStatus(), 2000);
                return;
            }
            const email = emailInput.value.trim();
            const password = passwordInput.value;

            if (!email || !password) {
                alert('Lütfen e-posta ve şifre girin');
                return;
            }

            if (password.length < 6) {
                alert('Şifre en az 6 karakter olmalıdır');
                return;
            }

            try {
                showSyncStatus('Giriş yapılıyor...', 'syncing');

                try {
                    await auth.signInWithEmailAndPassword(email, password);
                } catch (signInError) {
                    if (signInError.code === 'auth/user-not-found' || signInError.code === 'auth/invalid-credential') {
                        await auth.createUserWithEmailAndPassword(email, password);
                    } else {
                        throw signInError;
                    }
                }

                playSound('success');
            } catch (error) {
                console.error('Email login error:', error);
                const errorMessages = {
                    'auth/wrong-password': 'Hatalı şifre',
                    'auth/invalid-email': 'Geçersiz e-posta adresi',
                    'auth/email-already-in-use': 'Bu e-posta zaten kullanımda',
                    'auth/weak-password': 'Şifre çok zayıf',
                    'auth/network-request-failed': 'Ağ bağlantı hatası',
                    'auth/too-many-requests': 'Çok fazla deneme. Lütfen daha sonra tekrar deneyin',
                    'auth/invalid-credential': 'Geçersiz giriş bilgileri',
                    'auth/operation-not-allowed': 'Firebase Console’da giriş sağlayıcısı kapalı'
                };

                const errorMessage = errorMessages[error.code] || `Giriş hatası: ${error.message}`;
                alert(errorMessage);
                showSyncStatus(errorMessage, 'error');
                setTimeout(() => hideSyncStatus(), 3000);
            }
        });
    }

    setLoginButtonsEnabled(true);
    setupAccountPanel();
}

function setupAccountPanel() {
    if (accountPanelInitialized) return;
    accountPanelInitialized = true;

    const userAccountBtn = document.getElementById('userAccountBtn');
    const accountPanel = document.getElementById('accountPanel');
    const accountClose = document.getElementById('accountClose');
    const loginAgainBtn = document.getElementById('loginAgainBtn');
    const logoutBtn = document.getElementById('logoutBtn');

    userAccountBtn.addEventListener('click', () => {
        accountPanel.classList.toggle('active');
        document.getElementById('settingsPanel').classList.remove('active');
    });

    accountClose.addEventListener('click', () => {
        accountPanel.classList.remove('active');
    });

    document.addEventListener('click', (e) => {
        if (!accountPanel.contains(e.target) && !userAccountBtn.contains(e.target)) {
            accountPanel.classList.remove('active');
        }
    });

    loginAgainBtn.addEventListener('click', async () => {
        refreshFirebaseRefs();
        if (AppState.currentUser && auth) {
            await auth.signOut();
        }
        localStorage.removeItem('skipLogin');
        document.getElementById('loginModal').classList.remove('hidden');
        accountPanel.classList.remove('active');
    });

    logoutBtn.addEventListener('click', async () => {
        if (confirm('Çıkış yapmak istediğinizden emin misiniz?')) {
            try {
                refreshFirebaseRefs();
                if (auth) {
                    await auth.signOut();
                }
                setCurrentUser(null);
                setSyncEnabled(false);
                accountPanel.classList.remove('active');
                showSyncStatus('Çıkış yapıldı', 'success');
                setTimeout(() => hideSyncStatus(), 2000);

                AppState.syncListeners.forEach(unsubscribe => unsubscribe());
                AppState.syncListeners = [];
            } catch (error) {
                console.error('Logout error:', error);
                showSyncStatus('Çıkış hatası', 'error');
                setTimeout(() => hideSyncStatus(), 3000);
            }
        }
    });
}

function updateAccountUI(user) {
    const userAccountBtn = document.getElementById('userAccountBtn');
    const accountEmail = document.getElementById('accountEmail');
    const accountTypeText = document.getElementById('accountTypeText');
    const syncStatusText = document.getElementById('syncStatusText');
    const logoutBtn = document.getElementById('logoutBtn');

    if (user) {
        userAccountBtn.classList.remove('hidden');
        userAccountBtn.style.display = 'flex';

        if (user.isAnonymous) {
            accountEmail.textContent = 'Anonim Kullanıcı';
            accountTypeText.textContent = 'Anonim Hesap';
        } else {
            accountEmail.textContent = user.email || 'Kullanıcı';
            accountTypeText.textContent = 'E-posta ile Giriş';
        }

        syncStatusText.textContent = 'Senkronize Ediliyor';
        syncStatusText.style.color = 'var(--success-color)';
        logoutBtn.classList.remove('hidden');
        logoutBtn.style.display = 'flex';
    } else {
        const showAccountBtn = localStorage.getItem('skipLogin') === 'true';
        if (showAccountBtn) {
            userAccountBtn.classList.remove('hidden');
            userAccountBtn.style.display = 'flex';
        } else {
            userAccountBtn.classList.add('hidden');
            userAccountBtn.style.display = 'none';
        }

        accountEmail.textContent = 'Yerel Mod';
        accountTypeText.textContent = 'Senkronizasyon Kapalı';
        syncStatusText.textContent = 'Senkronize Değil';
        syncStatusText.style.color = 'var(--text-muted)';
        logoutBtn.classList.add('hidden');
        logoutBtn.style.display = 'none';
    }
}

let syncDebounceTimers = {};
function debouncedSync(key, fn, delay = 300) {
    clearTimeout(syncDebounceTimers[key]);
    syncDebounceTimers[key] = setTimeout(fn, delay);
}

function cloneForFirestore(value) {
    return JSON.parse(JSON.stringify(value ?? null));
}

function normalizeCaseMapSnapshot(snapshot = getCaseMapSnapshot(), includeUpdatedAt = true) {
    const clean = cloneForFirestore(snapshot) || {};
    const payload = {
        version: 2,
        view: clean.view || { x: 0, y: 0, zoom: 1, brightness: 0 },
        nodes: Array.isArray(clean.nodes) ? clean.nodes : [],
        edges: Array.isArray(clean.edges) ? clean.edges : [],
        hybrids: Array.isArray(clean.hybrids) ? clean.hybrids : [],
    };

    if (includeUpdatedAt) {
        payload.updatedAt = typeof clean.updatedAt === 'number' ? clean.updatedAt : Date.now();
    }

    return payload;
}

function comparableCaseMapSnapshot(snapshot) {
    return normalizeCaseMapSnapshot(snapshot, false);
}

function areCaseMapSnapshotsEqual(a, b) {
    return JSON.stringify(comparableCaseMapSnapshot(a)) === JSON.stringify(comparableCaseMapSnapshot(b));
}

function getEdgeKey(edge) {
    return edge?.id || `${edge?.from || ''}->${edge?.to || ''}`;
}

function mergeCaseMapSnapshots(localSnapshot, remoteSnapshot) {
    const local = normalizeCaseMapSnapshot(localSnapshot);
    const remote = normalizeCaseMapSnapshot(remoteSnapshot);

    if (remote.updatedAt && local.updatedAt && remote.updatedAt > local.updatedAt) {
        return remote;
    }

    const nodesById = new Map();
    remote.nodes.forEach((node) => {
        if (node?.id) nodesById.set(node.id, node);
    });
    local.nodes.forEach((node) => {
        if (!node?.id) return;
        const existing = nodesById.get(node.id);
        const localTime = Number(node.updatedAt || local.updatedAt || 0);
        const remoteTime = Number(existing?.updatedAt || remote.updatedAt || 0);
        if (!existing || localTime >= remoteTime) nodesById.set(node.id, node);
    });

    const nodeIds = new Set(nodesById.keys());
    const edgesByKey = new Map();
    remote.edges.forEach((edge) => {
        if (edge?.from && edge?.to && nodeIds.has(edge.from) && nodeIds.has(edge.to)) {
            edgesByKey.set(getEdgeKey(edge), edge);
        }
    });
    local.edges.forEach((edge) => {
        if (edge?.from && edge?.to && nodeIds.has(edge.from) && nodeIds.has(edge.to)) {
            edgesByKey.set(getEdgeKey(edge), edge);
        }
    });

    const hybridsByKey = new Map();
    local.hybrids.forEach((hybrid) => {
        if (hybrid?.key) hybridsByKey.set(hybrid.key, hybrid);
    });
    remote.hybrids.forEach((hybrid) => {
        if (hybrid?.key) hybridsByKey.set(hybrid.key, hybrid);
    });

    return {
        version: 2,
        updatedAt: Math.max(local.updatedAt || 0, remote.updatedAt || 0, Date.now()),
        view: local.nodes.length || local.edges.length ? local.view : remote.view,
        nodes: [...nodesById.values()],
        edges: [...edgesByKey.values()],
        hybrids: [...hybridsByKey.values()],
    };
}

export function saveCaseMapToFirebase(snapshot = getCaseMapSnapshot()) {
    if (!AppState.currentUser || !AppState.isSyncEnabled || !db) return Promise.resolve();

    const userId = AppState.currentUser.uid;
    const payload = normalizeCaseMapSnapshot({ ...snapshot, updatedAt: Date.now() });
    return db.collection('users').doc(userId).collection('settings').doc('casemap').set(payload)
        .catch((error) => console.error('Error saving case map:', error));
}

function bindCaseMapEvents() {
    if (caseMapEventsBound) return;
    caseMapEventsBound = true;

    window.addEventListener('taskmaster-casemap-change', (event) => {
        if (!AppState.currentUser || !AppState.isSyncEnabled || !db) return;

        const snapshot = event.detail || getCaseMapSnapshot();
        clearTimeout(caseMapSaveTimer);
        caseMapSaveTimer = setTimeout(() => {
            saveCaseMapToFirebase(snapshot);
        }, 500);
    });
}

async function migrateAndSubscribeCaseMap(userId, caseMapRef) {
    try {
        const remoteDoc = await caseMapRef.get();
        if (!AppState.currentUser || AppState.currentUser.uid !== userId) return;

        const localSnapshot = normalizeCaseMapSnapshot(getCaseMapSnapshot());
        let nextSnapshot = localSnapshot;

        if (remoteDoc.exists) {
            const remoteSnapshot = normalizeCaseMapSnapshot(remoteDoc.data());
            nextSnapshot = mergeCaseMapSnapshots(localSnapshot, remoteSnapshot);
            if (!areCaseMapSnapshotsEqual(nextSnapshot, remoteSnapshot)) {
                await caseMapRef.set(normalizeCaseMapSnapshot(nextSnapshot));
            }
        } else {
            await caseMapRef.set(normalizeCaseMapSnapshot(localSnapshot));
        }

        applyCaseMapSnapshot(nextSnapshot, { silent: true });
    } catch (error) {
        console.error('Case map migration error:', error);
        showSyncStatus('Gorev senkronizasyon hatasi', 'error');
        setTimeout(() => hideSyncStatus(), 3000);
    }

    if (!AppState.currentUser || AppState.currentUser.uid !== userId) return;

    const unsubscribeCaseMap = caseMapRef.onSnapshot((doc) => {
        if (!doc.exists) return;
        applyCaseMapSnapshot(doc.data(), { silent: true });
    }, (error) => {
        console.error('Case map sync error:', error);
        showSyncStatus('Gorev senkronizasyon hatasi', 'error');
        setTimeout(() => hideSyncStatus(), 3000);
    });
    AppState.syncListeners.push(unsubscribeCaseMap);
}

function initializeCaseMapFirebaseSync(userId) {
    bindCaseMapEvents();
    const caseMapRef = db.collection('users').doc(userId).collection('settings').doc('casemap');
    migrateAndSubscribeCaseMap(userId, caseMapRef);
}

function initializeFirebaseSync() {
    if (!AppState.currentUser || !AppState.isSyncEnabled) return;

    AppState.syncListeners.forEach(unsubscribe => unsubscribe());
    AppState.syncListeners = [];

    const userId = AppState.currentUser.uid;
    migrateLocalDataToFirebase(userId);
    initializeCaseMapFirebaseSync(userId);

    // Todos sync
    const todosRef = db.collection('users').doc(userId).collection('todos');
    const unsubscribeTodos = todosRef.orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
        const firebaseTodos = [];
        snapshot.forEach((doc) => {
            firebaseTodos.push({ id: doc.id, ...doc.data() });
        });
        setTodos(firebaseTodos);

        debouncedSync('todos', () => {
            const activeInput = document.querySelector('.todo-item input:focus, .todo-item textarea:focus');
            if (activeInput) return;
            renderTodos();
            updateStats();
        });
    }, (error) => {
        console.error('Todos sync error:', error);
        showSyncStatus('Senkronizasyon hatası', 'error');
        setTimeout(() => hideSyncStatus(), 3000);
    });
    AppState.syncListeners.push(unsubscribeTodos);

    // Stats sync
    const statsRef = db.collection('users').doc(userId).collection('settings').doc('stats');
    const unsubscribeStats = statsRef.onSnapshot((doc) => {
        if (doc.exists) {
            setStats(doc.data());
            debouncedSync('stats', () => updateStats());
        }
    });
    AppState.syncListeners.push(unsubscribeStats);

    // Notes sync
    const notesRef = db.collection('users').doc(userId).collection('notes');
    const unsubscribeNotes = notesRef.orderBy('updatedAt', 'desc').onSnapshot((snapshot) => {
        const firebaseNotes = [];
        snapshot.forEach((doc) => {
            firebaseNotes.push({ id: doc.id, ...doc.data() });
        });
        setNotes(firebaseNotes);

        debouncedSync('notes', () => {
            const activeTextarea = document.querySelector('.note-acc-item.open .note-acc-textarea');
            if (activeTextarea && document.activeElement === activeTextarea) {
                return;
            }
            renderNotesList();
        });
    });
    AppState.syncListeners.push(unsubscribeNotes);
}

function migrateLocalDataToFirebase(userId) {
    if (localStorage.getItem('migratedToFirebase')) return;

    const localTodos = JSON.parse(localStorage.getItem('todos')) || [];
    const localReminders = JSON.parse(localStorage.getItem('reminders')) || [];
    const localNotes = JSON.parse(localStorage.getItem('notes')) || [];
    const localStats = JSON.parse(localStorage.getItem('stats')) || {
        totalTasks: 0,
        completedTasks: 0,
        totalPomodoros: 0,
        totalMinutes: 0
    };

    // Migrate todos
    if (localTodos.length > 0) {
        const batch = db.batch();
        localTodos.forEach((todo) => {
            const docRef = db.collection('users').doc(userId).collection('todos').doc(todo.id);
            batch.set(docRef, todo);
        });
        batch.commit().then(() => console.log('Todos migrated'));
    }

    // Migrate reminders
    if (localReminders.length > 0) {
        const batch = db.batch();
        localReminders.forEach((reminder) => {
            const docRef = db.collection('users').doc(userId).collection('reminders').doc(reminder.id);
            batch.set(docRef, reminder);
        });
        batch.commit().then(() => console.log('Reminders migrated'));
    }

    // Migrate notes
    if (localNotes.length > 0) {
        const batch = db.batch();
        localNotes.forEach((note) => {
            const docRef = db.collection('users').doc(userId).collection('notes').doc(note.id);
            batch.set(docRef, note);
        });
        batch.commit().then(() => console.log('Notes migrated'));
    }

    // Migrate stats
    db.collection('users').doc(userId).collection('settings').doc('stats').set(localStats)
        .then(() => console.log('Stats migrated'));

    localStorage.setItem('migratedToFirebase', 'true');
}

// Firebase Save Functions
export function saveTodoToFirebase(todo) {
    if (!AppState.currentUser || !AppState.isSyncEnabled) return;
    const userId = AppState.currentUser.uid;
    db.collection('users').doc(userId).collection('todos').doc(todo.id).set(todo)
        .catch((error) => console.error('Error saving todo:', error));
}

export function deleteTodoFromFirebase(todoId) {
    if (!AppState.currentUser || !AppState.isSyncEnabled) return;
    const userId = AppState.currentUser.uid;
    db.collection('users').doc(userId).collection('todos').doc(todoId).delete()
        .catch((error) => console.error('Error deleting todo:', error));
}

export function saveReminderToFirebase(reminder) {
    if (!AppState.currentUser || !AppState.isSyncEnabled) return;
    const userId = AppState.currentUser.uid;
    db.collection('users').doc(userId).collection('reminders').doc(reminder.id).set(reminder)
        .catch((error) => console.error('Error saving reminder:', error));
}

export function deleteReminderFromFirebase(reminderId) {
    if (!AppState.currentUser || !AppState.isSyncEnabled) return;
    const userId = AppState.currentUser.uid;
    db.collection('users').doc(userId).collection('reminders').doc(reminderId).delete()
        .catch((error) => console.error('Error deleting reminder:', error));
}

export function saveStatsToFirebase() {
    if (!AppState.currentUser || !AppState.isSyncEnabled) return;
    const userId = AppState.currentUser.uid;
    db.collection('users').doc(userId).collection('settings').doc('stats').set(AppState.stats)
        .catch((error) => console.error('Error saving stats:', error));
}

export function saveNoteToFirebase(note) {
    if (!AppState.currentUser || !AppState.isSyncEnabled) return;
    const userId = AppState.currentUser.uid;
    db.collection('users').doc(userId).collection('notes').doc(note.id).set(note)
        .catch((error) => console.error('Error saving note:', error));
}

export function deleteNoteFromFirebase(noteId) {
    if (!AppState.currentUser || !AppState.isSyncEnabled) return;
    const userId = AppState.currentUser.uid;
    db.collection('users').doc(userId).collection('notes').doc(noteId).delete()
        .catch((error) => console.error('Error deleting note:', error));
}
