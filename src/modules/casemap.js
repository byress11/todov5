// ==================== CASE MAP (Olay Haritası) ====================
// Gezegen-uydu (planetary) tarzı dedektif panosu. Tek Canvas2D.
// Sıfır bağımlılık. On-demand redraw (idle CPU ~ 0%).

const STORAGE_KEY      = 'taskmaster.casemap.v1';
const HYBRIDS_KEY      = 'taskmaster.casemap.hybrids.v1';
const ARCHIVE_KEY      = 'taskmaster.todos.archive.json';
const ARCHIVE_DONE_KEY = 'taskmaster.todos.archived';
const SYNC_CHANGE_EVENT = 'taskmaster-casemap-change';
const CROSS_WINDOW_SYNC_CHANNEL = 'taskmaster-casemap-sync';

const DEFAULT_HYBRIDS = [
    { key: 'ARAZI',         title: 'ARAZİ',         color: '#22c55e', icon: 'fa-mountain' },
    { key: 'YAPI_DENETIMI', title: 'YAPI DENETİMİ', color: '#ef4444', icon: 'fa-helmet-safety' },
    { key: 'BELEDIYE',      title: 'BELEDİYE',      color: '#3b82f6', icon: 'fa-building-columns' },
    { key: 'TADILAT',       title: 'TADİLAT',       color: '#f59e0b', icon: 'fa-screwdriver-wrench' },
    { key: 'PROJE',         title: 'PROJE',         color: '#8b5cf6', icon: 'fa-drafting-compass' },
    { key: 'KONTROL_ET',    title: 'KONTROL ET',    color: '#06b6d4', icon: 'fa-magnifying-glass' },
    { key: 'GORUS',         title: 'GÖRÜŞ',         color: '#ec4899', icon: 'fa-comments' },
    { key: 'GONDER',        title: 'GÖNDER',        color: '#10b981', icon: 'fa-paper-plane' },
];

const STATUS_COLORS = {
    todo:    '#94a3b8',
    doing:   '#3b82f6',
    done:    '#10b981',
    blocked: '#ef4444',
};
const STATUS_LABELS = {
    todo: 'Yapılacak', doing: 'Devam', done: 'Bitti', blocked: 'Bloke',
};

// Yarıçaplar (dünya koordinatları)
const HYBRID_R     = 64;   // gezegen
const SUB_R        = 32;   // uydu
const ORBIT_GAP    = 80;   // yörünge yarıçapı = HYBRID_R + ORBIT_GAP
const ADD_BTN_OFF  = 18;   // hibritin altında "+" butonu offset
const ELLIPSE_RAT  = 0.42; // 3D yörünge eliptik yamulma (1 = düz daire, <1 = yandan görüş)

// ---------- State ----------
const state = {
    view: { x: 0, y: 0, zoom: 1, brightness: 0 },
    nodes: [],
    edges: [],
    selection: new Set(),
    hovered: null,
    hoveredHandle: null,
    hoveredAddBtn: null,
    searchTerm: '',
};
let hybrids = [];
let undoStack = [];
let redoStack = [];
const MAX_UNDO = 60;
let suppressSyncEvent = false;
let caseMapUpdatedAt = 0;
let crossWindowSyncBound = false;
let syncChannel = null;

// ---------- DOM refs ----------
let canvas, ctx, root, palette, paletteList, toolbar, inspector, ctxMenu, emptyHint, zoomIndicator, searchInput, mobileActions;
let dpr = 1, cssW = 0, cssH = 0;

// 2.5D parallax tilt — kaldırıldı (drag/zoom sırasında konumlandırma hissini bozuyordu)
const tilt = { x: 0, y: 0 };

// ---------- Interaction state ----------
const ix = {
    mode: 'idle',           // idle | pan | drag | connect | marquee
    startX: 0, startY: 0,
    lastX: 0, lastY: 0,
    dragOffsets: null,      // Map<id, {dx,dy}>
    connectFrom: null,
    marqueeRect: null,
    pressNodeId: null,
    moved: false,
};

// ---------- Utils ----------
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function debounce(fn, ms) {
    let t = null;
    return function (...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), ms);
    };
}

const persistViewSoon = debounce(() => persist(), 180);

function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
}

function readCaseMapSnapshotFromStorage() {
    let mapData = null;
    let hybridData = null;

    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) mapData = JSON.parse(raw);
    } catch (e) {
        console.warn('casemap storage snapshot failed', e);
    }

    try {
        const rawH = localStorage.getItem(HYBRIDS_KEY);
        if (rawH) hybridData = JSON.parse(rawH);
    } catch (e) {
        console.warn('hybrids storage snapshot failed', e);
    }

    return {
        version: 2,
        updatedAt: typeof mapData?.updatedAt === 'number' ? mapData.updatedAt : 0,
        view: mapData?.view || { x: 0, y: 0, zoom: 1, brightness: 0 },
        nodes: Array.isArray(mapData?.nodes) ? mapData.nodes.map(n => migrateNode({ ...n })) : [],
        edges: Array.isArray(mapData?.edges) ? mapData.edges : [],
        hybrids: Array.isArray(hybridData) && hybridData.length ? hybridData : DEFAULT_HYBRIDS.slice(),
    };
}

function buildCaseMapStoragePayload(snapshot = null) {
    const source = snapshot || {
        view: state.view,
        nodes: state.nodes,
        edges: state.edges,
    };
    return {
        version: 2,
        updatedAt: typeof source.updatedAt === 'number' ? source.updatedAt : Date.now(),
        view: cloneJson(source.view || { x: 0, y: 0, zoom: 1, brightness: 0 }),
        nodes: cloneJson(Array.isArray(source.nodes) ? source.nodes : []),
        edges: cloneJson(Array.isArray(source.edges) ? source.edges : []),
    };
}

export function getCaseMapSnapshot() {
    const storageSnapshot = readCaseMapSnapshotFromStorage();
    const liveHasData = state.nodes.length > 0 || state.edges.length > 0 || hybrids.length > 0;
    const source = liveHasData ? {
        view: state.view,
        nodes: state.nodes,
        edges: state.edges,
        hybrids: hybrids.length ? hybrids : storageSnapshot.hybrids,
        updatedAt: caseMapUpdatedAt || storageSnapshot.updatedAt,
    } : storageSnapshot;

    return {
        version: 2,
        updatedAt: source.updatedAt || Date.now(),
        view: cloneJson(source.view || { x: 0, y: 0, zoom: 1, brightness: 0 }),
        nodes: cloneJson(Array.isArray(source.nodes) ? source.nodes : []),
        edges: cloneJson(Array.isArray(source.edges) ? source.edges : []),
        hybrids: cloneJson(Array.isArray(source.hybrids) && source.hybrids.length ? source.hybrids : DEFAULT_HYBRIDS),
    };
}

function emitCaseMapChange() {
    if (suppressSyncEvent || typeof window === 'undefined') return;
    const snapshot = getCaseMapSnapshot();
    window.dispatchEvent(new CustomEvent(SYNC_CHANGE_EVENT, { detail: snapshot }));
    if (syncChannel) {
        try {
            syncChannel.postMessage({ type: 'casemap-updated', snapshot });
        } catch (e) {
            console.warn('casemap cross-window sync failed', e);
        }
    }
}

export function applyCaseMapSnapshot(snapshot, options = {}) {
    if (!snapshot || !Array.isArray(snapshot.nodes)) return false;

    const nextHybrids = Array.isArray(snapshot.hybrids) && snapshot.hybrids.length
        ? cloneJson(snapshot.hybrids)
        : (hybrids.length ? hybrids : DEFAULT_HYBRIDS.slice());
    const nextPayload = buildCaseMapStoragePayload({
        version: 2,
        updatedAt: typeof snapshot.updatedAt === 'number' ? snapshot.updatedAt : Date.now(),
        view: snapshot.view || state.view,
        nodes: snapshot.nodes.map(n => migrateNode({ ...n })),
        edges: Array.isArray(snapshot.edges) ? snapshot.edges : [],
    });

    suppressSyncEvent = !!options.silent;
    try {
        state.view = nextPayload.view;
        state.nodes = nextPayload.nodes.map(n => migrateNode({ ...n }));
        state.edges = nextPayload.edges;
        caseMapUpdatedAt = nextPayload.updatedAt;
        hybrids = nextHybrids;
        state.selection.clear();
        undoStack = [];
        redoStack = [];

        if (options.persist !== false) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(nextPayload));
            localStorage.setItem(HYBRIDS_KEY, JSON.stringify(hybrids));
        }

        if (paletteList) renderPalette();
        if (inspectorBoundId && !state.nodes.some(n => n.id === inspectorBoundId)) closeInspector();
        updateMobileActions();
        requestRedraw();
        return true;
    } catch (e) {
        console.warn('casemap apply snapshot failed', e);
        return false;
    } finally {
        suppressSyncEvent = false;
    }
}

const persist = debounce(() => {
    try {
        const payload = buildCaseMapStoragePayload();
        caseMapUpdatedAt = payload.updatedAt;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        emitCaseMapChange();
    } catch (e) { console.warn('casemap persist failed', e); }
}, 400);

function persistHybrids() {
    try {
        caseMapUpdatedAt = Date.now();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(buildCaseMapStoragePayload({ ...getCaseMapSnapshot(), updatedAt: caseMapUpdatedAt })));
        localStorage.setItem(HYBRIDS_KEY, JSON.stringify(hybrids));
        emitCaseMapChange();
    }
    catch (e) { console.warn('hybrids persist failed', e); }
}

