'use strict';
/* The Dark Board Assistant — frontend (v2.3) */

const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));

// ---------- preferences (all default-on for easy access) ----------
const PREF_KEY = 'dba-prefs';
const prefs = Object.assign(
  { easyView: true, softDark: true, biggerText: false, strongContrast: false },
  JSON.parse(localStorage.getItem(PREF_KEY) || '{}')
);
function savePrefs() { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); }
function applyPrefs() {
  document.body.classList.toggle('easy-view', prefs.easyView);
  document.body.classList.toggle('soft-dark', prefs.softDark);
  document.body.classList.toggle('bigger-text', prefs.biggerText);
  document.body.classList.toggle('strong-contrast', prefs.strongContrast);
  setToggle('#toggle-easy', prefs.easyView, 'Easy view — step-by-step wording, extra choices hidden');
  setToggle('#toggle-dark', prefs.softDark, 'Soft dark light');
  setToggle('#toggle-text', prefs.biggerText, 'Bigger text');
  setToggle('#toggle-contrast', prefs.strongContrast, 'Strong contrast');
}
function setToggle(sel, on, label) {
  const b = $(sel);
  b.setAttribute('aria-pressed', String(on));
  const mark = on ? '✓' : '○';
  b.textContent = mark + ' ' + label + ' — ' + (on ? 'on' : 'off');
}

// ---------- deck storage: several decks at once (this browser only) ----------
// Logged out, the decks live here under DECKS_KEY. The very first run migrates
// the old single-deck key ('dba-deck') once, keeping every card and check-off.
// The old key is left alone, so nothing is ever lost.
const DECKS_KEY = 'dba-decks';
const OLD_DECK_KEY = 'dba-deck';
function newId() {
  try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* fall through */ }
  return 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
// Numeric price helpers (Feature: market price total per deck).
function parsePriceNum(s) {
  if (typeof s === 'number' && isFinite(s)) return s;
  const m = /^\$\s*([\d,]+(?:\.\d{1,2})?)$/.exec(String(s || '').trim());
  if (m) {
    const n = parseFloat(m[1].replace(/,/g, ''));
    return isNaN(n) ? null : n;
  }
  return null;
}
function backfillCard(c) {
  c = c || {};
  if (c.priceNum === undefined) c.priceNum = parsePriceNum(c.price);
  if (typeof c.priceNum !== 'number' || !isFinite(c.priceNum)) c.priceNum = null;
  c.cmc = (typeof c.cmc === 'number' && isFinite(c.cmc) && c.cmc >= 0) ? c.cmc : null;
  c.colors = Array.isArray(c.colors) ? c.colors.filter((x) => /^[WUBRG]$/.test(x)) : [];
  c.maintype = typeof c.maintype === 'string' ? c.maintype : '';
  c.power = (c.power === null || c.power === undefined) ? null : String(c.power);
  c.toughness = (c.toughness === null || c.toughness === undefined) ? null : String(c.toughness);
  c.subtypes = Array.isArray(c.subtypes) ? c.subtypes.filter((x) => typeof x === 'string') : [];
  c.keywords = Array.isArray(c.keywords) ? c.keywords.filter((x) => typeof x === 'string') : [];
  c.removal = (typeof c.removal === 'number' && isFinite(c.removal) && c.removal >= 0)
    ? Math.min(99, Math.floor(c.removal)) : 0;
  c.lethalKws = Array.isArray(c.lethalKws) ? c.lethalKws.filter((x) => typeof x === 'string') : [];
  // Entries saved before v2.7 lack unlimited/legendary: mark them for the
  // one-time stats backfill instead of guessing.
  if (c.legendary === undefined || c.unlimited === undefined) c.statsOk = false;
  c.unlimited = !!c.unlimited;
  c.legendary = !!c.legendary;
  c.count = Number(c.count) > 0 ? Math.floor(Number(c.count)) : 1;
  c.checked = !!c.checked;
  c.commander = !!c.commander;
  return c;
}

// The main card type word from a Scryfall type line, e.g.
// "Legendary Creature — Dragon" -> "Creature". Used by the deck stats charts.
const STAT_TYPES = ['Creature', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Planeswalker', 'Land', 'Battle'];
function mainTypeOf(card) {
  const faces = card.card_faces || [];
  const line = card.type_line || (faces[0] && faces[0].type_line) || '';
  const before = line.split(/[—–-]/)[0].trim();
  const words = before.split(/\s+/).filter(Boolean);
  const last = words.length ? words[words.length - 1] : '';
  const word = last.charAt(0).toUpperCase() + last.slice(1).toLowerCase();
  return STAT_TYPES.includes(word) ? word : 'Other';
}

// The small stat fields the deck-stats charts need, taken from a Scryfall
// card object (face 0 for double-faced cards when the top level is missing).
function statFieldsOf(card) {
  const face = (card.card_faces && card.card_faces[0]) || {};
  const cmc = (typeof card.cmc === 'number' && isFinite(card.cmc)) ? card.cmc
    : ((typeof face.cmc === 'number' && isFinite(face.cmc)) ? face.cmc : null);
  const colors = Array.isArray(card.colors) ? card.colors
    : (Array.isArray(face.colors) ? face.colors : []);
  const typeLine = card.type_line || face.type_line || '';
  const after = typeLine.split(/[—–]/)[1] || '';
  const subtypes = after.trim().split(/\s+/).filter(Boolean);
  const power = (card.power !== undefined && card.power !== null) ? String(card.power)
    : ((face.power !== undefined && face.power !== null) ? String(face.power) : null);
  const toughness = (card.toughness !== undefined && card.toughness !== null) ? String(card.toughness)
    : ((face.toughness !== undefined && face.toughness !== null) ? String(face.toughness) : null);
  const keywords = Array.isArray(card.keywords) ? card.keywords
    : (Array.isArray(face.keywords) ? face.keywords : []);
  return {
    cmc: cmc,
    colors: colors.filter((c) => /^[WUBRG]$/.test(c)),
    maintype: mainTypeOf(card),
    power: power,
    toughness: toughness,
    subtypes: subtypes,
    keywords: keywords.filter((k) => typeof k === 'string'),
    removal: removalCountOf(card),
    lethalKws: lethalKeywordsOf(card),
    statsOk: true,
  };
}

// Removal/interaction count for the Battle rating: how many times the card's
// rules text destroys, exiles, deals damage, counters, or makes players
// sacrifice. Capped at 3 per card.
function removalCountOf(card) {
  const face = (card.card_faces && card.card_faces[0]) || {};
  const text = card.oracle_text || face.oracle_text || '';
  const m = String(text).match(/\b(destroy|exile|damage|counter|sacrifice)\b/gi);
  return Math.min(3, m ? m.length : 0);
}

// Evasion/finisher abilities for the Battle rating's Lethality factor.
// Checks Scryfall keywords plus rules text for "can't be blocked".
const LETHAL_KWS = ['flying', 'trample', 'menace', 'haste', 'deathtouch', 'double strike'];
function lethalKeywordsOf(card) {
  const face = (card.card_faces && card.card_faces[0]) || {};
  const kws = Array.isArray(card.keywords) ? card.keywords
    : (Array.isArray(face.keywords) ? face.keywords : []);
  const text = String(card.oracle_text || face.oracle_text || '');
  const found = [];
  LETHAL_KWS.forEach((k) => {
    if (kws.some((x) => String(x).toLowerCase() === k)) found.push(cap1(k));
  });
  if (/\bcan't be blocked\b|\bunblockable\b/i.test(text) && found.indexOf('Unblockable') === -1) {
    found.push('Unblockable');
  }
  return found;
}
function blankDeck(name) {
  return { id: newId(), name: name || 'New deck', format: 'commander', cards: [] };
}
function sanitizeDeck(d) {
  d = d || {};
  d.id = d.id || newId();
  d.name = d.name || 'My deck';
  d.format = ['commander', 'standard', 'modern'].includes(d.format) ? d.format : 'commander';
  d.cards = Array.isArray(d.cards) ? d.cards.map(backfillCard) : [];
  return d;
}
function loadCollection() {
  let col = null;
  try { col = JSON.parse(localStorage.getItem(DECKS_KEY) || 'null'); } catch (e) { /* corrupted: rebuild below */ }
  if (col && Array.isArray(col.decks) && col.decks.length) {
    col.decks = col.decks.map(sanitizeDeck);
    if (!col.decks.some((d) => d.id === col.activeId)) col.activeId = col.decks[0].id;
    return col;
  }
  let old = null;
  try { old = JSON.parse(localStorage.getItem(OLD_DECK_KEY) || 'null'); } catch (e) { /* ignore */ }
  const d = sanitizeDeck({ name: old && old.name, format: old && old.format, cards: old && old.cards });
  const migrated = { decks: [d], activeId: d.id };
  try { localStorage.setItem(DECKS_KEY, JSON.stringify(migrated)); } catch (e) { /* ignore */ }
  return migrated;
}
let collection = loadCollection();
// `deck` always points at the ACTIVE deck entry, so every deck function below
// keeps working on whichever deck is active.
let deck = collection.decks.find((d) => d.id === collection.activeId) || collection.decks[0];
function saveDecks() {
  collection.activeId = deck.id;
  try { localStorage.setItem(DECKS_KEY, JSON.stringify(collection)); } catch (e) { /* storage full: keep going */ }
  updateDeckPill();
  scheduleServerSync(); // no-op unless logged in
}
function saveDeck() { saveDecks(); } // old name, still used everywhere

// Keep the deck tab inputs (name field, format picker, deck switcher) in sync
// with the active deck.
function syncDeckInputs() {
  $('#deck-name').value = deck.name;
  $('#deck-format').value = deck.format;
  searchFormat = deck.format;
  $$('.format-btn').forEach((b) => {
    const on = b.dataset.format === deck.format;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  });
  renderDeckSelect();
}
function renderDeckSelect() {
  const sel = $('#deck-select');
  sel.innerHTML = '';
  collection.decks.forEach((d) => {
    const o = document.createElement('option');
    o.value = d.id;
    o.textContent = d.name + ' (' + cap(d.format) + ')';
    if (d.id === deck.id) o.selected = true;
    sel.appendChild(o);
  });
}

// ---------- announcements ----------
function announce(msg) { $('#announce').textContent = msg; }

// ---------- tabs ----------
$$('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('.tab').forEach((b) => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');
    $$('.panel').forEach((p) => (p.hidden = true));
    $('#tab-' + btn.dataset.tab).hidden = false;
    if (btn.dataset.tab === 'deck') renderDeck();
  });
});

// ---------- format picker ----------
let searchFormat = 'commander';
$$('.format-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('.format-btn').forEach((b) => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');
    searchFormat = btn.dataset.format;
    deck.format = searchFormat;
    $('#deck-format').value = searchFormat;
    saveDeck();
  });
});
$('#deck-format').addEventListener('change', (e) => {
  deck.format = e.target.value;
  searchFormat = deck.format;
  $$('.format-btn').forEach((b) => {
    const on = b.dataset.format === deck.format;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  });
  saveDeck();
  renderDeck();
});
$('#deck-name').addEventListener('input', (e) => {
  deck.name = e.target.value || 'My deck';
  saveDeck();
  renderDeckSelect(); // keep the switcher label fresh while typing
});

// ---------- multiple decks: switch, new, rename, delete ----------
function activeKeyFor(uid) { return 'dba-active-' + uid; }

async function setActiveDeck(id) {
  const target = collection.decks.find((d) => d.id === id);
  if (!target || target.id === deck.id) return;
  if (accountsOn && me) await syncDeckToServer(deck); // save the deck we're leaving first
  deck = target;
  if (accountsOn && me) {
    try { localStorage.setItem(activeKeyFor(me.id), deck.serverId || deck.id); } catch (e) { /* ignore */ }
    if (deck.serverId) {
      try {
        const full = await api('/api/decks/' + encodeURIComponent(deck.serverId));
        if (full.ok) {
          deck.name = full.data.name || deck.name;
          deck.format = ['commander', 'standard', 'modern'].includes(full.data.format) ? full.data.format : deck.format;
          deck.cards = Array.isArray(full.data.cards) ? full.data.cards.map(backfillCard) : [];
        } else if (full.status === 404) { deck.serverId = null; }
      } catch (e) { /* keep the local copy */ }
    }
  }
  syncDeckInputs();
  saveDecks();
  renderDeck();
  announce('Switched to ' + deck.name + '.');
}
$('#deck-select').addEventListener('change', (e) => setActiveDeck(e.target.value));

async function createDeck() {
  if (accountsOn && me) await syncDeckToServer(deck);
  const d = blankDeck('New deck ' + (collection.decks.length + 1));
  collection.decks.push(d);
  if (accountsOn && me) {
    const r = await api('/api/decks', { method: 'POST', body: JSON.stringify({ name: d.name, format: d.format, cards: [], checks: {} }) });
    if (r.ok && r.data && r.data.id) d.serverId = r.data.id;
    else if (r.status === 401) { await silentLogout(); }
  }
  deck = d;
  if (accountsOn && me) {
    try { localStorage.setItem(activeKeyFor(me.id), deck.serverId || deck.id); } catch (e) { /* ignore */ }
  }
  syncDeckInputs();
  saveDecks();
  renderDeck();
  announce('New deck created. It is now the active deck.');
}
$('#new-deck').addEventListener('click', () => createDeck());

function renameDeck() {
  if (typeof prompt !== 'function') return;
  const name = prompt('New name for this deck:', deck.name);
  if (name === null) return; // cancelled
  deck.name = name.trim() || deck.name;
  syncDeckInputs();
  saveDecks();
  renderDeck();
  announce('Deck renamed to ' + deck.name + '.');
}
$('#rename-deck').addEventListener('click', renameDeck);

let deleteArmed = false, deleteTimer = null;
async function confirmDeleteDeck() {
  const btn = $('#delete-deck');
  if (!deleteArmed) {
    deleteArmed = true;
    btn.textContent = 'Tap again to delete';
    announce('Tap Delete once more to remove "' + deck.name + '". This cannot be undone.');
    clearTimeout(deleteTimer);
    deleteTimer = setTimeout(() => { deleteArmed = false; btn.textContent = 'Delete'; }, 6000);
    return;
  }
  clearTimeout(deleteTimer);
  deleteArmed = false;
  btn.textContent = 'Delete';
  const doomed = deck;
  if (accountsOn && me && doomed.serverId) {
    try { await api('/api/decks/' + encodeURIComponent(doomed.serverId), { method: 'DELETE' }); } catch (e) { /* keep going */ }
  }
  collection.decks = collection.decks.filter((d) => d.id !== doomed.id);
  if (!collection.decks.length) collection.decks.push(blankDeck('My deck'));
  deck = collection.decks[0];
  if (accountsOn && me) {
    try { localStorage.setItem(activeKeyFor(me.id), deck.serverId || deck.id); } catch (e) { /* ignore */ }
  }
  syncDeckInputs();
  saveDecks();
  renderDeck();
  announce('Deck deleted.');
}
$('#delete-deck').addEventListener('click', () => confirmDeleteDeck());

