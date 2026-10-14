// The Dark Board Assistant — server (v2.0)
// Serves the single-page frontend and proxies api.scryfall.com so the
// browser never hits Scryfall rate limits directly. Simple in-memory cache
// keeps repeat queries fast and polite to the Scryfall API.
//
// v2.0 adds optional email/password accounts (Postgres via DATABASE_URL).
// When DATABASE_URL is unset the app runs exactly as before: decks save in
// each visitor's own browser and the account UI shows a short notice.
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
app.set('trust proxy', 1); // Render terminates TLS at its proxy
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 3000;
const SCRYFALL = 'https://api.scryfall.com';
const SPELLBOOK = 'https://backend.commanderspellbook.com';
const VERSION = '2.11';

const DATABASE_URL = process.env.DATABASE_URL || '';
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const COOKIE_NAME = 'dba_session';

// ---- optional Postgres (accounts) ----
let pool = null;
let accountsOn = false;

function makePool() {
  const { Pool } = require('pg');
  // Local dev databases usually have no TLS; hosted ones (Neon, Render) do.
  const local = /localhost|127\.0\.0\.1/.test(DATABASE_URL);
  return new Pool({
    connectionString: DATABASE_URL,
    ssl: local ? undefined : { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
  });
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users(
      id uuid PRIMARY KEY,
      email text UNIQUE NOT NULL,
      password_hash text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS decks(
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name text NOT NULL,
      format text NOT NULL,
      cards jsonb NOT NULL DEFAULT '[]',
      checks jsonb NOT NULL DEFAULT '{}',
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS decks_user_id_idx ON decks(user_id);
  `);
}

// ---- tiny cookie helper (no extra dependency) ----
function getCookie(req, name) {
  const h = req.headers.cookie || '';
  const m = h.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}
function cookieFlags(req) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  return { httpOnly: true, sameSite: 'lax', secure: !!secure, path: '/' };
}
function setSession(res, req, userId) {
  const jwt = require('jsonwebtoken');
  const token = jwt.sign({ uid: userId }, SESSION_SECRET, { expiresIn: '30d' });
  res.cookie(COOKIE_NAME, token, Object.assign(cookieFlags(req), {
    maxAge: 30 * 24 * 3600 * 1000,
  }));
}
function clearSession(res, req) {
  res.clearCookie(COOKIE_NAME, cookieFlags(req));
}
function authUserId(req) {
  const token = getCookie(req, COOKIE_NAME);
  if (!token) return null;
  try {
    const jwt = require('jsonwebtoken');
    return jwt.verify(token, SESSION_SECRET).uid || null;
  } catch (e) {
    return null;
  }
}
function requireAuth(req, res, next) {
  if (!accountsOn || !pool) {
    return res.status(503).json({ error: 'Accounts are turned off on this site right now.' });
  }
  const uid = authUserId(req);
  if (!uid) return res.status(401).json({ error: 'You need to log in first.' });
  req.userId = uid;
  next();
}

// ---- validation helpers ----
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function cleanEmail(v) {
  return String(v || '').trim().toLowerCase().slice(0, 254);
}
function validEmail(e) { return EMAIL_RE.test(e); }
const FORMATS = ['commander', 'standard', 'modern'];
function cleanCard(c) {
  if (!c || typeof c !== 'object') return null;
  const n = parseInt(c.count, 10);
  return {
    pid: String(c.pid || '').slice(0, 120),
    name: String(c.name || 'Unknown card').slice(0, 200),
    set: String(c.set || '').slice(0, 20),
    cn: String(c.cn || '').slice(0, 30),
    price: String(c.price || '').slice(0, 20),
    priceNum: (typeof c.priceNum === 'number' && isFinite(c.priceNum) && c.priceNum >= 0) ? c.priceNum : null,
    cmc: (typeof c.cmc === 'number' && isFinite(c.cmc) && c.cmc >= 0) ? c.cmc : null,
    colors: Array.isArray(c.colors)
      ? c.colors.filter((x) => typeof x === 'string' && /^[WUBRG]$/.test(x)).slice(0, 5)
      : [],
    maintype: String(c.maintype || '').slice(0, 30),
    power: c.power === null || c.power === undefined ? null : String(c.power).slice(0, 10),
    toughness: c.toughness === null || c.toughness === undefined ? null : String(c.toughness).slice(0, 10),
    subtypes: Array.isArray(c.subtypes)
      ? c.subtypes.filter((x) => typeof x === 'string').map((x) => x.slice(0, 40)).slice(0, 20)
      : [],
    keywords: Array.isArray(c.keywords)
      ? c.keywords.filter((x) => typeof x === 'string').map((x) => x.slice(0, 60)).slice(0, 30)
      : [],
    removal: (typeof c.removal === 'number' && isFinite(c.removal) && c.removal >= 0)
      ? Math.min(99, Math.floor(c.removal)) : 0,
    unlimited: !!c.unlimited,
    legendary: !!c.legendary,
    lethalKws: Array.isArray(c.lethalKws)
      ? c.lethalKws.filter((x) => typeof x === 'string').map((x) => x.slice(0, 30)).slice(0, 20)
      : [],
    statsOk: !!c.statsOk,
    img: String(c.img || '').slice(0, 2000),
    count: Math.max(1, Math.min(99, isNaN(n) ? 1 : n)),
    checked: !!c.checked,
    commander: !!c.commander,
  };
}
function cleanDeckBody(body) {
  const b = body || {};
  const name = String(b.name || 'My deck').trim().slice(0, 120) || 'My deck';
  const format = FORMATS.includes(b.format) ? b.format : 'commander';
  const cardsRaw = Array.isArray(b.cards) ? b.cards.slice(0, 500) : [];
  const cards = cardsRaw.map(cleanCard).filter(Boolean);
  const checks = b.checks && typeof b.checks === 'object' ? b.checks : {};
  return { name, format, cards, checks };
}

// ---- polite Scryfall client: tiny throttle + short-lived cache ----
const cache = new Map();
const TTL_MS = 10 * 60 * 1000; // 10 minutes
let lastCall = 0;

async function scryfallFetch(url, retries) {
  if (retries === undefined) retries = 3;
  const now = Date.now();
  const hit = cache.get(url);
  if (hit && now - hit.t < TTL_MS) return hit.data;
  const wait = Math.max(0, 120 - (now - lastCall));
  if (wait) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  let res;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': 'TheDarkBoardAssistant/2.11 (fan project)' },
    });
  } catch (e) {
    if (retries > 0) {
      await new Promise((r) => setTimeout(r, 800));
      return scryfallFetch(url, retries - 1);
    }
    throw e;
  }
  // The card database sometimes throttles rapid lookups (429) or hiccups
  // (5xx). Retry with backoff instead of surfacing "not found" to the user.
  if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
    if (retries > 0) {
      const backoff = [700, 2000, 5000][3 - retries] || 5000;
      await new Promise((r) => setTimeout(r, backoff));
      return scryfallFetch(url, retries - 1);
    }
  }
  if (!res.ok) {
    const err = new Error('Scryfall returned ' + res.status);
    err.status = res.status === 404 ? 404 : 502;
    throw err;
  }
  const data = await res.json();
  cache.set(url, { t: Date.now(), data });
  return data;
}

function scryfallProxy(scryPath) {
  return async (req, res) => {
    try {
      const qs = new URLSearchParams(req.query).toString();
      const data = await scryfallFetch(SCRYFALL + scryPath + (qs ? '?' + qs : ''));
      res.json(data);
    } catch (e) {
      res
        .status(e.status || 502)
        .json({ error: 'Card data is unavailable right now. Please try again in a moment.' });
    }
  };
}

// ---- Commander deck-idea themes ----
// Maps a theme button to a real Scryfall query; commanders come from the
// actual "is:commander" search ordered by EDHREC popularity. Nothing is invented.
const THEMES = {
  dragons: 't:dragon',
  zombies: 't:zombie',
  elves: 't:elf',
  vampires: 't:vampire',
  dinosaurs: 't:dinosaur',
  merfolk: 't:merfolk',
  angels: 't:angel',
  goblins: 't:goblin',
  artifacts: 't:artifact',
  counters: 'o:"+1/+1 counter"',
  aristocrats: 'o:"sacrifice"',
  spellslinger: 'o:"whenever you cast"',
};

app.get('/healthz', (_req, res) => res.send('ok'));
app.get('/api/status', (_req, res) => res.json({ accounts: accountsOn, version: VERSION }));

// ---- auth (rate-limited) ----
const rateLimit = require('express-rate-limit');
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many tries. Please wait a few minutes and try again.' },
});

app.post('/api/auth/signup', authLimiter, async (req, res) => {
  if (!accountsOn || !pool) {
    return res.status(503).json({ error: 'Accounts are turned off on this site right now.' });
  }
  const email = cleanEmail(req.body && req.body.email);
  const password = String((req.body && req.body.password) || '');
  if (!validEmail(email)) {
    return res.status(400).json({ error: 'That email does not look right. Please check it and try again.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Your password needs to be at least 8 characters long.' });
  }
  if (password.length > 128) {
    return res.status(400).json({ error: 'That password is too long. Please use 128 characters or fewer.' });
  }
  try {
    const bcrypt = require('bcryptjs');
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rowCount > 0) {
      return res.status(409).json({ error: 'This email already has an account. Try logging in instead.' });
    }
    const hash = await bcrypt.hash(password, 12);
    const id = crypto.randomUUID();
    await pool.query('INSERT INTO users(id, email, password_hash) VALUES($1, $2, $3)', [id, email, hash]);
    setSession(res, req, id);
    res.json({ id, email });
  } catch (e) {
    console.error('signup failed:', e.message);
    res.status(500).json({ error: 'Something went wrong. Please try again in a moment.' });
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  if (!accountsOn || !pool) {
    return res.status(503).json({ error: 'Accounts are turned off on this site right now.' });
  }
  const email = cleanEmail(req.body && req.body.email);
  const password = String((req.body && req.body.password) || '');
  try {
    const bcrypt = require('bcryptjs');
    const r = await pool.query('SELECT id, password_hash FROM users WHERE email = $1', [email]);
    if (r.rowCount === 0) {
      return res.status(401).json({ error: 'That email or password is wrong. Please try again.' });
    }
    const ok = await bcrypt.compare(password, r.rows[0].password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'That email or password is wrong. Please try again.' });
    }
    setSession(res, req, r.rows[0].id);
    res.json({ id: r.rows[0].id, email });
  } catch (e) {
    console.error('login failed:', e.message);
    res.status(500).json({ error: 'Something went wrong. Please try again in a moment.' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  clearSession(res, req);
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  if (!accountsOn || !pool) return res.status(401).json({ error: 'Not logged in.' });
  const uid = authUserId(req);
  if (!uid) return res.status(401).json({ error: 'Not logged in.' });
  pool.query('SELECT id, email FROM users WHERE id = $1', [uid])
    .then((r) => {
      if (r.rowCount === 0) return res.status(401).json({ error: 'Not logged in.' });
      res.json({ id: r.rows[0].id, email: r.rows[0].email });
    })
    .catch(() => res.status(500).json({ error: 'Something went wrong. Please try again in a moment.' }));
});

// ---- per-account decks (auth required, user-scoped) ----
app.get('/api/decks', requireAuth, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT id, name, format, updated_at FROM decks WHERE user_id = $1 ORDER BY updated_at DESC',
      [req.userId]
    );
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: 'Could not load your decks right now.' });
  }
});

app.get('/api/decks/:id', requireAuth, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT id, name, format, cards, checks, updated_at FROM decks WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Deck not found.' });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Could not load your deck right now.' });
  }
});

app.post('/api/decks', requireAuth, async (req, res) => {
  const d = cleanDeckBody(req.body);
  try {
    const id = crypto.randomUUID();
    const r = await pool.query(
      'INSERT INTO decks(id, user_id, name, format, cards, checks) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb) RETURNING id, name, format, updated_at',
      [id, req.userId, d.name, d.format, JSON.stringify(d.cards), JSON.stringify(d.checks)]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Could not save your deck right now.' });
  }
});

app.put('/api/decks/:id', requireAuth, async (req, res) => {
  const d = cleanDeckBody(req.body);
  try {
    const r = await pool.query(
      `UPDATE decks SET name=$1, format=$2, cards=$3::jsonb, checks=$4::jsonb, updated_at=now()
       WHERE id=$5 AND user_id=$6 RETURNING id, name, format, updated_at`,
      [d.name, d.format, JSON.stringify(d.cards), JSON.stringify(d.checks), req.params.id, req.userId]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Deck not found.' });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Could not save your deck right now.' });
  }
});

app.delete('/api/decks/:id', requireAuth, async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM decks WHERE id=$1 AND user_id=$2', [req.params.id, req.userId]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Deck not found.' });
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ error: 'Could not delete your deck right now.' });
  }
});

// ---- card data (unchanged from v1.x) ----
app.get('/api/search', scryfallProxy('/cards/search'));
app.get('/api/autocomplete', scryfallProxy('/cards/autocomplete'));
app.get('/api/named', scryfallProxy('/cards/named'));
app.get('/api/sets', scryfallProxy('/sets'));

app.get('/api/card/:id', async (req, res) => {
  try {
    const data = await scryfallFetch(SCRYFALL + '/cards/' + encodeURIComponent(req.params.id));
    res.json(data);
  } catch (e) {
    res
      .status(e.status || 502)
      .json({ error: 'Card data is unavailable right now. Please try again in a moment.' });
  }
});

// POST helper for Scryfall endpoints that need a JSON body (like
// /cards/collection). Same politeness delay as scryfallFetch.
async function scryfallPost(url, body) {
  const now = Date.now();
  const wait = Math.max(0, 80 - (now - lastCall));
  if (wait) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'TheDarkBoardAssistant/2.11 (fan project)',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = new Error('Scryfall returned ' + res.status);
    err.status = res.status === 404 ? 404 : 502;
    throw err;
  }
  return res.json();
}

// The main card type word: the word before the '—' in the type line
// (e.g. "Legendary Creature — Dragon" -> "Creature"), mapped to the
// buckets the deck-stats charts use, else "Other".
function mainTypeOf(card) {
  const faces = card.card_faces || [];
  const line = card.type_line || (faces[0] && faces[0].type_line) || '';
  const before = line.split(/[—–-]/)[0].trim();
  const words = before.split(/\s+/).filter(Boolean);
  const last = words.length ? words[words.length - 1] : '';
  const word = last.charAt(0).toUpperCase() + last.slice(1).toLowerCase();
  const buckets = ['Creature', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Planeswalker', 'Land', 'Battle'];
  return buckets.includes(word) ? word : 'Other';
}

function firstFace(card) {
  const faces = card.card_faces || [];
  return faces[0] || {};
}

// The small stat fields the deck-stats charts need for one Scryfall card.
function statFieldsOf(card) {
  const face = firstFace(card);
  const cmc = typeof card.cmc === 'number' && isFinite(card.cmc) ? card.cmc
    : (typeof face.cmc === 'number' && isFinite(face.cmc) ? face.cmc : null);
  const colors = Array.isArray(card.colors) ? card.colors
    : (Array.isArray(face.colors) ? face.colors : []);
  const typeLine = card.type_line || face.type_line || '';
  const after = typeLine.split(/[—–]/)[1] || '';
  const subtypes = after.trim().split(/\s+/).filter(Boolean);
  const power = card.power !== undefined && card.power !== null ? String(card.power)
    : (face.power !== undefined && face.power !== null ? String(face.power) : null);
  const toughness = card.toughness !== undefined && card.toughness !== null ? String(card.toughness)
    : (face.toughness !== undefined && face.toughness !== null ? String(face.toughness) : null);
  const keywords = Array.isArray(card.keywords) ? card.keywords
    : (Array.isArray(face.keywords) ? face.keywords : []);
  return {
    cmc: cmc,
    colors: colors.filter((c) => typeof c === 'string' && /^[WUBRG]$/.test(c)),
    maintype: mainTypeOf(card),
    legendary: /\bLegendary\b/i.test(typeLine),
    power: power,
    toughness: toughness,
    subtypes: subtypes,
    keywords: keywords.filter((k) => typeof k === 'string'),
    // Rules text so the client can count removal/interaction and spot
    // evasion abilities on cards saved before v2.6 (one-time backfill).
    oracle_text: String(card.oracle_text || face.oracle_text || '').slice(0, 4000),
  };
}

// Bulk stat lookup for the deck-stats charts: the client sends Scryfall ids
// for cards whose entries are missing stats, and gets back a map of
// id -> {cmc, colors, maintype, power, toughness, subtypes, keywords}.
// Scryfall takes at most 75 identifiers per call, so we chunk server-side.
const collectionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  message: { error: 'Too many requests. Please wait a moment and try again.' },
});
app.post('/api/cards/collection', collectionLimiter, async (req, res) => {
  const ids = req.body && req.body.identifiers;
  if (!Array.isArray(ids) || !ids.length) {
    return res.status(400).json({ error: 'Send an array of card ids as "identifiers".' });
  }
  const clean = ids.filter((x) => typeof x === 'string' && x.trim()).slice(0, 300);
  if (!clean.length) return res.status(400).json({ error: 'No valid card ids.' });
  try {
    const out = {};
    for (let i = 0; i < clean.length; i += 75) {
      const chunk = clean.slice(i, i + 75);
      const data = await scryfallPost(SCRYFALL + '/cards/collection', {
        identifiers: chunk.map((id) => ({ id: id })),
      });
      (data.data || []).forEach((card) => {
        out[card.id] = statFieldsOf(card);
      });
    }
    res.json({ cards: out });
  } catch (e) {
    res
      .status(e.status || 502)
      .json({ error: 'Card stats are unavailable right now. Please try again in a moment.' });
  }
});

// "Cards that work with…" — synergy suggestions powered by EDHREC's public
// JSON (what Commander players actually play alongside a card). The server
// fetches EDHREC's top cards for the named card, then resolves them to full
// Scryfall card objects so the client can reuse its normal card rendering.
function slugify(name) {
  return String(name || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
async function edhrecFetch(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'TheDarkBoardAssistant/2.11 (fan project)' },
  });
  if (!res.ok) {
    const err = new Error('EDHREC returned ' + res.status);
    // EDHREC answers unknown cards with 403 (AccessDenied), not 404.
    err.status = (res.status === 404 || res.status === 403) ? 404 : 502;
    throw err;
  }
  return res.json();
}
const synergyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many tries. Please wait a few minutes and try again.' },
});
app.get('/api/synergy', synergyLimiter, async (req, res) => {
  const name = (req.query.name || '').trim().slice(0, 120);
  if (!name) return res.status(400).json({ error: 'Type a card name first.' });
  const slug = slugify(name);
  if (!slug) return res.status(400).json({ error: 'That card name does not look right.' });
  try {
    let ed = null;
    for (const section of ['cards', 'commanders']) {
      try {
        ed = await edhrecFetch('https://json.edhrec.com/pages/' + section + '/' + slug + '.json');
        break;
      } catch (e) {
        if (e.status !== 404) throw e;
      }
    }
    if (!ed) {
      return res.status(404).json({ error: 'Could not find synergy data for "' + name + '". Check the spelling.' });
    }
    const lists = (((ed.container || {}).json_dict || {}).cardlists) || [];
    const byTag = {};
    lists.forEach((l) => { if (l && l.tag && !byTag[l.tag]) byTag[l.tag] = l; });
    const names = [];
    const seen = {};
    const take = (tag) => {
      const l = byTag[tag];
      if (!l || !Array.isArray(l.cardviews)) return;
      l.cardviews.forEach((cv) => {
        const n = cv && cv.name;
        if (!n || seen[n.toLowerCase()]) return;
        seen[n.toLowerCase()] = true;
        names.push(n);
      });
    };
    ['highsynergy', 'topsynergy', 'topcards', 'creatures', 'instants', 'sorceries',
     'utilityartifacts', 'enchantments', 'manaartifacts'].forEach(take);
    const picked = names
      .filter((n) => n.toLowerCase() !== name.toLowerCase())
      .slice(0, 12);
    if (!picked.length) {
      return res.status(404).json({ error: 'No suggestions found for that card.' });
    }
    const data = await scryfallPost(SCRYFALL + '/cards/collection', {
      identifiers: picked.map((n) => ({ name: n })),
    });
    res.json({ cards: data.data || [] });
  } catch (e) {
    res
      .status(e.status || 502)
      .json({ error: 'Suggestions are unavailable right now. Please try again in a moment.' });
  }
});

// ---- combo lookup via Commander Spellbook (free community combo database) ----
// POST /api/combos {cards: [names]} -> {ok, source:'spellbook', included, almostIncluded}
// Spellbook's find-my-combos wants {main:[{card, quantity}], commanders:[]}.
// ETIQUETTE (theirs): click-triggered only, cached server-side (1h), and on
// their 429 we do NOT retry — we surface "busy" and let the user retry.
// (The Scryfall retry logic in scryfallFetch must NOT apply here.)
const comboCache = new Map();
const COMBO_TTL_MS = 60 * 60 * 1000;
function comboKey(names) {
  return names.map((n) => n.toLowerCase().trim()).filter(Boolean).sort().join('|');
}
async function spellbookCombos(names) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(SPELLBOOK + '/find-my-combos/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TheDarkBoardAssistant/2.11 (fan project)',
      },
      body: JSON.stringify({
        main: names.map((n) => ({ card: n, quantity: 1 })),
        commanders: [],
      }),
      signal: ctrl.signal,
    });
    if (res.status === 429) {
      const e = new Error('Spellbook is busy');
      e.status = 429;
      throw e;
    }
    if (!res.ok) {
      const e = new Error('Spellbook returned ' + res.status);
      e.status = 502;
      throw e;
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}
function shapeVariant(v, deckLower) {
  const uses = ((v && v.uses) || [])
    .map((u) => (u.card && u.card.name) || '')
    .filter(Boolean);
  const produces = ((v && v.produces) || [])
    .map((p) => (p.feature && p.feature.name) || '')
    .filter(Boolean);
  const shaped = {
    cards: uses,
    produces: produces,
    description: String((v && v.description) || '').slice(0, 600),
  };
  if (deckLower) {
    shaped.missing = uses.filter((c) => !deckLower.has(c.toLowerCase()));
  }
  return shaped;
}
const comboLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many tries. Please wait a few minutes and try again.' },
});
app.post('/api/combos', comboLimiter, async (req, res) => {
  const raw = req.body && req.body.cards;
  if (!Array.isArray(raw) || !raw.length) {
    return res.status(400).json({ error: 'Send an array of card names as "cards".' });
  }
  const names = [...new Set(raw.map((n) => String(n).trim()).filter(Boolean))].slice(0, 200);
  if (!names.length) return res.status(400).json({ error: 'No valid card names.' });
  const key = comboKey(names);
  const hit = comboCache.get(key);
  if (hit && Date.now() - hit.t < COMBO_TTL_MS) return res.json(hit.data);
  try {
    const data = await spellbookCombos(names);
    const r = (data && data.results) || {};
    const lower = new Set(names.map((n) => n.toLowerCase()));
    const out = {
      ok: true,
      source: 'spellbook',
      included: (r.included || []).map((v) => shapeVariant(v)),
      // "One piece away": combos where exactly one card is missing.
      almostIncluded: (r.almostIncluded || [])
        .map((v) => shapeVariant(v, lower))
        .filter((v) => v.missing.length === 1),
    };
    comboCache.set(key, { t: Date.now(), data: out });
    if (comboCache.size > 200) comboCache.delete(comboCache.keys().next().value);
    res.json(out);
  } catch (e) {
    if (e.status === 429) {
      return res.status(429).json({ error: 'Combo lookup is busy right now. Try again in a moment.' });
    }
    res.status(502).json({ error: 'Combo lookup is unavailable right now.', fallback: true });
  }
});

// ---- card rules text for the quiet-synergy scan (v2.10) ----
// POST /api/cardtexts {cards:[names]} -> {texts:[{name, oracle_text, type_line}]}
// The combo checker reads the deck's actual card text (not just names) to
// find low-key synergies. Batched Scryfall collection lookup, 1h cache.
const textCache = new Map();
app.post('/api/cardtexts', comboLimiter, async (req, res) => {
  const raw = req.body && req.body.cards;
  if (!Array.isArray(raw) || !raw.length) {
    return res.status(400).json({ error: 'Send an array of card names as "cards".' });
  }
  const names = [...new Set(raw.map((n) => String(n).trim()).filter(Boolean))].slice(0, 200);
  if (!names.length) return res.status(400).json({ error: 'No valid card names.' });
  const key = 'texts:' + comboKey(names);
  const hit = textCache.get(key);
  if (hit && Date.now() - hit.t < COMBO_TTL_MS) return res.json(hit.data);
  try {
    const data = await scryfallPost(SCRYFALL + '/cards/collection', {
      identifiers: names.map((n) => ({ name: n })),
    });
    const out = {
      texts: (data.data || []).map((c) => {
        const faces = c.card_faces || [];
        const texts = [c.oracle_text].concat(faces.map((f) => f.oracle_text)).filter(Boolean);
        const types = [c.type_line].concat(faces.map((f) => f.type_line)).filter(Boolean);
        return { name: c.name, oracle_text: texts.join('\n'), type_line: types.join(' // ') };
      }),
    };
    textCache.set(key, { t: Date.now(), data: out });
    if (textCache.size > 200) textCache.delete(textCache.keys().next().value);
    res.json(out);
  } catch (e) {
    res.status(502).json({ error: 'Card text lookup is unavailable right now.' });
  }
});

// Printings of one card name (for the Pictures & versions viewer)
app.get('/api/printings', async (req, res) => {
  const name = (req.query.name || '').trim();
  if (!name) return res.status(400).json({ error: 'A card name is required.' });
  try {
    const q = '!%22' + encodeURIComponent(name).replace(/%20/g, '+') + '%22';
    const data = await scryfallFetch(
      `${SCRYFALL}/cards/search?q=${q}&unique=prints&order=released&dir=asc`
    );
    res.json(data);
  } catch (e) {
    res
      .status(e.status || 502)
      .json({ error: 'Card versions are unavailable right now. Please try again in a moment.' });
  }
});

// Deck ideas: commanders + key cards for a theme, from live Scryfall data
app.get('/api/theme', async (req, res) => {
  const theme = THEMES[req.query.theme];
  if (!theme) return res.status(400).json({ error: 'Unknown theme.' });
  try {
    const [commanders, staples] = await Promise.all([
      scryfallFetch(
        `${SCRYFALL}/cards/search?q=${encodeURIComponent('is:commander ' + theme)}&order=edhrec&unique=cards`
      ),
      scryfallFetch(
        `${SCRYFALL}/cards/search?q=${encodeURIComponent('game:paper commander:legal ' + theme)}&order=edhrec&unique=cards`
      ),
    ]);
    res.json({
      theme: req.query.theme,
      commanders: (commanders.data || []).slice(0, 6),
      staples: (staples.data || []).slice(0, 12),
    });
  } catch (e) {
    res
      .status(e.status || 502)
      .json({ error: 'Deck ideas are unavailable right now. Please try again in a moment.' });
  }
});

// Serve the web app manifest with the correct content type for installability.
app.get('/manifest.webmanifest', (_req, res) => {
  res.type('application/manifest+json');
  res.sendFile(path.join(__dirname, 'public', 'manifest.webmanifest'));
});

// App icons are stored in the repo as base64 text files (so they survive
// text-only file sync); decode them once at boot and serve as real PNGs.
const ICONS = {};
for (const name of ['icon-512.png', 'icon-192.png', 'apple-touch-icon.png']) {
  try {
    ICONS[name] = Buffer.from(
      fs.readFileSync(path.join(__dirname, 'public', 'icons', name + '.b64'), 'utf8').trim(),
      'base64'
    );
  } catch (e) {
    console.error('Icon missing: ' + name);
  }
}
app.get('/icons/:name', (req, res) => {
  const buf = ICONS[req.params.name];
  if (!buf) return res.status(404).end();
  res.type('image/png').send(buf);
});

app.use(express.static(path.join(__dirname, 'public')));

// ---- boot ----
(async () => {
  if (DATABASE_URL) {
    if (!SESSION_SECRET) {
      console.error(
        'FATAL: DATABASE_URL is set but SESSION_SECRET is missing.\n' +
        'Set SESSION_SECRET to a long random value (generate one with: openssl rand -hex 32).'
      );
      process.exit(1);
    }
    try {
      pool = makePool();
      pool.on('error', (e) => console.error('Postgres pool error:', e.message));
      await initDb();
      accountsOn = true;
      console.log('Accounts are on: users can sign up, log in, and save decks to their account.');
    } catch (e) {
      pool = null;
      accountsOn = false;
      console.error('Database unavailable (' + e.message + ') — running without accounts.');
    }
  } else {
    console.log('DATABASE_URL is not set — running without accounts. Decks save in this browser only.');
  }
  app.listen(PORT, () => {
    console.log('The Dark Board Assistant v' + VERSION + ' listening on port ' + PORT);
  });
})();