// Eski (rect) → yeni (circle) göçü
function migrateNode(n) {
    if (typeof n.cx !== 'number') {
        n.cx = (n.x ?? 0) + (n.w ?? 200) / 2;
        n.cy = (n.y ?? 0) + (n.h ?? 92) / 2;
    }
    if (typeof n.r !== 'number') {
        n.r = (n.type === 'hybrid') ? HYBRID_R : SUB_R;
    }
    if (typeof n.expanded !== 'boolean') n.expanded = true;
    delete n.x; delete n.y; delete n.w; delete n.h;
    return n;
}

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const data = JSON.parse(raw);
            state.view = data.view || state.view;
            state.nodes = (Array.isArray(data.nodes) ? data.nodes : []).map(migrateNode);
            state.edges = Array.isArray(data.edges) ? data.edges : [];
            caseMapUpdatedAt = typeof data.updatedAt === 'number' ? data.updatedAt : 0;
        }
    } catch (e) { console.warn('casemap load failed', e); }
    try {
        const rawH = localStorage.getItem(HYBRIDS_KEY);
        hybrids = rawH ? JSON.parse(rawH) : DEFAULT_HYBRIDS.slice();
        if (!Array.isArray(hybrids) || !hybrids.length) hybrids = DEFAULT_HYBRIDS.slice();
    } catch { hybrids = DEFAULT_HYBRIDS.slice(); }
}

function applyExternalCaseMapSnapshot(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.nodes)) return;
    const incomingUpdatedAt = typeof snapshot.updatedAt === 'number' ? snapshot.updatedAt : 0;
    if (incomingUpdatedAt && caseMapUpdatedAt && incomingUpdatedAt < caseMapUpdatedAt) return;

    applyCaseMapSnapshot(snapshot, { silent: true, persist: false });
}

const applyStorageSnapshotSoon = debounce(() => {
    applyExternalCaseMapSnapshot(readCaseMapSnapshotFromStorage());
}, 80);

function bindCrossWindowSync() {
    if (crossWindowSyncBound || typeof window === 'undefined') return;
    crossWindowSyncBound = true;

    if (typeof BroadcastChannel !== 'undefined') {
        syncChannel = new BroadcastChannel(CROSS_WINDOW_SYNC_CHANNEL);
        syncChannel.addEventListener('message', (event) => {
            if (event.data?.type !== 'casemap-updated') return;
            applyExternalCaseMapSnapshot(event.data.snapshot);
        });
    }

    window.addEventListener('storage', (event) => {
        if (event.key !== STORAGE_KEY && event.key !== HYBRIDS_KEY) return;
        applyStorageSnapshotSoon();
    });
}

function archiveLegacyTodos() {
    if (localStorage.getItem(ARCHIVE_DONE_KEY)) return;
    const t = localStorage.getItem('todos');
    if (t) { try { localStorage.setItem(ARCHIVE_KEY, t); } catch (_) {} }
    localStorage.setItem(ARCHIVE_DONE_KEY, '1');
}

function pushUndo() {
    undoStack.push(JSON.stringify({ nodes: state.nodes, edges: state.edges }));
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack.length = 0;
}
function undo() {
    if (!undoStack.length) return;
    redoStack.push(JSON.stringify({ nodes: state.nodes, edges: state.edges }));
    const prev = JSON.parse(undoStack.pop());
    state.nodes = prev.nodes; state.edges = prev.edges;
    state.selection.clear(); requestRedraw(); persist();
}
function redo() {
    if (!redoStack.length) return;
    undoStack.push(JSON.stringify({ nodes: state.nodes, edges: state.edges }));
    const next = JSON.parse(redoStack.pop());
    state.nodes = next.nodes; state.edges = next.edges;
    state.selection.clear(); requestRedraw(); persist();
}

function getHybrid(key) {
    return hybrids.find(h => h.key === key) || hybrids[0] || DEFAULT_HYBRIDS[0];
}

function isMobileInteractionMode() {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(max-width: 768px), (hover: none) and (pointer: coarse)').matches;
}

function getSingleSelectedNode() {
    if (state.selection.size !== 1) return null;
    const id = [...state.selection][0];
    return state.nodes.find(n => n.id === id) || null;
}

function updateMobileActions() {
    if (!mobileActions) return;
    if (!isMobileInteractionMode() || (inspector && !inspector.hidden)) {
        mobileActions.hidden = true;
        return;
    }

    const n = getSingleSelectedNode();
    if (!n) {
        mobileActions.hidden = true;
        return;
    }

    const hasChildren = state.nodes.some(x => x.parentId === n.id);
    const status = n.status || 'todo';
    mobileActions.innerHTML = `
        <div class="cm-mobile-selection">
            <span class="cm-mobile-title">${escapeAttr(n.title || getHybrid(n.hybridKey).title || 'Secili')}</span>
            <span class="cm-mobile-status">${escapeAttr(STATUS_LABELS[status] || status)}</span>
        </div>
        <div class="cm-mobile-buttons">
            <button type="button" data-mobile-action="edit" title="Duzenle"><i class="fas fa-pen"></i><span>Duzenle</span></button>
            <button type="button" data-mobile-action="add" title="Alt is ekle"><i class="fas fa-circle-plus"></i><span>Alt is</span></button>
            <button type="button" data-mobile-action="status" title="Durum degistir"><i class="fas fa-circle-half-stroke"></i><span>Durum</span></button>
            ${hasChildren ? `<button type="button" data-mobile-action="toggle" title="Goster/Gizle"><i class="fas ${n.expanded ? 'fa-eye-slash' : 'fa-eye'}"></i><span>${n.expanded ? 'Gizle' : 'Goster'}</span></button>` : ''}
            <button type="button" data-mobile-action="duplicate" title="Kopyala"><i class="fas fa-copy"></i><span>Kopyala</span></button>
            <button type="button" data-mobile-action="delete" class="danger" title="Sil"><i class="fas fa-trash"></i><span>Sil</span></button>
        </div>
    `;
    mobileActions.hidden = false;
}

function bindMobileActions() {
    if (!canvas || mobileActions) return;
    mobileActions = document.createElement('div');
    mobileActions.className = 'casemap-mobile-actions';
    mobileActions.hidden = true;
    canvas.parentElement.appendChild(mobileActions);

    mobileActions.addEventListener('click', (ev) => {
        const btn = ev.target.closest('[data-mobile-action]');
        if (!btn) return;
        const n = getSingleSelectedNode();
        if (!n) return;

        const action = btn.dataset.mobileAction;
        if (action === 'edit') {
            openInspector(n);
        } else if (action === 'add') {
            addSatellite(n);
        } else if (action === 'toggle') {
            n.expanded = !n.expanded;
            requestRedraw();
            persist();
        } else if (action === 'duplicate') {
            duplicateNode(n);
        } else if (action === 'delete') {
            deleteSelection();
        } else if (action === 'status') {
            const order = Object.keys(STATUS_LABELS);
            const idx = order.indexOf(n.status || 'todo');
            pushUndo();
            n.status = order[(idx + 1) % order.length];
            n.updatedAt = Date.now();
            requestRedraw();
            persist();
        }
        updateMobileActions();
    });

    window.addEventListener('resize', updateMobileActions);
}

// ---------- Coords ----------
function screenToWorld(sx, sy) {
    return { x: (sx - state.view.x) / state.view.zoom, y: (sy - state.view.y) / state.view.zoom };
}
function worldToScreen(wx, wy) {
    return { x: wx * state.view.zoom + state.view.x, y: wy * state.view.zoom + state.view.y };
}

function nodeAtWorld(wx, wy) {
    for (let i = state.nodes.length - 1; i >= 0; i--) {
        const n = state.nodes[i];
        if (isNodeHidden(n)) continue;
        const dx = wx - n.cx, dy = wy - n.cy;
        if (dx * dx + dy * dy <= n.r * n.r) return n;
    }
    return null;
}

// + ekle butonu (her düğümün altında alt iş eklemek için)
function addBtnAtScreen(sx, sy) {
    for (let i = state.nodes.length - 1; i >= 0; i--) {
        const n = state.nodes[i];
        if (isNodeHidden(n)) continue;
        // Yalnızca hover/seçili düğüm için + görünür → yalnızca onu test et
        if (!isMobileInteractionMode() && state.hoveredAddBtn !== n.id && state.hovered !== n.id && !state.selection.has(n.id)) continue;
        const p = worldToScreen(n.cx, n.cy + n.r + ADD_BTN_OFF);
        const dx = sx - p.x, dy = sy - p.y;
        const hitR = isMobileInteractionMode() ? 19 : 11;
        if (dx * dx + dy * dy <= hitR * hitR) return n;
    }
    return null;
}

// Bağlantı kulpu — düğümün dış halkasında, fareye bakan yön
function handleAtScreen(sx, sy) {
    for (let i = state.nodes.length - 1; i >= 0; i--) {
        const n = state.nodes[i];
        if (isNodeHidden(n)) continue;
        const cs = worldToScreen(n.cx, n.cy);
        const dx = sx - cs.x, dy = sy - cs.y;
        const dist = Math.hypot(dx, dy);
        const ringR = n.r * state.view.zoom;
        // dış halka 6px kalınlığında
        if (dist >= ringR - 1 && dist <= ringR + 8) return n;
    }
    return null;
}

function isNodeHidden(n) {
    let cur = n;
    let depth = 0;
    while (cur && cur.parentId && depth < 32) {
        const p = state.nodes.find(x => x.id === cur.parentId);
        if (!p) break;
        if (p.expanded === false) return true;
        cur = p;
        depth++;
    }
    return false;
}

