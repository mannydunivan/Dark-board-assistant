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
  c.count = Number(c.count) > 0 ? Math.floor(Number(c.count)) : 1;
  c.checked = !!c.checked;
  c.commander = !!c.commander;
  return c;
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

async function runSearch(page) {
  const q = buildQuery();
  const params = new URLSearchParams({
    q, order: 'name', dir: 'auto', page: String(page),
  });
  if ($('#q-prints').checked) params.set('unique', 'prints');
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
    $('#results-info').textContent = (data.total_cards || 0) + ' card' + ((data.total_cards || 0) === 1 ? '' : 's') + ' found';
    $('#results-info').setAttribute('aria-hidden', 'false');
    announce((data.total_cards || 0) + ' cards found.');
  } catch (e) {
    $('#results-info').textContent = 'Search failed. Check your connection and try again.';
    announce('Search failed.');
  }
}

$('#search-form').addEventListener('submit', (e) => { e.preventDefault(); runSearch(1); });
$('#next-page').addEventListener('click', () => { if (hasMore) runSearch(searchPage + 1); });
$('#prev-page').addEventListener('click', () => { if (searchPage > 1) runSearch(searchPage - 1); });

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

function addCardToDeck(card, asCommander) {
  const entry = {
    pid: card.id, name: card.name, set: (card.set || '').toUpperCase(),
    cn: card.collector_number || '', price: priceOf(card), priceNum: numPriceOf(card),
    img: imgOf(card), back: backImgOf(card),
    checked: false, count: 1, commander: !!asCommander,
  };
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