// ---------- Scryfall helpers ----------
function clean(s) { return (s || '').replace(/["“”]/g, '').trim(); }

function imgOf(card, face) {
  face = face || 0;
  if (card.image_uris && card.image_uris.normal) return card.image_uris.normal;
  const faces = card.card_faces || [];
  if (faces[face] && faces[face].image_uris) return faces[face].image_uris.normal;
  return '';
}
function backImgOf(card) {
  const faces = card.card_faces || [];
  return faces[1] && faces[1].image_uris ? faces[1].image_uris.normal : '';
}
function priceOf(card) {
  const p = card.prices && card.prices.usd;
  return p ? '$' + Number(p).toFixed(2) : '—';
}
function numPriceOf(card) {
  const p = card.prices && card.prices.usd;
  const n = parseFloat(p);
  return isNaN(n) ? null : n;
}
const FORMAT_KEY = { commander: 'commander', standard: 'standard', modern: 'modern' };
function legalityLine(card) {
  const leg = card.legalities && card.legalities[FORMAT_KEY[searchFormat]];
  if (leg === 'legal') return '<p class="legal ok">✓ Legal in ' + cap(searchFormat) + '</p>';
  if (leg === 'banned') return '<p class="legal no">✗ Banned in ' + cap(searchFormat) + '</p>';
  return '<p class="legal no">Not legal in ' + cap(searchFormat) + '</p>';
}
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function isBasicLand(card) { return /Basic Land/.test(card.type_line || ''); }

// Cards like Relentless Rats whose rules text says a deck can have any
// number of them: no copy limits in any format, just like basic lands.
function allowsAnyNumber(card) {
  if (isBasicLand(card)) return true;
  const faces = card.card_faces || [];
  const text = card.oracle_text || (faces[0] && faces[0].oracle_text) || '';
  return /a deck can have any number of cards named/i.test(text);
}

// Quantity stepper for cards with no copy limit (basic lands and "a deck
// can have any number" cards). Returns '' for everything else.
function qtyStepperHTML(card) {
  if (!allowsAnyNumber(card)) return '';
  return '<label class="qty-label">Qty <input type="number" class="qty-input" min="1" max="99" value="1" ' +
    'aria-label="How many ' + esc(card.name) + ' to add"></label>';
}
function qtyFromEl(scope) {
  const el = scope.querySelector('.qty-input');
  const n = el ? parseInt(el.value, 10) : 1;
  return Math.max(1, Math.min(99, isNaN(n) ? 1 : n));
}
function viewerQty() {
  if ($('#viewer-qty-wrap').hidden) return 1;
  const n = parseInt($('#viewer-qty').value, 10);
  return Math.max(1, Math.min(99, isNaN(n) ? 1 : n));
}

// Any legendary creature can be a commander (checks the front face too
// for double-faced cards).
function isLegendaryCreature(card) {
  const faces = card.card_faces || [];
  const line = (card.type_line || '') + ' ' + ((faces[0] && faces[0].type_line) || '');
  return /\bLegendary\b/i.test(line) && /\bCreature\b/i.test(line);
}

// Switch the active deck to Commander format (same as the Deck ideas tab).
function ensureCommanderFormat() {
  if (deck.format === 'commander') return;
  deck.format = 'commander';
  searchFormat = 'commander';
  const df = $('#deck-format');
  if (df) df.value = 'commander';
  $$('.format-btn').forEach((b) => {
    const on = b.dataset.format === 'commander';
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  });
}

// Set a card as the deck's commander. If another commander is already set,
// the first tap arms a confirm ("Tap again to replace …"), the second tap
// replaces it. Returns true when the commander was set, false while arming.
let commanderArmPid = null, commanderArmTimer = null;
function handleSetCommander(card, btn) {
  ensureCommanderFormat();
  const current = deck.cards.find((c) => c.commander);
  if (current && current.pid === card.id) {
    announce(card.name + ' is already your commander.');
    return true;
  }
  if (current && commanderArmPid !== card.id) {
    commanderArmPid = card.id;
    if (btn) {
      if (btn.dataset.orig === undefined) btn.dataset.orig = btn.textContent;
      btn.textContent = 'Tap again to replace';
    }
    announce('Tap again to replace ' + current.name + ' as commander.');
    clearTimeout(commanderArmTimer);
    commanderArmTimer = setTimeout(() => {
      commanderArmPid = null;
      if (btn && btn.isConnected && btn.dataset.orig !== undefined) btn.textContent = btn.dataset.orig;
    }, 6000);
    return false;
  }
  clearTimeout(commanderArmTimer);
  commanderArmPid = null;
  if (btn && btn.dataset.orig !== undefined) btn.textContent = btn.dataset.orig;
  deck.cards = deck.cards.filter((c) => !c.commander);
  addCardToDeck(card, true);
  announce(card.name + ' is now your commander.');
  return true;
}

// ---------- search ----------
let searchPage = 1, hasMore = false;

function buildQuery() {
  const parts = [];
  const name = clean($('#q-name').value);
  const type = clean($('#q-type').value);
  const ability = clean($('#q-ability').value);
  const colors = $$('input[name="color"]:checked').map((c) => c.value).join('');
  if (name) parts.push(name);
  if (type) parts.push('t:"' + type.toLowerCase() + '"');
  if (ability) parts.push('o:"' + ability.toLowerCase() + '"');
  if (colors) parts.push('c>=' + colors);
  const set = clean($('#q-set').value);
  if (set) parts.push('s:' + set.toLowerCase());
  const cn = clean($('#q-cn').value);
  if (/^\d+$/.test(cn)) parts.push('cn:' + cn);
  const maxp = parseFloat($('#q-maxprice').value);
  if (!isNaN(maxp)) parts.push('usd<=' + maxp);
  parts.push('f:' + searchFormat);
  return parts.join(' ') || 'f:' + searchFormat;
}

async function runSearch(page, custom) {
  const q = custom ? custom.q : buildQuery();
  const params = new URLSearchParams({
    q, order: custom ? custom.order : 'name', dir: custom ? custom.dir : 'auto', page: String(page),
  });
  if (custom ? custom.unique : $('#q-prints').checked) params.set('unique', 'prints');
  announce('Searching…');
  try {
    const res = await fetch('/api/search?' + params.toString());
    const data = await res.json();
    if (data.error) { announce(data.error); $('#results-info').textContent = data.error; $('#results').innerHTML = ''; return; }
    renderCards(data.data || []);
    searchPage = page;
    hasMore = !!data.has_more;
    $('#pager').hidden = !(page > 1 || hasMore);
    $('#prev-page').disabled = page <= 1;
    const n = data.total_cards || 0;
    const countText = custom
      ? n + ' version' + (n === 1 ? '' : 's') + ' found'
      : n + ' card' + (n === 1 ? '' : 's') + ' found';
    $('#results-info').textContent = custom ? custom.label + ' — ' + countText : countText;
    $('#results-info').setAttribute('aria-hidden', 'false');
    announce(custom ? custom.label + ' — ' + countText + '.' : n + ' cards found.');
  } catch (e) {
    $('#results-info').textContent = 'Search failed. Check your connection and try again.';
    announce('Search failed.');
  }
}

$('#search-form').addEventListener('submit', (e) => { e.preventDefault(); activeCustom = null; runSearch(1); });
$('#next-page').addEventListener('click', () => { if (hasMore) runSearch(searchPage + 1, activeCustom); });
$('#prev-page').addEventListener('click', () => { if (searchPage > 1) runSearch(searchPage - 1, activeCustom); });

// ---------- basic lands ----------
const BASIC_LANDS = [
  { name: 'Plains',   key: 'plains',   q: 't:basic t:plains' },
  { name: 'Island',   key: 'island',   q: 't:basic t:island' },
  { name: 'Swamp',    key: 'swamp',    q: 't:basic t:swamp' },
  { name: 'Mountain', key: 'mountain', q: 't:basic t:mountain' },
  { name: 'Forest',   key: 'forest',   q: 't:basic t:forest' },
  { name: 'Wastes',   key: 'wastes',   q: 't:basic !"wastes"' },
];
let activeCustom = null;

function basicLandQuery(land) {
  let q = land.q;
  const set = clean($('#q-set').value).toLowerCase();
  if (set) q += ' set:' + set;
  const cn = clean($('#q-cn').value);
  if (/^\d+$/.test(cn)) q += ' cn:' + cn;
  return q;
}

function landCustom(land) {
  return {
    q: basicLandQuery(land), order: 'set', dir: 'asc', unique: true,
    label: 'Showing ' + land.name + ' printings',
  };
}

async function runBasicLandSearch(land, page) {
  activeCustom = landCustom(land);
  await runSearch(page || 1, activeCustom);
}

$$('.land-btn').forEach((b) => {
  b.addEventListener('click', () => {
    const land = BASIC_LANDS.find((l) => l.key === b.dataset.land);
    if (land) runBasicLandSearch(land, 1);
  });
});

$('#more-filters-btn').addEventListener('click', () => {
  const open = $('#more-filters').hidden;
  $('#more-filters').hidden = !open;
  const b = $('#more-filters-btn');
  b.setAttribute('aria-expanded', String(open));
  b.textContent = open ? 'Fewer choices ▾' : 'More choices ▸';
});

// gentle autocomplete on the name field
let acTimer = null;
$('#q-name').addEventListener('input', (e) => {
  clearTimeout(acTimer);
  const v = e.target.value.trim();
  if (v.length < 2) return;
  acTimer = setTimeout(async () => {
    try {
      const res = await fetch('/api/autocomplete?q=' + encodeURIComponent(v));
      const data = await res.json();
      const dl = $('#name-suggest');
      dl.innerHTML = '';
      (data.data || []).slice(0, 8).forEach((n) => {
        const o = document.createElement('option');
        o.value = n;
        dl.appendChild(o);
      });
    } catch (e) { /* ignore */ }
  }, 350);
});

function renderCards(cards) {
  const grid = $('#results');
  grid.innerHTML = '';
  cards.forEach((card) => {
    const d = document.createElement('div');
    d.className = 'card';
    const img = imgOf(card);
    d.innerHTML =
      '<img src="' + img + '" alt="Card art: ' + esc(card.name) + '" loading="lazy" tabindex="0" role="button" aria-label="View pictures and versions of ' + esc(card.name) + '">' +
      '<h3>' + esc(card.name) + '</h3>' +
      '<p class="price">' + priceOf(card) + '</p>' +
      legalityLine(card) +
      '<div class="row"><button type="button" class="secondary view-btn">Pictures &amp; versions</button>' +
      '<button type="button" class="primary add-btn">+ Add</button>' +
      qtyStepperHTML(card) +
      (isLegendaryCreature(card) ? '<button type="button" class="secondary cmd-btn">👑 Set as commander</button>' : '') + '</div>';
    const imgEl = d.querySelector('img');
    const open = () => openViewer(card);
    imgEl.addEventListener('click', open);
    imgEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    d.querySelector('.view-btn').addEventListener('click', open);
    d.querySelector('.add-btn').addEventListener('click', () => addCardToDeck(card, false, qtyFromEl(d)));
    const cmdBtn = d.querySelector('.cmd-btn');
    if (cmdBtn) cmdBtn.addEventListener('click', () => handleSetCommander(card, cmdBtn));
    grid.appendChild(d);
  });
}

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- pictures & versions viewer ----------
let viewerCard = null, viewerPrintings = [], viewerFace = 0;

async function openViewer(card) {
  viewerCard = card;
  viewerFace = 0;
  $('#viewer-title').textContent = card.name;
  $('#viewer-img').src = imgOf(card);
  $('#viewer-img').alt = 'Card art: ' + card.name + ' (front face)';
  $('#viewer-flip').hidden = !backImgOf(card);
  $('#viewer-commander').hidden = !isLegendaryCreature(card);
  $('#viewer-qty-wrap').hidden = !allowsAnyNumber(card);
  syncViewerFlipA11y();
  $('#viewer-label').textContent = (card.type_line || '') + ' — ' + (card.mana_cost || '');
  $('#viewer-price').textContent = priceOf(card);
  $('#viewer').hidden = false;
  $('#viewer-close').focus();
  announce('Opened pictures and versions for ' + card.name + '.');

  const sel = $('#viewer-printings');
  sel.innerHTML = '<option>Loading versions…</option>';
  $('#viewer-version-detail').textContent = '';
  try {
    const res = await fetch('/api/printings?name=' + encodeURIComponent(card.name));
    const data = await res.json();
    viewerPrintings = data.data || [];
    sel.innerHTML = '';
    viewerPrintings.forEach((p, i) => {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = p.set_name + ' (' + p.set.toUpperCase() + ' #' + p.collector_number + ') — ' + priceOf(p);
      sel.appendChild(o);
    });
    if (viewerPrintings.length) pickPrinting(0);
    else $('#viewer-version-detail').textContent = 'No other versions found.';
  } catch (e) {
    sel.innerHTML = '';
    $('#viewer-version-detail').textContent = 'Versions could not be loaded right now.';
  }
}

function pickPrinting(i) {
  const p = viewerPrintings[i];
  if (!p) return;
  viewerFace = 0;
  $('#viewer-img').src = imgOf(p);
  $('#viewer-img').alt = 'Card art: ' + p.name + ' (front face)';
  $('#viewer-flip').hidden = !backImgOf(p);
  $('#viewer-commander').hidden = !isLegendaryCreature(p);
  $('#viewer-qty-wrap').hidden = !allowsAnyNumber(p);
  syncViewerFlipA11y();
  $('#viewer-label').textContent = p.set_name + ' (' + p.set.toUpperCase() + ' #' + p.collector_number + ')';
  $('#viewer-price').textContent = priceOf(p);
  $('#viewer-version-detail').textContent =
    'Released ' + (p.released_at || '—') + ' · ' + (p.rarity || '') + (p.artist ? ' · Art by ' + p.artist : '');
}

$('#viewer-printings').addEventListener('change', (e) => pickPrinting(Number(e.target.value)));

// Flip a double-faced card in the viewer. Tapping the card image does the
// same as the "Flip card" button; the button stays for clarity.
function syncViewerFlipA11y() {
  const img = $('#viewer-img');
  const flippable = !$('#viewer-flip').hidden;
  if (flippable) {
    img.tabIndex = 0;
    img.setAttribute('role', 'button');
    img.setAttribute('aria-label', 'Flip card — showing the ' + (viewerFace === 0 ? 'front' : 'back') +
      ' face of ' + ($('#viewer-title').textContent || 'this card') + '. Activate to flip.');
  } else {
    img.tabIndex = -1;
    img.removeAttribute('role');
    img.removeAttribute('aria-label');
  }
}
function flipViewer() {
  if ($('#viewer').hidden || $('#viewer-flip').hidden) return;
  const p = viewerPrintings[Number($('#viewer-printings').value || 0)] || viewerCard;
  const back = backImgOf(p);
  if (!back) return;
  viewerFace = viewerFace === 0 ? 1 : 0;
  const img = $('#viewer-img');
  img.src = viewerFace === 0 ? imgOf(p) : back;
  const face = viewerFace === 0 ? 'front' : 'back';
  img.alt = 'Card art: ' + (p.name || 'this card') + ' (' + face + ' face)';
  syncViewerFlipA11y();
  announce('Showing ' + face + ' face.');
}
$('#viewer-flip').addEventListener('click', () => flipViewer());
$('#viewer-img').addEventListener('click', () => flipViewer());
$('#viewer-img').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flipViewer(); }
});
$('#viewer-close').addEventListener('click', () => { $('#viewer').hidden = true; });
$('#viewer').addEventListener('click', (e) => { if (e.target.id === 'viewer') $('#viewer').hidden = true; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#viewer').hidden) $('#viewer').hidden = true; });
$('#viewer-add').addEventListener('click', () => {
  const i = Number($('#viewer-printings').value || 0);
  const p = viewerPrintings[i] || viewerCard;
  addCardToDeck(p, false, viewerQty());
  $('#viewer').hidden = true;
});
$('#viewer-commander').addEventListener('click', (e) => {
  const i = Number($('#viewer-printings').value || 0);
  const p = viewerPrintings[i] || viewerCard;
  if (handleSetCommander(p, e.currentTarget)) $('#viewer').hidden = true;
});

// ---------- deck ----------
function deckTotal() { return deck.cards.reduce((n, c) => n + c.count, 0); }

// Market price total for the active deck.
function deckValue() {
  let total = 0, missing = 0;
  deck.cards.forEach((c) => {
    const n = typeof c.priceNum === 'number' && isFinite(c.priceNum) ? c.priceNum : null;
    const count = c.count > 0 ? c.count : 1;
    if (n === null) missing += count;
    else total += n * count;
  });
  return { total: Math.round(total * 100) / 100, missing: missing };
}
function deckValueLine() {
  if (!deck.cards.length) return '';
  const priced = deck.cards.some((c) => typeof c.priceNum === 'number' && isFinite(c.priceNum));
  if (!priced) return 'Deck value: — (no prices listed)';
  const v = deckValue();
  let s = 'Deck value: $' + v.total.toFixed(2);
  if (v.missing > 0) s += ' · ' + v.missing + (v.missing === 1 ? ' card has' : ' cards have') + ' no listed price';
  return s;
}

function deckValueLine() {
  if (!deck.cards.length) return '';
  const priced = deck.cards.some((c) => typeof c.priceNum === 'number' && isFinite(c.priceNum));
  if (!priced) return 'Deck value: — (no prices listed)';
  const v = deckValue();
  let s = 'Deck value: $' + v.total.toFixed(2);
  if (v.missing > 0) s += ' · ' + v.missing + (v.missing === 1 ? ' card has' : ' cards have') + ' no listed price';
  return s;
}

// ---------- deck stats (v2.4): charts + coaching ----------
// Entries added from search carry cmc/colors/maintype/power/toughness/
// subtypes/keywords/statsOk (see statFieldsOf). Older entries get them from
// the one-time per-deck backfill below (POST /api/cards/collection).
const statsBackfillTried = {};
const statsBackfillBusy = {};

function statCopies(c) { return c.count > 0 ? Math.floor(c.count) : 1; }

function topEntries(obj, n) {
  return Object.keys(obj).map((k) => ({ name: k, n: obj[k] }))
    .sort((a, b) => b.n - a.n || (a.name < b.name ? -1 : 1)).slice(0, n);
}

function nameList(names) {
  const e = names.map(esc);
  if (e.length <= 1) return e.join('');
  if (e.length === 2) return e[0] + ' and ' + e[1];
  return e.slice(0, -1).join(', ') + ', and ' + e[e.length - 1];
}

function plural(word) {
  const irr = { Elf: 'Elves', Dwarf: 'Dwarves', Wolf: 'Wolves', Faerie: 'Faeries' };
  if (irr[word]) return irr[word];
  if (/s$|x$|ch$|sh$/i.test(word)) return word + 'es';
  return word + 's';
}

function cap1(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
const COLOR_NAMES = { W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' };

function computeStats(cards) {
  const ok = cards.filter((c) => c.statsOk);
  const total = cards.reduce((n, c) => n + statCopies(c), 0);
  const missing = cards.reduce((n, c) => n + (c.statsOk ? 0 : statCopies(c)), 0);
  const curve = [0, 0, 0, 0, 0, 0, 0];
  const colors = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  const types = {};
  let speedSum = 0, speedN = 0, early = 0, mid = 0, late = 0;
  let powSum = 0, powN = 0, touSum = 0, touN = 0;
  let small = 0, medium = 0, big = 0, unknownPow = 0, bigThreats = 0;
  let creatureCopies = 0, spellCopies = 0, landCount = 0, okNonLand = 0;
  const tribes = {}, keywords = {}, lethalKws = {};
  let lethalCreatures = 0, removalCards = 0;
  const seenPid = {};
  const expensive = [], priciest = [];
  ok.forEach((c) => {
    const n = statCopies(c);
    if (!seenPid[c.pid]) {
      seenPid[c.pid] = true;
      if (typeof c.cmc === 'number') expensive.push({ name: c.name, cmc: c.cmc, n: n });
      if (typeof c.priceNum === 'number') priciest.push({ name: c.name, price: c.priceNum, n: n });
    }
    const isLand = c.maintype === 'Land';
    if (isLand) { landCount += n; } else { okNonLand += n; }
    if (!isLand && (c.removal || 0) > 0) removalCards += n;
    else if (typeof c.cmc === 'number') {
      curve[c.cmc >= 6 ? 6 : Math.floor(c.cmc)] += n;
      speedSum += c.cmc * n; speedN += n;
      if (c.cmc <= 2) early += n; else if (c.cmc <= 4) mid += n; else late += n;
    }
    if (c.colors && c.colors.length) {
      c.colors.forEach((k) => { if (colors[k] !== undefined) colors[k] += n; });
    } else { colors.C += n; }
    const t = c.maintype || 'Other';
    types[t] = (types[t] || 0) + n;
    if (c.maintype === 'Creature') {
      creatureCopies += n;
      const p = parseFloat(c.power);
      const tv = parseFloat(c.toughness);
      const pKnown = c.power !== null && c.power !== undefined && c.power !== '' && isFinite(p);
      const tKnown = c.toughness !== null && c.toughness !== undefined && c.toughness !== '' && isFinite(tv);
      if (pKnown) {
        powSum += p * n; powN += n;
        if (p <= 1) small += n; else if (p <= 3) medium += n; else big += n;
        if (p >= 5) bigThreats += n;
      } else { unknownPow += n; }
      if (tKnown) { touSum += tv * n; touN += n; }
      (c.subtypes || []).forEach((s) => { tribes[s] = (tribes[s] || 0) + n; });
      const lk = Array.isArray(c.lethalKws) ? c.lethalKws : [];
      if (lk.length) {
        lethalCreatures += n;
        lk.forEach((k) => { lethalKws[k] = (lethalKws[k] || 0) + n; });
      }
    } else if (!isLand) { spellCopies += n; }
    (c.keywords || []).forEach((k) => { keywords[k] = (keywords[k] || 0) + n; });
  });
  expensive.sort((a, b) => b.cmc - a.cmc || (a.name < b.name ? -1 : 1));
  priciest.sort((a, b) => b.price - a.price || (a.name < b.name ? -1 : 1));
  return {
    total: total, missing: missing,
    curve: curve, curveTotal: curve.reduce((a, b) => a + b, 0),
    colors: colors, types: types,
    speed: { avg: speedN ? speedSum / speedN : null, n: speedN, early: early, mid: mid, late: late },
    size: {
      avgP: powN ? powSum / powN : null, avgT: touN ? touSum / touN : null,
      small: small, medium: medium, big: big, unknown: unknownPow, creatures: creatureCopies,
    },
    creatureCopies: creatureCopies, spellCopies: spellCopies, landCount: landCount,
    okNonLand: okNonLand, removalCards: removalCards, bigThreats: bigThreats,
    lethal: { withLethal: lethalCreatures, byKeyword: topEntries(lethalKws, 5) },
    tribes: topEntries(tribes, 5), keywords: topEntries(keywords, 5),
    expensive: expensive, priciest: priciest,
  };
}

// Up to `limit` example cards of one creature subtype, most copies first.
function tribeExamples(cards, subtype, limit) {
  const seen = {};
  const list = [];
  cards.forEach((c) => {
    if (!c.statsOk || c.maintype !== 'Creature' || seen[c.pid]) return;
    if ((c.subtypes || []).indexOf(subtype) === -1) return;
    seen[c.pid] = true;
    list.push({ name: c.name, n: statCopies(c) });
  });
  list.sort((a, b) => b.n - a.n);
  return list.slice(0, limit);
}

// ---------- inline SVG charts (no dependencies) ----------
function svgOpen(w, h, label) {
  return '<svg class="stat-svg" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(label) + '">';
}

function manaCurveSVG(st) {
  const buckets = st.curve;
  const W = 360, H = 172, top = 28, bottom = 26;
  const max = Math.max.apply(null, buckets.concat([1]));
  const slot = W / buckets.length, bw = Math.min(40, slot * 0.62);
  const aria = 'Mana curve: ' + buckets.map((v, i) =>
    v + (v === 1 ? ' card costs ' : ' cards cost ') + (i === 6 ? '6 or more' : i) + ' mana').join(', ');
  let s = svgOpen(W, H, aria);
  buckets.forEach((v, i) => {
    const x = slot * i + (slot - bw) / 2;
    const bh = (H - top - bottom) * (v / max);
    const y = H - bottom - bh;
    const label = i === 6 ? '6+' : String(i);
    s += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) +
      '" height="' + Math.max(bh, v ? 3 : 0).toFixed(1) + '" rx="4" fill="#e8a33d"/>';
    s += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (y - 7).toFixed(1) +
      '" text-anchor="middle" font-size="13">' + v + '</text>';
    s += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 8) +
      '" text-anchor="middle" font-size="12">' + label + '</text>';
  });
  return s + '</svg>';
}

function hbarSVG(rows, aria) {
  const W = 360, rowH = 30, labelW = 108, valW = 36;
  const H = rows.length * rowH + 10;
  const max = Math.max.apply(null, rows.map((r) => r.value).concat([1]));
  const barW = W - labelW - valW;
  let s = svgOpen(W, H, aria);
  rows.forEach((r, i) => {
    const y = 8 + i * rowH;
    const w = Math.max(r.value ? 4 : 0, barW * r.value / max);
    s += '<text x="0" y="' + (y + 18) + '" font-size="13">' + esc(r.label) + '</text>';
    s += '<rect x="' + labelW + '" y="' + (y + 5) + '" width="' + w.toFixed(1) +
      '" height="16" rx="8" fill="' + r.color + '"/>';
    s += '<text x="' + (labelW + w + 7).toFixed(1) + '" y="' + (y + 18) +
      '" font-size="13">' + r.value + '</text>';
  });
  return s + '</svg>';
}

function colorsSVG(st) {
  const rows = [
    { label: 'White', value: st.colors.W, color: '#e8dcc0' },
    { label: 'Blue', value: st.colors.U, color: '#5aa3e8' },
    { label: 'Black', value: st.colors.B, color: '#8d8d9e' },
    { label: 'Red', value: st.colors.R, color: '#e85a5a' },
    { label: 'Green', value: st.colors.G, color: '#5ac878' },
    { label: 'Colorless', value: st.colors.C, color: '#6e6e6e' },
  ];
  const aria = 'Colors: ' + rows.map((r) => r.value + ' ' + r.label.toLowerCase()).join(', ');
  return hbarSVG(rows, aria);
}

function typesSVG(st) {
  const order = ['Creature', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Planeswalker', 'Land', 'Battle', 'Other'];
  const rows = order.map((t) => ({ label: t, value: st.types[t] || 0, color: '#e8a33d' }));
  const aria = 'Card types: ' + rows.map((r) => r.value + ' ' + r.label.toLowerCase()).join(', ');
  return hbarSVG(rows, aria);
}

function sizeSVG(st) {
  const rows = [
    { label: 'Small (0–1)', value: st.size.small, color: '#8fd18a' },
    { label: 'Medium (2–3)', value: st.size.medium, color: '#e8a33d' },
    { label: 'Big (4+)', value: st.size.big, color: '#e78a8a' },
  ];
  const aria = 'Creature sizes: ' + st.size.small + ' small, ' + st.size.medium + ' medium, ' + st.size.big + ' big';
  return hbarSVG(rows, aria);
}

function speedBarSVG(st) {
  const segs = [
    { label: 'Early (0–2)', value: st.speed.early, color: '#8fd18a' },
    { label: 'Mid (3–4)', value: st.speed.mid, color: '#e8a33d' },
    { label: 'Late (5+)', value: st.speed.late, color: '#e78a8a' },
  ];
  const total = Math.max(segs[0].value + segs[1].value + segs[2].value, 1);
  const W = 360, H = 40;
  const aria = 'Speed split: ' + segs[0].value + ' early cards, ' + segs[1].value + ' mid cards, ' + segs[2].value + ' late cards';
  let s = svgOpen(W, H, aria);
  let x = 0;
  segs.forEach((g, i) => {
    const w = W * g.value / total;
    s += '<rect x="' + x.toFixed(1) + '" y="8" width="' + Math.max(w, g.value ? 3 : 0).toFixed(1) +
      '" height="24" rx="' + (i === 0 ? '6' : '0') + '" fill="' + g.color + '"/>';
    x += w;
  });
  return s + '</svg>' +
    '<p class="muted small">' + segs.map((g) =>
      '<span class="legend-dot" style="background:' + g.color + '"></span>' + esc(g.label) + ': ' + g.value
    ).join(' &nbsp; ') + '</p>';
}

// ---------- takeaways: plain-language reading of each chart ----------
function manaTakeaway(st) {
  const c = st.curve, total = st.curveTotal;
  if (!total) return 'No cards with known mana costs yet.';
  const early12 = c[1] + c[2];
  const late = c[5] + c[6];
  const out = [];
  out.push(early12 > 0
    ? early12 + ' of your ' + total + ' cards cost 1–2 mana, so you\'ll usually have something to play on turns 1 and 2.'
    : 'None of your cards cost 1–2 mana — you may have nothing to play on the first turns.');
  let peak = 0;
  c.forEach((v, i) => { if (v > c[peak]) peak = i; });
  const peakLabel = peak === 6 ? '6 or more' : String(peak);
  out.push('Most of your cards cost ' + peakLabel + ' mana' +
    (late > 0 ? ', but those ' + late + ' big cards (5+ mana) may sit in your hand during the early turns.' : '.'));
  const big7 = st.expensive.filter((e) => e.cmc >= 7);
  const big7n = big7.reduce((n, e) => n + e.n, 0);
  if (big7.length) {
    out.push('Your most expensive cards are ' +
      nameList(big7.slice(0, 3).map((e) => e.name + ' (' + e.cmc + ')')) +
      ' — ' + big7n + ' of your ' + st.total + ' cards cost 7 or more.');
  }
  return out.join(' ');
}

function colorsTakeaway(st) {
  const order = ['W', 'U', 'B', 'R', 'G'].filter((k) => st.colors[k] > 0)
    .sort((a, b) => st.colors[b] - st.colors[a]);
  if (!order.length) return st.colors.C ? 'All ' + st.colors.C + ' cards are colorless.' : '';
  const lead = order.slice(0, 2).map((k) => cap1(COLOR_NAMES[k]) + ' (' + st.colors[k] + ')');
  let s = 'Mostly ' + (lead.length === 2 ? lead[0] + ' and ' + lead[1] : lead[0]);
  const splash = order.slice(2);
  if (splash.length) s += ' with a splash of ' + splash.map((k) => COLOR_NAMES[k] + ' (' + st.colors[k] + ')').join(' and ');
  if (st.colors.C) s += ', plus ' + st.colors.C + ' colorless cards';
  s += '. ';
  s += order.length === 1 ? 'One color means your mana will be very reliable.'
    : order.length === 2 ? 'Two colors means your mana will be fairly reliable.'
    : 'With three or more colors, make sure you have enough lands that make each color.';
  return s;
}

function typesTakeaway(st) {
  const t = st.types;
  const creatures = t.Creature || 0;
  const spells = (t.Instant || 0) + (t.Sorcery || 0);
  if (!st.total) return '';
  if (creatures > 0 && creatures >= spells) {
    const spellWord = spells === 0 ? 'no instants or sorceries'
      : 'only ' + spells + ' instant' + (spells === 1 ? '' : 's') + ' and sorceries';
    return creatures + ' creature' + (creatures === 1 ? '' : 's') + ' and ' + spellWord +
      ' — your plan is to win by attacking.';
  }
  if (spells > creatures) {
    return spells + ' instants and sorceries vs ' + creatures + ' creatures — you win more with spells than with attackers.';
  }
  const others = st.total - creatures - spells - (t.Land || 0);
  return 'A mix of ' + creatures + ' creatures, ' + spells + ' instants and sorceries, and ' + others + ' other cards.';
}

function speedTakeaway(st) {
  const sp = st.speed;
  if (sp.avg === null) return 'No non-land cards with known mana costs yet.';
  const label = sp.avg < 2.5 ? 'Fast deck' : (sp.avg <= 3.5 ? 'Average-speed deck' : 'Slow deck');
  const exp = sp.avg < 2.5 ? "you'll pressure opponents early, but you may run out of cards if the game goes long."
    : sp.avg <= 3.5 ? "you'll have plays through most of the game."
    : 'your big cards hit hard late, but you need to survive the early turns.';
  return 'Average mana cost: ' + sp.avg.toFixed(2) + ' (non-land cards — lower is faster). ' + label + ' — ' + exp;
}

function sizeTakeaway(st) {
  const sz = st.size;
  if (sz.avgP === null) return 'No creatures with known power yet.';
  const impl = sz.avgP < 2 ? 'Abilities like flying or deathtouch help small creatures get through.'
    : sz.avgP >= 4 ? 'Big creatures end games fast — protect them.'
    : 'Medium creatures hold their own in a fight.';
  let s = 'Your creatures average ' + sz.avgP.toFixed(1) + ' power and ' +
    (sz.avgT !== null ? sz.avgT.toFixed(1) : '—') + ' toughness. ' + impl;
  if (sz.unknown) {
    s += ' (' + sz.unknown + (sz.unknown === 1 ? ' creature has' : ' creatures have') +
      ' unknown power — not counted, not treated as zero.)';
  }
  return s;
}

function synergyTakeaway(st, cards) {
  const tribe = st.tribes[0], kw = st.keywords[0];
  const parts = [];
  if (tribe && tribe.n >= 2) {
    const ex = tribeExamples(cards, tribe.name, 3);
    const more = tribe.n - ex.reduce((n, e) => n + e.n, 0);
    let s = 'Your ' + tribe.n + ' ' + plural(tribe.name) + ' include ' + nameList(ex.map((e) => e.name));
    if (more > 0) s += ' (and ' + more + ' more)';
    s += '.';
    parts.push(s);
    const ratio = st.creatureCopies ? tribe.n / st.creatureCopies : 0;
    const boost = ratio >= 0.5 ? 'half or more of your creatures'
      : ratio >= 0.33 ? 'about a third of your creatures' : 'many of your creatures';
    parts.push('Cards that say "' + esc(tribe.name) + ' you control get +1/+1" would boost ' + boost + ' at once.');
  }
  if (kw) {
    parts.push(cap(kw.name) + ' appears on ' + kw.n + ' of your cards — more cards with ' +
      kw.name.toLowerCase() + ' would work well together.');
  }
  if (!parts.length) return 'No strong groups yet — add more cards and check back.';
  return parts.join(' ');
}

function deckSummary(st) {
  const sp = st.speed;
  const speedWord = sp.avg === null ? null : (sp.avg < 2.5 ? 'fast' : (sp.avg <= 3.5 ? 'average-speed' : 'slow'));
  const order = ['W', 'U', 'B', 'R', 'G'].filter((k) => st.colors[k] > 0)
    .sort((a, b) => st.colors[b] - st.colors[a]);
  const colorPart = order.length >= 2 ? COLOR_NAMES[order[0]] + '-' + COLOR_NAMES[order[1]]
    : order.length === 1 ? COLOR_NAMES[order[0]] : 'colorless';
  const topTribe = st.tribes[0];
  const sizeAdj = st.size.avgP !== null ? (st.size.avgP < 2 ? 'small ' : (st.size.avgP >= 4 ? 'big ' : '')) : '';
  let plan = null;
  if (topTribe && topTribe.n >= 6) plan = 'lots of ' + sizeAdj + plural(topTribe.name);
  else if (st.creatureCopies > 0 && st.creatureCopies >= st.spellCopies) plan = 'lots of ' + sizeAdj + 'creatures';
  else if (st.spellCopies > 0) plan = 'lots of spells';
  let s = 'This is ' + (speedWord ? 'a ' + speedWord + ' ' : 'a ') + colorPart + ' deck';
  if (plan) s += ' with ' + plan;
  return s + '.';
}

function standoutsHTML(st) {
  const blocks = [];
  const exp = st.expensive.slice(0, 3);
  if (exp.length) {
    blocks.push({
      title: 'Highest mana cost',
      items: exp.map((e) => esc(e.name) + ' (' + e.cmc + ')'),
    });
  }
  const pr = st.priciest.slice(0, 3);
  if (pr.length) {
    blocks.push({
      title: 'Priciest cards',
      items: pr.map((e) => esc(e.name) + ' ($' + e.price.toFixed(2) + ')'),
    });
  }
  if (st.keywords[0]) {
    const k = st.keywords[0];
    blocks.push({
      title: 'Most used keyword',
      items: [cap(k.name) + ' — on ' + k.n + (k.n === 1 ? ' card' : ' cards')],
    });
  }
  if (!blocks.length) return '';
  return '<div class="stat-chart"><h4>Standouts</h4>' + blocks.map((b) =>
    '<p class="standout-title">' + esc(b.title) + '</p><ul class="stat-list">' +
    b.items.map((i) => '<li>' + i + '</li>').join('') + '</ul>'
  ).join('') + '</div>';
}

// Tips for your deck: up to 5, one sentence each, only when they apply.
function deckTips(st) {
  const tips = [];
  const c = st.curve;
  if (st.curveTotal > 0 && c[1] + c[2] === 0) {
    tips.push('You have no cards costing 1–2 mana — you might have nothing to do on the first turns.');
  }
  const colorKeys = ['W', 'U', 'B', 'R', 'G'].filter((k) => st.colors[k] > 0);
  if (colorKeys.length >= 3) {
    colorKeys.forEach((k) => {
      if (st.colors[k] < 4) {
        tips.push('Only ' + st.colors[k] + ' ' + COLOR_NAMES[k] + ' card' + (st.colors[k] === 1 ? '' : 's') +
          ' — you may rarely draw ' + (st.colors[k] === 1 ? 'it' : 'them') + '.');
      }
    });
  }
  const tribe = st.tribes[0];
  if (tribe && tribe.n >= 6) {
    tips.push('Your biggest group is ' + plural(tribe.name) + ' (' + tribe.n + ' cards). Cards that help ' +
      plural(tribe.name).toLowerCase() + ' would make your deck stronger.');
  }
  const kw = st.keywords[0];
  if (kw && kw.n >= 3) {
    tips.push(cap(kw.name) + ' appears on ' + kw.n + ' of your cards — more cards with ' +
      kw.name.toLowerCase() + ' would work well together.');
  }
  const hasKw = (w) => st.keywords.some((k) => k.name.toLowerCase() === w);
  const sz = st.size;
  if (sz.avgP !== null && sz.avgP >= 4 && hasKw('trample')) {
    const tn = st.keywords.find((k) => k.name.toLowerCase() === 'trample').n;
    tips.push('Your creatures are big (avg ' + sz.avgP.toFixed(1) + ' power) and ' + tn +
      ' have trample — trample is perfect for big creatures.');
  }
  if (sz.avgP !== null && sz.avgP <= 2 && hasKw('deathtouch')) {
    const dn = st.keywords.find((k) => k.name.toLowerCase() === 'deathtouch').n;
    tips.push('Your creatures are small (avg ' + sz.avgP.toFixed(1) + ' power) and ' + dn +
      ' have deathtouch — deathtouch lets small creatures beat big ones.');
  }
  const big6 = st.expensive.filter((e) => e.cmc >= 6).reduce((n, e) => n + e.n, 0);
  const expected = deck.format === 'commander' ? 37 : 24;
  if (big6 >= 6 && st.landCount < expected - 6) {
    tips.push('You have ' + big6 + ' cards costing 6+ mana but only ' + st.landCount +
      ' lands in a ' + st.total + '-card deck — you may struggle to cast them.');
  }
  if (st.total >= 40 && st.landCount < expected - 6 && !(big6 >= 6 && st.landCount < expected - 6)) {
    tips.push('Only ' + st.landCount + ' lands — most ' + cap(deck.format) +
      ' decks want around ' + expected + '. You may miss land drops.');
  }
  if (st.total >= 40 && st.landCount > expected + 6) {
    tips.push(st.landCount + ' lands is a lot — around ' + expected +
      ' is typical. You could swap some for spells.');
  }
  return tips.slice(0, 5);
}

function statChart(title, body, takeaway, caption) {
  return '<div class="stat-chart"><h4>' + esc(title) + '</h4>' +
    (caption ? '<p class="muted small">' + caption + '</p>' : '') + body +
    (takeaway ? '<p class="stat-takeaway">' + takeaway + '</p>' : '') + '</div>';
}

// ---------- power estimate (1–10): honest, number-based, never a win prediction ----------
function powerEstimate(st) {
  if (st.total < 10) return null;
  const factors = [];
  // Speed: average mana cost of non-land cards.
  if (st.speed.avg !== null && isFinite(st.speed.avg)) {
    const a = st.speed.avg;
    const score = Math.max(1, Math.min(10, Math.round(10 - ((a - 2.0) * 9) / 2.5)));
    const pace = a < 2.5 ? "that's fairly fast." : a <= 3.5 ? "that's about average." : "that's on the slow side.";
    factors.push({
      name: 'Speed', score: score,
      sentence: 'Your cards cost ' + a.toFixed(1) + ' mana on average — ' + pace,
    });
  }
  // Consistency: land count vs ideal + cheap early plays.
  {
    const ideal = deck.format === 'commander' ? 37 : 24;
    let score = 10;
    const notes = [];
    if (Math.abs(st.landCount - ideal) >= 6) {
      score -= 3;
      notes.push('only ' + st.landCount + ' lands — most ' + cap(deck.format) + ' decks want around ' + ideal);
    }
    const early = st.curve[1] + st.curve[2];
    if (early < 8) {
      score -= 2;
      notes.push('only ' + early + ' card' + (early === 1 ? '' : 's') + ' costing 1–2 mana');
    }
    factors.push({
      name: 'Consistency', score: Math.max(1, score),
      sentence: notes.length
        ? cap(notes.join('; ')) + '.'
        : 'Your land count and early plays look solid.',
    });
  }
  // Synergy: share of the top creature tribe, else top keyword share of all cards.
  {
    let score, sentence;
    const tribe = st.tribes[0];
    const kw = st.keywords[0];
    if (tribe && st.creatureCopies > 0) {
      const share = tribe.n / st.creatureCopies;
      score = share >= 0.40 ? 9 : share >= 0.25 ? 7 : share >= 0.15 ? 5 : 3;
      const how = share >= 0.40 ? 'very focused.' : share >= 0.25 ? "that's focused." : share >= 0.15 ? 'somewhat focused.' : 'fairly scattered — look for cards that share a type or ability.';
      sentence = tribe.n + ' of your ' + st.creatureCopies + ' creatures ' +
        (tribe.n === 1 ? 'is' : 'are') + ' ' + plural(tribe.name) + ' — ' + how;
    } else if (kw && st.total > 0) {
      const share = kw.n / st.total;
      score = share >= 0.40 ? 9 : share >= 0.25 ? 7 : share >= 0.15 ? 5 : 3;
      sentence = cap(kw.name) + ' shows up on ' + kw.n + ' of your ' + st.total +
        ' cards — ' + (share >= 0.25 ? "that's focused." : 'fairly scattered — look for cards that share a type or ability.');
    } else {
      score = 3;
      sentence = 'No clear shared creature type or keyword yet.';
    }
    factors.push({ name: 'Synergy', score: score, sentence: sentence });
  }
  // Curve: smoothness across buckets 1–4.
  {
    const empty = [1, 2, 3, 4].filter((b) => st.curve[b] === 0);
    const score = Math.max(1, 10 - empty.length * 2);
    factors.push({
      name: 'Curve', score: score,
      sentence: empty.length === 0
        ? 'You have cards at every cost from 1 to 4 — smooth.'
        : 'No cards costing ' + empty.join(', ') + ' — you may have quiet turns there.',
    });
  }
  if (!factors.length) return null;
  const overall = Math.max(1, Math.min(10,
    Math.round(factors.reduce((n, f) => n + f.score, 0) / factors.length)));
  return { overall: overall, factors: factors, partial: st.missing > 0, counted: st.total - st.missing, of: st.total };
}

function powerHTML(st) {
  const p = powerEstimate(st);
  if (!p) {
    return '<div class="stat-chart"><h4>Power estimate</h4>' +
      '<p class="muted">Add more cards for a power estimate.</p></div>';
  }
  let meter = '';
  for (let i = 0; i < 10; i++) {
    meter += '<span class="seg' + (i < p.overall ? ' on' : '') + '"></span>';
  }
  let html = '<div class="stat-chart"><h4>Power estimate</h4>' +
    '<p class="muted small">An estimate from your deck\u2019s numbers — it can\u2019t measure your skill, your opponents, or surprise combos.</p>' +
    '<p class="power-number"><strong>' + p.overall + '/10</strong></p>' +
    '<div class="power-meter" role="img" aria-label="Power estimate ' + p.overall + ' out of 10">' + meter + '</div>' +
    '<ul class="stat-list">' + p.factors.map((f) =>
      '<li><strong>' + esc(f.name) + ': ' + f.score + '/10</strong> — ' + esc(f.sentence) + '</li>'
    ).join('') + '</ul>';
  if (p.partial) {
    html += '<p class="muted small">Based on ' + p.counted + ' of ' + p.of + ' cards — some are missing stats.</p>';
  }
  return html + '</div>';
}

// ---------- battle rating (1–10): Power, Speed, Lethality, Destruction ----------
// Like the power estimate, this only reads the shared stats object — it never
// changes the other charts. Honest and number-based, never a win prediction.
function battleRating(st) {
  if (st.total < 10) return null;
  const factors = [];
  // Power: raw battlefield threat from creature size.
  {
    let score, sentence;
    if (st.creatureCopies > 0 && st.size.avgP !== null && isFinite(st.size.avgP)) {
      const a = st.size.avgP;
      score = a >= 4 ? 9 : a >= 3 ? 7 : a >= 2 ? 5 : 3;
      if (st.bigThreats >= 5) score = Math.min(10, score + 1);
      sentence = 'Your creatures average ' + a.toFixed(1) + ' power' +
        (st.bigThreats > 0
          ? ', including ' + st.bigThreats + ' big threat' + (st.bigThreats === 1 ? '' : 's') + ' (5+ power)'
          : '') + '.';
    } else {
      score = 4;
      sentence = 'No creatures — power measures battlefield threats.';
    }
    factors.push({ name: 'Power', score: score, sentence: sentence });
  }
  // Speed: average mana cost of non-land cards (same scale as Power estimate).
  if (st.speed.avg !== null && isFinite(st.speed.avg)) {
    const a = st.speed.avg;
    const score = Math.max(1, Math.min(10, Math.round(10 - ((a - 2.0) * 9) / 2.5)));
    const pace = a < 2.5 ? "that's fairly fast." : a <= 3.5 ? "that's about average." : "that's on the slow side.";
    factors.push({
      name: 'Speed', score: score,
      sentence: 'Your cards cost ' + a.toFixed(1) + ' mana on average — ' + pace,
    });
  }
  // Lethality: share of creatures with evasion or finisher abilities.
  {
    let score, sentence;
    if (st.creatureCopies > 0) {
      const share = st.lethal.withLethal / st.creatureCopies;
      score = share >= 0.5 ? 9 : share >= 0.3 ? 7 : share >= 0.15 ? 5 : 3;
      const top2 = st.lethal.byKeyword.slice(0, 2);
      if (top2.length) {
        sentence = top2.map((k) => k.name + ' (' + k.n + ')').join(' and ') +
          (top2.length === 1 ? ' makes' : ' make') + ' your creatures hard to stop — ' +
          st.lethal.withLethal + ' of ' + st.creatureCopies + ' creatures can finish games.';
      } else {
        sentence = 'None of your creatures have evasion or finisher abilities yet.';
      }
    } else {
      score = 3;
      sentence = 'No creatures to be lethal with yet.';
    }
    factors.push({ name: 'Lethality', score: score, sentence: sentence });
  }
  // Destruction: removal and interaction among non-land cards.
  {
    const nonLand = st.okNonLand;
    const n = st.removalCards;
    const share = nonLand > 0 ? n / nonLand : 0;
    const score = share >= 0.15 ? 9 : share >= 0.10 ? 7 : share >= 0.05 ? 5 : 3;
    factors.push({
      name: 'Destruction', score: score,
      sentence: n + ' of your ' + nonLand + ' non-land cards can destroy, exile, or counter threats.',
    });
  }
  if (!factors.length) return null;
  const overall = Math.max(1, Math.min(10,
    Math.round(factors.reduce((n, f) => n + f.score, 0) / factors.length)));
  return { overall: overall, factors: factors, partial: st.missing > 0, counted: st.total - st.missing, of: st.total };
}

function battleHTML(st) {
  const p = battleRating(st);
  if (!p) {
    return '<div class="stat-chart"><h4>Battle rating</h4>' +
      '<p class="muted">Add more cards for a battle rating.</p></div>';
  }
  let meter = '';
  for (let i = 0; i < 10; i++) {
    meter += '<span class="seg' + (i < p.overall ? ' on' : '') + '"></span>';
  }
  let html = '<div class="stat-chart"><h4>Battle rating</h4>' +
    '<p class="muted small">An estimate from your deck\u2019s numbers — it can\u2019t measure your skill, your opponents, or surprise combos.</p>' +
    '<p class="power-number"><strong>' + p.overall + '/10</strong></p>' +
    '<div class="power-meter" role="img" aria-label="Battle rating ' + p.overall + ' out of 10">' + meter + '</div>' +
    '<ul class="stat-list">' + p.factors.map((f) =>
      '<li><strong>' + esc(f.name) + ': ' + f.score + '/10</strong> — ' + esc(f.sentence) + '</li>'
    ).join('') + '</ul>';
  if (p.partial) {
    html += '<p class="muted small">Based on ' + p.counted + ' of ' + p.of + ' cards — some are missing stats.</p>';
  }
  return html + '</div>';
}

function synergyHTML(st, cards) {
  let html = '';
  const tribe = st.tribes;
  html += '<p class="standout-title">Top creature types</p>';
  html += tribe.length
    ? '<ol class="stat-list">' + tribe.map((t) => '<li>' + esc(t.name) + ' — ' + t.n + '</li>').join('') + '</ol>'
    : '<p class="muted">None yet.</p>';
  const kw = st.keywords;
  html += '<p class="standout-title">Top keywords</p>';
  html += kw.length
    ? '<ol class="stat-list">' + kw.map((k) => '<li>' + esc(cap(k.name)) + ' — ' + k.n + '</li>').join('') + '</ol>'
    : '<p class="muted">None yet.</p>';
  return html;
}

function renderStats() {
  const box = $('#stats-charts');
  const note = $('#stats-note');
  if (!box) return;
  if (!deck.cards.length) {
    if (note) note.textContent = '';
    box.innerHTML = '<p class="muted">Add cards to see your deck stats.</p>';
    return;
  }
  const st = computeStats(deck.cards);
  if (note) {
    if (statsBackfillBusy[deck.id]) note.textContent = 'Loading card stats…';
    else if (st.missing > 0) {
      note.textContent = 'Stats missing for ' + st.missing + (st.missing === 1 ? ' card' : ' cards') +
        ' — the charts below use the rest.';
    } else note.textContent = '';
  }
  let html = '<p class="deck-summary"><strong>' + esc(deckSummary(st)) + '</strong></p>';
  html += powerHTML(st);
  html += battleHTML(st);
  html += statChart('Mana curve', manaCurveSVG(st), manaTakeaway(st), 'Lands are not counted.');
  html += statChart('Colors', colorsSVG(st), colorsTakeaway(st));
  html += statChart('Card types', typesSVG(st), typesTakeaway(st));
  html += statChart('Speed', speedHTML(st), speedTakeaway(st));
  html += statChart('Creature size', sizeHTML(st), sizeTakeaway(st));
  html += statChart('Cards that may work well together', synergyHTML(st, deck.cards),
    synergyTakeaway(st, deck.cards), 'Cards sharing types or abilities often boost each other.');
  html += standoutsHTML(st);
  const tips = deckTips(st);
  if (tips.length) {
    html += '<div class="stat-chart"><h4>Tips for your deck</h4><ul class="tips-list">' +
      tips.map((t) => '<li>' + esc(t) + '</li>').join('') + '</ul></div>';
  }
  box.innerHTML = html;
}

function speedHTML(st) {
  const sp = st.speed;
  let html = '';
  if (sp.avg !== null) {
    html += '<p><strong>Average mana cost: ' + sp.avg.toFixed(2) + '</strong> ' +
      '<span class="muted small">(non-land cards — lower is faster)</span></p>';
  } else {
    html += '<p class="muted">No non-land cards with known mana costs yet.</p>';
  }
  html += speedBarSVG(st);
  return html;
}

function sizeHTML(st) {
  const sz = st.size;
  let html = '';
  if (sz.avgP !== null) {
    html += '<p><strong>Average creature: ' + sz.avgP.toFixed(1) + '/' +
      (sz.avgT !== null ? sz.avgT.toFixed(1) : '—') + '</strong></p>';
  } else {
    html += '<p class="muted">No creatures with known power yet.</p>';
  }
  html += sizeSVG(st);
  if (sz.unknown) {
    html += '<p class="muted small">' + sz.unknown + (sz.unknown === 1 ? ' creature has' : ' creatures have') +
      ' unknown power (like *) — shown separately, not counted as zero.</p>';
  }
  return html;
}

// One-time per-deck backfill: fetch stats for entries that are missing them
// (cards saved before v2.4), apply, and save. Never retried in one session.
async function maybeBackfillStats() {
  const missing = deck.cards.filter((c) => !c.statsOk && c.pid);
  if (!missing.length) return;
  if (statsBackfillTried[deck.id] || statsBackfillBusy[deck.id]) return;
  statsBackfillBusy[deck.id] = true;
  const note = $('#stats-note');
  if (note) note.textContent = 'Loading card stats…';
  try {
    const r = await api('/api/cards/collection', {
      method: 'POST',
      body: JSON.stringify({ identifiers: missing.map((c) => c.pid) }),
    });
    if (r.ok && r.data && r.data.cards) {
      let applied = 0;
      missing.forEach((c) => {
        const s = r.data.cards[c.pid];
        if (s) {
          const extra = {};
          const ot = (typeof s.oracle_text === 'string') ? s.oracle_text : '';
          if (ot) {
            const probe = { oracle_text: ot, keywords: s.keywords };
            extra.removal = removalCountOf(probe);
            extra.lethalKws = lethalKeywordsOf(probe);
          }
          // "Any number" cards (Relentless Rats and friends) and basic
          // lands have no copy limits. Old entries don't store their type
          // line, so basic lands are recognized by name here.
          extra.unlimited =
            /a deck can have any number of cards named/i.test(ot) ||
            /^(Plains|Island|Swamp|Mountain|Forest|Wastes)$/i.test(c.name);
          const merged = backfillCard(Object.assign({}, c, s, extra, { statsOk: true }));
          Object.keys(merged).forEach((k) => { c[k] = merged[k]; });
          applied++;
        }
      });
      if (applied) saveDeck();
    }
  } catch (e) { /* charts render from whatever data exists */ }
  statsBackfillBusy[deck.id] = false;
  statsBackfillTried[deck.id] = true;
  renderStats();
}

// Builds a deck-list entry from a Scryfall-like card object. Shared by the
// manual add flow and the deck generator (v2.13).
function makeDeckEntry(card, asCommander, qty) {
  qty = Math.max(1, Math.min(99, Math.floor(Number(qty) || 1)));
  if (asCommander) qty = 1; // a commander is always a single copy
  const unlimited = allowsAnyNumber(card);
  const entry = Object.assign({
    pid: card.id, name: card.name, set: (card.set || '').toUpperCase(),
    cn: card.collector_number || '', price: priceOf(card), priceNum: numPriceOf(card),
    img: imgOf(card), back: backImgOf(card),
    checked: false, count: 1, commander: !!asCommander,
    unlimited: unlimited, legendary: isLegendaryCreature(card),
  }, statFieldsOf(card));
  if (deck.format === 'commander' && !unlimited && !asCommander) qty = 1;
  entry.count = unlimited ? Math.min(99, qty) : Math.min(4, qty);
  return entry;
}
function addCardToDeck(card, asCommander, qty) {
  const entry = makeDeckEntry(card, asCommander, qty);
  const existing = deck.cards.find((c) => c.pid === entry.pid && c.commander === entry.commander);

  if (deck.format === 'commander' && !entry.unlimited && !asCommander && existing) {
    announce(card.name + ' is already in this Commander deck (singleton).');
    return;
  }
  if (existing) {
    // (Bug fix v2.7: the old code rejected a second basic land here in
    // Commander. Unlimited cards — basics and "any number" cards — stack
    // freely in every format.)
    if (deck.format === 'commander' && !entry.unlimited) { announce(card.name + ' is already in this Commander deck (singleton).'); return; }
    existing.count = entry.unlimited
      ? Math.min(99, existing.count + entry.count)
      : Math.min(4, existing.count + entry.count);
  } else {
    deck.cards.push(entry);
  }
  saveDeck();
  renderDeck();
  announce(card.name + ' added to your deck.');
}

// Switch the commander from inside the deck list: the old commander stays
// in the deck as a regular card, the new one takes the crown. If the new
// commander had several copies, one copy becomes the commander and the rest
// stay as a regular entry.
function makeCommander(pid) {
  const target = deck.cards.find((c) => c.pid === pid && !c.commander);
  if (!target) return;
  ensureCommanderFormat();
  const old = deck.cards.find((c) => c.commander);
  if (old) old.commander = false;
  if (target.count > 1) {
    target.count -= 1;
    deck.cards.push(Object.assign({}, target, { commander: true, count: 1, checked: false }));
  } else {
    target.commander = true;
  }
  saveDeck();
  renderDeck();
  announce(target.name + ' is now your commander.' +
    (old ? ' ' + old.name + ' is still in your deck as a regular card.' : ''));
}

function removeFromDeck(pid, commander) {
  deck.cards = deck.cards.filter((c) => !(c.pid === pid && c.commander === commander));
  saveDeck();
  renderDeck();
}

function ruleCheckLines() {
  const total = deckTotal();
  const lines = [];
  const commanders = deck.cards.filter((c) => c.commander);
  if (deck.format === 'commander') {
    const cmd = commanders.reduce((n, c) => n + c.count, 0);
    lines.push(cmd >= 1
      ? '<span class="ok">✓ Commander set (' + cmd + ')</span>'
      : '<span class="no">✗ No commander yet — use Deck ideas to pick one</span>');
    lines.push(total === 100
      ? '<span class="ok">✓ 100 cards — Commander ready</span>'
      : '<span class="no">✗ ' + total + ' / 100 cards</span>');
    const dupes = deck.cards.filter((c) => !c.commander && c.count > 1 && !c.unlimited && !/Basic Land/i.test(c.name));
    lines.push(dupes.length === 0
      ? '<span class="ok">✓ Singleton rule ok</span>'
      : '<span class="no">✗ Duplicates: ' + dupes.map((c) => esc(c.name)).join(', ') + '</span>');
  } else {
    lines.push(total >= 60
      ? '<span class="ok">✓ ' + total + ' cards — minimum 60 met</span>'
      : '<span class="no">✗ ' + total + ' / 60 cards minimum</span>');
    const bad = deck.cards.filter((c) => c.count > 4 && !c.unlimited && !/^(Plains|Island|Swamp|Mountain|Forest|Wastes)$/i.test(c.name));
    lines.push(bad.length === 0
      ? '<span class="ok">✓ Max 4 copies rule ok</span>'
      : '<span class="no">✗ Too many copies: ' + bad.map((c) => esc(c.name)).join(', ') + '</span>');
  }
  return lines;
}

function renderDeck() {
  const list = $('#deck-list');
  list.innerHTML = '';
  deck.cards.forEach((c) => {
    const li = document.createElement('li');
    if (c.checked) li.classList.add('checked');
    li.innerHTML =
      '<input type="checkbox" ' + (c.checked ? 'checked' : '') + ' aria-label="Check off ' + esc(c.name) + ' as owned">' +
      '<img src="' + c.img + '" alt="">' +
      '<span class="name">' + esc(c.name) + (c.commander ? ' 👑' : '') +
      '<small>' + c.set + ' #' + c.cn + ' · ' + c.price + '</small>' +
      '<span class="abilities" data-aname="' + esc(c.name) + '"></span></span>' +
      '<span class="qty">' + (c.count > 1 ? c.count + '×' : '') + '</span>' +
      (c.legendary && c.maintype === 'Creature' && !c.commander
        ? '<button type="button" class="secondary small make-cmd" aria-label="Make ' + esc(c.name) + ' your commander">👑</button>'
        : '') +
      '<button type="button" class="remove" aria-label="Remove ' + esc(c.name) + ' from deck">✕</button>';
    li.querySelector('input').addEventListener('change', (e) => {
      c.checked = e.target.checked;
      saveDeck();
      renderDeck();
    });
    const mkBtn = li.querySelector('.make-cmd');
    if (mkBtn) mkBtn.addEventListener('click', () => makeCommander(c.pid));
    li.querySelector('.remove').addEventListener('click', () => removeFromDeck(c.pid, c.commander));
    list.appendChild(li);
  });
  if (!deck.cards.length) list.innerHTML = '<li>No cards yet. Search for cards and tap “+ Add”.</li>';
  fillDeckAbilities();

  $('#rule-check').innerHTML = ruleCheckLines().join('<br>');

  $('#deck-value').textContent = deckValueLine();
  const checked = deck.cards.filter((c) => c.checked).length;
  const total = deck.cards.length;
  $('#checkoff-count').textContent = checked + ' / ' + total + ' cards';
  const pct = total ? Math.round((checked / total) * 100) : 0;
  $('#checkoff-fill').style.width = pct + '%';
  $('#checkoff-progress').setAttribute('aria-valuenow', String(pct));
  renderDeckSelect();
  updateDeckPill();
  renderStats();
  renderMatchupSelects();
  maybeBackfillStats();
}

function updateDeckPill() {
  // v2.11: the pill shows the true total — every copy counts, lands included.
  $('#deck-count').textContent = deck.cards.length ? String(deckTotal()) : '';
}

$('#clear-checks').addEventListener('click', () => {
  deck.cards.forEach((c) => (c.checked = false));
  saveDeck();
  renderDeck();
  announce('All check-offs cleared.');
});

// ---------- photo import (v2.7) ----------
// Take a picture of a written/printed card list (or a single card), read it
// with OCR, and add the cards to a deck. Tesseract.js loads lazily from a
// pinned CDN only when this feature is used, so the first page load stays
// light. It is NOT in the service-worker precache on purpose.
const TESSERACT_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
let tesseractPromise = null;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (!tesseractPromise) {
    tesseractPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = TESSERACT_CDN;
      s.onload = () => (window.Tesseract
        ? resolve(window.Tesseract)
        : reject(new Error('The text reader did not start. Please try again.')));
      s.onerror = () => reject(new Error('Could not load the text reader. Check your connection and try again.'));
      document.head.appendChild(s);
    });
  }
  return tesseractPromise;
}