// ---------- Canvas sizing ----------
function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    cssW = rect.width; cssH = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(cssW * dpr));
    canvas.height = Math.max(1, Math.floor(cssH * dpr));
    requestRedraw();
}

// ---------- On-demand redraw ----------
let redrawScheduled = false;
function requestRedraw() {
    if (redrawScheduled) return;
    redrawScheduled = true;
    requestAnimationFrame(() => { redrawScheduled = false; draw(); });
}

function viewportWorld() {
    const tl = screenToWorld(0, 0);
    const br = screenToWorld(cssW, cssH);
    return { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y };
}

function draw() {
    if (!ctx) return;
    const z = state.view.zoom * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();
    ctx.setTransform(z, 0, 0, z, state.view.x * dpr, state.view.y * dpr);

    const vp = viewportWorld();
    const pad = 100;

    // 1a. Hibritler arası takım yıldızı bağlantıları (en altta)
    drawConstellation();

    // 1b. Yörünge halkaları (genişlemiş hibritler için)
    for (const n of state.nodes) {
        if (n.type !== 'hybrid' || n.expanded === false) continue;
        if (n.cx + 200 < vp.x - pad || n.cx - 200 > vp.x + vp.w + pad ||
            n.cy + 200 < vp.y - pad || n.cy - 200 > vp.y + vp.h + pad) continue;
        drawOrbit(n);
    }

    // 2. Edges (kenarlar)
    for (const e of state.edges) {
        const a = state.nodes.find(n => n.id === e.from);
        const b = state.nodes.find(n => n.id === e.to);
        if (!a || !b) continue;
        if (isNodeHidden(a) || isNodeHidden(b)) continue;
        if (!edgeInViewport(a, b, vp, pad)) continue;
        drawEdge(a, b, e, false);
    }

    // 3. Pending connect
    if (ix.mode === 'connect' && ix.connectFrom) {
        const a = state.nodes.find(n => n.id === ix.connectFrom);
        if (a) {
            const w = screenToWorld(ix.lastX, ix.lastY);
            const ghost = { id: '__g', cx: w.x, cy: w.y, r: 1 };
            drawEdge(a, ghost, { dashed: true }, true);
        }
    }

    // 4. Düğümler — z-order: arka uydular → gezegenler → ön uydular (3D depth)
    const backSubs = [], frontSubs = [], hyb = [], orphanSubs = [];
    for (const n of state.nodes) {
        if (isNodeHidden(n)) continue;
        if (n.cx + n.r < vp.x - pad || n.cx - n.r > vp.x + vp.w + pad ||
            n.cy + n.r < vp.y - pad || n.cy - n.r > vp.y + vp.h + pad) continue;
        if (n.type === 'hybrid') { hyb.push(n); continue; }
        if (n.parentId) {
            const p = state.nodes.find(x => x.id === n.parentId);
            if (p) {
                if (n.cy < p.cy) backSubs.push(n);
                else frontSubs.push(n);
                continue;
            }
        }
        orphanSubs.push(n);
    }
    for (const n of backSubs)   drawNode(n);
    for (const n of orphanSubs) drawNode(n);
    for (const n of hyb)        drawNode(n);
    for (const n of frontSubs)  drawNode(n);

    // 5. Marquee
    if (ix.mode === 'marquee' && ix.marqueeRect) {
        const r = ix.marqueeRect;
        ctx.save();
        ctx.fillStyle = 'rgba(99,102,241,0.10)';
        ctx.strokeStyle = 'rgba(99,102,241,0.85)';
        ctx.lineWidth = 1 / state.view.zoom;
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        ctx.restore();
    }

    if (emptyHint) emptyHint.style.display = state.nodes.length ? 'none' : '';
    if (zoomIndicator) zoomIndicator.textContent = Math.round(state.view.zoom * 100) + '%';
}

// Modern, sade arka plan — dünya koordinatlarına kilitli nokta-grid
// Pan/zoom sırasında zemin ile düğümler birlikte hareket eder; "kayma" hissi olmaz.
function starHash(x, y, seed) {
    let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 224682251);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function drawSpaceGlow(x, y, inner, outer, stops) {
    const g = ctx.createRadialGradient(x, y, inner, x, y, outer);
    for (const stop of stops) g.addColorStop(stop[0], stop[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawStarDot(x, y, radius, color, alpha, glow) {
    if (glow > 0) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, radius * glow);
        g.addColorStop(0, `rgba(${color}, ${alpha})`);
        g.addColorStop(0.38, `rgba(${color}, ${alpha * 0.32})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, radius * glow, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.fillStyle = `rgba(${color}, ${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.35, radius), 0, Math.PI * 2);
    ctx.fill();
}

function screenPxFromWorld(wx, wy) {
    return {
        x: (wx * state.view.zoom + state.view.x) * dpr,
        y: (wy * state.view.zoom + state.view.y) * dpr,
    };
}

function drawUnifiedSpaceBase(w, h, b) {
    const base = ctx.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, '#061123');
    base.addColorStop(0.46, '#07101f');
    base.addColorStop(1, '#03040c');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);

    const calm = ctx.createRadialGradient(w * 0.36, h * 0.28, 0, w * 0.36, h * 0.28, Math.max(w, h) * 0.88);
    calm.addColorStop(0, `rgba(14, 165, 233, ${0.10 + b * 0.05})`);
    calm.addColorStop(0.52, `rgba(59, 130, 246, ${0.030 + b * 0.02})`);
    calm.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = calm;
    ctx.fillRect(0, 0, w, h);

    const depth = ctx.createRadialGradient(w * 0.76, h * 0.76, 0, w * 0.76, h * 0.76, Math.max(w, h) * 0.82);
    depth.addColorStop(0, `rgba(109, 40, 217, ${0.08 + b * 0.04})`);
    depth.addColorStop(0.64, `rgba(88, 28, 135, ${0.030 + b * 0.02})`);
    depth.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = depth;
    ctx.fillRect(0, 0, w, h);
}

function drawWorldNebulaFields(w, h, b) {
    const vp = viewportWorld();
    const tile = 1450;
    const z = state.view.zoom;
    const boost = 1 + b * 0.55;
    const minI = Math.floor(vp.x / tile) - 1;
    const maxI = Math.ceil((vp.x + vp.w) / tile) + 1;
    const minJ = Math.floor(vp.y / tile) - 1;
    const maxJ = Math.ceil((vp.y + vp.h) / tile) + 1;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let j = minJ; j <= maxJ; j++) {
        for (let i = minI; i <= maxI; i++) {
            if (starHash(i, j, 1807) > 0.48) continue;
            const wx = i * tile + (starHash(i, j, 1811) - 0.5) * tile * 0.72;
            const wy = j * tile + (starHash(i, j, 1817) - 0.5) * tile * 0.72;
            const p = screenPxFromWorld(wx, wy);
            const radius = clamp((620 + starHash(i, j, 1823) * 520) * z * dpr, 260 * dpr, 920 * dpr);
            const hue = starHash(i, j, 1829);
            const core = hue > 0.58 ? '168, 85, 247' : '14, 165, 233';
            const outer = hue > 0.58 ? '59, 130, 246' : '56, 189, 248';
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
            g.addColorStop(0, `rgba(${core}, ${0.080 * boost})`);
            g.addColorStop(0.42, `rgba(${outer}, ${0.034 * boost})`);
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, w, h);
        }
    }
    ctx.restore();
}

function drawWorldStarLayer(layer, b) {
    const vp = viewportWorld();
    const z = state.view.zoom;
    const step = layer.step;
    const minI = Math.floor(vp.x / step) - 1;
    const maxI = Math.ceil((vp.x + vp.w) / step) + 1;
    const minJ = Math.floor(vp.y / step) - 1;
    const maxJ = Math.ceil((vp.y + vp.h) / step) + 1;
    const alphaBoost = 1 + b * 0.6;

    for (let j = minJ; j <= maxJ; j++) {
        for (let i = minI; i <= maxI; i++) {
            if (starHash(i, j, layer.seed) > layer.density) continue;
            const wx = i * step + (starHash(i, j, layer.seed + 11) - 0.5) * step * 0.74;
            const wy = j * step + (starHash(i, j, layer.seed + 23) - 0.5) * step * 0.74;
            const p = screenPxFromWorld(wx, wy);
            if (p.x < -20 || p.y < -20 || p.x > canvas.width + 20 || p.y > canvas.height + 20) continue;

            const tone = starHash(i, j, layer.seed + 37);
            const color = tone > 0.76 ? layer.warmColor : layer.color;
            const radius = clamp(layer.radius * Math.sqrt(z) * dpr * (0.72 + tone * 0.54), layer.minRadius * dpr, layer.maxRadius * dpr);
            const alpha = Math.min(1, layer.alpha * (0.70 + tone * 0.46) * alphaBoost);
            drawStarDot(p.x, p.y, radius, color, alpha, layer.glow);
        }
    }
}

function drawWorldBrightStars(b) {
    drawWorldStarLayer({
        step: 330,
        density: 0.18,
        radius: 1.35,
        minRadius: 0.8,
        maxRadius: 2.6,
        alpha: 0.62,
        glow: 6.4,
        color: '226, 246, 255',
        warmColor: '221, 214, 254',
        seed: 2441,
    }, b);
}

