// ==================== GOREV AVCISI - Shooter Plus (canvas) ====================
// Case map nodes and todo text become enemy labels. This module is intentionally
// self-contained: no persistent inventory/state is written outside the game run.

import AppState, { getTodos } from './state.js';
import { getCaseMapSnapshot } from './casemap.js';

const STATUS_TINT = {
    todo: '#94a3b8',
    doing: '#3b82f6',
    done: '#10b981',
    blocked: '#ef4444',
};

const LEVELS = [
    {
        name: 'Baslangic Alani',
        tint: '#38bdf8',
        accent: '#22d3ee',
        goal: 900,
        spawn: ['chaser', 'splitter'],
        boss: 'Proje Core',
        bossHp: 24,
        bg: ['#07111f', '#0a1630', '#10143a'],
    },
    {
        name: 'Hiz Koridoru',
        tint: '#fbbf24',
        accent: '#fb923c',
        goal: 1300,
        spawn: ['chaser', 'splitter', 'striker'],
        boss: 'Deadline Surucusu',
        bossHp: 32,
        bg: ['#160d05', '#241106', '#33160a'],
    },
    {
        name: 'Ates Hatti',
        tint: '#fb7185',
        accent: '#f43f5e',
        goal: 1700,
        spawn: ['striker', 'chaser', 'tank'],
        boss: 'Bildirim Kulesi',
        bossHp: 42,
        bg: ['#170612', '#26091a', '#330a20'],
    },
    {
        name: 'Zirh Dokumu',
        tint: '#a78bfa',
        accent: '#8b5cf6',
        goal: 2200,
        spawn: ['tank', 'striker', 'splitter'],
        boss: 'Engel Titan',
        bossHp: 56,
        bg: ['#0f0920', '#180d31', '#231147'],
    },
    {
        name: 'Final Senkron',
        tint: '#34d399',
        accent: '#10b981',
        goal: 2800,
        spawn: ['chaser', 'striker', 'tank', 'splitter'],
        boss: 'Sonsuz Is Akisi',
        bossHp: 72,
        bg: ['#061a17', '#09251e', '#0f3328'],
    },
];

const WEAPONS = {
    blaster: {
        label: 'Hizli Blaster',
        short: 'BLASTER',
        color: '#38bdf8',
        fireCd: 0.105,
        power: 1,
    },
    spread: {
        label: 'Uclu Atis',
        short: 'UC ATIS',
        color: '#fbbf24',
        fireCd: 0.18,
        power: 0.85,
    },
    rocket: {
        label: 'Roket',
        short: 'ROKET',
        color: '#fb7185',
        fireCd: 0.42,
        power: 3,
    },
};

const ENEMY_TYPES = {
    chaser: {
        label: 'Takipci',
        hp: 2,
        w: 54,
        h: 28,
        score: 110,
        color: '#38bdf8',
    },
    striker: {
        label: 'Atici',
        hp: 3,
        w: 64,
        h: 30,
        score: 150,
        color: '#fb7185',
    },
    tank: {
        label: 'Zirhli',
        hp: 7,
        w: 82,
        h: 38,
        score: 260,
        color: '#a78bfa',
    },
    splitter: {
        label: 'Bolunen',
        hp: 2,
        w: 58,
        h: 28,
        score: 135,
        color: '#34d399',
    },
    shard: {
        label: 'Parca',
        hp: 1,
        w: 34,
        h: 22,
        score: 55,
        color: '#6ee7b7',
    },
};

let overlay, canvas, ctx;
let hudScore, hudWave, hudLevel, hudLives, hudArmor, hudWeapon, hudInventory, hudCombo, hudBoss;
let startPanel, gameOverEl, finalScoreEl, finalLevelEl, bannerEl, bannerTitleEl, bannerSubEl;
let rafId = null;
let resizeObs = null;
let keyHandler = null;
let audioCtx = null;
let pointerDown = false;
let touchFireDown = false;
let selectedWeapon = 'blaster';

const INVENTORY_SKILLS = {
    1: { key: 'nova', label: 'Nova' },
    2: { key: 'repair', label: 'Tamir' },
    3: { key: 'drone', label: 'Drone' },
    4: { key: 'slow', label: 'Zaman' },
};

const game = {
    phase: 'idle',
    t: 0,
    w: 0,
    h: 0,
    dpr: 1,
    score: 0,
    level: 1,
    wave: 1,
    levelScore: 0,
    levelState: 'run',
    levelBannerT: 0,
    spawnAcc: 0,
    enemyFireAcc: 0,
    scroll: 0,
    shake: 0,
    flash: 0,
    combo: 0,
    comboT: 0,
    difficulty: 1,
    player: null,
    bullets: [],
    enemyBullets: [],
    enemies: [],
    particles: [],
    powerups: [],
    trails: [],
    stars: [],
    pool: [],
    rng: (a, b) => a + Math.random() * (b - a),
};

function pick(arr) {
    return arr[(Math.random() * arr.length) | 0];
}

function labelText(text, max = 28) {
    const raw = String(text || '').trim() || 'Gorev';
    return raw.length > max ? `${raw.slice(0, max - 3)}...` : raw;
}

function currentLevel() {
    return LEVELS[Math.min(game.level, LEVELS.length) - 1] || LEVELS[LEVELS.length - 1];
}

function endlessBonus() {
    return Math.max(0, game.level - LEVELS.length);
}

function collectSpawnPool() {
    const snap = getCaseMapSnapshot();
    const hybrids = Array.isArray(snap.hybrids) ? snap.hybrids : [];
    const nodes = Array.isArray(snap.nodes) ? snap.nodes : [];
    const pool = [];
    const hybridByKey = Object.fromEntries(hybrids.map(h => [h.key, h]));

    for (const n of nodes) {
        const h = hybridByKey[n.hybridKey];
        const label = (n.title || h?.title || 'Hibrit').trim() || 'Hibrit';
        pool.push({
            kind: 'hibrit',
            label: label.slice(0, 26),
            color: h?.color || STATUS_TINT[n.status] || '#22c55e',
        });
    }

    for (const h of hybrids) {
        pool.push({
            kind: 'hibrit',
            label: (h.title || h.key || 'Hibrit').slice(0, 26),
            color: h.color || '#6366f1',
        });
    }

    const todos = getTodos() || [];
    for (const t of todos) {
        const raw = (t.text || t.title || t.name || '').trim();
        if (!raw) continue;
        pool.push({
            kind: 'gorev',
            label: raw.slice(0, 30),
            color: '#c4b5fd',
        });
    }

    if (!pool.length) {
        pool.push(
            { kind: 'hibrit', label: 'ARAZI', color: '#22c55e' },
            { kind: 'hibrit', label: 'PROJE', color: '#8b5cf6' },
            { kind: 'gorev', label: 'Yapilacak is', color: '#a78bfa' }
        );
    }
    return pool;
}