let photoDataUrl = '';

function loadImgEl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read that image. Please try another.'));
    img.src = dataUrl;
  });
}

// Preprocess a photo for OCR (canvas, no new dependencies):
// - optional top-strip crop (a Magic card's name is always in the top ~18%)
// - downscale giant photos to max 2000px wide (speed), upscale tiny ones
// - grayscale + contrast stretch (fixes glare / uneven light)
async function preprocessDataUrl(dataUrl, opts) {
  opts = opts || {};
  const img = await loadImgEl(dataUrl);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  let sy = 0, sh = h;
  if (opts.cropTop) sh = Math.max(1, Math.round(h * 0.18));
  let scale = 1;
  if (w > 2000) scale = 2000 / w;
  else if (w < 900) scale = Math.min(2, 900 / w);
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(sh * scale));
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, sy, w, sh, 0, 0, cw, ch);
  const imgd = ctx.getImageData(0, 0, cw, ch);
  const px = imgd.data;
  let min = 255, max = 0;
  for (let i = 0; i < px.length; i += 4) {
    const l = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000;
    if (l < min) min = l;
    if (l > max) max = l;
  }
  const range = (max - min) || 1;
  // Only stretch washed-out photos; clean scans already span the full range
  // and stretching them amplifies JPEG noise into fake characters.
  const stretch = (max - min) < 150;
  for (let i = 0; i < px.length; i += 4) {
    const l = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000;
    const v = stretch
      ? Math.max(0, Math.min(255, Math.round(((l - min) / range) * 255)))
      : Math.round(l);
    px[i] = px[i + 1] = px[i + 2] = v;
  }
  ctx.putImageData(imgd, 0, 0);
  return c.toDataURL('image/png');
}