function drawUnifiedVignette(w, h, b) {
    const max = Math.max(w, h);
    const vg = ctx.createRadialGradient(w * 0.5, h * 0.48, 0, w * 0.5, h * 0.5, max * 0.86);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(0.68, 'rgba(0,0,0,0.03)');
    vg.addColorStop(1, `rgba(0,0,0, ${0.56 - b * 0.12})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
}

function drawBackground() {
    const w = canvas.width;
    const h = canvas.height;
    const b = clamp(state.view.brightness || 0, 0, 1);

    drawUnifiedSpaceBase(w, h, b);
    drawWorldNebulaFields(w, h, b);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    drawWorldStarLayer({
        step: 44,
        density: 0.45,
        radius: 0.42,
        minRadius: 0.30,
        maxRadius: 0.85,
        alpha: 0.22,
        glow: 0,
        color: '148, 163, 184',
        warmColor: '203, 213, 225',
        seed: 1101,
    }, b);
    drawWorldStarLayer({
        step: 86,
        density: 0.38,
        radius: 0.70,
        minRadius: 0.42,
        maxRadius: 1.35,
        alpha: 0.34,
        glow: 2.1,
        color: '186, 230, 253',
        warmColor: '221, 214, 254',
        seed: 3107,
    }, b);
    drawWorldStarLayer({
        step: 172,
        density: 0.32,
        radius: 1.00,
        minRadius: 0.54,
        maxRadius: 1.90,
        alpha: 0.48,
        glow: 3.3,
        color: '125, 211, 252',
        warmColor: '244, 214, 255',
        seed: 6109,
    }, b);
    drawWorldBrightStars(b);
    ctx.restore();

    if (b > 0) {
        drawSpaceGlow(w * 0.5, h * 0.42, 0, Math.max(w, h) * 0.76, [
            [0, `rgba(255, 255, 255, ${0.080 * b})`],
            [0.48, `rgba(125, 211, 252, ${0.055 * b})`],
            [1, 'rgba(0,0,0,0)'],
        ]);
    }

    drawUnifiedVignette(w, h, b);
}

function drawConstellation() {
    const planets = state.nodes.filter(n => n.type === 'hybrid');
    if (planets.length < 2) return;
    ctx.save();
    ctx.lineWidth = 1 / state.view.zoom;
    ctx.setLineDash([3 / state.view.zoom, 5 / state.view.zoom]);
    for (let i = 0; i < planets.length; i++) {
        const a = planets[i];
        // en yakın 2 komşu
        const others = planets
            .map((b, j) => ({ b, j, d: Math.hypot(b.cx - a.cx, b.cy - a.cy) }))
            .filter(x => x.j !== i)
            .sort((x, y) => x.d - y.d)
            .slice(0, 2);
        for (const { b } of others) {
            const dx = b.cx - a.cx, dy = b.cy - a.cy;
            const len = Math.max(1, Math.hypot(dx, dy));
            const ux = dx / len, uy = dy / len;
            const ax = a.cx + ux * a.r, ay = a.cy + uy * a.r;
            const bx = b.cx - ux * b.r, by = b.cy - uy * b.r;
            // Çizgi rengi: gezegen renkleri arasında bir gradient
            const grad = ctx.createLinearGradient(ax, ay, bx, by);
            grad.addColorStop(0, hexA(getHybrid(a.hybridKey).color, 0.35));
            grad.addColorStop(1, hexA(getHybrid(b.hybridKey).color, 0.35));
            ctx.strokeStyle = grad;
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.stroke();
        }
    }
    ctx.restore();
}

function drawOrbit(planet) {
    const subs = state.nodes.filter(n => n.parentId === planet.id);
    if (!subs.length) return;
    const isDark = !document.body.classList.contains('light-theme');
    ctx.save();
    ctx.lineWidth = 1 / state.view.zoom;
    // Yörünge yarıçapı — uyduların maksimum yatay mesafesinden
    let rx = 0;
    for (const s of subs) {
        const dx = Math.abs(s.cx - planet.cx);
        if (dx > rx) rx = dx;
    }
    if (rx < planet.r + 30) rx = planet.r + ORBIT_GAP;
    const ry = rx * ELLIPSE_RAT;
    // Arka yarı — hafif solgun
    ctx.strokeStyle = isDark ? 'rgba(186,230,253,0.10)' : 'rgba(15,23,42,0.06)';
    ctx.setLineDash([3 / state.view.zoom, 5 / state.view.zoom]);
    ctx.beginPath();
    ctx.ellipse(planet.cx, planet.cy, rx, ry, 0, Math.PI, Math.PI * 2);
    ctx.stroke();
    // Ön yarı — daha belirgin
    ctx.strokeStyle = isDark ? 'rgba(186,230,253,0.22)' : 'rgba(15,23,42,0.12)';
    ctx.beginPath();
    ctx.ellipse(planet.cx, planet.cy, rx, ry, 0, 0, Math.PI);
    ctx.stroke();
    ctx.restore();
}

function drawEdge(a, b, e, isPending) {
    // Çevrenden çevrene bezier
    const dx0 = b.cx - a.cx, dy0 = b.cy - a.cy;
    const len = Math.max(1, Math.hypot(dx0, dy0));
    const ux = dx0 / len, uy = dy0 / len;
    const ax = a.cx + ux * a.r, ay = a.cy + uy * a.r;
    const bx = b.cx - ux * (b.r || 0), by = b.cy - uy * (b.r || 0);
    const ctrlOff = Math.min(160, len * 0.35);
    const cax = ax + ux * ctrlOff - uy * 18;
    const cay = ay + uy * ctrlOff + ux * 18;
    const cbx = bx - ux * ctrlOff - uy * 18;
    const cby = by - uy * ctrlOff + ux * 18;

    ctx.save();
    ctx.lineWidth = 2 / state.view.zoom;
    ctx.strokeStyle = e.color || (isPending ? 'rgba(186,230,253,0.90)' : 'rgba(148,183,218,0.78)');
    if (e.dashed || isPending) ctx.setLineDash([6 / state.view.zoom, 5 / state.view.zoom]);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.bezierCurveTo(cax, cay, cbx, cby, bx, by);
    ctx.stroke();
    if (!isPending) {
        ctx.setLineDash([]);
        // ok başı b yönünde
        const ah = 8 / state.view.zoom;
        const ang = Math.atan2(by - cby, bx - cbx);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx - ah * Math.cos(ang - 0.4), by - ah * Math.sin(ang - 0.4));
        ctx.lineTo(bx - ah * Math.cos(ang + 0.4), by - ah * Math.sin(ang + 0.4));
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();
}

function drawNode(n) {
    const h = getHybrid(n.hybridKey);
    const isHybrid = n.type === 'hybrid';
    const isDark = !document.body.classList.contains('light-theme');
    const selected = state.selection.has(n.id);
    const matched = state.searchTerm && (
        ((n.title || '').toLowerCase().includes(state.searchTerm)) ||
        ((n.note || '').toLowerCase().includes(state.searchTerm))
    );

    // 2.5D depth: arka uydulara solma + küçülme
    let depthScale = 1, depthAlpha = 1;
    if (!isHybrid && n.parentId) {
        const p = state.nodes.find(x => x.id === n.parentId);
        if (p) {
            // y < p.cy → arka, y > p.cy → ön
            const rel = (n.cy - p.cy) / Math.max(1, n.r * 4);
            const front = clamp(0.5 + rel * 0.6, 0, 1);
            depthScale = 0.85 + 0.3 * front;
            depthAlpha = 0.7 + 0.3 * front;
        }
    }
    // Drag/seçim pop
    const popScale = (ix.mode === 'drag' && state.selection.has(n.id)) ? 1.06 : 1;
    const r = n.r * depthScale * popScale;

    ctx.save();
    ctx.globalAlpha = depthAlpha;

    // 1. Eliptik gölge (zemine düşen)
    ctx.fillStyle = `rgba(0,0,0,${0.42 * depthAlpha})`;
    ctx.beginPath();
    ctx.ellipse(n.cx + r * 0.12, n.cy + r * 1.05, r * 0.78, r * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. Glow halkası
    const glowR = r + (isHybrid ? 9 : 7);
    const grad = ctx.createRadialGradient(n.cx, n.cy, r * 0.2, n.cx, n.cy, glowR);
    grad.addColorStop(0, hexA(h.color, isHybrid ? 0.32 : 0.16));
    grad.addColorStop(1, hexA(h.color, 0));
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(n.cx, n.cy, glowR, 0, Math.PI * 2); ctx.fill();

    // 3. Gövde gradient (küre yüzeyi) - ışık sol-üstten
    const lx = n.cx - r * 0.45, ly = n.cy - r * 0.50;
    const surf = ctx.createRadialGradient(lx, ly, r * 0.08, n.cx, n.cy, r);
    if (isHybrid) {
        surf.addColorStop(0,    lighten(h.color, 0.55));
        surf.addColorStop(0.45, h.color);
        surf.addColorStop(1,    darken(h.color, 0.55));
    } else {
        const base = lighten(h.color, 0.10);
        surf.addColorStop(0,    isDark ? lighten(base, 0.4) : '#ffffff');
        surf.addColorStop(0.55, isDark ? darken(base, 0.55) : darken(base, 0.05));
        surf.addColorStop(1,    isDark ? '#04060f'         : darken(base, 0.35));
    }
    ctx.fillStyle = surf;
    ctx.beginPath(); ctx.arc(n.cx, n.cy, r, 0, Math.PI * 2); ctx.fill();

    // 4. Meridyen + ekvator (3D rotasyon hissi) — sadece hibritlerde, zoom yeterse
    if (isHybrid && state.view.zoom > 0.5) {
        ctx.save();
        ctx.lineWidth = 1 / state.view.zoom;
        ctx.strokeStyle = 'rgba(255,255,255,0.10)';
        // ekvator
        ctx.beginPath();
        ctx.ellipse(n.cx, n.cy, r, r * 0.28, 0, 0, Math.PI * 2);
        ctx.stroke();
        // meridyen
        ctx.beginPath();
        ctx.ellipse(n.cx, n.cy, r * 0.32, r, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    // 5. Rim darkening (kenar koyulaşması — hacim hissi)
    const rim = ctx.createRadialGradient(n.cx, n.cy, r * 0.65, n.cx, n.cy, r);
    rim.addColorStop(0, 'rgba(0,0,0,0)');
    rim.addColorStop(1, 'rgba(0,0,0,0.50)');
    ctx.fillStyle = rim;
    ctx.beginPath(); ctx.arc(n.cx, n.cy, r, 0, Math.PI * 2); ctx.fill();

    // 6. Specular highlight (sol-üst parlama noktası)
    const spec = ctx.createRadialGradient(lx, ly, 0, lx, ly, r * 0.45);
    spec.addColorStop(0, 'rgba(255,255,255,0.65)');
    spec.addColorStop(0.4, 'rgba(255,255,255,0.18)');
    spec.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = spec;
    ctx.beginPath(); ctx.arc(n.cx, n.cy, r, 0, Math.PI * 2); ctx.fill();

    // 7. Dış halka (seçim/match/normal)
    ctx.lineWidth = (selected ? 3 : (matched ? 2.5 : 1.5)) / state.view.zoom;
    ctx.strokeStyle = selected ? '#a5b4fc'
                    : matched ? '#facc15'
                    : (isHybrid ? hexA(h.color, 0.9) : hexA(h.color, 0.5));
    ctx.beginPath(); ctx.arc(n.cx, n.cy, r, 0, Math.PI * 2); ctx.stroke();

    // 8. Status göstergesi
    const statusAng = -Math.PI * 0.25;
    const sx = n.cx + Math.cos(statusAng) * r;
    const sy = n.cy + Math.sin(statusAng) * r;
    ctx.fillStyle = STATUS_COLORS[n.status] || STATUS_COLORS.todo;
    ctx.beginPath(); ctx.arc(sx, sy, 5, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 1.5 / state.view.zoom;
    ctx.strokeStyle = isDark ? '#0b1020' : '#fff';
    ctx.stroke();

    // İçerik (başlık)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (isHybrid) {
        const title = (n.title || h.title).toUpperCase();
        const fitted = fitTextSize(ctx, title, r * 1.5, 18, 11, '800');
        ctx.font = `800 ${fitted.size}px Inter, system-ui, sans-serif`;
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillText(fitted.text, n.cx + 1, n.cy + 1);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(fitted.text, n.cx, n.cy);

        ctx.font = `700 9px Inter, sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.80)';
        ctx.fillText('HİBRİT', n.cx, n.cy + r * 0.55);

        const ch = state.nodes.some(x => x.parentId === n.id);
        if (ch) {
            ctx.font = `900 10px Inter, sans-serif`;
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.fillText(n.expanded ? '▾' : '▸', n.cx, n.cy + r - 6);
        }

        const showAddBtn = state.hoveredAddBtn === n.id || state.hovered === n.id || selected;
        if (showAddBtn) {
            const bx = n.cx, by = n.cy + r + ADD_BTN_OFF;
            ctx.fillStyle = h.color;
            ctx.beginPath(); ctx.arc(bx, by, 11, 0, Math.PI * 2); ctx.fill();
            ctx.lineWidth = 2 / state.view.zoom;
            ctx.strokeStyle = isDark ? '#0b1020' : '#fff';
            ctx.stroke();
            ctx.fillStyle = '#fff';
            ctx.font = `900 14px Inter, sans-serif`;
            ctx.fillText('+', bx, by + 1);
        }
    } else {
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(0,0,0,0.7)';
        ctx.shadowBlur = 4 / state.view.zoom;
        const title = n.title || 'Yeni iş';
        const fitted = fitTextSize(ctx, title, r * 1.6, 13, 9, '700');
        ctx.font = `700 ${fitted.size}px Inter, sans-serif`;
        ctx.fillText(fitted.text, n.cx, n.cy - 4);
        ctx.shadowBlur = 0;
        ctx.font = `700 8px Inter, sans-serif`;
        ctx.fillStyle = lighten(h.color, 0.3);
        ctx.fillText((h.title || '').toUpperCase().slice(0, 10), n.cx, n.cy + r * 0.5);

        // Çocukları varsa expand/collapse oku
        const ch = state.nodes.some(x => x.parentId === n.id);
        if (ch) {
            ctx.font = `900 9px Inter, sans-serif`;
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.fillText(n.expanded ? '▾' : '▸', n.cx, n.cy + r - 5);
        }

        // Hover/seçim → "+" alt iş ekleme butonu (uydulara da)
        const showAddBtn = state.hoveredAddBtn === n.id || state.hovered === n.id || selected;
        if (showAddBtn) {
            const bx = n.cx, by = n.cy + r + ADD_BTN_OFF;
            ctx.fillStyle = h.color;
            ctx.beginPath(); ctx.arc(bx, by, 10, 0, Math.PI * 2); ctx.fill();
            ctx.lineWidth = 2 / state.view.zoom;
            ctx.strokeStyle = isDark ? '#0b1020' : '#fff';
            ctx.stroke();
            ctx.fillStyle = '#fff';
            ctx.font = `900 13px Inter, sans-serif`;
            ctx.fillText('+', bx, by + 1);
        }
    }

    ctx.restore();
}

