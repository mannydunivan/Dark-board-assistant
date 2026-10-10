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
    statsOk: true,
  };
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
      '<button type="button" class="primary add-btn">+ Add</button></div>';
    const imgEl = d.querySelector('img');
    const open = () => openViewer(card);
    imgEl.addEventListener('click', open);
    imgEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    d.querySelector('.view-btn').addEventListener('click', open);
    d.querySelector('.add-btn').addEventListener('click', () => addCardToDeck(card, false));
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
  $('#viewer-img').alt = 'Card art: ' + card.name;
  $('#viewer-flip').hidden = !backImgOf(card);
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
  $('#viewer-flip').hidden = !backImgOf(p);
  $('#viewer-label').textContent = p.set_name + ' (' + p.set.toUpperCase() + ' #' + p.collector_number + ')';
  $('#viewer-price').textContent = priceOf(p);
  $('#viewer-version-detail').textContent =
    'Released ' + (p.released_at || '—') + ' · ' + (p.rarity || '') + (p.artist ? ' · Art by ' + p.artist : '');
}

$('#viewer-printings').addEventListener('change', (e) => pickPrinting(Number(e.target.value)));
$('#viewer-flip').addEventListener('click', () => {
  const p = viewerPrintings[Number($('#viewer-printings').value || 0)] || viewerCard;
  const back = backImgOf(p);
  if (!back) return;
  viewerFace = viewerFace === 0 ? 1 : 0;
  $('#viewer-img').src = viewerFace === 0 ? imgOf(p) : back;
});
$('#viewer-close').addEventListener('click', () => { $('#viewer').hidden = true; });
$('#viewer').addEventListener('click', (e) => { if (e.target.id === 'viewer') $('#viewer').hidden = true; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#viewer').hidden) $('#viewer').hidden = true; });
$('#viewer-add').addEventListener('click', () => {
  const i = Number($('#viewer-printings').value || 0);
  const p = viewerPrintings[i] || viewerCard;
  addCardToDeck(p, false);
  $('#viewer').hidden = true;
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
  let small = 0, medium = 0, big = 0, unknownPow = 0;
  let creatureCopies = 0, spellCopies = 0, landCount = 0;
  const tribes = {}, keywords = {};
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
    if (isLand) { landCount += n; }
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
      } else { unknownPow += n; }
      if (tKnown) { touSum += tv * n; touN += n; }
      (c.subtypes || []).forEach((s) => { tribes[s] = (tribes[s] || 0) + n; });
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
          const merged = backfillCard(Object.assign({}, c, s, { statsOk: true }));
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

function addCardToDeck(card, asCommander) {
  const entry = Object.assign({
    pid: card.id, name: card.name, set: (card.set || '').toUpperCase(),
    cn: card.collector_number || '', price: priceOf(card), priceNum: numPriceOf(card),
    img: imgOf(card), back: backImgOf(card),
    checked: false, count: 1, commander: !!asCommander,
  }, statFieldsOf(card));
  const basic = isBasicLand(card);
  const existing = deck.cards.find((c) => c.pid === entry.pid && c.commander === entry.commander);

  if (deck.format === 'commander' && !basic && !asCommander && existing) {
    announce(card.name + ' is already in this Commander deck (singleton).');
    return;
  }
  if (existing) {
    if (deck.format === 'commander') { announce(card.name + ' is already in this Commander deck (singleton).'); return; }
    if (existing.count >= 4 && !basic) { announce('You already have 4 copies of ' + card.name + '.'); return; }
    existing.count += 1;
  } else {
    deck.cards.push(entry);
  }
  saveDeck();
  renderDeck();
  announce(card.name + ' added to your deck.');
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
    const dupes = deck.cards.filter((c) => !c.commander && c.count > 1 && !/Basic Land/i.test(c.name));
    lines.push(dupes.length === 0
      ? '<span class="ok">✓ Singleton rule ok</span>'
      : '<span class="no">✗ Duplicates: ' + dupes.map((c) => esc(c.name)).join(', ') + '</span>');
  } else {
    lines.push(total >= 60
      ? '<span class="ok">✓ ' + total + ' cards — minimum 60 met</span>'
      : '<span class="no">✗ ' + total + ' / 60 cards minimum</span>');
    const bad = deck.cards.filter((c) => c.count > 4 && !/^(Plains|Island|Swamp|Mountain|Forest|Wastes)$/i.test(c.name));
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
      '<small>' + c.set + ' #' + c.cn + ' · ' + c.price + '</small></span>' +
      '<span class="qty">' + (c.count > 1 ? c.count + '×' : '') + '</span>' +
      '<button type="button" class="remove" aria-label="Remove ' + esc(c.name) + ' from deck">✕</button>';
    li.querySelector('input').addEventListener('change', (e) => {
      c.checked = e.target.checked;
      saveDeck();
      renderDeck();
    });
    li.querySelector('.remove').addEventListener('click', () => removeFromDeck(c.pid, c.commander));
    list.appendChild(li);
  });
  if (!deck.cards.length) list.innerHTML = '<li>No cards yet. Search for cards and tap “+ Add”.</li>';

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
  maybeBackfillStats();
}

function updateDeckPill() {
  $('#deck-count').textContent = deck.cards.length ? String(deck.cards.length) : '';
}

$('#clear-checks').addEventListener('click', () => {
  deck.cards.forEach((c) => (c.checked = false));
  saveDeck();
  renderDeck();
  announce('All check-offs cleared.');
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

function ideaCard(card, isCommander) {
  const d = document.createElement('div');
  d.className = 'card';
  d.innerHTML =
    '<img src="' + imgOf(card) + '" alt="Card art: ' + esc(card.name) + '" loading="lazy" tabindex="0" role="button" aria-label="View pictures and versions of ' + esc(card.name) + '">' +
    '<h3>' + esc(card.name) + '</h3>' +
    '<p class="price">' + priceOf(card) + '</p>' +
    '<div class="row"><button type="button" class="secondary view-btn">Pictures</button>' +
    '<button type="button" class="primary add-btn">' + (isCommander ? '👑 Commander' : '+ Add') + '</button></div>';
  const open = () => openViewer(card);
  const imgEl = d.querySelector('img');
  imgEl.addEventListener('click', open);
  imgEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  d.querySelector('.view-btn').addEventListener('click', open);
  d.querySelector('.add-btn').addEventListener('click', () => {
    if (isCommander && deck.format !== 'commander') {
      deck.format = 'commander';
      searchFormat = 'commander';
      $('#deck-format').value = 'commander';
      $$('.format-btn').forEach((b) => {
        const on = b.dataset.format === 'commander';
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', String(on));
      });
    }
    addCardToDeck(card, isCommander);
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

// Register the service worker so the app can be added to the home screen.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