async function ocrImage(dataUrl, onProgress, opts) {
  const T = await loadTesseract();
  const processed = await preprocessDataUrl(dataUrl, opts);
  const res = await T.recognize(processed, 'eng', {
    logger: (m) => {
      if (m && m.status === 'recognizing text' && onProgress) onProgress(m.progress || 0);
    },
  });
  return (res && res.data && res.data.text) || '';
}

// Keep the characters card names can contain; drop OCR junk.
function cleanOcrLine(line) {
  return String(line || '').replace(/[^A-Za-z0-9'\-, /×]/g, '').replace(/\s+/g, ' ').trim();
}

// Stricter name cleaning for lookup candidates: letters, spaces,
// apostrophes, commas, hyphens — what Magic names use.
function cleanOcrName(line) {
  return String(line || '').replace(/[^A-Za-z'’,\- ]/g, '').replace(/\s+/g, ' ').trim();
}

// Ordered name candidates from OCR text: cleaned lines, longest first,
// deduped. Lines under 3 chars or with fewer than 3 letters are dropped.
function nameCandidates(text) {
  const seen = new Set();
  const out = [];
  String(text || '').split('\n').forEach((raw) => {
    const l = cleanOcrName(raw);
    if (l.length < 3) return;
    if (l.replace(/[^A-Za-z]/g, '').length < 3) return;
    const k = l.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(l);
  });
  out.sort((a, b) => b.length - a.length);
  return out;
}

// Extra candidates from the best line: first 4, 3, then 2 words
// (OCR often appends mana-cost junk like "G U" to the name).
function wordVariants(line) {
  const words = String(line || '').split(' ').filter(Boolean);
  const out = [];
  [4, 3, 2].forEach((n) => {
    if (words.length > n) {
      const v = words.slice(0, n).join(' ');
      if (v.length >= 3 && out.indexOf(v) < 0) out.push(v);
    }
  });
  return out;
}

// Candidates for single-card mode: lines longest-first, with word
// truncations of the best line tried right after it.
function orderedPhotoCandidates(text, withVariants) {
  const lines = nameCandidates(text);
  if (!withVariants || !lines.length) return lines;
  const out = [lines[0]];
  wordVariants(lines[0]).forEach((v) => { if (out.indexOf(v) < 0) out.push(v); });
  lines.slice(1).forEach((l) => { if (out.indexOf(l) < 0) out.push(l); });
  return out;
}

// Try fuzzy lookup across candidates in order; first hit wins.
// maxTries caps API calls per photo.
async function fuzzyFirst(candidates, maxTries) {
  let tries = 0;
  for (const c of candidates) {
    if (tries >= (maxTries || 8)) break;
    tries++;
    const card = await fuzzyCard(c);
    if (card) return { card: card, name: c };
  }
  return null;
}

// "Did you mean…?" — autocomplete suggestions for a failed name.
async function autocompleteNames(q) {
  try {
    const res = await fetch('/api/autocomplete?q=' + encodeURIComponent(q));
    if (!res.ok) return [];
    const d = await res.json();
    return (d && Array.isArray(d.data) ? d.data : []).slice(0, 5);
  } catch (e) { return []; }
}

async function fillChips(box, name, onPick) {
  if (!box) return;
  box.innerHTML = '';
  if (!name) return;
  const names = await autocompleteNames(name);
  if (!box.isConnected || !names.length) return;
  const label = document.createElement('span');
  label.className = 'muted small';
  label.textContent = 'Did you mean…?';
  box.appendChild(label);
  names.forEach((n) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'secondary small chip';
    b.textContent = n;
    b.addEventListener('click', () => onPick(n));
    box.appendChild(b);
  });
}

// Lookup for one photo-review name: the name, then shorter word-variants.
async function lookupPhotoName(name) {
  if (!name) return null;
  const hit = await fuzzyFirst([name].concat(wordVariants(name)), 3);
  return hit ? hit.card : null;
}

// Quantity parsing: "3 Sol Ring", "3x Sol Ring", "Sol Ring x3" (default 1).
function parseQtyLine(line) {
  let qty = 1, name = String(line || '').trim();
  let m = /^(\d+)\s*[x×]?\s+(.+)$/i.exec(name);
  if (m && m[2].trim()) { qty = parseInt(m[1], 10); name = m[2].trim(); }
  else {
    m = /^(.+?)\s*[x×]\s*(\d+)$/.exec(name);
    if (m && m[1].trim()) { name = m[1].trim(); qty = parseInt(m[2], 10); }
  }
  return { qty: Math.max(1, Math.min(99, qty || 1)), name: name };
}

// Fuzzy card lookup through the existing /api/named proxy (?fuzzy= passes through).
async function fuzzyCard(name) {
  try {
    const res = await fetch('/api/named?fuzzy=' + encodeURIComponent(name));
    if (!res.ok) return null;
    const d = await res.json();
    return (d && d.id) ? d : null;
  } catch (e) { return null; }
}

$('#photo-take').addEventListener('click', () => {
  const f = $('#photo-file');
  f.setAttribute('capture', 'environment');
  f.click();
});
$('#photo-choose').addEventListener('click', () => {
  const f = $('#photo-file');
  f.removeAttribute('capture');
  f.click();
});
$('#photo-file').addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const rd = new FileReader();
  rd.onload = () => {
    photoDataUrl = String(rd.result || '');
    if (!photoDataUrl) {
      $('#photo-stage').innerHTML = '<p class="error-text">Could not read that image. Please try another.</p>';
      return;
    }
    $('#photo-img').src = photoDataUrl;
    $('#photo-preview').hidden = false;
    $('#photo-stage').innerHTML = '';
    $('#photo-preview').scrollIntoView({ block: 'nearest' });
    announce('Photo ready. Choose what is in the photo.');
  };
  rd.onerror = () => {
    $('#photo-stage').innerHTML = '<p class="error-text">Could not read that image. Please try another.</p>';
  };
  rd.readAsDataURL(file);
});

function photoProgressHTML(msg) {
  return '<p class="muted" role="status" id="ocr-status">' + esc(msg) + '</p>';
}
function setOcrProgress(pct) {
  const el = $('#ocr-status');
  if (el) el.textContent = 'Reading your photo… ' + Math.round(pct * 100) + '%';
}

// ----- list mode: photo of a written/printed list -----
$('#photo-mode-list').addEventListener('click', async () => {
  const stage = $('#photo-stage');
  stage.innerHTML = photoProgressHTML('Loading text reader…');
  let text = '';
  try {
    text = await ocrImage(photoDataUrl, setOcrProgress);
  } catch (e) {
    stage.innerHTML = '<p class="error-text">' + esc(e.message || 'Could not read the photo.') + '</p>';
    return;
  }
  const merged = {}, order = [];
  text.split('\n').forEach((raw) => {
    const line = cleanOcrLine(raw);
    if (line.length < 2) return;
    const q = parseQtyLine(line);
    if (!q.name) return;
    const key = q.name.toLowerCase();
    if (!merged[key]) { merged[key] = { name: q.name, qty: 0 }; order.push(key); }
    merged[key].qty = Math.min(99, merged[key].qty + q.qty);
  });
  const items = order.map((k) => merged[k]);
  if (!items.length) {
    stage.innerHTML = '<p class="error-text">Could not read any card names from that photo. Try a clearer, well-lit picture.</p>';
    return;
  }
  renderPhotoReview(items);
});

function paintPhotoRow(rec) {
  const statusEl = rec.row.querySelector('.photo-status');
  const imgEl = rec.row.querySelector('.photo-thumb');
  const retryBtn = rec.row.querySelector('.photo-retry');
  if (rec.card) {
    imgEl.src = imgOf(rec.card);
    imgEl.hidden = false;
    statusEl.innerHTML = '✓ <strong>' + esc(rec.card.name) + '</strong> <span class="muted">(' +
      esc((rec.card.set || '').toUpperCase()) + ' · ' + priceOf(rec.card) + ')</span>';
    retryBtn.hidden = true;
    const chipsBox = rec.row.querySelector('.photo-chips');
    if (chipsBox) chipsBox.innerHTML = '';
  } else {
    imgEl.hidden = true;
    imgEl.removeAttribute('src');
    statusEl.textContent = 'Not found — fix the name, tap Retry, or pick a suggestion.';
    retryBtn.hidden = false;
    const failedName = clean(rec.row.querySelector('.photo-name').value);
    fillChips(rec.row.querySelector('.photo-chips'), failedName, (pick) => {
      if (!rec.row.isConnected) return;
      rec.row.querySelector('.photo-name').value = pick;
      rec.row.querySelector('.photo-retry').click();
    });
  }
  updatePhotoButtons();
}

let photoRows = [];
function updatePhotoButtons() {
  const found = photoRows.filter((r) => r.card).length;
  const b1 = $('#photo-add-current'), b2 = $('#photo-add-new');
  if (b1) b1.disabled = !found;
  if (b2) b2.disabled = !found;
  const note = $('#photo-review-note');
  if (note) {
    note.textContent = found
      ? found + ' of ' + photoRows.length + ' found.' +
        (found < photoRows.length ? ' Lines not found will be skipped.' : '')
      : 'Looking up cards…';
  }
}

function photoFoundCards() {
  return photoRows.filter((r) => r.card).map((r) => ({
    card: r.card,
    qty: Math.max(1, Math.min(99, parseInt(r.row.querySelector('.photo-qty').value, 10) || 1)),
  }));
}

async function renderPhotoReview(items) {
  const stage = $('#photo-stage');
  photoRows = [];
  stage.innerHTML =
    '<h4>Review — fix any name that looks wrong, then tap Retry</h4>' +
    '<div id="photo-review-list"></div>' +
    '<p class="muted" id="photo-review-note" role="status">Looking up cards…</p>' +
    '<div class="share-row">' +
    '<button type="button" id="photo-add-current" class="primary" disabled>Add found cards to this deck</button>' +
    '<button type="button" id="photo-add-new" class="secondary" disabled>Add found cards to a new deck</button>' +
    '</div>';
  const list = $('#photo-review-list');
  items.forEach((it) => {
    const row = document.createElement('div');
    row.className = 'photo-row';
    row.innerHTML =
      '<img class="photo-thumb" alt="" hidden>' +
      '<div class="photo-row-main">' +
      '<input type="text" class="photo-name" value="' + esc(it.name) + '" aria-label="Card name" ' +
      'autocorrect="off" autocapitalize="off" spellcheck="false" autocomplete="off">' +
      '<span class="muted small photo-status">Looking up…</span>' +
      '<div class="photo-chips"></div></div>' +
      '<label class="qty-label">Qty <input type="number" class="photo-qty qty-input" min="1" max="99" value="' + it.qty + '"></label>' +
      '<button type="button" class="secondary small photo-retry" hidden>Retry</button>';
    list.appendChild(row);
    const rec = { row: row, card: null };
    photoRows.push(rec);
    row.querySelector('.photo-retry').addEventListener('click', async () => {
      const name = clean(row.querySelector('.photo-name').value);
      row.querySelector('.photo-status').textContent = 'Looking up…';
      rec.card = await lookupPhotoName(name);
      paintPhotoRow(rec);
    });
  });
  updatePhotoButtons();
  for (const rec of photoRows) {
    const name = clean(rec.row.querySelector('.photo-name').value);
    rec.card = await lookupPhotoName(name);
    paintPhotoRow(rec);
  }
  $('#photo-add-current').addEventListener('click', () => {
    const found = photoFoundCards();
    const skipped = photoRows.length - found.length;
    found.forEach((f) => addCardToDeck(f.card, false, f.qty));
    stage.innerHTML = '<p>' + found.length + ' card' + (found.length === 1 ? '' : 's') +
      ' added to ' + esc(deck.name) + '.' +
      (skipped ? ' ' + skipped + ' line' + (skipped === 1 ? '' : 's') + ' not found and skipped.' : '') + '</p>';
    announce(found.length + ' cards added to ' + deck.name + '.');
    photoRows = [];
  });
  $('#photo-add-new').addEventListener('click', async () => {
    const found = photoFoundCards();
    if (!found.length) return;
    let name = 'Imported ' + new Date().toLocaleDateString();
    if (typeof prompt === 'function') {
      const n = prompt('Name for the new deck:', name);
      if (n === null) return;
      name = n.trim() || name;
    }
    await createDeck();
    deck.name = name;
    syncDeckInputs();
    saveDecks();
    renderDeck();
    const skipped = photoRows.length - found.length;
    found.forEach((f) => addCardToDeck(f.card, false, f.qty));
    stage.innerHTML = '<p>' + found.length + ' card' + (found.length === 1 ? '' : 's') +
      ' added to new deck "' + esc(deck.name) + '".' +
      (skipped ? ' ' + skipped + ' line' + (skipped === 1 ? '' : 's') + ' not found and skipped.' : '') + '</p>';
    announce(found.length + ' cards added to new deck ' + deck.name + '.');
    photoRows = [];
  });
}

// ----- single-card mode: photo of one card -----
$('#photo-mode-single').addEventListener('click', async () => {
  const stage = $('#photo-stage');
  stage.innerHTML = photoProgressHTML('Loading text reader…');
  // A Magic card's name is always in the top strip: OCR that first, then the
  // full image only if nothing matches.
  let rawLine = '', hit = null;
  try {
    const cropText = await ocrImage(photoDataUrl, setOcrProgress, { cropTop: true });
    const cands = orderedPhotoCandidates(cropText, true);
    rawLine = cands.length ? cands[0] : '';
    if (cands.length) hit = await fuzzyFirst(cands, 8);
  } catch (e) { /* fall through to the full image */ }
  if (!hit) {
    try {
      const fullText = await ocrImage(photoDataUrl, setOcrProgress, {});
      const cands = orderedPhotoCandidates(fullText, true);
      if (!rawLine && cands.length) rawLine = cands[0];
      if (cands.length) hit = await fuzzyFirst(cands, 8);
    } catch (e) { /* the form below still lets them type the name */ }
  }
  const guess = hit ? hit.name : rawLine;
  stage.innerHTML =
    '<h4>Is this the card?</h4>' +
    '<div class="field"><label for="photo-single-name">Card name</label>' +
    '<input id="photo-single-name" type="text" value="' + esc(guess) + '" ' +
    'autocorrect="off" autocapitalize="off" spellcheck="false" autocomplete="off"></div>' +
    (rawLine ? '<p class="muted small">We read: "' + esc(rawLine) + '"</p>' : '') +
    '<div class="share-row"><button type="button" id="photo-single-lookup" class="primary">Look up</button></div>' +
    '<div id="photo-single-result"></div>';
  const renderFound = (card) => {
    const box = $('#photo-single-result');
    const unlimited = allowsAnyNumber(card);
    box.innerHTML =
      '<div class="photo-found"><img src="' + imgOf(card) + '" alt="Card art: ' + esc(card.name) + '">' +
      '<div><strong>' + esc(card.name) + '</strong><br><span class="muted">' +
      esc((card.set || '').toUpperCase()) + ' #' + esc(card.collector_number || '') + ' · ' + priceOf(card) +
      '</span></div></div>' +
      (unlimited ? '<label class="qty-label">Qty <input type="number" id="photo-single-qty" class="qty-input" min="1" max="99" value="1" aria-label="How many copies to add"></label>' : '') +
      '<div class="share-row"><button type="button" id="photo-single-add" class="primary">+ Add to deck</button></div>';
    $('#photo-single-add').addEventListener('click', () => {
      let q = 1;
      if (unlimited) {
        const n = parseInt($('#photo-single-qty').value, 10);
        q = Math.max(1, Math.min(99, isNaN(n) ? 1 : n));
      }
      addCardToDeck(card, false, q);
      box.innerHTML = '<p>' + esc(card.name) + ' added to ' + esc(deck.name) + '.</p>';
    });
  };
  const doLookup = async () => {
    const name = clean($('#photo-single-name').value);
    const box = $('#photo-single-result');
    if (!name) { box.innerHTML = '<p class="muted">Type the card name first.</p>'; return; }
    box.innerHTML = '<p class="muted" role="status">Looking up…</p>';
    announce('Looking up ' + name + '.');
    const card = await fuzzyCard(name);
    if (!card) {
      box.innerHTML = '<p class="error-text">Could not find "' + esc(name) + '".</p><div class="photo-chips"></div>';
      await fillChips(box.querySelector('.photo-chips'), name, (pick) => {
        const inp = $('#photo-single-name');
        if (inp) { inp.value = pick; doLookup(); }
      });
      return;
    }
    renderFound(card);
  };
  $('#photo-single-lookup').addEventListener('click', doLookup);
  $('#photo-single-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLookup(); });
  if (hit) renderFound(hit.card);
  else if (guess) doLookup();
});

// ---------- deck vs deck matchup (v2.9) ----------
// A numbers-based head-to-head projection: five weighted categories produce
// a "wins N out of 10" split. This only reads the shared stats objects — it
// never changes the stats charts, power estimate, or battle rating.
function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function deckTotalOf(d) { return (d.cards || []).reduce((n, c) => n + statCopies(c), 0); }

// Fisher-Yates partial shuffle: draw 7 random cards from the pool.
function sampleHand(pool) {
  const idx = [];
  for (let i = 0; i < pool.length; i++) idx.push(i);
  const hand = [];
  const take = Math.min(7, pool.length);
  for (let k = 0; k < take; k++) {
    const j = k + Math.floor(Math.random() * (pool.length - k));
    const t = idx[k]; idx[k] = idx[j]; idx[j] = t;
    hand.push(pool[idx[k]]);
  }
  return hand;
}
// Keepable = 2-4 lands and at least one non-land card costing 3 or less.
function handKeepable(hand) {
  let lands = 0, early = false;
  hand.forEach((c) => {
    if ((c.maintype || '') === 'Land') lands++;
    else if (typeof c.cmc === 'number' && c.cmc <= 3) early = true;
  });
  return lands >= 2 && lands <= 4 && early;
}
function simulateKeepRate(cards, n) {
  const pool = [];
  cards.forEach((c) => {
    const k = statCopies(c);
    for (let i = 0; i < k; i++) pool.push(c);
  });
  if (pool.length < 7) return 0;
  let keep = 0;
  for (let i = 0; i < n; i++) if (handKeepable(sampleHand(pool))) keep++;
  return keep / n;
}
function sampleHandForDisplay(entry) {
  const pool = [];
  entry.cards.forEach((c) => {
    const k = statCopies(c);
    for (let i = 0; i < k; i++) pool.push(c);
  });
  return sampleHand(pool).map((c) => c.name);
}

function matchupEdges(a, b, hands) {
  const stA = computeStats(a.cards), stB = computeStats(b.cards);
  const edges = {};
  // Speed (25%): lower non-land average mana cost wins.
  if (stA.speed.avg !== null && stB.speed.avg !== null &&
      isFinite(stA.speed.avg) && isFinite(stB.speed.avg)) {
    edges.speed = clamp01(0.5 + (stB.speed.avg - stA.speed.avg) * 0.25);
  } else edges.speed = 0.5;
  // Threats (25%): average creature power plus 0.3 per big threat (5+ power).
  const tScore = (st) => (st.size.avgP !== null && isFinite(st.size.avgP) ? st.size.avgP : 0) + 0.3 * st.bigThreats;
  edges.threats = (stA.creatureCopies || stB.creatureCopies)
    ? clamp01(0.5 + (tScore(stA) - tScore(stB)) * 0.15)
    : 0.5;
  // Interaction (20%): removal share of non-land cards.
  const share = (st) => st.okNonLand > 0 ? st.removalCards / st.okNonLand : 0;
  edges.interaction = clamp01(0.5 + (share(stA) - share(stB)) * 2);
  // Opening hands (15%): simulated keepable-hand rate.
  edges.hands = hands ? clamp01(0.5 + (hands.a - hands.b) * 1.5) : 0.5;
  // Synergy (15%): power-estimate Synergy factor. That factor never reads
  // deck.format, so the active deck's format can't leak into the comparison.
  const synScore = (st) => {
    const p = powerEstimate(st);
    if (!p) return null;
    const f = p.factors.filter((x) => x.name === 'Synergy')[0];
    return f ? f.score : null;
  };
  const sA = synScore(stA), sB = synScore(stB);
  edges.synergy = (sA !== null && sB !== null) ? clamp01(0.5 + (sA - sB) / 10 * 0.6) : 0.5;
  return { edges: edges, stA: stA, stB: stB, syn: [sA, sB] };
}

function matchup(a, b, handsCache) {
  if (deckTotalOf(a) < 10 || deckTotalOf(b) < 10) return { tooSmall: true };
  let hands = null;
  if (handsCache) {
    const key = (d) => d.id + ':' + deckTotalOf(d) + ':' + d.cards.length;
    const ka = key(a), kb = key(b);
    if (!(ka in handsCache)) handsCache[ka] = simulateKeepRate(a.cards, 1000);
    if (!(kb in handsCache)) handsCache[kb] = simulateKeepRate(b.cards, 1000);
    hands = { a: handsCache[ka], b: handsCache[kb] };
  }
  const r = matchupEdges(a, b, hands);
  const prob = 0.25 * r.edges.speed + 0.25 * r.edges.threats +
    0.20 * r.edges.interaction + 0.15 * r.edges.hands + 0.15 * r.edges.synergy;
  const winsA = Math.round(prob * 10);
  return { winsA: winsA, winsB: 10 - winsA, edges: r.edges, stA: r.stA, stB: r.stB, syn: r.syn, hands: hands };
}

function matchupReasons(m, a, b) {
  const ra = [], rb = [];
  const e = m.edges;
  const push = (edge, aTxt, bTxt) => {
    if (edge >= 0.58) ra.push(aTxt);
    else if (edge <= 0.42) rb.push(bTxt);
  };
  if (m.stA.speed.avg !== null && m.stB.speed.avg !== null) {
    push(e.speed,
      '<strong>Faster:</strong> ' + esc(a.name) + ' averages ' + m.stA.speed.avg.toFixed(1) + ' mana vs ' + m.stB.speed.avg.toFixed(1) + ' — it pressures early.',
      '<strong>Faster:</strong> ' + esc(b.name) + ' averages ' + m.stB.speed.avg.toFixed(1) + ' mana vs ' + m.stA.speed.avg.toFixed(1) + ' — it pressures early.');
  }
  if (m.hands) {
    const pa = Math.round(m.hands.a * 100), pb = Math.round(m.hands.b * 100);
    push(e.hands,
      '<strong>Better opening hands:</strong> keeps ' + pa + '% vs ' + pb + '% — it starts its game plan more often.',
      '<strong>Better opening hands:</strong> keeps ' + pb + '% vs ' + pa + '% — it starts its game plan more often.');
  }
  if (m.stA.creatureCopies || m.stB.creatureCopies) {
    const ap = m.stA.size.avgP, bp = m.stB.size.avgP;
    const bigA = m.stA.bigThreats ? ', with ' + m.stA.bigThreats + ' big finisher' + (m.stA.bigThreats === 1 ? '' : 's') : '';
    const bigB = m.stB.bigThreats ? ', with ' + m.stB.bigThreats + ' big finisher' + (m.stB.bigThreats === 1 ? '' : 's') : '';
    push(e.threats,
      '<strong>Bigger threats:</strong> ' + esc(a.name) + '’s creatures average ' + (ap !== null ? ap.toFixed(1) : '—') + ' power vs ' + (bp !== null ? bp.toFixed(1) : '—') + bigA + '.',
      '<strong>Bigger threats:</strong> ' + esc(b.name) + '’s creatures average ' + (bp !== null ? bp.toFixed(1) : '—') + ' power vs ' + (ap !== null ? ap.toFixed(1) : '—') + bigB + '.');
  }
  push(e.interaction,
    '<strong>More removal:</strong> ' + m.stA.removalCards + ' answers to ' + m.stB.removalCards + ' — it can kill the big threats.',
    '<strong>More removal:</strong> ' + m.stB.removalCards + ' answers to ' + m.stA.removalCards + ' — it can kill the big threats.');
  if (m.syn && m.syn[0] !== null && m.syn[1] !== null) {
    push(e.synergy,
      '<strong>More focused:</strong> synergy ' + m.syn[0] + '/10 vs ' + m.syn[1] + '/10 — its cards work together better.',
      '<strong>More focused:</strong> synergy ' + m.syn[1] + '/10 vs ' + m.syn[0] + '/10 — its cards work together better.');
  }
  // Combo edge — only when the user has checked combos for that deck.
  const cbA = comboEdgeBullet(a), cbB = comboEdgeBullet(b);
  if (cbA) ra.push(cbA);
  if (cbB) rb.push(cbB);
  return { ra: ra, rb: rb };
}

// The fatal blow, by the numbers: how the projected winner ends games.
// damage per swing = avg power of big threats × up to 3 of them.
function fatalBlow(entry) {
  const st = computeStats(entry.cards);
  const isBig = (c) => c.statsOk && c.maintype === 'Creature' &&
    c.power !== null && c.power !== '' && isFinite(parseFloat(c.power)) && parseFloat(c.power) >= 5;
  const bigOnes = entry.cards.filter(isBig);
  const pool = bigOnes.length ? bigOnes : entry.cards.filter((c) => c.statsOk && c.maintype === 'Creature' &&
    c.power !== null && c.power !== '' && isFinite(parseFloat(c.power)));
  if (!pool.length) return null;
  let sum = 0, n = 0;
  pool.forEach((c) => { const p = parseFloat(c.power); const k = statCopies(c); sum += p * k; n += k; });
  const avgP = sum / n;
  const threatCopies = bigOnes.length ? st.bigThreats : st.creatureCopies;
  const dmg = Math.max(1, Math.round(avgP * Math.min(3, threatCopies)));
  const life = entry.format === 'commander' ? 40 : 20;
  const swings = Math.max(1, Math.ceil(life / dmg));
  let unblock = 0;
  entry.cards.forEach((c) => {
    if (!c.statsOk || c.maintype !== 'Creature') return;
    const lk = (c.lethalKws || []).map((x) => String(x).toLowerCase());
    if (lk.indexOf('flying') !== -1 || lk.indexOf('trample') !== -1 ||
        lk.indexOf('menace') !== -1 || lk.indexOf('unblockable') !== -1) {
      unblock += statCopies(c);
    }
  });
  return { avgP: avgP, n: threatCopies, big: bigOnes.length > 0, dmg: dmg, swings: swings, unblock: unblock };
}
function fatalBlowHTML(w) {
  const f = fatalBlow(w);
  if (!f) return '';
  let html = '<p class="standout-title">The fatal blow — by the numbers</p>';
  html += '<div class="tiles" role="img" aria-label="Fatal blow: ' + f.dmg + ' damage per swing, lethal in about ' +
    f.swings + ' swings, ' + f.unblock + ' hard-to-block threats">' +
    '<div class="tile"><div class="big">' + f.dmg + '</div><div class="lbl">damage per swing</div></div>' +
    '<div class="tile"><div class="big">' + f.swings + '</div><div class="lbl">swings to lethal</div></div>' +
    '<div class="tile"><div class="big">' + f.unblock + '</div><div class="lbl">unblockable threats</div></div></div>';
  html += '<p>' + esc(w.name) + '’s ' + f.n + (f.big ? ' big threats' : ' creatures') + ' average <strong>' +
    f.avgP.toFixed(1) + ' power</strong>' + (f.unblock ? ', ' + f.unblock + ' with flying or trample' : '') +
    ' — about <strong>' + f.dmg + ' damage per swing</strong>, lethal in ~' + f.swings +
    (f.swings === 1 ? ' swing' : ' swings') + '.</p>';
  return html;
}

function matchupHTML(a, b, m, reasons, sA, sB) {
  const aWins = m.winsA >= m.winsB;
  const w = aWins ? a : b, wWins = aWins ? m.winsA : m.winsB;
  const wReasons = aWins ? reasons.ra : reasons.rb;
  const lName = aWins ? b.name : a.name;
  const lWins = aWins ? m.winsB : m.winsA;
  const lReasons = aWins ? reasons.rb : reasons.ra;
  let html = '<div class="stat-chart"><h4>' + esc(w.name) + ' wins ' + wWins + ' out of 10</h4>';
  html += '<div class="matchup-scale" role="img" aria-label="' + esc(a.name) + ' wins ' + m.winsA +
    ' out of 10 against ' + esc(b.name) + '">' +
    '<span class="n">' + m.winsA + '</span>' +
    '<div class="matchup-bar"><div class="fill-a" style="width:' + (m.winsA * 10) + '%"></div>' +
    '<div class="fill-b" style="width:' + (m.winsB * 10) + '%"></div></div>' +
    '<span class="n">' + m.winsB + '</span></div>';
  html += '<p class="muted small">' + esc(a.name) + ' · projected games · ' + esc(b.name) + '</p>';
  html += '<p class="muted small">A numbers-based projection from your decks’ stats and 1,000 simulated opening hands each — not a prediction of real games.</p></div>';
  html += '<div class="stat-chart"><h4>Opening hands — 1,000 shuffled deals each</h4>';
  html += '<p><strong>' + esc(a.name) + ':</strong> <span class="muted">' + sA.map(esc).join(', ') + '</span></p>';
  html += '<p><strong>' + esc(b.name) + ':</strong> <span class="muted">' + sB.map(esc).join(', ') + '</span></p>';
  html += '<div class="share-row"><button type="button" id="redeal-hands" class="secondary small">Re-deal</button></div>';
  if (m.hands) {
    html += '<p>Keepable hands: <strong>' + esc(a.name) + ' ' + Math.round(m.hands.a * 100) + '%</strong> vs <strong>' +
      esc(b.name) + ' ' + Math.round(m.hands.b * 100) + '%</strong> ' +
      '<span class="muted small">— 2–4 lands and a play by turn 3</span></p>';
  }
  html += '</div>';
  html += '<div class="stat-chart"><h4>Status sheet — how each deck outcompetes the other</h4>';
  html += '<p class="standout-title">How ' + esc(w.name) + ' wins</p>';
  html += wReasons.length
    ? '<ul class="stat-list">' + wReasons.map((r) => '<li>' + r + '</li>').join('') + '</ul>'
    : '<p class="muted">No clear edge — the decks match up evenly here.</p>';
  if (m.winsA !== m.winsB) html += fatalBlowHTML(w);
  html += '<p class="standout-title">How ' + esc(lName) + ' wins (' + lWins + ' out of 10)</p>';
  html += lReasons.length
    ? '<ul class="stat-list">' + lReasons.map((r) => '<li>' + r + '</li>').join('') + '</ul>'
    : '<p class="muted">No clear edge — the decks match up evenly here.</p>';
  html += '</div>';
  return html;
}

function renderMatchupSelects() {
  const sa = $('#matchup-a'), sb = $('#matchup-b');
  if (!sa || !sb) return;
  const prevA = sa.value, prevB = sb.value;
  const ids = collection.decks.map((d) => d.id);
  [sa, sb].forEach((s) => {
    s.innerHTML = '';
    collection.decks.forEach((d) => {
      const o = document.createElement('option');
      o.value = d.id;
      o.textContent = d.name + ' (' + deckTotalOf(d) + ' cards)';
      s.appendChild(o);
    });
  });
  sa.value = ids.indexOf(prevA) !== -1 ? prevA : deck.id;
  const defB = ids.filter((id) => id !== sa.value)[0] || sa.value;
  sb.value = ids.indexOf(prevB) !== -1 && prevB !== sa.value ? prevB : defB;
}
function matchupEntries() {
  const sa = $('#matchup-a'), sb = $('#matchup-b');
  if (!sa || !sb) return [null, null];
  return [
    collection.decks.filter((d) => d.id === sa.value)[0] || null,
    collection.decks.filter((d) => d.id === sb.value)[0] || null,
  ];
}
let matchupHC = {};
function runMatchup() {
  const box = $('#matchup-out');
  if (!box) return;
  const pair = matchupEntries();
  const a = pair[0], b = pair[1];
  if (!a || !b) { box.innerHTML = '<p class="muted">Add at least two decks to compare them.</p>'; return; }
  if (a.id === b.id) { box.innerHTML = '<p class="muted">Pick two different decks to compare.</p>'; return; }
  box.innerHTML = '<p class="muted" role="status">Running the numbers…</p>';
  // Let the "running" note paint before the hand simulations run.
  setTimeout(() => {
    const m = matchup(a, b, matchupHC);
    if (m.tooSmall) {
      box.innerHTML = '<p class="muted">Both decks need at least 10 cards for a matchup — add more cards first.</p>';
      announce('Both decks need at least 10 cards for a matchup.');
      return;
    }
    const reasons = matchupReasons(m, a, b);
    box.innerHTML = matchupHTML(a, b, m, reasons, sampleHandForDisplay(a), sampleHandForDisplay(b));
    const redeal = $('#redeal-hands');
    if (redeal) redeal.addEventListener('click', runMatchup);
    announce(a.name + ' wins ' + m.winsA + ' out of 10 against ' + b.name + '.');
  }, 30);
}

// Round-robin: every deck with 10+ cards plays every other deck once.
function runRankings() {
  const box = $('#rank-out');
  if (!box) return;
  const elig = collection.decks.filter((d) => deckTotalOf(d) >= 10);
  if (elig.length < 2) {
    box.innerHTML = '<p class="muted">You need at least two decks with 10 or more cards to rank them.</p>';
    announce('Not enough decks to rank yet.');
    return;
  }
  box.innerHTML = '<p class="muted" role="status">Ranking ' + elig.length + ' decks…</p>';
  setTimeout(() => {
    const hc = {};
    const rec = elig.map((d) => ({ d: d, w: 0, l: 0 }));
    for (let i = 0; i < rec.length; i++) {
      for (let j = i + 1; j < rec.length; j++) {
        const m = matchup(rec[i].d, rec[j].d, hc);
        if (m.tooSmall) continue;
        rec[i].w += m.winsA; rec[i].l += m.winsB;
        rec[j].w += m.winsB; rec[j].l += m.winsA;
      }
    }
    rec.sort((x, y) => y.w - x.w || x.l - y.l);
    box.innerHTML = '<h4>Rank my decks</h4><ol class="stat-list">' + rec.map((r, i) =>
      '<li><strong>' + (i + 1) + '. ' + esc(r.d.name) + '</strong> — ' + r.w + 'W / ' + r.l + 'L</li>'
    ).join('') + '</ol>';
    announce('Deck rankings are ready.');
  }, 30);
}

// ---------- combo detection (v2.9) ----------
// Complete combos and "one piece away" combos, from Commander Spellbook's
// free database (via /api/combos), with a built-in fallback list if their
// service is unreachable. Results are cached per deck so repeat views are free.
const comboCache = {};
// Curated fallback: famous combos, used only when Spellbook is unreachable.
const KNOWN_COMBOS = [
  { cards: ["Exquisite Blood", "Sanguine Bond"], result: "Infinite life loss" },
  { cards: ["Thassa's Oracle", "Demonic Consultation"], result: "Win the game on the spot" },
  { cards: ["Thassa's Oracle", "Tainted Pact"], result: "Win the game on the spot" },
  { cards: ["Laboratory Maniac", "Demonic Consultation"], result: "Win the game on the spot" },
  { cards: ["Jace, Wielder of Mysteries", "Demonic Consultation"], result: "Win the game on the spot" },
  { cards: ["Isochron Scepter", "Dramatic Reversal"], result: "Infinite mana" },
  { cards: ["Splinter Twin", "Deceiver Exarch"], result: "Infinite hasty attackers" },
  { cards: ["Splinter Twin", "Pestermite"], result: "Infinite hasty attackers" },
  { cards: ["Kiki-Jiki, Mirror Breaker", "Deceiver Exarch"], result: "Infinite hasty attackers" },
  { cards: ["Kiki-Jiki, Mirror Breaker", "Pestermite"], result: "Infinite hasty attackers" },
  { cards: ["Kiki-Jiki, Mirror Breaker", "Zealous Conscripts"], result: "Infinite hasty attackers" },
  { cards: ["Mikaeus, the Unhallowed", "Triskelion"], result: "Infinite damage" },
  { cards: ["Mikaeus, the Unhallowed", "Walking Ballista"], result: "Infinite damage" },
  { cards: ["Helm of Obedience", "Rest in Peace"], result: "Mill the whole library" },
  { cards: ["Painter's Servant", "Grindstone"], result: "Mill the whole library" },
  { cards: ["Basalt Monolith", "Rings of Brighthearth"], result: "Infinite colorless mana" },
  { cards: ["Grim Monolith", "Power Artifact"], result: "Infinite colorless mana" },
  { cards: ["Kinnan, Bonder Prodigy", "Basalt Monolith"], result: "Infinite colorless mana" },
  { cards: ["Deadeye Navigator", "Peregrine Drake"], result: "Infinite mana and blinks" },
  { cards: ["Deadeye Navigator", "Great Whale"], result: "Infinite mana and blinks" },
  { cards: ["Niv-Mizzet, Parun", "Curiosity"], result: "Infinite damage and card draw" },
  { cards: ["Niv-Mizzet, the Firemind", "Curiosity"], result: "Infinite damage and card draw" },
  { cards: ["Niv-Mizzet, Parun", "Ophidian Eye"], result: "Infinite damage and card draw" },
  { cards: ["Malcolm, Keen-Eyed Navigator", "Glint-Horn Buccaneer"], result: "Infinite damage" },
  { cards: ["Food Chain", "Squee, the Immortal"], result: "Infinite creature mana" },
  { cards: ["Food Chain", "Misthollow Griffin"], result: "Infinite creature mana" },
  { cards: ["Earthcraft", "Squirrel Nest"], result: "Infinite Squirrel tokens" },
  { cards: ["Midnight Guard", "Presence of Gond"], result: "Infinite Elf tokens" },
  { cards: ["Freed from the Real", "Bloom Tender"], result: "Infinite mana" },
  { cards: ["Pemmin's Aura", "Bloom Tender"], result: "Infinite mana" },
  { cards: ["Priest of Titania", "Sword of the Paruns"], result: "Infinite green mana" },
  { cards: ["Priest of Titania", "Umbral Mantle"], result: "Infinite green mana" },
  { cards: ["Elvish Archdruid", "Umbral Mantle"], result: "Infinite green mana" },
  { cards: ["Vizier of Remedies", "Devoted Druid"], result: "Infinite green mana" },
  { cards: ["Grand Architect", "Pili-Pala"], result: "Infinite colored mana" },
  { cards: ["Bloodchief Ascension", "Mindcrank"], result: "Infinite mill and life loss" },
  { cards: ["Duskmantle Guildmage", "Mindcrank"], result: "Infinite mill and life loss" },
  { cards: ["Famished Paladin", "Sorcerer's Wand"], result: "Infinite damage" },
  { cards: ["Chain of Smog", "Witherbloom Apprentice"], result: "Infinite magecraft triggers" },
  { cards: ["Teferi, Mage of Zhalfir", "Knowledge Pool"], result: "Opponents can't cast spells" },
  { cards: ["Reveillark", "Karmic Guide"], result: "Infinite creature recursion" },
  { cards: ["Ashnod's Altar", "Nim Deathmantle"], result: "Infinite death triggers and mana (with any creature)" },
  { cards: ["Underworld Breach", "Brain Freeze", "Lion's Eye Diamond"], result: "Storm off and mill everyone out" },
];
function localComboCheck(names) {
  const lower = {};
  names.forEach((n) => { lower[String(n).toLowerCase()] = true; });
  const included = [], almost = [];
  KNOWN_COMBOS.forEach((c) => {
    const missing = c.cards.filter((n) => !lower[n.toLowerCase()]);
    if (missing.length === 0) included.push({ cards: c.cards, produces: [c.result], description: '', missing: [] });
    else if (missing.length === 1) almost.push({ cards: c.cards, produces: [c.result], description: '', missing: missing });
  });
  return { ok: true, source: 'fallback', included: included, almostIncluded: almost };
}
function comboResultText(v) {
  const p = (v.produces || []).filter(Boolean);
  return p.length ? p.slice(0, 2).join(', ') : 'a known combo';
}
async function fetchCombos(entry) {
  const names = [...new Set(entry.cards.map((c) => c.name))];
  try {
    const r = await api('/api/combos', { method: 'POST', body: JSON.stringify({ cards: names }) });
    if (!r.ok) throw new Error('combo service unavailable');
    comboCache[entry.id] = { data: r.data, fallback: false };
  } catch (e) {
    comboCache[entry.id] = { data: localComboCheck(names), fallback: true };
  }
  return comboCache[entry.id];
}
// (v2.10: checkCombosFor and renderComboResults now live in the quiet
// synergies section below — they read card text and find quiet synergies
// alongside the famous combos.)
function searchForCard(name) {
  const tab = document.querySelector('.tab[data-tab="search"]');
  if (tab) tab.click();
  const inp = $('#q-name');
  if (inp) inp.value = name || '';
  runSearch(1);
}
function comboEdgeBullet(entry) {
  const c = comboCache[entry.id];
  if (c && c.data && c.data.included && c.data.included.length) {
    const v = c.data.included[0];
    return '<strong>Combo edge:</strong> holds the complete ' + esc(v.cards.join(' + ')) + ' combo — ' + esc(comboResultText(v)) + '.';
  }
  return null;
}

// ---------- quiet synergies (v2.10) ----------
// The combo checker now reads the deck's actual card text (via /api/cardtexts)
// and scans every card pair for low-key mechanic pairings — the synergies too
// quiet for the famous-combo database. Each rule is a text-pattern pair plus a
// plain-language explanation. Pairs already part of a famous combo are skipped.
const SYNERGY_RULES = [
  { a: /sacrific/i, b: /when(ever)? .* dies\b/i, why: 'Sacrifice outlets feed your "whenever something dies" triggers.' },
  { a: /sacrific/i, b: /when(ever)? you sacrifice/i, why: 'Sacrificing things triggers your sacrifice payoffs.' },
  { a: /enters the battlefield/i, b: /exile[^.]{0,80}return[^.]{0,80}battlefield/i, why: 'Blink effects let you reuse enter-the-battlefield triggers.' },
  { a: /return .* from your graveyard to the battlefield/i, b: /enters the battlefield/i, why: 'Reanimation brings back enter-the-battlefield triggers for a second run.' },
  { a: /return .* from your graveyard to the battlefield/i, b: /when(ever)? .* dies\b/i, why: 'Recurring creatures feed your death triggers over and over.' },
  { a: /\bdraw\b/i, b: /when(ever)? you draw/i, why: 'Card draw feeds your whenever-you-draw payoffs.' },
  { a: /\bdiscard\b/i, b: /when(ever)? you discard|madness/i, why: 'Discard outlets power your discard payoffs and madness cards.' },
  { a: /\bmill\b/i, b: /from your graveyard|flashback|escape|unearth/i, why: 'Mill fills your graveyard to fuel your graveyard payoffs.' },
  { a: /\+1\/\+1 counter|proliferate/i, b: /with a \+1\/\+1 counter|for each .* counter|whenever .* counter/i, why: 'Counter makers feed your counter payoffs.' },
  { a: /create .* token/i, b: /when(ever)? .* token|sacrifice a token|tokens you control get/i, why: 'Token makers feed your token payoffs.' },
  { a: /you gain .* life/i, b: /when(ever)? you gain life/i, why: 'Lifegain triggers your whenever-you-gain-life cards.' },
  { a: /deathtouch/i, b: /deals .* damage to/i, why: 'Deathtouch turns any damage into a kill.' },
  { a: /when(ever)? .* attacks/i, b: /additional combat|haste/i, why: 'Attack triggers love extra combats and haste.' },
  { a: /\{t\}/i, b: /\buntap\b/i, why: 'Untap effects let you reuse tap abilities.' },
  { a: /when(ever)? a land/i, b: /search your library for .* land/i, why: 'Ramp triggers your landfall cards.' },
  { a: /prowess/i, b: /instant|sorcery/i, why: 'Instants and sorceries grow your prowess creatures.' },
  { a: /equip/i, b: /flying|unblockable|can't be blocked|trample|menace/i, why: 'Equipment hits harder on hard-to-block creatures.' },
  { a: /deals combat damage to a player/i, b: /draw a card/i, why: 'Combat-damage triggers that draw cards reward getting through.' },
];
// Tribal lords: "Other Elves you control get +1/+1" + an Elf creature.
function tribalLordWhy(A, B) {
  const pairs = [[A, B], [B, A]];
  for (const [lord, member] of pairs) {
    const m = String(lord.oracle_text || '').match(/other ([A-Za-z]+) you control get/i);
    if (!m) continue;
    const tribe = m[1];
    if (new RegExp('\\b' + tribe + '\\b', 'i').test(member.type_line || '') &&
        /\bcreature\b/i.test(member.type_line || '')) {
      return 'Tribal payoff: pumps every ' + tribe + ' you control, including ' + member.name + '.';
    }
  }
  return null;
}
function synergyWhy(A, B) {
  const ta = A.oracle_text || '', tb = B.oracle_text || '';
  for (const r of SYNERGY_RULES) {
    if ((r.a.test(ta) && r.b.test(tb)) || (r.a.test(tb) && r.b.test(ta))) return r.why;
  }
  return tribalLordWhy(A, B);
}
function findSynergies(texts, famousPairs, skipPairs) {
  const cards = (texts || []).filter((t) => t.oracle_text && String(t.oracle_text).trim());
  const found = [];
  const seen = {};
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const A = cards[i], B = cards[j];
      const pk = [A.name.toLowerCase(), B.name.toLowerCase()].sort().join('|');
      if (seen[pk] || (famousPairs && famousPairs[pk]) || (skipPairs && skipPairs[pk])) continue;
      seen[pk] = true;
      const why = synergyWhy(A, B);
      if (why) found.push({ a: A.name, b: B.name, why: why });
    }
  }
  return found;
}
// ---------- generated combos (v2.11) ----------
// Goes beyond pre-written rules: the app builds combos from the collected
// card text. It finds an ENGINE card (does something repeatable) and a PAYOFF
// card (triggers on it), then writes the play pattern using the cards' own
// words. It also spots infinite loops: a free sacrifice outlet plus something
// that replaces itself.
function snippetFor(text, rx) {
  const parts = String(text || '').split('.').map((s) => s.trim()).filter(Boolean);
  const hit = parts.find((p) => rx.test(p)) || parts[0] || '';
  return hit.length > 110 ? hit.slice(0, 110).trim() + '…' : hit;
}
// engine: card does X repeatably. payoff: card triggers on X.
const COMBO_LINKS = [
  { engine: /sacrific/i, payoff: /when(ever)?[^.]{0,80}dies\b/i,
    make: (E, P, es, ps) => 'Sacrifice with ' + E + ' ("' + es + '") to trigger ' + P + ' ("' + ps + '") — every sacrifice pays twice.' },
  { engine: /sacrific/i, payoff: /when(ever)? you sacrifice/i,
    make: (E, P, es, ps) => 'Sacrifice with ' + E + ' ("' + es + '") to set off ' + P + ' ("' + ps + '").' },
  { engine: /exile[^.]{0,80}return[^.]{0,80}battlefield/i, payoff: /enters the battlefield/i,
    make: (E, P, es, ps) => 'Blink with ' + E + ' ("' + es + '") to reuse ' + P + '’s "' + ps + '".' },
  { engine: /return[^.]{0,40}from your graveyard to the battlefield/i, payoff: /enters the battlefield/i,
    make: (E, P, es, ps) => 'Reanimate with ' + E + ' ("' + es + '") to get ' + P + '’s "' + ps + '" again.' },
  { engine: /\bdraw\b/i, payoff: /when(ever)? you draw/i,
    make: (E, P, es, ps) => 'Draw with ' + E + ' ("' + es + '") to trigger ' + P + ' ("' + ps + '").' },
  { engine: /\bdiscard\b/i, payoff: /when(ever)? you discard|madness/i,
    make: (E, P, es, ps) => 'Discard with ' + E + ' ("' + es + '") to power ' + P + ' ("' + ps + '").' },
  { engine: /\bmill\b/i, payoff: /from your graveyard|flashback|escape|unearth/i,
    make: (E, P, es, ps) => 'Mill with ' + E + ' ("' + es + '") to fuel ' + P + ' ("' + ps + '").' },
  { engine: /create[^.]{0,40}token/i, payoff: /when(ever)?[^.]{0,40}token|sacrifice a token|tokens you control get/i,
    make: (E, P, es, ps) => 'Make tokens with ' + E + ' ("' + es + '") to feed ' + P + ' ("' + ps + '").' },
  { engine: /you gain[^.]{0,30}life/i, payoff: /when(ever)? you gain life/i,
    make: (E, P, es, ps) => 'Gain life with ' + E + ' ("' + es + '") to trigger ' + P + ' ("' + ps + '").' },
  { engine: /\+1\/\+1 counter|proliferate/i, payoff: /with a \+1\/\+1 counter|for each[^.]{0,40}counter|whenever[^.]{0,40}counter/i,
    make: (E, P, es, ps) => 'Stack counters with ' + E + ' ("' + es + '") for ' + P + '’s "' + ps + '".' },
];
function linkForPair(A, B) {
  const ta = A.oracle_text || '', tb = B.oracle_text || '';
  for (const L of COMBO_LINKS) {
    if (L.engine.test(ta) && L.payoff.test(tb)) return { E: A, P: B, L: L };
    if (L.engine.test(tb) && L.payoff.test(ta)) return { E: B, P: A, L: L };
  }
  return null;
}
// A free sacrifice outlet: "Sacrifice a creature:" with no tap or mana in the cost.
function freeSacSnippet(t) {
  const parts = String(t.oracle_text || '').split('.').map((s) => s.trim()).filter(Boolean);
  return parts.find((p) => /^sacrifice (a|another)\b[^:]*:/i.test(p) && !/\{[T0-9WUBRGCXYZ]+\}/i.test(p.split(':')[0])) || null;
}
// Something that replaces itself when it dies: makes a token or comes back.
function selfReplacingSnippet(t) {
  const parts = String(t.oracle_text || '').split('.').map((s) => s.trim()).filter(Boolean);
  return parts.find((p) => /when(ever)?[^.]{0,60}dies[^.]{0,60}(create[^.]{0,40}token|return[^.]{0,40}battlefield)/i.test(p)) || null;
}
function deathPayoffSnippet(t) {
  const parts = String(t.oracle_text || '').split('.').map((s) => s.trim()).filter(Boolean);
  return parts.find((p) => /when(ever)?[^.]{0,60}dies[^.]{0,60}(target|each|draw|lose|gain|deal)/i.test(p)) || null;
}
function findGeneratedCombos(texts, famousPairs) {
  const cards = (texts || []).filter((t) => t.oracle_text && String(t.oracle_text).trim());
  const combos = [], usedPairs = {};
  const pairKey = (a, b) => [a.toLowerCase(), b.toLowerCase()].sort().join('|');
  // 2-card engine -> payoff combos, written from the cards' own words.
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const A = cards[i], B = cards[j], pk = pairKey(A.name, B.name);
      if (famousPairs[pk] || usedPairs[pk]) continue;
      const link = linkForPair(A, B);
      if (!link) continue;
      usedPairs[pk] = true;
      combos.push({
        cards: [link.E.name, link.P.name],
        line: link.L.make(link.E.name, link.P.name,
          snippetFor(link.E.oracle_text, link.L.engine), snippetFor(link.P.oracle_text, link.L.payoff)),
      });
    }
  }
  // Infinite loops: free sacrifice outlet + something that replaces itself.
  const outlets = cards.map((c) => ({ c: c, snip: freeSacSnippet(c) })).filter((o) => o.snip);
  const replacers = cards.map((c) => ({ c: c, snip: selfReplacingSnippet(c) })).filter((o) => o.snip);
  const payoffs = cards.map((c) => ({ c: c, snip: deathPayoffSnippet(c) })).filter((o) => o.snip);
  outlets.forEach((o) => {
    replacers.forEach((r) => {
      if (o.c.name === r.c.name) return;
      const pk = pairKey(o.c.name, r.c.name);
      if (famousPairs[pk] || usedPairs[pk]) return;
      usedPairs[pk] = true;
      combos.push({
        cards: [o.c.name, r.c.name],
        line: 'Infinite loop: sacrifice to ' + o.c.name + ' ("' + o.snip + '") — ' + r.c.name + '’s "' + r.snip + '" replaces it. Repeat forever.',
      });
    });
  });
  // 3-card infinite: outlet + token-maker-on-death + death payoff.
  const makers = replacers.filter((r) => /create[^.]{0,40}token/i.test(r.snip));
  outlets.forEach((o) => {
    makers.forEach((m) => {
      payoffs.forEach((p) => {
        if (o.c.name === m.c.name || o.c.name === p.c.name || m.c.name === p.c.name) return;
        const names = [o.c.name, m.c.name, p.c.name].map((n) => n.toLowerCase()).sort();
        const k3 = names.join('|');
        if (famousPairs[k3] || usedPairs[k3] || combos.length > 40) return;
        usedPairs[k3] = true;
        combos.push({
          cards: [o.c.name, m.c.name, p.c.name],
          line: 'Infinite loop: sacrifice ' + m.c.name + '’s token to ' + o.c.name + ' ("' + o.snip + '") — ' + m.c.name + ' makes another, and ' + p.c.name + ' ("' + p.snip + '") triggers every time.',
        });
      });
    });
  });
  return { combos: combos, usedPairs: usedPairs };
}
// ---------- card abilities in the deck list (v2.12) ----------
// Shows each card's written rules text right in the deck builder, under the
// card name. Texts are cached by card name (shared across decks), so the
// lookup only hits the network once per card.
const abilityTexts = {};
async function ensureAbilityTexts(names) {
  const missing = [...new Set(names.map((n) => String(n)))].filter((n) => !(n.toLowerCase() in abilityTexts));
  if (!missing.length) return;
  try {
    const r = await api('/api/cardtexts', { method: 'POST', body: JSON.stringify({ cards: missing }) });
    ((r.data && r.data.texts) || []).forEach((t) => { abilityTexts[t.name.toLowerCase()] = t.oracle_text || ''; });
  } catch (e) { /* leave blank; the row simply shows no text */ }
}
function fillDeckAbilities() {
  const names = deck.cards.map((c) => c.name);
  ensureAbilityTexts(names).then(() => {
    const rows = document.querySelectorAll('#deck-list .abilities');
    for (const el of rows) {
      const t = abilityTexts[(el.getAttribute('data-aname') || '').toLowerCase()];
      if (t) el.textContent = t;
    }
  });
}
const cardTextCache = {};
async function fetchCardTexts(entry) {
  if (cardTextCache[entry.id]) return cardTextCache[entry.id];
  const names = [...new Set(entry.cards.map((c) => c.name))];
  try {
    const r = await api('/api/cardtexts', { method: 'POST', body: JSON.stringify({ cards: names }) });
    cardTextCache[entry.id] = (r.data && r.data.texts) || [];
  } catch (e) {
    cardTextCache[entry.id] = [];
  }
  return cardTextCache[entry.id];
}
async function checkCombosFor(entry, box) {
  if (!box) return;
  box.innerHTML = '<p class="muted" role="status">Reading your cards and checking for combos…</p>';
  announce('Checking ' + entry.name + ' for combos and synergies.');
  const c = await fetchCombos(entry);
  let generated = [], synergies = [];
  try {
    const texts = await fetchCardTexts(entry);
    const famousPairs = {};
    (c.data.included || []).forEach((v) => {
      const cs = (v.cards || []).map((x) => String(x).toLowerCase()).sort();
      for (let i = 0; i < cs.length; i++) {
        for (let j = i + 1; j < cs.length; j++) famousPairs[cs[i] + '|' + cs[j]] = true;
      }
    });
    const g = findGeneratedCombos(texts, famousPairs);
    generated = g.combos;
    synergies = findSynergies(texts, famousPairs, g.usedPairs);
  } catch (e) { generated = []; synergies = []; }
  renderComboResults(entry, box, c.data, c.fallback, generated, synergies);
}
function renderComboResults(entry, box, data, usedFallback, generated, synergies) {
  const inc = data.included || [], alm = data.almostIncluded || [],
    gen = generated || [], syn = synergies || [];
  let html = '';
  if (usedFallback) {
    html += '<p class="muted small">The combo database is busy — showing the built-in combo list instead.</p>';
  }
  if (!inc.length && !alm.length && !gen.length && !syn.length) {
    html += '<p class="muted">No combos or synergies found in ' + esc(entry.name) + '. Famous combos come from the community database; the rest are generated by reading your cards’ rules text.</p>';
  }
  if (inc.length) {
    html += '<p class="standout-title">Complete combos (' + inc.length + ')</p><ul class="stat-list">';
    inc.forEach((v) => {
      html += '<li><strong>Combo: ' + esc(v.cards.join(' + ')) + '</strong> → ' + esc(comboResultText(v)) + '</li>';
    });
    html += '</ul>';
  }
  if (alm.length) {
    html += '<p class="standout-title">One piece away (' + alm.length + ')</p><ul class="stat-list">';
    alm.slice(0, 8).forEach((v) => {
      const miss = (v.missing && v.missing[0]) || '';
      html += '<li>One piece away from <strong>' + esc(v.cards.join(' + ')) + '</strong> → ' + esc(comboResultText(v)) +
        '<br><span class="muted">Add ' + esc(miss) + '</span>' +
        '<button type="button" class="secondary small combo-find" data-name="' + esc(miss) + '">Find this card</button></li>';
    });
    html += '</ul>';
    if (alm.length > 8) html += '<p class="muted small">…and ' + (alm.length - 8) + ' more.</p>';
  }
  if (gen.length) {
    html += '<p class="standout-title">Generated combos (' + gen.length + ')</p><ul class="stat-list">';
    gen.slice(0, 10).forEach((g) => {
      html += '<li><strong>Combo: ' + esc(g.cards.join(' + ')) + '</strong><br><span>' + esc(g.line) + '</span></li>';
    });
    html += '</ul>';
    if (gen.length > 10) html += '<p class="muted small">…and ' + (gen.length - 10) + ' more.</p>';
  }
  if (syn.length) {
    html += '<p class="standout-title">Quieter synergies (' + syn.length + ')</p><ul class="stat-list">';
    syn.slice(0, 12).forEach((s) => {
      html += '<li><strong>' + esc(s.a) + ' + ' + esc(s.b) + '</strong> — ' + esc(s.why) + '</li>';
    });
    html += '</ul>';
    if (syn.length > 12) html += '<p class="muted small">…and ' + (syn.length - 12) + ' more.</p>';
  }
  box.innerHTML = html;
  box.querySelectorAll('.combo-find').forEach((btn) => {
    btn.addEventListener('click', () => searchForCard(btn.getAttribute('data-name')));
  });
  announce(inc.length + ' complete combos, ' + alm.length + ' one-piece-away combos, ' + gen.length + ' generated combos, and ' + syn.length + ' quieter synergies in ' + entry.name + '.');
}