// metni daireye sığdırmak için font boyutu ayarı (basit)
function fitTextSize(c, text, maxW, maxSize, minSize, weight) {
    let s = maxSize;
    while (s >= minSize) {
        c.font = `${weight} ${s}px Inter, sans-serif`;
        if (c.measureText(text).width <= maxW) return { text, size: s };
        s -= 1;
    }
    // hala sığmadıysa kırp
    let truncated = text;
    while (truncated.length > 1) {
        truncated = truncated.slice(0, -1);
        if (c.measureText(truncated + '…').width <= maxW) return { text: truncated + '…', size: minSize };
    }
    return { text: '…', size: minSize };
}

function edgeInViewport(a, b, vp, pad) {
    const minX = Math.min(a.cx, b.cx) - pad, maxX = Math.max(a.cx, b.cx) + pad;
    const minY = Math.min(a.cy, b.cy) - pad, maxY = Math.max(a.cy, b.cy) + pad;
    return !(maxX < vp.x || maxY < vp.y || minX > vp.x + vp.w || minY > vp.y + vp.h);
}

// ---------- Renk yardımcıları ----------
function hexA(hex, a) {
    const c = hex.replace('#', '');
    const r = parseInt(c.length === 3 ? c[0]+c[0] : c.slice(0,2), 16);
    const g = parseInt(c.length === 3 ? c[1]+c[1] : c.slice(2,4), 16);
    const b = parseInt(c.length === 3 ? c[2]+c[2] : c.slice(4,6), 16);
    return `rgba(${r},${g},${b},${a})`;
}
function lighten(hex, amt) { return mixHex(hex, '#ffffff', amt); }
function darken(hex, amt)  { return mixHex(hex, '#000000', amt); }
function mixHex(a, b, t) {
    const pa = a.replace('#',''), pb = b.replace('#','');
    const ra = parseInt(pa.slice(0,2),16), ga = parseInt(pa.slice(2,4),16), ba = parseInt(pa.slice(4,6),16);
    const rb = parseInt(pb.slice(0,2),16), gb = parseInt(pb.slice(2,4),16), bb = parseInt(pb.slice(4,6),16);
    const m = (x, y) => Math.round(x + (y - x) * t);
    const h = v => v.toString(16).padStart(2, '0');
    return '#' + h(m(ra,rb)) + h(m(ga,gb)) + h(m(ba,bb));
}

// ---------- Mutations ----------
function addNode(opts) {
    pushUndo();
    const isHybrid = opts.type === 'hybrid';
    const n = migrateNode({
        id: uid(),
        type: opts.type || 'sub',
        title: opts.title || '',
        hybridKey: opts.hybridKey || hybrids[0].key,
        cx: opts.cx ?? 0, cy: opts.cy ?? 0,
        r: opts.r || (isHybrid ? HYBRID_R : SUB_R),
        status: opts.status || 'todo',
        note: opts.note || '',
        parentId: opts.parentId || null,
        expanded: isHybrid ? true : undefined,
        createdAt: Date.now(), updatedAt: Date.now(),
    });
    state.nodes.push(n);
    state.selection.clear(); state.selection.add(n.id);
    updateMobileActions();
    requestRedraw(); persist();
    return n;
}

function addSatellite(parent) {
    const existing = state.nodes.filter(x => x.parentId === parent.id);
    const idx = existing.length;
    const total = Math.max(idx + 1, 6);
    const angle = (idx / total) * Math.PI * 2;
    // Yörünge yarıçapı parent boyutuna oranla; alt nesilde uydu küçülür
    const childR = Math.max(18, parent.r * 0.55);
    const orbitR = parent.r + Math.max(40, childR + 22);
    const sub = addNode({
        type: 'sub',
        hybridKey: parent.hybridKey,
        title: 'Yeni iş',
        cx: parent.cx + Math.cos(angle) * orbitR,
        cy: parent.cy + Math.sin(angle) * orbitR * ELLIPSE_RAT,
        parentId: parent.id,
        r: childR,
    });
    state.edges.push({ id: uid(), from: parent.id, to: sub.id, dashed: false });
    if (parent.expanded === false) parent.expanded = true;
    requestRedraw(); persist();
    return sub;
}