function initStars() {
    game.stars = [];
    const layers = [
        { n: 48, z: 0.35, s: 0.55 },
        { n: 58, z: 0.65, s: 1.05 },
        { n: 42, z: 1, s: 1.8 },
    ];
    for (const L of layers) {
        for (let i = 0; i < L.n; i++) {
            game.stars.push({
                x: Math.random() * game.w,
                y: Math.random() * game.h,
                z: L.z,
                sp: L.s * (0.85 + Math.random() * 0.45),
            });
        }
    }
}

function resize() {
    if (!canvas || !overlay || overlay.hidden) return;
    const rect = canvas.parentElement.getBoundingClientRect();
    const w = Math.max(320, Math.floor(rect.width));
    const h = Math.max(400, Math.floor(rect.height));
    game.dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(w * game.dpr);
    canvas.height = Math.floor(h * game.dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(game.dpr, 0, 0, game.dpr, 0, 0);
    game.w = w;
    game.h = h;
    if (game.player) {
        game.player.x = Math.max(24, Math.min(game.w - 24, game.player.x || w / 2));
        game.player.y = h - 58;
    }
    initStars();
}

function beep(freq, duration, vol = 0.035, type = 'square') {
    if (!AppState.soundEnabled) return;
    try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        audioCtx = audioCtx || new AC();
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = type;
        o.frequency.value = freq;
        g.gain.setValueAtTime(vol, audioCtx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        o.connect(g);
        g.connect(audioCtx.destination);
        o.start();
        o.stop(audioCtx.currentTime + duration);
    } catch (_) { /* audio is optional */ }
}

function showLevelBanner(title, subtitle) {
    game.levelBannerT = 2.2;
    if (!bannerEl) return;
    bannerEl.hidden = false;
    bannerTitleEl.textContent = title;
    bannerSubEl.textContent = subtitle;
}

function hasTemporaryWeapon(p = game.player) {
    return !!p && (p.spreadT > 0 || p.rapidT > 0 || p.rocketT > 0);
}

function syncTouchControls() {
    if (!overlay) return;
    const p = game.player;
    const canUseSkills = game.phase === 'play' && !!p;
    for (const btn of overlay.querySelectorAll('[data-tb-skill]')) {
        const skill = INVENTORY_SKILLS[btn.dataset.tbSkill];
        const count = skill && p?.inventory ? p.inventory[skill.key] || 0 : 0;
        const countEl = btn.querySelector('.tb-touch-count');
        if (countEl) countEl.textContent = String(count);
        btn.disabled = !canUseSkills || count <= 0 || p.skillCd > 0;
        btn.classList.toggle('ready', canUseSkills && count > 0 && p.skillCd <= 0);
    }
    for (const btn of overlay.querySelectorAll('[data-tb-weapon]')) {
        btn.classList.toggle('active', btn.dataset.tbWeapon === selectedWeapon);
    }
    const pauseBtn = document.getElementById('tbTouchPauseBtn');
    if (pauseBtn) {
        pauseBtn.disabled = game.phase !== 'play' && game.phase !== 'paused';
        pauseBtn.classList.toggle('paused', game.phase === 'paused');
        const icon = pauseBtn.querySelector('i');
        if (icon) {
            icon.className = game.phase === 'paused' ? 'fas fa-play' : 'fas fa-pause';
        }
    }
}

function updateHud() {
    const p = game.player;
    if (hudScore) hudScore.textContent = String(Math.floor(game.score));
    if (hudWave) hudWave.textContent = String(game.wave);
    if (hudLevel) hudLevel.textContent = game.level > LEVELS.length ? `S-${endlessBonus()}` : String(game.level);
    if (hudLives) hudLives.textContent = p ? String(p.lives) : '3';
    if (hudArmor) hudArmor.textContent = p ? String(p.armor) : '0';
    if (hudWeapon) hudWeapon.textContent = p ? WEAPONS[p.weapon].short : WEAPONS[selectedWeapon].short;
    if (hudInventory) {
        if (p?.inventory) {
            hudInventory.textContent = `N${p.inventory.nova} T${p.inventory.repair} D${p.inventory.drone} Z${p.inventory.slow}`;
        } else {
            hudInventory.textContent = 'N0 T0 D0 Z0';
        }
    }
    if (hudBoss) {
        const boss = game.enemies.find(e => e.boss);
        hudBoss.hidden = !boss;
        if (boss) hudBoss.textContent = `BOSS ${Math.max(0, boss.hp)}/${boss.maxHp}`;
    }
    if (hudCombo) {
        if (game.combo >= 2) {
            hudCombo.hidden = false;
            hudCombo.textContent = `x${game.combo} ZINCIR`;
        } else {
            hudCombo.hidden = true;
        }
    }
    syncTouchControls();
}

function resetRun() {
    const weapon = WEAPONS[selectedWeapon] ? selectedWeapon : 'blaster';
    game.t = 0;
    game.score = 0;
    game.level = 1;
    game.wave = 1;
    game.levelScore = 0;
    game.levelState = 'run';
    game.levelBannerT = 0;
    game.spawnAcc = 0;
    game.enemyFireAcc = 0;
    game.scroll = 0;
    game.shake = 0;
    game.flash = 0;
    game.combo = 0;
    game.comboT = 0;
    game.difficulty = 1;
    game.bullets = [];
    game.enemyBullets = [];
    game.enemies = [];
    game.particles = [];
    game.powerups = [];
    game.trails = [];
    game.player = {
        x: game.w / 2,
        y: game.h - 58,
        w: 30,
        h: 24,
        lives: 3,
        armor: weapon === 'rocket' ? 1 : 0,
        shield: weapon === 'spread' ? 1 : 0,
        invuln: 1.1,
        weapon,
        spreadT: 0,
        rapidT: 0,
        rocketT: 0,
        droneT: 0,
        slowT: 0,
        skillCd: 0,
        inventory: {
            nova: weapon === 'rocket' ? 1 : 0,
            repair: 1,
            drone: weapon === 'blaster' ? 1 : 0,
            slow: weapon === 'spread' ? 1 : 0,
        },
        fireCd: 0,
    };
    game.pool = collectSpawnPool();
    initStars();
    showLevelBanner('LEVEL 1', currentLevel().name);
    updateHud();
}

function makeEnemy(type, x, y, opts = {}) {
    const def = ENEMY_TYPES[type] || ENEMY_TYPES.chaser;
    const base = opts.base || pick(game.pool);
    const level = currentLevel();
    const hpMul = 1 + Math.max(0, game.level - 1) * 0.18 + endlessBonus() * 0.12;
    return {
        type,
        x,
        y,
        w: opts.w || def.w,
        h: opts.h || def.h,
        vx: opts.vx ?? game.rng(-0.35, 0.35),
        vy: opts.vy ?? (0.72 + game.difficulty * 0.18 + Math.random() * 0.38),
        hp: opts.hp || Math.max(1, Math.round(def.hp * hpMul)),
        maxHp: opts.hp || Math.max(1, Math.round(def.hp * hpMul)),
        score: opts.score || def.score,
        label: opts.label || base.label,
        kind: base.kind,
        color: opts.color || base.color || def.color || level.tint,
        accent: opts.accent || def.color || level.accent,
        homing: opts.homing ?? (type === 'chaser' ? 0.08 : 0.025),
        zig: Math.random() * Math.PI * 2,
        fireCd: type === 'striker' ? game.rng(1.0, 2.0) : 999,
        split: type === 'splitter',
        boss: false,
        hitT: 0,
    };
}

function spawnEnemy(type = null, opts = {}) {
    const level = currentLevel();
    const allowed = level.spawn || ['chaser'];
    const selectedType = type || pick(allowed);
    const def = ENEMY_TYPES[selectedType] || ENEMY_TYPES.chaser;
    const x = opts.x ?? game.rng(def.w / 2 + 10, game.w - def.w / 2 - 10);
    const y = opts.y ?? -46;
    game.enemies.push(makeEnemy(selectedType, x, y, opts));
}

function spawnBoss() {
    const level = currentLevel();
    const base = pick(game.pool);
    const hp = Math.round(level.bossHp * (1 + endlessBonus() * 0.3));
    game.enemies.push({
        type: 'boss',
        x: game.w / 2,
        y: -70,
        w: Math.min(250, game.w * 0.62),
        h: 64,
        vx: 1.5 + endlessBonus() * 0.12,
        vy: 0.48,
        hp,
        maxHp: hp,
        score: 850 + game.level * 130,
        label: `${level.boss || 'Final Canavar'}: ${labelText(base.label, 18)}`,
        kind: base.kind,
        color: level.tint,
        accent: level.accent,
        homing: 0,
        zig: 0,
        fireCd: 0.65,
        summonCd: 1.2,
        boss: true,
        entered: false,
        hitT: 0,
    });
    game.levelState = 'boss';
    showLevelBanner('FINAL CANAVAR', `${level.boss} gorev ve hibritlerle saldiriyor`);
    spawnFinalPack();
    beep(150, 0.12, 0.05, 'sawtooth');
    updateHud();
}

function spawnFinalPack() {
    const level = currentLevel();
    const count = game.level >= 4 ? 3 : 2;
    for (let i = 0; i < count; i++) {
        const side = i - (count - 1) / 2;
        spawnEnemy(pick(level.spawn), {
            x: game.w / 2 + side * 74,
            y: -30 - i * 18,
            base: pick(game.pool),
            hp: 2 + game.level,
            score: 90,
            vy: 0.72,
            homing: 0.06,
        });
    }
}

function spawnPowerup(x, y, forced = null) {
    if (!forced && Math.random() > 0.16) return;
    const kinds = ['armor', 'shield', 'rapid', 'spread', 'rocket', 'nova', 'repair', 'drone', 'slow'];
    game.powerups.push({
        x,
        y,
        kind: forced || pick(kinds),
        vy: 1.15,
        r: 11,
        t: 0,
    });
}

function explode(x, y, color, n = 14, power = 1) {
    for (let i = 0; i < n; i++) {
        const a = (Math.PI * 2 * i) / n + Math.random() * 0.45;
        const sp = game.rng(1.4, 4.9) * power;
        game.particles.push({
            x,
            y,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp,
            life: game.rng(0.45, 1),
            size: game.rng(2, 5),
            color,
        });
    }
}

function damagePlayer(amount = 1) {
    const p = game.player;
    if (!p || p.invuln > 0) return;
    if (p.shield > 0) {
        p.shield--;
        p.invuln = 0.65;
        game.shake = 10;
        game.flash = 0.18;
        beep(180, 0.06, 0.06);
        updateHud();
        return;
    }
    if (p.armor > 0) {
        p.armor = Math.max(0, p.armor - amount);
        p.invuln = 0.8;
        game.shake = 12;
        game.flash = 0.22;
        beep(140, 0.08, 0.06);
        updateHud();
        return;
    }
    p.lives -= amount;
    p.invuln = 1.0;
    game.shake = 16;
    game.flash = 0.28;
    explode(p.x, p.y, '#38bdf8', 18, 1.15);
    beep(95, 0.18, 0.06, 'sawtooth');
    if (p.lives <= 0) {
        game.phase = 'over';
        pointerDown = false;
        touchFireDown = false;
        if (gameOverEl) gameOverEl.hidden = false;
        if (finalScoreEl) finalScoreEl.textContent = String(Math.floor(game.score));
        if (finalLevelEl) finalLevelEl.textContent = game.level > LEVELS.length ? `Sonsuz ${endlessBonus()}` : String(game.level);
        stopLoop();
    }
    updateHud();
}

function splitEnemy(e) {
    if (!e.split || e.type === 'shard') return;
    for (const dir of [-1, 1]) {
        game.enemies.push(makeEnemy('shard', e.x + dir * 12, e.y, {
            label: e.label.slice(0, 18),
            color: e.color,
            vx: dir * game.rng(0.8, 1.4),
            vy: game.rng(1.0, 1.45),
            hp: 1,
            score: 45,
            homing: 0.05,
        }));
    }
}

function advanceLevel() {
    game.level++;
    game.wave++;
    game.levelScore = 0;
    game.levelState = 'run';
    game.spawnAcc = -0.8;
    game.enemyFireAcc = 0;
    game.difficulty = Math.min(5, game.difficulty + 0.28);
    game.enemyBullets = [];
    if (game.player) {
        game.player.armor = Math.min(4, game.player.armor + 1);
        game.player.shield = Math.min(3, game.player.shield + 1);
    }
    const title = game.level <= LEVELS.length ? `LEVEL ${game.level}` : `SONSUZ ${endlessBonus()}`;
    showLevelBanner(title, currentLevel().name);
    updateHud();
}

function killEnemy(e, idx) {
    const mult = 1 + Math.min(6, game.combo) * 0.12;
    const gained = e.score * mult * (0.8 + game.level * 0.16);
    game.score += gained;
    game.levelScore += gained;
    if (game.t - game.comboT < 2.25) game.combo++;
    else game.combo = 1;
    game.comboT = game.t;
    explode(e.x, e.y, e.color, e.boss ? 36 : 15, e.boss ? 1.35 : 1);
    if (!e.boss) splitEnemy(e);
    spawnPowerup(e.x, e.y, e.boss ? 'armor' : null);
    beep(e.boss ? 320 : 460, 0.045, 0.035);
    game.enemies.splice(idx, 1);

    if (e.boss) {
        advanceLevel();
    } else if (game.levelState === 'run' && game.levelScore >= currentLevel().goal && !game.enemies.some(x => x.boss)) {
        spawnBoss();
    }
    updateHud();
}

function addBullet(x, y, vx, vy, opts = {}) {
    game.bullets.push({
        x,
        y,
        vx,
        vy,
        r: opts.r || 3,
        damage: opts.damage || 1,
        color: opts.color || '#fef08a',
        rocket: !!opts.rocket,
        life: 1.8,
    });
}

function fire() {
    const p = game.player;
    const weapon = WEAPONS[p.weapon] || WEAPONS.blaster;
    const bx = p.x;
    const by = p.y - p.h / 2;

    if (p.weapon === 'spread' || p.spreadT > 0) {
        addBullet(bx, by, 0, -9.2, { damage: weapon.power, color: '#fef08a' });
        addBullet(bx - 8, by + 3, -1.35, -8.6, { damage: weapon.power, color: '#fde68a' });
        addBullet(bx + 8, by + 3, 1.35, -8.6, { damage: weapon.power, color: '#fde68a' });
    } else if (p.weapon === 'rocket' || p.rocketT > 0) {
        addBullet(bx, by, 0, -7.4, { r: 5, damage: weapon.power, color: '#fb7185', rocket: true });
    } else {
        addBullet(bx - 4, by, 0, -9.8, { damage: weapon.power, color: '#fef08a' });
        addBullet(bx + 4, by, 0, -9.8, { damage: weapon.power, color: '#fef08a' });
    }
    game.trails.push({ x: bx, y: by + 8, life: 0.12, color: weapon.color });
    beep(p.weapon === 'rocket' ? 260 : 690, 0.025, 0.022, p.weapon === 'rocket' ? 'sawtooth' : 'square');
}

function fireEnemy(e) {
    const p = game.player;
    if (!p) return;
    const taskShot = e.boss ? pick(game.pool) : null;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const dist = Math.hypot(dx, dy) || 1;
    const speed = e.boss ? 4.0 : 3.2;
    game.enemyBullets.push({
        x: e.x,
        y: e.y + e.h * 0.45,
        vx: (dx / dist) * speed,
        vy: (dy / dist) * speed,
        r: e.boss ? 5 : 4,
        color: e.boss ? e.accent : '#fb7185',
        label: taskShot ? labelText(taskShot.label, 18) : '',
        kind: taskShot?.kind || '',
    });
    if (e.boss && Math.random() < 0.55) {
        const left = pick(game.pool);
        const right = pick(game.pool);
        game.enemyBullets.push({ x: e.x - 30, y: e.y + e.h * 0.3, vx: -1.2, vy: speed * 0.95, r: 4, color: left.color || e.accent, label: labelText(left.label, 14), kind: left.kind });
        game.enemyBullets.push({ x: e.x + 30, y: e.y + e.h * 0.3, vx: 1.2, vy: speed * 0.95, r: 4, color: right.color || e.accent, label: labelText(right.label, 14), kind: right.kind });
    }
}

function bossSummon(e) {
    const level = currentLevel();
    const base = pick(game.pool);
    spawnEnemy(pick(level.spawn), {
        x: Math.max(42, Math.min(game.w - 42, e.x + game.rng(-90, 90))),
        y: e.y + e.h * 0.65,
        base,
        hp: Math.max(2, Math.round(1.5 + game.level * 0.7)),
        color: base.color || level.tint,
        score: 80,
        vy: 0.95,
        homing: 0.08,
    });
}

function applyPowerup(u) {
    const p = game.player;
    if (!p) return;
    if (u.kind === 'armor') {
        p.armor = Math.min(5, p.armor + 1);
        beep(430, 0.05);
    } else if (u.kind === 'shield') {
        p.shield = Math.min(3, p.shield + 1);
        beep(520, 0.05);
    } else if (u.kind === 'rapid') {
        p.weapon = 'blaster';
        p.rapidT = 8;
        p.spreadT = 0;
        p.rocketT = 0;
        beep(760, 0.05);
    } else if (u.kind === 'spread') {
        p.weapon = 'spread';
        p.spreadT = 8;
        p.rapidT = 0;
        p.rocketT = 0;
        beep(700, 0.05);
    } else if (u.kind === 'rocket') {
        p.weapon = 'rocket';
        p.rocketT = 7;
        p.rapidT = 0;
        p.spreadT = 0;
        beep(310, 0.07);
    } else if (u.kind === 'nova') {
        p.inventory.nova = Math.min(9, p.inventory.nova + 1);
        beep(620, 0.06);
    } else if (u.kind === 'repair') {
        p.inventory.repair = Math.min(9, p.inventory.repair + 1);
        beep(560, 0.06);
    } else if (u.kind === 'drone') {
        p.inventory.drone = Math.min(9, p.inventory.drone + 1);
        beep(720, 0.06);
    } else if (u.kind === 'slow') {
        p.inventory.slow = Math.min(9, p.inventory.slow + 1);
        beep(480, 0.06);
    }
    updateHud();
}

function castNovaSkill() {
    const p = game.player;
    if (!p || p.inventory.nova <= 0 || p.skillCd > 0) return;
    p.inventory.nova--;
    p.skillCd = 0.35;
    for (let i = game.enemies.length - 1; i >= 0; i--) {
        const e = game.enemies[i];
        if (e.boss) {
            e.hp -= 10;
            e.hitT = 0.2;
        } else {
            explode(e.x, e.y, e.color, 12);
            game.score += 65;
            game.levelScore += 65;
            game.enemies.splice(i, 1);
        }
    }
    game.enemyBullets = [];
    game.shake = 20;
    beep(260, 0.13, 0.055, 'sawtooth');
    updateHud();
}

function castRepairSkill() {
    const p = game.player;
    if (!p || p.inventory.repair <= 0 || p.skillCd > 0) return;
    p.inventory.repair--;
    p.skillCd = 0.35;
    p.lives = Math.min(5, p.lives + 1);
    p.armor = Math.min(6, p.armor + 2);
    p.invuln = Math.max(p.invuln, 0.7);
    explode(p.x, p.y, '#93c5fd', 12, 0.75);
    beep(540, 0.08);
    updateHud();
}

function castDroneSkill() {
    const p = game.player;
    if (!p || p.inventory.drone <= 0 || p.skillCd > 0) return;
    p.inventory.drone--;
    p.skillCd = 0.35;
    p.droneT = 9;
    beep(760, 0.08);
    updateHud();
}

function castSlowSkill() {
    const p = game.player;
    if (!p || p.inventory.slow <= 0 || p.skillCd > 0) return;
    p.inventory.slow--;
    p.skillCd = 0.35;
    p.slowT = 5.5;
    game.shake = Math.max(game.shake, 7);
    beep(420, 0.1, 0.045, 'triangle');
    updateHud();
}

function castInventorySkill(slot) {
    if (slot === '1') castNovaSkill();
    else if (slot === '2') castRepairSkill();
    else if (slot === '3') castDroneSkill();
    else if (slot === '4') castSlowSkill();
}

function step(dt) {
    const level = currentLevel();
    game.t += dt;
    game.scroll += dt * (44 + game.difficulty * 16);
    game.shake *= Math.pow(0.86, dt * 60);
    game.flash = Math.max(0, game.flash - dt);
    if (game.levelBannerT > 0) {
        game.levelBannerT -= dt;
        if (game.levelBannerT <= 0 && bannerEl) bannerEl.hidden = true;
    }

    const p = game.player;
    if (p.invuln > 0) p.invuln -= dt;
    if (p.spreadT > 0 && p.spreadT < 900) p.spreadT -= dt;
    if (p.rapidT > 0 && p.rapidT < 900) p.rapidT -= dt;
    if (p.rocketT > 0 && p.rocketT < 900) p.rocketT -= dt;
    if (p.droneT > 0) p.droneT -= dt;
    if (p.slowT > 0) p.slowT -= dt;
    if (p.skillCd > 0) p.skillCd -= dt;
    if (p.fireCd > 0) p.fireCd -= dt;
    if (p.spreadT <= 0 && p.rapidT <= 0 && p.rocketT <= 0 && p.weapon !== selectedWeapon) p.weapon = selectedWeapon;
    const enemyTimeScale = p.slowT > 0 ? 0.46 : 1;

    for (const s of game.stars) {
        s.y += s.sp * (1 + game.difficulty * 0.18) * dt * 60 * s.z;
        if (s.y > game.h) {
            s.y = 0;
            s.x = Math.random() * game.w;
        }
    }

    const keys = game._keys || {};
    let mx = 0;
    let my = 0;
    if (keys.ArrowLeft || keys.a || keys.A) mx -= 1;
    if (keys.ArrowRight || keys.d || keys.D) mx += 1;
    if (keys.ArrowUp || keys.w || keys.W) my -= 1;
    if (keys.ArrowDown || keys.s || keys.S) my += 1;
    const len = Math.hypot(mx, my) || 1;
    p.x += (mx / len) * 245 * dt;
    p.y += (my / len) * 170 * dt;
    p.x = Math.max(22, Math.min(game.w - 22, p.x));
    p.y = Math.max(game.h * 0.48, Math.min(game.h - 42, p.y));

    const wantsFire = keys[' '] || keys.Space || pointerDown || touchFireDown;
    const weapon = WEAPONS[p.weapon] || WEAPONS.blaster;
    const cdMul = p.rapidT > 0 ? 0.72 : 1;
    if (wantsFire && p.fireCd <= 0) {
        fire();
        p.fireCd = weapon.fireCd * cdMul;
    }

    if (p.droneT > 0 && Math.floor(game.t * 8) !== Math.floor((game.t - dt) * 8)) {
        const target = game.enemies
            .filter(e => e.y > -20)
            .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
        const dx = target ? target.x - p.x : 0;
        const dy = target ? target.y - p.y : -1;
        const dist = Math.hypot(dx, dy) || 1;
        addBullet(p.x - 22, p.y - 10, (dx / dist) * 8.8, (dy / dist) * 8.8, { damage: 1.15, color: '#67e8f9', r: 3 });
        addBullet(p.x + 22, p.y - 10, (dx / dist) * 8.8, (dy / dist) * 8.8, { damage: 1.15, color: '#67e8f9', r: 3 });
    }

    if (game.levelState === 'run') {
        game.spawnAcc += dt;
        const interval = Math.max(0.28, 1.04 - game.difficulty * 0.11 - game.level * 0.035);
        while (game.spawnAcc >= interval) {
            game.spawnAcc -= interval;
            spawnEnemy();
        }
    }

    for (let i = game.bullets.length - 1; i >= 0; i--) {
        const b = game.bullets[i];
        b.x += b.vx * dt * 60;
        b.y += b.vy * dt * 60;
        b.life -= dt;
        game.trails.push({ x: b.x, y: b.y, life: 0.12, color: b.color });
        if (b.y < -18 || b.x < -24 || b.x > game.w + 24 || b.life <= 0) game.bullets.splice(i, 1);
    }

    for (let i = game.enemyBullets.length - 1; i >= 0; i--) {
        const b = game.enemyBullets[i];
        b.x += b.vx * dt * 60 * enemyTimeScale;
        b.y += b.vy * dt * 60 * enemyTimeScale;
        if (b.y > game.h + 24 || b.x < -24 || b.x > game.w + 24) {
            game.enemyBullets.splice(i, 1);
            continue;
        }
        if (Math.hypot(b.x - p.x, b.y - p.y) < b.r + p.w * 0.35) {
            game.enemyBullets.splice(i, 1);
            damagePlayer(1);
        }
    }

    for (let i = game.enemies.length - 1; i >= 0; i--) {
        const e = game.enemies[i];
        if (e.hp <= 0) {
            killEnemy(e, i);
            continue;
        }
        e.zig += dt * (e.boss ? 1.8 : 3.2);
        e.hitT = Math.max(0, e.hitT - dt);
        if (e.boss) {
            if (!e.entered) {
                e.y += e.vy * dt * 60 * enemyTimeScale;
                if (e.y >= 74) e.entered = true;
            } else {
                e.x += Math.sin(e.zig) * e.vx * dt * 60 * enemyTimeScale;
                if (e.x < e.w / 2 + 8 || e.x > game.w - e.w / 2 - 8) e.vx *= -1;
                e.fireCd -= dt * enemyTimeScale;
                if (e.fireCd <= 0) {
                    fireEnemy(e);
                    e.fireCd = Math.max(0.38, 0.85 - game.level * 0.035);
                }
                e.summonCd -= dt * enemyTimeScale;
                if (e.summonCd <= 0) {
                    bossSummon(e);
                    e.summonCd = Math.max(1.1, 2.7 - game.level * 0.12);
                }
            }
        } else {
            e.x += (Math.sin(e.zig) * (e.type === 'striker' ? 1.35 : 0.8) + e.vx) * dt * 60 * enemyTimeScale;
            e.y += e.vy * dt * 60 * enemyTimeScale;
            const dx = p.x - e.x;
            const dy = p.y - e.y;
            const dist = Math.hypot(dx, dy) || 1;
            e.x += (dx / dist) * e.homing * 60 * dt * enemyTimeScale * (e.type === 'tank' ? 18 : 46);
            if (e.type === 'striker') {
                e.fireCd -= dt * enemyTimeScale;
                if (e.fireCd <= 0 && e.y > 30) {
                    fireEnemy(e);
                    e.fireCd = game.rng(1.1, 2.0) / Math.min(1.45, game.difficulty * 0.35 + 0.9);
                }
            }
        }

        e.x = Math.max(e.w / 2, Math.min(game.w - e.w / 2, e.x));
        if (e.y > game.h + 70) {
            game.enemies.splice(i, 1);
            continue;
        }
        if (Math.abs(e.x - p.x) < (e.w + p.w) * 0.34 && Math.abs(e.y - p.y) < (e.h + p.h) * 0.42) {
            if (!e.boss) game.enemies.splice(i, 1);
            damagePlayer(e.type === 'tank' || e.boss ? 2 : 1);
            continue;
        }
        for (let j = game.bullets.length - 1; j >= 0; j--) {
            const b = game.bullets[j];
            if (Math.abs(b.x - e.x) < e.w / 2 && Math.abs(b.y - e.y) < e.h / 2) {
                game.bullets.splice(j, 1);
                e.hp -= b.damage;
                e.hitT = 0.16;
                if (b.rocket) {
                    explode(b.x, b.y, '#fb7185', 12, 0.9);
                    for (const other of game.enemies) {
                        if (other === e) continue;
                        const d = Math.hypot(other.x - b.x, other.y - b.y);
                        if (d < 58) {
                            other.hp -= 1.25;
                            other.hitT = 0.12;
                        }
                    }
                    game.shake = Math.max(game.shake, 7);
                }
                if (e.hp <= 0) killEnemy(e, i);
                updateHud();
                break;
            }
        }
    }

    for (let i = game.powerups.length - 1; i >= 0; i--) {
        const u = game.powerups[i];
        u.t += dt;
        u.y += u.vy * dt * 60;
        if (u.y > game.h + 24) {
            game.powerups.splice(i, 1);
            continue;
        }
        if (Math.hypot(u.x - p.x, u.y - p.y) < u.r + p.w * 0.45) {
            applyPowerup(u);
            game.powerups.splice(i, 1);
        }
    }

    for (let i = game.particles.length - 1; i >= 0; i--) {
        const q = game.particles[i];
        q.x += q.vx * dt * 60;
        q.y += q.vy * dt * 60;
        q.vy += 0.045 * dt * 60;
        q.life -= dt * 1.65;
        if (q.life <= 0) game.particles.splice(i, 1);
    }

    for (let i = game.trails.length - 1; i >= 0; i--) {
        game.trails[i].life -= dt;
        if (game.trails[i].life <= 0) game.trails.splice(i, 1);
    }

    if (game.comboT && game.t - game.comboT > 2.35) {
        game.combo = 0;
        updateHud();
    }

    game.score += dt * (7 + game.level * 2.5);
    game.levelScore += dt * (7 + game.level * 2.5);
    if (game.levelState === 'run' && game.levelScore >= currentLevel().goal && !game.enemies.some(x => x.boss)) {
        spawnBoss();
    }
    updateHud();
}

function drawShip(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.invuln > 0 && Math.floor(game.t * 16) % 2 === 0) ctx.globalAlpha = 0.55;
    const weapon = WEAPONS[p.weapon] || WEAPONS.blaster;
    ctx.fillStyle = weapon.color;
    ctx.shadowColor = weapon.color;
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.moveTo(0, -p.h / 2 - 3);
    ctx.lineTo(p.w / 2, p.h / 2);
    ctx.lineTo(7, p.h / 2 - 4);
    ctx.lineTo(0, p.h / 2 + 5);
    ctx.lineTo(-7, p.h / 2 - 4);
    ctx.lineTo(-p.w / 2, p.h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#e0f2fe';
    ctx.fillRect(-3, -2, 6, 8);
    if (p.shield > 0) {
        ctx.strokeStyle = `rgba(52,211,153,${0.38 + p.shield * 0.14})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, p.w * 0.86 + p.shield * 4, 0, Math.PI * 2);
        ctx.stroke();
    }
    if (p.droneT > 0) {
        ctx.fillStyle = '#67e8f9';
        ctx.shadowColor = '#22d3ee';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(-24, -9 + Math.sin(game.t * 8) * 3, 5, 0, Math.PI * 2);
        ctx.arc(24, -9 + Math.cos(game.t * 8) * 3, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }
    ctx.restore();
}

function drawEnemy(e) {
    ctx.save();
    ctx.translate(e.x, e.y);
    const pulse = 1 + Math.sin(game.t * 5 + e.zig) * 0.035;
    ctx.scale(pulse, pulse);
    ctx.globalAlpha = e.hitT > 0 ? 0.65 : 1;
    ctx.fillStyle = e.hitT > 0 ? '#ffffff' : e.color;
    ctx.shadowColor = e.color;
    ctx.shadowBlur = e.boss ? 22 : 10;

    if (e.boss) {
        const r = 10;
        ctx.beginPath();
        ctx.moveTo(-e.w / 2 + r, -e.h / 2);
        ctx.lineTo(e.w / 2 - r, -e.h / 2);
        ctx.quadraticCurveTo(e.w / 2, -e.h / 2, e.w / 2, -e.h / 2 + r);
        ctx.lineTo(e.w / 2, e.h / 2 - r);
        ctx.quadraticCurveTo(e.w / 2, e.h / 2, e.w / 2 - r, e.h / 2);
        ctx.lineTo(-e.w / 2 + r, e.h / 2);
        ctx.quadraticCurveTo(-e.w / 2, e.h / 2, -e.w / 2, e.h / 2 - r);
        ctx.lineTo(-e.w / 2, -e.h / 2 + r);
        ctx.quadraticCurveTo(-e.w / 2, -e.h / 2, -e.w / 2 + r, -e.h / 2);
        ctx.fill();
        ctx.fillStyle = e.accent;
        ctx.fillRect(-e.w / 2 + 18, -4, e.w - 36, 8);
    } else if (e.type === 'tank') {
        ctx.fillRect(-e.w / 2, -e.h / 2, e.w, e.h);
        ctx.fillStyle = e.accent;
        ctx.fillRect(-e.w / 2 + 8, -e.h / 2 + 7, e.w - 16, 5);
    } else if (e.type === 'striker') {
        ctx.beginPath();
        ctx.moveTo(0, e.h / 2);
        ctx.lineTo(-e.w / 2, -e.h / 2 + 6);
        ctx.lineTo(-8, -e.h / 2);
        ctx.lineTo(0, -6);
        ctx.lineTo(8, -e.h / 2);
        ctx.lineTo(e.w / 2, -e.h / 2 + 6);
        ctx.closePath();
        ctx.fill();
    } else if (e.type === 'splitter' || e.type === 'shard') {
        ctx.beginPath();
        ctx.moveTo(0, -e.h / 2);
        ctx.lineTo(e.w / 2, 0);
        ctx.lineTo(0, e.h / 2);
        ctx.lineTo(-e.w / 2, 0);
        ctx.closePath();
        ctx.fill();
    } else {
        ctx.beginPath();
        ctx.moveTo(0, e.h / 2);
        ctx.lineTo(-e.w / 2, -e.h / 2);
        ctx.lineTo(e.w / 2, -e.h / 2);
        ctx.closePath();
        ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.font = `${e.boss ? 10 : 9}px "Press Start 2P", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = labelText(e.label, e.boss ? 30 : 22);
    const labelW = Math.min(e.boss ? e.w + 20 : game.w - 24, Math.max(e.w * 0.82, ctx.measureText(label).width + 14));
    const labelY = e.boss ? e.h / 2 + 16 : -e.h / 2 - 17;
    ctx.fillStyle = 'rgba(3,7,18,0.86)';
    ctx.strokeStyle = e.boss ? 'rgba(254,240,138,0.8)' : 'rgba(255,255,255,0.26)';
    ctx.lineWidth = 1;
    ctx.fillRect(-labelW / 2, labelY - 9, labelW, 18);
    ctx.strokeRect(-labelW / 2, labelY - 9, labelW, 18);
    ctx.fillStyle = e.boss ? '#fef08a' : '#f8fafc';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 5;
    ctx.fillText(label, 0, labelY);
    ctx.shadowBlur = 0;
    ctx.textBaseline = 'alphabetic';
    if (e.maxHp > 1) {
        const bw = e.w * 0.82;
        ctx.fillStyle = '#111827';
        ctx.fillRect(-bw / 2, -e.h / 2 - 9, bw, 4);
        ctx.fillStyle = e.boss ? '#fef08a' : '#34d399';
        ctx.fillRect(-bw / 2, -e.h / 2 - 9, bw * Math.max(0, e.hp / e.maxHp), 4);
    }
    ctx.restore();
}

function drawPowerup(u) {
    const colors = {
        armor: '#93c5fd',
        shield: '#34d399',
        rapid: '#38bdf8',
        spread: '#fbbf24',
        rocket: '#fb7185',
        nova: '#f472b6',
        repair: '#60a5fa',
        drone: '#67e8f9',
        slow: '#c4b5fd',
    };
    const letters = {
        armor: 'A',
        shield: 'S',
        rapid: 'B',
        spread: 'W',
        rocket: 'R',
        nova: 'N',
        repair: 'T',
        drone: 'D',
        slow: 'Z',
    };
    ctx.save();
    ctx.translate(u.x, u.y + Math.sin(u.t * 7) * 3);
    ctx.fillStyle = colors[u.kind] || '#c4b5fd';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(0, 0, u.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#0f172a';
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(letters[u.kind] || '?', 0, 4);
    ctx.restore();
}

function draw() {
    const ox = (Math.random() - 0.5) * game.shake;
    const oy = (Math.random() - 0.5) * game.shake;
    const level = currentLevel();

    ctx.save();
    ctx.translate(ox, oy);
    const g = ctx.createLinearGradient(0, 0, 0, game.h);
    g.addColorStop(0, level.bg[0]);
    g.addColorStop(0.52, level.bg[1]);
    g.addColorStop(1, level.bg[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, game.w, game.h);

    for (const s of game.stars) {
        const a = 0.2 + s.z * 0.78;
        ctx.fillStyle = `rgba(225,240,255,${a})`;
        ctx.fillRect(s.x, s.y, s.z > 0.8 ? 2 : 1, s.z > 0.8 ? 2 : 1);
    }

    ctx.strokeStyle = `${level.accent}22`;
    ctx.lineWidth = 1;
    const gridOff = (game.scroll * 0.15) % 42;
    for (let y = -gridOff; y < game.h; y += 42) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(game.w, y);
        ctx.stroke();
    }
    for (let x = ((game.scroll * 0.08) % 80) - 80; x < game.w + 80; x += 80) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x - game.w * 0.2, game.h);
        ctx.stroke();
    }

    for (const tr of game.trails) {
        ctx.globalAlpha = Math.max(0, tr.life / 0.12) * 0.65;
        ctx.fillStyle = tr.color;
        ctx.fillRect(tr.x - 2, tr.y - 5, 4, 10);
    }
    ctx.globalAlpha = 1;

    drawShip(game.player);

    for (const b of game.bullets) {
        ctx.fillStyle = b.color;
        ctx.shadowColor = b.color;
        ctx.shadowBlur = b.rocket ? 14 : 8;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.shadowBlur = 0;

    for (const b of game.enemyBullets) {
        ctx.fillStyle = b.color;
        ctx.shadowColor = b.color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
        if (b.label) {
            ctx.shadowBlur = 0;
            ctx.font = '7px "Press Start 2P", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const text = labelText(b.label, 14);
            const tw = Math.max(34, ctx.measureText(text).width + 10);
            ctx.fillStyle = b.kind === 'hibrit' ? 'rgba(30,41,59,0.88)' : 'rgba(127,29,29,0.88)';
            ctx.fillRect(b.x - tw / 2, b.y + 8, tw, 14);
            ctx.strokeStyle = 'rgba(255,255,255,0.24)';
            ctx.strokeRect(b.x - tw / 2, b.y + 8, tw, 14);
            ctx.fillStyle = '#f8fafc';
            ctx.fillText(text, b.x, b.y + 15);
            ctx.textBaseline = 'alphabetic';
        }
    }
    ctx.shadowBlur = 0;

    for (const e of game.enemies) drawEnemy(e);
    for (const u of game.powerups) drawPowerup(u);

    for (const q of game.particles) {
        ctx.globalAlpha = Math.max(0, q.life);
        ctx.fillStyle = q.color;
        ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
    }
    ctx.globalAlpha = 1;

    if (game.flash > 0) {
        ctx.fillStyle = `rgba(251,113,133,${game.flash * 0.8})`;
        ctx.fillRect(0, 0, game.w, game.h);
    }
    if (game.player.slowT > 0) {
        ctx.fillStyle = 'rgba(196,181,253,0.08)';
        ctx.fillRect(0, 0, game.w, game.h);
        ctx.strokeStyle = 'rgba(196,181,253,0.28)';
        ctx.lineWidth = 3;
        ctx.strokeRect(8, 8, game.w - 16, game.h - 16);
    }
    ctx.restore();
}

let lastTs = 0;
function frame(ts) {
    if (game.phase !== 'play' && game.phase !== 'paused') return;
    const dt = Math.min(0.05, (ts - lastTs) / 1000) || 0.016;
    lastTs = ts;
    if (game.phase === 'play') step(dt);
    draw();
    if (game.phase === 'paused') {
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, game.w, game.h);
        ctx.fillStyle = '#f9a8d4';
        ctx.font = '11px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('DURAKLAT', game.w / 2, game.h / 2 - 8);
        ctx.font = '8px "Press Start 2P", monospace';
        ctx.fillStyle = '#c4b5fd';
        ctx.fillText('P ile devam', game.w / 2, game.h / 2 + 14);
        ctx.restore();
    }
    rafId = requestAnimationFrame(frame);
}

function stopLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
}