// ---------- matchup & combo wiring ----------
$('#check-combos').addEventListener('click', () => checkCombosFor(deck, $('#combo-out')));
$('#matchup-a').addEventListener('change', runMatchup);
$('#matchup-b').addEventListener('change', runMatchup);
$('#rank-decks').addEventListener('click', runRankings);

// ---------- deck generator (v2.13) ----------
// Builds a whole deck from the user's theme: price cap, creature type,
// effect/wording, speed, and card types. Candidates come from /api/gen-pool;
// the combo/synergy engine scores them so cards that work together get picked.
let genPreview = null;
let genLastRequest = null;
let genExcluded = [];
function dtoToCard(dto) {
  return {
    id: dto.id, name: dto.name, set: dto.set, collector_number: dto.cn,
    prices: { usd: dto.usd }, image_uris: dto.image ? { normal: dto.image, small: dto.image } : {},
    type_line: dto.type_line, cmc: dto.cmc, colors: dto.colors, color_identity: dto.color_identity,
    keywords: [], oracle_text: dto.oracle_text, power: dto.power, toughness: dto.toughness,
  };
}
function basicLandDto(color, basics) {
  if (basics && basics[color]) return basics[color];
  const info = { W: ['Plains', '{W}'], U: ['Island', '{U}'], B: ['Swamp', '{B}'], R: ['Mountain', '{R}'], G: ['Forest', '{G}'], C: ['Wastes', '{C}'] }[color] || ['Wastes', '{C}'];
  return {
    id: 'basic-' + info[0], name: info[0], oracle_text: '({T}: Add ' + info[1] + '.)',
    type_line: 'Basic Land — ' + info[0], cmc: 0, colors: color === 'C' ? [] : [color],
    color_identity: color === 'C' ? [] : [color], usd: '0.10', set: 'GEN', cn: '1', image: '',
    edhrec: 999999, power: null, toughness: null,
  };
}
async function generateDeck() {
  const box = $('#gen-out');
  const fmt = document.querySelector('input[name="gen-format"]:checked');
  const spd = document.querySelector('input[name="gen-speed"]:checked');
  const format = fmt ? fmt.value : 'commander';
  const speed = spd ? spd.value : 'balanced';
  const maxPrice = parseFloat($('#gen-price').value) || 0;
  const maxTotal = parseFloat($('#gen-maxtotal').value) || 0;
  const creatureType = $('#gen-type').value.trim();
  const effect = $('#gen-effect').value.trim();
  const commanderName = format === 'commander' ? $('#gen-commander').value.trim() : '';
  const cardTypes = $$('#tab-gen input[name="gen-ctype"]:checked').map((el) => el.value);
  const prefColors = $$('#tab-gen input[name="gen-color"]:checked').map((el) => el.value);
  const name = $('#gen-name').value.trim() || 'Generated deck';
  if (!creatureType && !effect && !commanderName && !prefColors.length) {
    box.innerHTML = '<p class="muted">Tell me a creature type, an effect, or a color to build around first — or name your commander.</p>';
    return;
  }
  if (!cardTypes.length) {
    box.innerHTML = '<p class="muted">Pick at least one card type.</p>';
    return;
  }
  genExcluded = [];
  genLastRequest = { format: format, maxPrice: maxPrice, maxTotal: maxTotal, creatureType: creatureType, effect: effect, speed: speed, commanderName: commanderName, colors: prefColors, cardTypes: cardTypes, name: name };
  box.innerHTML = '<p class="muted" role="status">Generating your deck… this takes a few seconds.</p>';
  announce('Generating deck.');
  try {
    const r = await api('/api/gen-pool', { method: 'POST', body: JSON.stringify({ format: format, maxPrice: maxPrice, creatureType: creatureType, effect: effect, speed: speed, commanderName: commanderName, colors: prefColors }) });
    if (!r.ok) throw new Error((r.data && r.data.error) || 'generation failed');
    const built = buildGeneratedDeck(r.data, { format: format, cardTypes: cardTypes, maxTotal: maxTotal });
    if (!built.picks.length) {
      box.innerHTML = '<p class="muted">Not enough cards matched. Try raising the price or loosening the filters.</p>';
      return;
    }
    genPreview = { built: built, name: name, format: format };
    renderGenPreview();
  } catch (e) {
    box.innerHTML = '<p class="muted">Deck generation is unavailable right now. Please try again in a moment.</p>';
  }
}
function buildGeneratedDeck(pool, opts) {
  const isCommander = opts.format === 'commander';
  const typeWanted = {};
  opts.cardTypes.forEach((t) => { typeWanted[t] = true; });
  let colors = (pool.colors || []).slice();
  const cands = pool.candidates || [];
  if (!isCommander && !colors.length) {
    // No preferred colors: the two most common colors among candidates
    // keeps 60-card decks coherent.
    const cnt = {};
    cands.forEach((c) => (c.colors || []).forEach((col) => { cnt[col] = (cnt[col] || 0) + 1; }));
    colors = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]).slice(0, 2);
    if (!colors.length) colors = ['W', 'U', 'B', 'R', 'G'];
  }
  const cmdName = pool.commander ? pool.commander.name.toLowerCase() : null;
  const eligible = cands.filter((c) =>
    c.name.toLowerCase() !== cmdName &&
    (c.color_identity || []).every((col) => colors.includes(col)) &&
    typeWanted[mainTypeOf(c)] &&
    !/Land/.test(c.type_line || '')
  );
  // Score with the combo/synergy engine: cards that work together get picked.
  const texts = eligible.map((c) => ({ name: c.name, oracle_text: c.oracle_text, type_line: c.type_line }));
  if (pool.commander) texts.push({ name: pool.commander.name, oracle_text: pool.commander.oracle_text, type_line: pool.commander.type_line });
  const g = findGeneratedCombos(texts, {});
  const syns = findSynergies(texts, {}, g.usedPairs);
  const score = {};
  g.combos.forEach((v) => v.cards.forEach((n) => { score[n] = (score[n] || 0) + 3; }));
  syns.forEach((v) => { score[v.a] = (score[v.a] || 0) + 1; score[v.b] = (score[v.b] || 0) + 1; });
  eligible.sort((a, b) => ((score[b.name] || 0) - (score[a.name] || 0)) || (a.edhrec - b.edhrec));
  const picks = [];
  const pickedNames = {};
  if (pool.commander) pickedNames[pool.commander.name.toLowerCase()] = true;
  if (isCommander) {
    eligible.slice(0, 63).forEach((c) => { picks.push({ dto: c, qty: 1, asCommander: false }); pickedNames[c.name.toLowerCase()] = true; });
  } else {
    eligible.slice(0, 9).forEach((c) => { picks.push({ dto: c, qty: 4, asCommander: false }); pickedNames[c.name.toLowerCase()] = true; });
  }
  // Mana base first (deterministic), so the budget counts the whole deck:
  // commander + spells + lands.
  const landColors = colors.length ? colors : ['C'];
  const spellCount = picks.reduce((n, p) => n + p.qty, 0);
  const target = isCommander ? 100 : 60;
  const landCount = Math.max(0, target - spellCount - (isCommander ? 1 : 0));
  const landMap = {};
  for (let i = 0; i < landCount; i++) {
    const dto = basicLandDto(landColors[i % landColors.length], pool.basics);
    landMap[dto.name] = landMap[dto.name] || { dto: dto, qty: 0, asCommander: false };
    landMap[dto.name].qty++;
  }
  const landEntries = Object.values(landMap);
  const cmdEntry = pool.commander ? { dto: pool.commander, qty: 1, asCommander: true } : null;
  const fullPrice = () => picks.concat(landEntries, cmdEntry ? [cmdEntry] : [])
    .reduce((n, p) => n + (parseFloat(p.dto.usd) || 0) * p.qty, 0);
  // Whole-deck budget: swap the priciest spell picks for cheaper eligible
  // cards until the full deck fits under the user's max total. The commander
  // and lands are never cut.
  const cap = opts.maxTotal > 0 ? opts.maxTotal : Infinity;
  let guard = 0;
  while (fullPrice() > cap && guard++ < 80) {
    const victim = picks.filter((p) => !p.asCommander)
      .sort((a, b) => (parseFloat(b.dto.usd) || 0) - (parseFloat(a.dto.usd) || 0))[0];
    if (!victim) break;
    const vPrice = parseFloat(victim.dto.usd) || 0;
    const cheaper = eligible
      .filter((c) => !pickedNames[c.name.toLowerCase()] && (parseFloat(c.usd) || 0) < vPrice)
      .sort((a, b) => (parseFloat(a.usd) || 0) - (parseFloat(b.usd) || 0))[0];
    if (!cheaper) break;
    picks[picks.indexOf(victim)] = { dto: cheaper, qty: victim.qty, asCommander: false };
    delete pickedNames[victim.dto.name.toLowerCase()];
    pickedNames[cheaper.name.toLowerCase()] = true;
  }
  const all = picks.concat(landEntries, cmdEntry ? [cmdEntry] : []);
  const totalPrice = fullPrice();
  return {
    picks: all,
    totalCards: all.reduce((n, p) => n + p.qty, 0),
    priceLine: '$' + totalPrice.toFixed(2),
    overBudget: totalPrice > cap,
    budgetCap: cap === Infinity ? 0 : cap,
    commanderName: pool.commander ? pool.commander.name : null,
    comboCount: g.combos.length + syns.length,
  };
}
function renderGenPreview() {
  const box = $('#gen-out');
  const b = genPreview.built;
  let html = '<p class="standout-title">' + esc(genPreview.name) + ' — ' + b.totalCards + ' cards' +
    (b.commanderName ? ', led by ' + esc(b.commanderName) : '') + '</p>';
  let budgetNote = '';
  if (b.budgetCap > 0) {
    budgetNote = b.overBudget
      ? ' · over your $' + b.budgetCap + ' budget — this is the cheapest build found'
      : ' · under your $' + b.budgetCap + ' budget';
  }
  html += '<p class="muted small">About ' + esc(b.priceLine) + ' total' + budgetNote + ' · ' + b.comboCount + ' combos and synergies woven in</p>';
  html += '<ul class="stat-list">';
  b.picks.slice(0, 24).forEach((p) => {
    html += '<li>' + esc(p.dto.name) + (p.qty > 1 ? ' ×' + p.qty : '') + (p.asCommander ? ' 👑' : '') + '</li>';
  });
  html += '</ul>';
  if (b.picks.length > 24) html += '<p class="muted small">…and ' + (b.picks.length - 24) + ' more.</p>';
  html += '<div class="share-row">';
  if (b.commanderName) html += '<button type="button" id="gen-swap">↻ Different commander</button>';
  html += '<button type="button" id="gen-add" class="primary">Add to my decks</button></div>';
  box.innerHTML = html;
  $('#gen-add').addEventListener('click', addGeneratedToDecks);
  const swapBtn = $('#gen-swap');
  if (swapBtn) swapBtn.addEventListener('click', swapCommander);
  announce('Deck generated: ' + b.totalCards + ' cards.');
}
// "Different commander" (v2.17): re-roll the auto-pick with the commanders
// already shown excluded, and rebuild the deck around the new one. Every
// filter from the original generation (theme, price, colors) is kept.
async function swapCommander() {
  if (!genPreview || !genLastRequest || !genPreview.built.commanderName) return;
  const req = genLastRequest;
  genExcluded.push(genPreview.built.commanderName);
  const box = $('#gen-out');
  box.innerHTML = '<p class="muted" role="status">Finding a different commander…</p>';
  announce('Finding a different commander.');
  try {
    const r = await api('/api/gen-pool', { method: 'POST', body: JSON.stringify({ format: req.format, maxPrice: req.maxPrice, creatureType: req.creatureType, effect: req.effect, speed: req.speed, commanderName: '', colors: req.colors, excludeCommanders: genExcluded }) });
    if (!r.ok) throw new Error((r.data && r.data.error) || 'generation failed');
    const built = buildGeneratedDeck(r.data, { format: req.format, cardTypes: req.cardTypes, maxTotal: req.maxTotal });
    if (!built.picks.length) {
      box.innerHTML = '<p class="muted">Not enough cards matched for a different commander. Try loosening the filters.</p>';
      return;
    }
    genPreview = { built: built, name: req.name, format: req.format };
    renderGenPreview();
  } catch (e) {
    box.innerHTML = '<p class="muted">No other commander matches those filters. Try loosening them — or raise the max price per card — and generate again.</p>';
  }
}
async function addGeneratedToDecks() {
  if (!genPreview) return;
  const built = genPreview.built, name = genPreview.name, format = genPreview.format;
  if (accountsOn && me) await syncDeckToServer(deck);
  const d = blankDeck(name);
  d.format = format;
  collection.decks.push(d);
  if (accountsOn && me) {
    const r = await api('/api/decks', { method: 'POST', body: JSON.stringify({ name: d.name, format: d.format, cards: [], checks: {} }) });
    if (r.ok && r.data && r.data.id) d.serverId = r.data.id;
    else if (r.status === 401) { await silentLogout(); }
  }
  deck = d;
  built.picks.forEach((p) => {
    d.cards.push(makeDeckEntry(dtoToCard(p.dto), p.asCommander, p.qty));
  });
  if (accountsOn && me) {
    try { localStorage.setItem(activeKeyFor(me.id), deck.serverId || deck.id); } catch (e) { /* ignore */ }
  }
  syncDeckInputs();
  saveDecks();
  renderDeck();
  const tab = document.querySelector('.tab[data-tab="deck"]');
  if (tab) tab.click();
  announce('Generated deck added to your decks.');
}
$('#gen-go').addEventListener('click', generateDeck);
$('#matchup-combos').addEventListener('click', async () => {
  const pair = matchupEntries();
  const a = pair[0], b = pair[1];
  const box = $('#matchup-combo-out');
  if (!a || !b || a.id === b.id) {
    if (box) box.innerHTML = '<p class="muted">Pick two different decks first.</p>';
    return;
  }
  if (box) box.innerHTML = '<p class="muted" role="status">Checking both decks for combos…</p>';
  announce('Checking both decks for combos.');
  await fetchCombos(a);
  await fetchCombos(b);
  const sum = (d) => {
    const c = comboCache[d.id];
    const n = c && c.data ? c.data.included.length : 0;
    return '<strong>' + esc(d.name) + ':</strong> ' + (n ? n + ' complete combo' + (n === 1 ? '' : 's') : 'no complete combos');
  };
  if (box) box.innerHTML = '<p>' + sum(a) + '<br>' + sum(b) + '</p>';
  runMatchup(); // refresh so combo-edge bullets appear in the status sheet
  announce('Combo check done for both decks.');
});