function deleteSelection() {
    if (!state.selection.size) return;
    pushUndo();
    // Hibrit silinince uyduları da sil
    const toDelete = new Set(state.selection);
    let added = true;
    while (added) {
        added = false;
        for (const n of state.nodes) {
            if (n.parentId && toDelete.has(n.parentId) && !toDelete.has(n.id)) {
                toDelete.add(n.id); added = true;
            }
        }
    }
    state.nodes = state.nodes.filter(n => !toDelete.has(n.id));
    state.edges = state.edges.filter(e => !toDelete.has(e.from) && !toDelete.has(e.to));
    state.selection.clear();
    updateMobileActions();
    requestRedraw(); persist();
}

function addEdge(fromId, toId) {
    if (fromId === toId) return;
    if (state.edges.some(e => e.from === fromId && e.to === toId)) return;
    pushUndo();
    state.edges.push({ id: uid(), from: fromId, to: toId });
    requestRedraw(); persist();
}

// ---------- Pointer ----------
function onWheel(ev) {
    ev.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
    const factor = ev.deltaY < 0 ? 1.12 : 1 / 1.12;
    const oldZ = state.view.zoom;
    const newZ = clamp(oldZ * factor, 0.2, 3);
    if (newZ === oldZ) return;

    const anchor = screenToWorld(mx, my);
    state.view.zoom = newZ;
    state.view.x = mx - anchor.x * newZ;
    state.view.y = my - anchor.y * newZ;
    requestRedraw(); persistViewSoon();
}

function onPointerDown(ev) {
    canvas.setPointerCapture(ev.pointerId);
    const rect = canvas.getBoundingClientRect();
    const sx = ev.clientX - rect.left, sy = ev.clientY - rect.top;
    ix.startX = ix.lastX = sx; ix.startY = ix.lastY = sy;
    ix.moved = false;
    pendingPanDx = 0;
    pendingPanDy = 0;
    hideContextMenu();

    if (ev.button === 2) {
        const w = screenToWorld(sx, sy);
        const n = nodeAtWorld(w.x, w.y);
        if (n && !state.selection.has(n.id)) { state.selection.clear(); state.selection.add(n.id); }
        updateMobileActions();
        showContextMenu(ev.clientX, ev.clientY, n);
        ev.preventDefault();
        requestRedraw();
        return;
    }
    if (ev.button === 1) { ix.mode = 'pan'; return; }

    // önce + butonu
    const addOn = addBtnAtScreen(sx, sy);
    if (addOn) {
        addSatellite(addOn);
        ix.mode = 'idle';
        return;
    }
    // sonra connect halkası
    const handleNode = handleAtScreen(sx, sy);
    if (handleNode) {
        // halka tıklaması: dış kenarsa connect, iç ise drag
        const cs = worldToScreen(handleNode.cx, handleNode.cy);
        const dist = Math.hypot(sx - cs.x, sy - cs.y);
        const ringR = handleNode.r * state.view.zoom;
        if (dist >= ringR - 1 && dist <= ringR + 8 && ev.shiftKey) {
            ix.mode = 'connect';
            ix.connectFrom = handleNode.id;
            return;
        }
    }

    const w = screenToWorld(sx, sy);
    const node = nodeAtWorld(w.x, w.y);
    if (node) {
        if (!ev.shiftKey && !state.selection.has(node.id)) state.selection.clear();
        state.selection.add(node.id);
        updateMobileActions();
        ix.mode = 'drag';
        ix.pressNodeId = node.id;
        ix.dragOffsets = new Map();
        // Sürüklenen + tüm alt soyağacı (recursive)
        const movers = new Set(state.selection);
        const collectDescendants = (id) => {
            for (const s of state.nodes) {
                if (s.parentId === id && !movers.has(s.id)) {
                    movers.add(s.id);
                    collectDescendants(s.id);
                }
            }
        };
        for (const id of [...state.selection]) collectDescendants(id);
        for (const id of movers) {
            const nn = state.nodes.find(x => x.id === id);
            if (nn) ix.dragOffsets.set(id, { dx: nn.cx - w.x, dy: nn.cy - w.y });
        }
        requestRedraw();
        return;
    }

    if (ev.shiftKey || ev.altKey) {
        ix.mode = 'marquee';
        ix.marqueeRect = { x: w.x, y: w.y, w: 0, h: 0 };
    } else {
        if (state.selection.size) { state.selection.clear(); updateMobileActions(); requestRedraw(); }
        ix.mode = 'pan';
    }
}

let movePending = false;
let pendingPanDx = 0;
let pendingPanDy = 0;
function onPointerMove(ev) {
    const rect = canvas.getBoundingClientRect();
    const sx = ev.clientX - rect.left, sy = ev.clientY - rect.top;
    const dx = sx - ix.lastX;
    const dy = sy - ix.lastY;
    ix.lastX = sx; ix.lastY = sy;

    if (Math.abs(sx - ix.startX) + Math.abs(sy - ix.startY) > 3) ix.moved = true;

    if (ix.mode === 'idle') {
        const addOn = addBtnAtScreen(sx, sy);
        const w = screenToWorld(sx, sy);
        const n = addOn || nodeAtWorld(w.x, w.y);
        const newAdd = addOn ? addOn.id : null;
        const newHover = n ? n.id : null;
        let cursor = 'default';
        if (addOn) cursor = 'pointer';
        else if (n) cursor = (ev.shiftKey ? 'crosshair' : 'grab');
        if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor;
        if (state.hovered !== newHover || state.hoveredAddBtn !== newAdd) {
            state.hovered = newHover; state.hoveredAddBtn = newAdd;
            requestRedraw();
        }
        return;
    }

    if (ix.mode === 'pan') {
        pendingPanDx += dx;
        pendingPanDy += dy;
    }

    if (movePending) return;
    movePending = true;
    requestAnimationFrame(() => {
        movePending = false;
        if (ix.mode === 'pan') {
            const panDx = pendingPanDx;
            const panDy = pendingPanDy;
            pendingPanDx = 0;
            pendingPanDy = 0;
            state.view.x += panDx;
            state.view.y += panDy;
        }
        if (ix.mode === 'drag' && ix.dragOffsets) {
            const w = screenToWorld(ix.lastX, ix.lastY);
            for (const [id, off] of ix.dragOffsets) {
                const n = state.nodes.find(x => x.id === id);
                if (n) { n.cx = w.x + off.dx; n.cy = w.y + off.dy; }
            }
        }
        if (ix.mode === 'marquee' && ix.marqueeRect) {
            const sw = screenToWorld(ix.startX, ix.startY);
            const cw = screenToWorld(ix.lastX, ix.lastY);
            ix.marqueeRect.x = Math.min(sw.x, cw.x);
            ix.marqueeRect.y = Math.min(sw.y, cw.y);
            ix.marqueeRect.w = Math.abs(cw.x - sw.x);
            ix.marqueeRect.h = Math.abs(cw.y - sw.y);
        }
        requestRedraw();
    });
}

function onPointerUp(ev) {
    try { canvas.releasePointerCapture(ev.pointerId); } catch (_) {}
    const rect = canvas.getBoundingClientRect();
    const sx = ev.clientX - rect.left, sy = ev.clientY - rect.top;

    if (ix.mode === 'pan') {
        if (pendingPanDx || pendingPanDy) {
            state.view.x += pendingPanDx;
            state.view.y += pendingPanDy;
            pendingPanDx = 0;
            pendingPanDy = 0;
        }
        if (ix.moved) persist();
    }

    if (ix.mode === 'connect' && ix.connectFrom) {
        const w = screenToWorld(sx, sy);
        const target = nodeAtWorld(w.x, w.y);
        if (target && target.id !== ix.connectFrom) addEdge(ix.connectFrom, target.id);
    }

    if (ix.mode === 'marquee' && ix.marqueeRect) {
        if (!ev.shiftKey) state.selection.clear();
        const r = ix.marqueeRect;
        for (const n of state.nodes) {
            if (isNodeHidden(n)) continue;
            if (n.cx >= r.x && n.cx <= r.x + r.w && n.cy >= r.y && n.cy <= r.y + r.h) {
                state.selection.add(n.id);
            }
        }
        updateMobileActions();
    }

    // Tek tık (hareketsiz) → çocuğu olan düğümlerde expand toggle
    if (ix.mode === 'drag' && !ix.moved && ix.pressNodeId) {
        const n = state.nodes.find(x => x.id === ix.pressNodeId);
        if (n && !isMobileInteractionMode()) {
            const hasChildren = state.nodes.some(x => x.parentId === n.id);
            if (hasChildren) n.expanded = !n.expanded;
        }
        updateMobileActions();
    }
    if (ix.mode === 'drag' && ix.moved) persist();

    ix.mode = 'idle';
    ix.connectFrom = null;
    ix.marqueeRect = null;
    ix.dragOffsets = null;
    ix.pressNodeId = null;
    ix.moved = false;
    requestRedraw();
}

function onDblClick(ev) {
    const rect = canvas.getBoundingClientRect();
    const sx = ev.clientX - rect.left, sy = ev.clientY - rect.top;
    const w = screenToWorld(sx, sy);
    const n = nodeAtWorld(w.x, w.y);
    if (n) openInspector(n);
    else {
        // boş alana çift tık → serbest düğüm ekle
        addNode({
            type: 'sub', title: 'Yeni not',
            hybridKey: hybrids[0].key,
            cx: w.x, cy: w.y,
        });
    }
}