function startLoop() {
    stopLoop();
    lastTs = performance.now();
    rafId = requestAnimationFrame(frame);
}

function togglePause() {
    if (game.phase === 'play') {
        game.phase = 'paused';
        touchFireDown = false;
    } else if (game.phase === 'paused') {
        game.phase = 'play';
    }
    updateHud();
}

function onKeyDown(ev) {
    if (!overlay || overlay.hidden) return;
    if (game.phase === 'play' && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Space', 'a', 'A', 'd', 'D', 'w', 'W', 's', 'S'].includes(ev.key)) {
        ev.preventDefault();
    }
    if (ev.key === 'p' || ev.key === 'P') {
        togglePause();
    }
    if (game.phase === 'play' && ['1', '2', '3', '4'].includes(ev.key) && !ev.repeat) {
        ev.preventDefault();
        castInventorySkill(ev.key);
    }
    if (!game._keys) game._keys = {};
    game._keys[ev.key] = true;
}

function onKeyUp(ev) {
    if (!game._keys) return;
    game._keys[ev.key] = false;
}

function bindPointer() {
    canvas.addEventListener('pointerdown', (e) => {
        if (game.phase !== 'play' || !game.player) return;
        e.preventDefault();
        pointerDown = true;
        canvas.setPointerCapture(e.pointerId);
        const r = canvas.getBoundingClientRect();
        game.player.x = Math.max(22, Math.min(game.w - 22, e.clientX - r.left));
    });
    canvas.addEventListener('pointerup', (e) => {
        pointerDown = false;
        try { canvas.releasePointerCapture(e.pointerId); } catch (_) { /* optional */ }
    });
    canvas.addEventListener('pointercancel', () => {
        pointerDown = false;
    });
    canvas.addEventListener('pointermove', (e) => {
        if (game.phase !== 'play' || !game.player) return;
        if (!pointerDown && e.buttons !== 1) return;
        e.preventDefault();
        const r = canvas.getBoundingClientRect();
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        game.player.x = Math.max(22, Math.min(game.w - 22, x));
        game.player.y = Math.max(game.h * 0.48, Math.min(game.h - 42, y));
    });
}