// ---------- share ----------
function deckText() {
  const lines = ['The Dark Board Assistant — ' + deck.name + ' (' + cap(deck.format) + ')'];
  deck.cards.forEach((c) => {
    lines.push((c.count > 1 ? c.count + 'x ' : '') + c.name + ' (' + c.set + ' #' + c.cn + ') — ' + c.price);
  });
  lines.push('Total: ' + deckTotal() + ' cards');
  const valueLine = deckValueLine();
  if (valueLine) lines.push(valueLine);
  return lines.join('\n');
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e2) { /* ignore */ }
    ta.remove();
    return ok;
  }
}

$('#copy-deck').addEventListener('click', async () => {
  const ok = await copyText(deckText());
  const n = $('#share-note');
  n.textContent = ok ? 'Deck list copied — paste it into Messenger or a text.' : 'Copy did not work on this device. Try the Share button.';
  n.setAttribute('aria-hidden', 'false');
  announce(n.textContent);
});

$('#share-deck').addEventListener('click', async () => {
  const text = deckText();
  const n = $('#share-note');
  if (navigator.share) {
    try {
      await navigator.share({ title: deck.name, text });
      n.textContent = 'Shared!';
    } catch (e) { n.textContent = 'Share was cancelled.'; }
  } else {
    const ok = await copyText(text);
    n.textContent = ok
      ? 'This device has no share menu — deck list copied instead. Paste it into Messenger or a text.'
      : 'Sharing is not available on this device.';
  }
  n.setAttribute('aria-hidden', 'false');
  announce(n.textContent);
});