// ---------- Context Menu ----------
function showContextMenu(clientX, clientY, node) {
    if (!ctxMenu) return;
    const items = [];
    if (node) {
        items.push({ label: 'Düzenle', icon: 'fa-pen', fn: () => openInspector(node) });
        items.push({ label: 'Alt İş Ekle', icon: 'fa-circle-plus', fn: () => addSatellite(node) });
        if (state.nodes.some(x => x.parentId === node.id)) {
            items.push({ label: node.expanded ? 'Çocukları Gizle' : 'Çocukları Göster',
                icon: node.expanded ? 'fa-eye-slash' : 'fa-eye',
                fn: () => { node.expanded = !node.expanded; requestRedraw(); persist(); }});
        }
        items.push({ label: 'Bağlantı (Shift+sürükle)', icon: 'fa-link',
            fn: () => { ix.mode = 'connect'; ix.connectFrom = node.id; }});
        items.push({ label: 'Kopyala', icon: 'fa-copy', fn: () => duplicateNode(node) });
        items.push({ label: 'Durum', icon: 'fa-circle-half-stroke', sub: Object.keys(STATUS_LABELS).map(s => ({
            label: STATUS_LABELS[s], fn: () => { pushUndo(); node.status = s; requestRedraw(); persist(); }
        }))});
        items.push({ separator: true });
        items.push({ label: 'Sil', icon: 'fa-trash', danger: true,
            fn: () => { state.selection.clear(); state.selection.add(node.id); deleteSelection(); }});
    } else {
        items.push({ label: 'Görünümü Sığdır', icon: 'fa-expand', fn: fitView });
        items.push({ label: 'Sıfırla', icon: 'fa-rotate-left',
            fn: () => { state.view = { x: cssW/2, y: cssH/2, zoom: 1 }; requestRedraw(); persist(); }});
    }
    ctxMenu.innerHTML = '';
    for (const it of items) {
        if (it.separator) {
            const s = document.createElement('div'); s.className = 'cm-ctx-sep'; ctxMenu.appendChild(s);
            continue;
        }
        const el = document.createElement('button');
        el.className = 'cm-ctx-item' + (it.danger ? ' danger' : '');
        el.innerHTML = `<i class="fas ${it.icon || 'fa-angle-right'}"></i><span>${it.label}</span>` +
                       (it.sub ? '<i class="fa-solid fa-angle-right cm-ctx-arrow"></i>' : '');
        if (it.sub) {
            const sm = document.createElement('div');
            sm.className = 'cm-ctx-sub';
            for (const ss of it.sub) {
                const sb = document.createElement('button');
                sb.className = 'cm-ctx-item';
                sb.innerHTML = `<span>${ss.label}</span>`;
                sb.onclick = (e) => { e.stopPropagation(); ss.fn(); hideContextMenu(); };
                sm.appendChild(sb);
            }
            el.appendChild(sm);
        } else {
            el.onclick = () => { it.fn(); hideContextMenu(); };
        }
        ctxMenu.appendChild(el);
    }
    ctxMenu.style.left = clientX + 'px';
    ctxMenu.style.top  = clientY + 'px';
    ctxMenu.hidden = false;
    requestAnimationFrame(() => {
        const r = ctxMenu.getBoundingClientRect();
        if (r.right > window.innerWidth) ctxMenu.style.left = (clientX - r.width) + 'px';
        if (r.bottom > window.innerHeight) ctxMenu.style.top = (clientY - r.height) + 'px';
    });
}
function hideContextMenu() { if (ctxMenu) ctxMenu.hidden = true; }

function duplicateNode(n) {
    pushUndo();
    const copy = { ...n, id: uid(), cx: n.cx + 30, cy: n.cy + 30,
        createdAt: Date.now(), updatedAt: Date.now() };
    state.nodes.push(copy);
    state.selection.clear(); state.selection.add(copy.id);
    updateMobileActions();
    requestRedraw(); persist();
}

// ---------- Inspector ----------
let inspectorBoundId = null;
function openInspector(n) {
    if (!inspector) return;
    inspectorBoundId = n.id;
    inspector.hidden = false;
    updateMobileActions();
    document.getElementById('cmInspTitle').value = n.title || '';
    document.getElementById('cmInspNote').value = n.note || '';
    const sel = document.getElementById('cmInspHybrid');
    sel.innerHTML = hybrids.map(h => `<option value="${h.key}">${h.title}</option>`).join('');
    sel.value = n.hybridKey;
    document.querySelectorAll('#cmInspStatus .cm-status-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.status === (n.status || 'todo'));
    });
}
function closeInspector() {
    inspectorBoundId = null;
    if (inspector) inspector.hidden = true;
    updateMobileActions();
}
function bindInspector() {
    document.getElementById('casemapInspectorClose').onclick = closeInspector;
    document.getElementById('cmInspTitle').addEventListener('input', (e) => {
        const n = state.nodes.find(x => x.id === inspectorBoundId); if (!n) return;
        n.title = e.target.value; n.updatedAt = Date.now(); updateMobileActions(); requestRedraw(); persist();
    });
    document.getElementById('cmInspNote').addEventListener('input', (e) => {
        const n = state.nodes.find(x => x.id === inspectorBoundId); if (!n) return;
        n.note = e.target.value; n.updatedAt = Date.now(); requestRedraw(); persist();
    });
    document.getElementById('cmInspHybrid').addEventListener('change', (e) => {
        const n = state.nodes.find(x => x.id === inspectorBoundId); if (!n) return;
        pushUndo(); n.hybridKey = e.target.value; updateMobileActions(); requestRedraw(); persist();
    });
    document.querySelectorAll('#cmInspStatus .cm-status-btn').forEach(b => {
        b.onclick = () => {
            const n = state.nodes.find(x => x.id === inspectorBoundId); if (!n) return;
            pushUndo(); n.status = b.dataset.status;
            document.querySelectorAll('#cmInspStatus .cm-status-btn').forEach(x =>
                x.classList.toggle('active', x === b));
            updateMobileActions(); requestRedraw(); persist();
        };
    });
    document.getElementById('cmInspDelete').onclick = () => {
        if (!inspectorBoundId) return;
        state.selection.clear(); state.selection.add(inspectorBoundId);
        deleteSelection(); closeInspector();
    };
    document.getElementById('cmInspDuplicate').onclick = () => {
        const n = state.nodes.find(x => x.id === inspectorBoundId); if (!n) return;
        duplicateNode(n);
    };
}

// ---------- Palette ----------
function renderPalette() {
    if (!paletteList) return;
    paletteList.innerHTML = '';
    for (const h of hybrids) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'casemap-palette-item';
        el.draggable = true;
        el.style.setProperty('--hy-color', h.color);
        el.dataset.key = h.key;
        el.innerHTML = `
            <span class="cm-pal-orb" style="background: radial-gradient(circle at 30% 30%, ${lighten(h.color, 0.4)}, ${h.color} 60%, ${darken(h.color, 0.4)});"></span>
            <span class="cm-pal-title">${h.title}</span>
            <span class="cm-pal-add" title="Haritaya ekle"><i class="fas fa-plus"></i></span>
        `;
        el.addEventListener('dragstart', (ev) => {
            ev.dataTransfer.setData('text/cm-hybrid', h.key);
            ev.dataTransfer.effectAllowed = 'copy';
        });
        el.addEventListener('dblclick', () => spawnHybridAtCenter(h.key));
        el.addEventListener('click', (e) => {
            if (!isMobileInteractionMode() || e.target.closest('.cm-pal-add')) return;
            spawnHybridAtCenter(h.key);
        });
        el.querySelector('.cm-pal-add').onclick = (e) => {
            e.stopPropagation(); spawnHybridAtCenter(h.key);
        };
        paletteList.appendChild(el);
    }
}

function spawnHybridAtCenter(key) {
    const w = screenToWorld(cssW / 2, cssH / 2);
    const h = getHybrid(key);
    addNode({ type: 'hybrid', hybridKey: key, title: h.title, cx: w.x, cy: w.y });
}

function bindCanvasDnd() {
    canvas.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    canvas.addEventListener('drop', (e) => {
        e.preventDefault();
        const key = e.dataTransfer.getData('text/cm-hybrid');
        if (!key) return;
        const rect = canvas.getBoundingClientRect();
        const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        const h = getHybrid(key);
        addNode({ type: 'hybrid', hybridKey: key, title: h.title, cx: w.x, cy: w.y });
    });
}