function openOverlay() {
    overlay.hidden = false;
    game.phase = 'idle';
    if (gameOverEl) gameOverEl.hidden = true;
    if (startPanel) startPanel.hidden = false;
    if (bannerEl) bannerEl.hidden = true;
    resize();
    document.body.style.overflow = 'hidden';
    updateHud();
}

function closeOverlay() {
    overlay.hidden = true;
    game.phase = 'idle';
    stopLoop();
    document.body.style.overflow = '';
    pointerDown = false;
    touchFireDown = false;
    if (keyHandler) {
        window.removeEventListener('keydown', keyHandler.down, true);
        window.removeEventListener('keyup', keyHandler.up, true);
        keyHandler = null;
    }
}

function startGame() {
    if (startPanel) startPanel.hidden = true;
    if (gameOverEl) gameOverEl.hidden = true;
    pointerDown = false;
    touchFireDown = false;
    if (keyHandler) {
        window.removeEventListener('keydown', keyHandler.down, true);
        window.removeEventListener('keyup', keyHandler.up, true);
    }
    resetRun();
    game.phase = 'play';
    game._keys = {};
    keyHandler = { down: onKeyDown, up: onKeyUp };
    window.addEventListener('keydown', keyHandler.down, true);
    window.addEventListener('keyup', keyHandler.up, true);
    updateHud();
    startLoop();
}