// ---------- commander deck ideas ----------
const THEMES = [
  ['dragons', '🐉 Dragons'], ['zombies', '🧟 Zombies'], ['elves', '🧝 Elves'],
  ['vampires', '🧛 Vampires'], ['dinosaurs', '🦕 Dinosaurs'], ['merfolk', '🧜 Merfolk'],
  ['angels', '👼 Angels'], ['goblins', '👺 Goblins'], ['artifacts', '⚙️ Artifacts'],
  ['counters', '➕ +1/+1 counters'], ['aristocrats', '💀 Aristocrats'], ['spellslinger', '✨ Spellslinger'],
];
const themeGrid = $('#theme-grid');
THEMES.forEach(([key, label]) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'theme-btn';
  b.textContent = label;
  b.addEventListener('click', () => {
    $$('.theme-btn').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    loadIdeas(key, label);
  });
  themeGrid.appendChild(b);
});

async function loadIdeas(theme, label) {
  $('#ideas-title').hidden = false;
  $('#ideas-title').textContent = label + ' — suggestions';
  $('#ideas-commanders').innerHTML = '<p class="muted">Loading…</p>';
  $('#ideas-staples').innerHTML = '';
  announce('Loading ' + label + ' suggestions.');
  try {
    const res = await fetch('/api/theme?theme=' + encodeURIComponent(theme));
    const data = await res.json();
    if (data.error) { $('#ideas-commanders').innerHTML = '<p>' + data.error + '</p>'; return; }

    const cg = $('#ideas-commanders');
    cg.innerHTML = '<h3 style="grid-column:1/-1">Possible commanders — tap “Set as commander”</h3>';
    (data.commanders || []).forEach((card) => {
      cg.appendChild(ideaCard(card, true));
    });
    const sg = $('#ideas-staples');
    sg.innerHTML = '<h3 style="grid-column:1/-1">Popular cards for this theme</h3>';
    (data.staples || []).forEach((card) => {
      sg.appendChild(ideaCard(card, false));
    });
    announce('Suggestions loaded.');
  } catch (e) {
    $('#ideas-commanders').innerHTML = '<p>Could not load suggestions right now.</p>';
  }
}