// ---------- Templates Modal ----------
function openTemplatesModal() {
    const modal = document.getElementById('casemapTemplatesModal');
    const list = document.getElementById('casemapTemplatesList');
    let working = JSON.parse(JSON.stringify(hybrids));

    const renderList = () => {
        list.innerHTML = '';
        working.forEach((h, idx) => {
            const row = document.createElement('div');
            row.className = 'cm-tpl-row';
            row.innerHTML = `
                <input type="color" value="${h.color}" class="cm-tpl-color" title="Renk">
                <input type="text" value="${escapeAttr(h.title)}" class="cm-tpl-title" placeholder="Başlık">
                <input type="text" value="${escapeAttr(h.icon)}" class="cm-tpl-icon" placeholder="fa-… ikon">
                <span class="cm-tpl-preview"><i class="fas ${escapeAttr(h.icon)}"></i></span>
                <button class="cm-tpl-up" title="Yukarı"><i class="fas fa-arrow-up"></i></button>
                <button class="cm-tpl-down" title="Aşağı"><i class="fas fa-arrow-down"></i></button>
                <button class="cm-tpl-del" title="Sil"><i class="fas fa-trash"></i></button>
            `;
            row.querySelector('.cm-tpl-color').oninput = (e) => { working[idx].color = e.target.value; };
            row.querySelector('.cm-tpl-title').oninput = (e) => { working[idx].title = e.target.value; };
            row.querySelector('.cm-tpl-icon').oninput  = (e) => {
                working[idx].icon = e.target.value;
                row.querySelector('.cm-tpl-preview').innerHTML = `<i class="fas ${escapeAttr(e.target.value)}"></i>`;
            };
            row.querySelector('.cm-tpl-up').onclick = () => {
                if (idx === 0) return;
                [working[idx - 1], working[idx]] = [working[idx], working[idx - 1]]; renderList();
            };
            row.querySelector('.cm-tpl-down').onclick = () => {
                if (idx === working.length - 1) return;
                [working[idx + 1], working[idx]] = [working[idx], working[idx + 1]]; renderList();
            };
            row.querySelector('.cm-tpl-del').onclick = () => {
                if (working.length <= 1) { alert('En az bir hibrit olmalı.'); return; }
                working.splice(idx, 1); renderList();
            };
            list.appendChild(row);
        });
    };
    renderList();

    document.getElementById('casemapTemplatesAdd').onclick = () => {
        working.push({
            key: 'CUSTOM_' + uid().toUpperCase(),
            title: 'Yeni Hibrit', color: '#6366f1', icon: 'fa-circle-nodes',
        });
        renderList();
    };
    const closeModal = () => { modal.hidden = true; document.removeEventListener('keydown', escHandler); };
    const escHandler = (e) => { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', escHandler);
    document.getElementById('casemapTemplatesSave').onclick = () => {
        for (const h of working) {
            if (!h.key) h.key = 'CUSTOM_' + uid().toUpperCase();
            if (!h.title) h.title = 'Hibrit';
            if (!h.color) h.color = '#6366f1';
            if (!h.icon) h.icon = 'fa-circle-nodes';
        }
        hybrids = working;
        persistHybrids();
        renderPalette();
        requestRedraw();
        closeModal();
    };
    modal.querySelectorAll('[data-close]').forEach(el => el.onclick = closeModal);
    modal.hidden = false;
}

function escapeAttr(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
}

// ---------- View ----------
function fitView() {
    const visible = state.nodes.filter(n => !isNodeHidden(n));
    if (!visible.length) {
        state.view = { x: cssW / 2, y: cssH / 2, zoom: 1 };
        requestRedraw(); persist(); return;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of visible) {
        if (n.cx - n.r < minX) minX = n.cx - n.r;
        if (n.cy - n.r < minY) minY = n.cy - n.r;
        if (n.cx + n.r > maxX) maxX = n.cx + n.r;
        if (n.cy + n.r > maxY) maxY = n.cy + n.r;
    }
    const pad = 80;
    const w = maxX - minX + pad * 2;
    const h = maxY - minY + pad * 2;
    const zoom = clamp(Math.min(cssW / w, cssH / h), 0.2, 2);
    state.view.zoom = zoom;
    state.view.x = (cssW - (maxX + minX) * zoom) / 2;
    state.view.y = (cssH - (maxY + minY) * zoom) / 2;
    requestRedraw(); persist();
}
function zoomBy(factor) {
    const oldZ = state.view.zoom;
    const newZ = clamp(oldZ * factor, 0.2, 3);
    const cx = cssW / 2, cy = cssH / 2;
    state.view.x = cx - (cx - state.view.x) * (newZ / oldZ);
    state.view.y = cy - (cy - state.view.y) * (newZ / oldZ);
    state.view.zoom = newZ;
    requestRedraw(); persist();
}

// ---------- Toolbar ----------
function bindToolbar() {
    toolbar.addEventListener('click', (ev) => {
        const btn = ev.target.closest('[data-action]');
        if (!btn) return;
        const a = btn.dataset.action;
        if (a === 'fit') fitView();
        else if (a === 'zoom-in') zoomBy(1.2);
        else if (a === 'zoom-out') zoomBy(1 / 1.2);
        else if (a === 'undo') undo();
        else if (a === 'redo') redo();
        else if (a === 'open-casemap-window') {
            if (window.isElectron && window.electronAPI?.openCaseMapWindow) {
                window.electronAPI.openCaseMapWindow();
            }
        }
        else if (a === 'export') exportJson();
        else if (a === 'import') document.getElementById('casemapImportFile').click();
    });
    document.getElementById('casemapImportFile').addEventListener('change', (ev) => {
        const f = ev.target.files && ev.target.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const data = JSON.parse(reader.result);
                if (!data || !Array.isArray(data.nodes)) throw new Error('invalid');
                pushUndo();
                state.nodes = data.nodes.map(migrateNode);
                state.edges = Array.isArray(data.edges) ? data.edges : [];
                if (data.view) state.view = data.view;
                state.selection.clear();
                fitView(); persist();
            } catch (e) { alert('Geçersiz dosya: ' + e.message); }
        };
        reader.readAsText(f);
        ev.target.value = '';
    });
    searchInput.addEventListener('input', () => {
        state.searchTerm = (searchInput.value || '').trim().toLowerCase();
        requestRedraw();
    });

    const bright = document.getElementById('casemapBrightness');
    if (bright) {
        bright.value = String(Math.round((state.view.brightness || 0) * 100));
        bright.addEventListener('input', () => {
            state.view.brightness = clamp((+bright.value || 0) / 100, 0, 1);
            requestRedraw(); persist();
        });
    }
}

function exportJson() {
    const data = JSON.stringify({
        version: 2, exportedAt: new Date().toISOString(),
        view: state.view, nodes: state.nodes, edges: state.edges, hybrids,
    }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `olay-haritasi-${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- Klavye ----------
function onKey(ev) {
    if (!isCaseMapVisible()) return;
    const tag = (ev.target && ev.target.tagName) || '';
    if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
    if (ev.ctrlKey || ev.metaKey) {
        if (ev.key === 'z' || ev.key === 'Z') { ev.preventDefault(); undo(); return; }
        if (ev.key === 'y' || ev.key === 'Y') { ev.preventDefault(); redo(); return; }
        if (ev.key === 'f' || ev.key === 'F') { ev.preventDefault(); searchInput.focus(); return; }
        if (ev.key === 'd' || ev.key === 'D') {
            ev.preventDefault();
            const arr = [...state.selection].map(id => state.nodes.find(n => n.id === id)).filter(Boolean);
            arr.forEach(duplicateNode);
            return;
        }
    }
    if (ev.key === 'Delete' || ev.key === 'Backspace') {
        if (state.selection.size) { ev.preventDefault(); deleteSelection(); }
    } else if (ev.key === 'h' || ev.key === 'H') {
        fitView();
    } else if (ev.key === 'f' || ev.key === 'F') {
        if (state.selection.size === 1) {
            const n = state.nodes.find(x => x.id === [...state.selection][0]);
            if (n) {
                state.view.zoom = 1;
                state.view.x = cssW / 2 - n.cx;
                state.view.y = cssH / 2 - n.cy;
                requestRedraw(); persist();
            }
        }
    } else if (ev.key === 'Escape') {
        hideContextMenu(); closeInspector();
    } else if (ev.key === ' ' && state.selection.size === 1) {
        // space = aç/kapa (çocuğu olan tüm düğümler)
        const n = state.nodes.find(x => x.id === [...state.selection][0]);
        if (n && state.nodes.some(x => x.parentId === n.id)) {
            ev.preventDefault(); n.expanded = !n.expanded; requestRedraw(); persist();
        }
    }
}

function isCaseMapVisible() {
    const tab = document.getElementById('todoTab');
    return tab && tab.classList.contains('active');
}

let ro;
function bindResize() {
    ro = new ResizeObserver(() => resizeCanvas());
    ro.observe(canvas.parentElement);
    window.addEventListener('resize', resizeCanvas);
}

// ---------- Init ----------
export function initializeCaseMap() {
    archiveLegacyTodos();
    loadState();

    root          = document.querySelector('.casemap-root');
    palette       = document.getElementById('casemapPalette');
    paletteList   = document.getElementById('casemapPaletteList');
    canvas        = document.getElementById('casemapCanvas');
    toolbar       = document.querySelector('.casemap-toolbar');
    inspector     = document.getElementById('casemapInspector');
    ctxMenu       = document.getElementById('casemapContextMenu');
    emptyHint     = document.getElementById('casemapEmptyHint');
    zoomIndicator = document.getElementById('casemapZoomIndicator');
    searchInput   = document.getElementById('casemapSearch');
    if (!canvas) return;

    ctx = canvas.getContext('2d', { alpha: false });

    renderPalette();
    bindCanvasDnd();
    bindToolbar();
    bindInspector();
    bindMobileActions();
    bindCrossWindowSync();

    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('dblclick', onDblClick);
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', (e) => {
        if (ctxMenu && !ctxMenu.hidden && !ctxMenu.contains(e.target)) hideContextMenu();
    });

    document.getElementById('casemapEditTemplatesBtn').onclick = openTemplatesModal;

    document.addEventListener('click', (e) => {
        const nav = e.target.closest('.nav-btn[data-tab="todo"]');
        if (nav) requestAnimationFrame(resizeCanvas);
    });

    bindResize();
    resizeCanvas();
    if (!state.nodes.length && state.view.zoom === 1 && !state.view.x && !state.view.y) {
        state.view.x = cssW / 2;
        state.view.y = cssH / 2;
    }
    requestRedraw();
    console.log('🪐 Olay Haritası (planetary) hazır');
}