function selectWeapon(weapon, opts = {}) {
    if (!WEAPONS[weapon]) return;
    selectedWeapon = weapon;
    const p = game.player;
    if (p && (opts.force || !hasTemporaryWeapon(p))) {
        p.weapon = selectedWeapon;
        if (opts.force) {
            p.spreadT = 0;
            p.rapidT = 0;
            p.rocketT = 0;
        }
    }
    updateHud();
}

function bindWeaponChoices() {
    const choices = overlay.querySelectorAll('[data-tb-weapon]');
    for (const btn of choices) {
        btn.classList.toggle('active', btn.dataset.tbWeapon === selectedWeapon);
        btn.addEventListener('click', (ev) => {
            ev.preventDefault();
            selectWeapon(btn.dataset.tbWeapon || 'blaster', { force: game.phase === 'play' });
        });
    }
}

function bindTouchControls() {
    const fireBtn = document.getElementById('tbTouchFireBtn');
    if (fireBtn) {
        fireBtn.addEventListener('pointerdown', (ev) => {
            ev.preventDefault();
            if (game.phase !== 'play') return;
            touchFireDown = true;
            fireBtn.classList.add('firing');
            try { fireBtn.setPointerCapture(ev.pointerId); } catch (_) { /* optional */ }
        });
        const releaseFire = (ev) => {
            touchFireDown = false;
            fireBtn.classList.remove('firing');
            if (ev?.pointerId) {
                try { fireBtn.releasePointerCapture(ev.pointerId); } catch (_) { /* optional */ }
            }
        };
        fireBtn.addEventListener('pointerup', releaseFire);
        fireBtn.addEventListener('pointercancel', releaseFire);
        fireBtn.addEventListener('lostpointercapture', releaseFire);
    }

    const pauseBtn = document.getElementById('tbTouchPauseBtn');
    if (pauseBtn) {
        pauseBtn.addEventListener('click', (ev) => {
            ev.preventDefault();
            togglePause();
        });
    }

    for (const btn of overlay.querySelectorAll('[data-tb-skill]')) {
        btn.addEventListener('click', (ev) => {
            ev.preventDefault();
            if (game.phase !== 'play') return;
            castInventorySkill(btn.dataset.tbSkill);
            updateHud();
        });
    }
}