// ---------- "cards that work with…" (EDHREC synergy) ----------
async function loadSynergy() {
  const name = clean($('#synergy-name').value);
  const box = $('#synergy-results');
  if (!name) {
    box.innerHTML = '<p class="muted">Type a card name above to see cards that work well with it.</p>';
    return;
  }
  box.innerHTML = '<p class="muted">Looking for cards that work with ' + esc(name) + '…</p>';
  announce('Looking for cards that work with ' + name + '.');
  try {
    const r = await api('/api/synergy?name=' + encodeURIComponent(name));
    if (!r.ok) {
      box.innerHTML = '<p>' + esc((r.data && r.data.error) || 'Could not load suggestions right now.') + '</p>';
      return;
    }
    const cards = (r.data && r.data.cards) || [];
    if (!cards.length) {
      box.innerHTML = '<p class="muted">No suggestions found for that card.</p>';
      return;
    }
    box.innerHTML = '<h3 style="grid-column:1/-1">Cards that work well with ' + esc(name) + '</h3>';
    cards.forEach((card) => box.appendChild(ideaCard(card, false)));
    announce(cards.length + ' suggestions for ' + name + '.');
  } catch (e) {
    box.innerHTML = '<p>Could not load suggestions right now.</p>';
  }
}
$('#synergy-btn').addEventListener('click', loadSynergy);
$('#synergy-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadSynergy(); });

function ideaCard(card, isCommander) {
  const d = document.createElement('div');
  d.className = 'card';
  d.innerHTML =
    '<img src="' + imgOf(card) + '" alt="Card art: ' + esc(card.name) + '" loading="lazy" tabindex="0" role="button" aria-label="View pictures and versions of ' + esc(card.name) + '">' +
    '<h3>' + esc(card.name) + '</h3>' +
    '<p class="price">' + priceOf(card) + '</p>' +
    '<div class="row"><button type="button" class="secondary view-btn">Pictures</button>' +
    '<button type="button" class="primary add-btn">' + (isCommander ? '👑 Commander' : '+ Add') + '</button>' +
    (!isCommander ? qtyStepperHTML(card) : '') + '</div>';
  const open = () => openViewer(card);
  const imgEl = d.querySelector('img');
  imgEl.addEventListener('click', open);
  imgEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  d.querySelector('.view-btn').addEventListener('click', open);
  d.querySelector('.add-btn').addEventListener('click', () => {
    if (isCommander) ensureCommanderFormat();
    addCardToDeck(card, isCommander, isCommander ? 1 : qtyFromEl(d));
  });
  return d;
}

// ---------- easy access toggles ----------
$('#toggle-easy').addEventListener('click', () => { prefs.easyView = !prefs.easyView; savePrefs(); applyPrefs(); });
$('#toggle-dark').addEventListener('click', () => { prefs.softDark = !prefs.softDark; savePrefs(); applyPrefs(); });
$('#toggle-text').addEventListener('click', () => { prefs.biggerText = !prefs.biggerText; savePrefs(); applyPrefs(); });
$('#toggle-contrast').addEventListener('click', () => { prefs.strongContrast = !prefs.strongContrast; savePrefs(); applyPrefs(); });

// ---------- account (v2.0): optional sign-up / log-in ----------
// When logged in, the working deck also saves to the account (debounced)
// and loads from the account on start. Logged out, everything works
// exactly as before: the deck saves in this browser only.
let accountsOn = false;
let me = null;            // {id, email} when logged in
let syncTimer = null;

async function api(path, opts) {
  const res = await fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts || {}));
  let data = null;
  try { data = await res.json(); } catch (e) { /* not JSON */ }
  return { ok: res.ok, status: res.status, data: data || {} };
}

function checksOf(d) {
  const o = {};
  (d.cards || []).forEach((c) => { if (c.checked) o[c.pid + '|' + (c.commander ? 'cmd' : 'x')] = true; });
  return o;
}

function scheduleServerSync() {
  if (!accountsOn || !me) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncDeckToServer(), 1500);
}

// Save one deck entry to the account. Each local deck has its own serverId,
// so the whole collection is stored server-side, one server deck per deck.
async function syncDeckToServer(entry) {
  if (!accountsOn || !me) return;
  entry = entry || deck;
  clearTimeout(syncTimer);
  const body = JSON.stringify({ name: entry.name, format: entry.format, cards: entry.cards, checks: checksOf(entry) });
  if (!entry.serverId) {
    const r = await api('/api/decks', { method: 'POST', body });
    if (r.ok && r.data && r.data.id) {
      entry.serverId = r.data.id;
      collection.activeId = deck.id;
      try { localStorage.setItem(DECKS_KEY, JSON.stringify(collection)); } catch (e) { /* ignore */ }
    }
    else if (r.status === 401) { await silentLogout(); }
    return;
  }
  const r = await api('/api/decks/' + encodeURIComponent(entry.serverId), { method: 'PUT', body });
  if (r.status === 401) { await silentLogout(); return; }
  if (r.status === 404) { entry.serverId = null; scheduleServerSync(); }
}

function movedKeyFor(uid) { return 'dba-moved-' + uid; }

// Load the account's decks from the server into the local collection.
async function loadCollectionFromServer() {
  const r = await api('/api/decks');
  if (!r.ok) return;
  if (r.data.length) {
    const fresh = [];
    for (const s of r.data) {
      const full = await api('/api/decks/' + encodeURIComponent(s.id));
      if (!full.ok) continue;
      const entry = sanitizeDeck({ name: full.data.name, format: full.data.format, cards: full.data.cards });
      entry.serverId = s.id;
      fresh.push(entry);
    }
    if (fresh.length) {
      collection = { decks: fresh, activeId: fresh[0].id };
      let want = null;
      try { want = localStorage.getItem(activeKeyFor(me.id)); } catch (e) { /* ignore */ }
      deck = fresh.find((d) => d.serverId === want || d.id === want) || fresh[0];
      saveDecks();
    }
  } else {
    // No decks on the account yet: keep the local decks, but forget any
    // server ids left over from a different account on this browser.
    collection.decks.forEach((d) => { delete d.serverId; });
    deck = collection.decks.find((d) => d.id === collection.activeId) || collection.decks[0];
    saveDecks();
  }
  syncDeckInputs();
  renderDeck();
}

function acctError(msg) {
  const n = $('#acct-error');
  if (!msg) { n.hidden = true; n.textContent = ''; return; }
  n.textContent = msg;
  n.hidden = false;
  announce(msg);
}

function updateAccountUI() {
  const off = !accountsOn;
  $('#account-off').hidden = !off;
  $('#account-login').hidden = off || !!me;
  $('#account-user').hidden = off || !me;
  $('#save-account-btn').hidden = !(accountsOn && me);
  if (me) $('#acct-who').textContent = me.email;
}

async function silentLogout() {
  me = null; clearTimeout(syncTimer);
  updateAccountUI();
}

// One-tap move of ALL local decks to the account (non-destructive: the local
// copies stay on this device too).
function updateMoveAllRow() {
  const row = $('#move-deck-row');
  if (!accountsOn || !me) { row.hidden = true; return; }
  let moved = null;
  try { moved = localStorage.getItem(movedKeyFor(me.id)); } catch (e) { /* ignore */ }
  const withCards = collection.decks.filter((d) => d.cards.length && !d.serverId);
  if (!withCards.length || moved) { row.hidden = true; return; }
  row.hidden = false;
  $('#move-deck').textContent = withCards.length === 1
    ? 'Move my deck to my account'
    : 'Move all ' + withCards.length + ' decks to my account';
  $('#move-deck').onclick = async () => {
    let n = 0;
    for (const d of withCards) {
      const r = await api('/api/decks', {
        method: 'POST',
        body: JSON.stringify({ name: d.name, format: d.format, cards: d.cards, checks: checksOf(d) }),
      });
      if (r.ok && r.data && r.data.id) { d.serverId = r.data.id; n++; }
      else if (r.status === 401) { await silentLogout(); return; }
    }
    if (n > 0) {
      try { localStorage.setItem(movedKeyFor(me.id), '1'); } catch (e) { /* ignore */ }
      saveDecks();
      row.hidden = true;
      announce(n + (n === 1 ? ' deck was' : ' decks were') + ' copied to your account. The copies on this device are still here too.');
    } else {
      announce('Could not move the decks right now. Please try again in a moment.');
    }
  };
}

async function onLogin(user) {
  me = user;
  acctError(null);
  $('#acct-email').value = '';
  $('#acct-password').value = '';
  updateAccountUI();
  announce('Logged in as ' + user.email + '.');
  try { await loadCollectionFromServer(); }
  catch (e) { /* stay on the local decks */ }
  updateMoveAllRow();
}

async function doAuth(kind) {
  acctError(null);
  const email = $('#acct-email').value.trim();
  const password = $('#acct-password').value;
  if (!email || !password) { acctError('Please type your email and password first.'); return; }
  const r = await api('/api/auth/' + kind, { method: 'POST', body: JSON.stringify({ email, password }) });
  if (!r.ok) { acctError(r.data.error || 'Something went wrong. Please try again.'); return; }
  await onLogin(r.data);
}

$('#acct-login').addEventListener('click', () => doAuth('login'));
$('#acct-signup').addEventListener('click', () => doAuth('signup'));
$('#acct-password').addEventListener('keydown', (e) => { if (e.key === 'Enter') doAuth('login'); });

$('#acct-logout').addEventListener('click', async () => {
  await syncDeckToServer(deck); // save any last changes first
  await api('/api/auth/logout', { method: 'POST' });
  await silentLogout();
  $('#move-deck-row').hidden = true;
  announce('Logged out. Your decks are still saved on this device.');
});

async function saveToAccountNow() {
  if (!me) return;
  await syncDeckToServer();
  announce('Deck saved to your account.');
}
$('#save-to-account').addEventListener('click', saveToAccountNow);
$('#save-account-btn').addEventListener('click', saveToAccountNow);

async function initAccount() {
  try {
    const s = await api('/api/status');
    accountsOn = !!(s.data && s.data.accounts);
  } catch (e) { accountsOn = false; }
  updateAccountUI();
  if (!accountsOn) return;
  try {
    const m = await api('/api/auth/me');
    if (m.ok) {
      me = m.data;
      updateAccountUI();
      await loadCollectionFromServer();
      updateMoveAllRow();
    }
  } catch (e) { /* stay logged out, local mode */ }
}

// ---------- init ----------
applyPrefs();
syncDeckInputs();
renderDeck();
updateDeckPill();
initAccount();
// Deck generator: the commander picker only applies to the Commander format.
function syncGenCommanderField() {
  const fmt = document.querySelector('input[name="gen-format"]:checked');
  const wrap = $('#gen-commander-wrap');
  if (wrap) wrap.style.display = (!fmt || fmt.value === 'commander') ? '' : 'none';
}
$$('input[name="gen-format"]').forEach((el) => el.addEventListener('change', syncGenCommanderField));
syncGenCommanderField();

// Register the service worker so the app can be added to the home screen.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