export function initializeTaskBlasterGame() {
    overlay = document.getElementById('taskBlasterOverlay');
    canvas = document.getElementById('taskBlasterCanvas');
    if (!overlay || !canvas) return;

    ctx = canvas.getContext('2d', { alpha: false });
    hudScore = document.getElementById('tbHudScore');
    hudWave = document.getElementById('tbHudWave');
    hudLevel = document.getElementById('tbHudLevel');
    hudLives = document.getElementById('tbHudLives');
    hudArmor = document.getElementById('tbHudArmor');
    hudWeapon = document.getElementById('tbHudWeapon');
    hudInventory = document.getElementById('tbHudInventory');
    hudCombo = document.getElementById('tbHudCombo');
    hudBoss = document.getElementById('tbHudBoss');
    startPanel = document.getElementById('taskBlasterStartPanel');
    gameOverEl = document.getElementById('taskBlasterGameOver');
    finalScoreEl = document.getElementById('tbFinalScore');
    finalLevelEl = document.getElementById('tbFinalLevel');
    bannerEl = document.getElementById('taskBlasterLevelBanner');
    bannerTitleEl = document.getElementById('tbLevelBannerTitle');
    bannerSubEl = document.getElementById('tbLevelBannerSub');

    const openBtn = document.getElementById('taskBlasterOpenBtn');
    const closeBtn = document.getElementById('taskBlasterCloseBtn');
    const startBtn = document.getElementById('taskBlasterStartBtn');
    const restartBtn = document.getElementById('taskBlasterRestartBtn');

    if (openBtn) openBtn.addEventListener('click', openOverlay);
    if (closeBtn) closeBtn.addEventListener('click', closeOverlay);
    overlay.querySelector('.task-blaster-backdrop')?.addEventListener('click', closeOverlay);
    if (startBtn) startBtn.addEventListener('click', startGame);
    if (restartBtn) restartBtn.addEventListener('click', startGame);
    bindWeaponChoices();
    bindPointer();
    bindTouchControls();

    game.player = {
        x: 0,
        y: 0,
        w: 30,
        h: 24,
        lives: 3,
        armor: 0,
        shield: 0,
        invuln: 0,
        weapon: selectedWeapon,
        spreadT: 0,
        rapidT: 0,
        rocketT: 0,
        droneT: 0,
        slowT: 0,
        skillCd: 0,
        inventory: { nova: 0, repair: 1, drone: 0, slow: 0 },
        fireCd: 0,
    };

    resizeObs = new ResizeObserver(() => {
        if (!overlay.hidden) resize();
    });
    resizeObs.observe(canvas.parentElement);

    document.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Escape') return;
        if (!overlay || overlay.hidden) return;
        ev.preventDefault();
        closeOverlay();
    }, true);
}
