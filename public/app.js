'use strict';
/* The Dark Board Assistant — frontend (v2.0) */

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

// ---------- deck storage (this browser only) ----------
const DECK_KEY = 'dba-deck';
let deck = JSON.parse(localStorage.getItem(DECK_KEY) || 'null') || {
  name: 'My deck', format: 'commander', cards: [],
};
function saveDeck() {
  localStorage.setItem(DECK_KEY, JSON.stringify(deck));
  updateDeckPill();
  scheduleServerSync(); // no-op unless logged in (v2.0)
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
$('#deck-format').value = deck.format;
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
$('#deck-name').value = deck.name;
$('#deck-name').addEventListener('input', (e) => { deck.name = e.target.value || 'My deck'; saveDeck(); });

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

function addCardToDeck(card, asCommander) {
  const entry = {
    pid: card.id, name: card.name, set: (card.set || '').toUpperCase(),
    cn: card.collector_number || '', price: priceOf(card),
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

  const checked = deck.cards.filter((c) => c.checked).length;
  const total = deck.cards.length;
  $('#checkoff-count').textContent = checked + ' / ' + total + ' cards';
  const pct = total ? Math.round((checked / total) * 100) : 0;
  $('#checkoff-fill').style.width = pct + '%';
  $('#checkoff-progress').setAttribute('aria-valuenow', String(pct));
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
let serverDeckId = null;  // server deck the working deck syncs to
let syncTimer = null;
const MOVED_KEY = 'dba-moved';

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
  syncTimer = setTimeout(syncDeckToServer, 1500);
}

async function syncDeckToServer() {
  if (!accountsOn || !me) return;
  clearTimeout(syncTimer);
  const body = JSON.stringify({ name: deck.name, format: deck.format, cards: deck.cards, checks: checksOf(deck) });
  if (!serverDeckId) {
    const r = await api('/api/decks', { method: 'POST', body });
    if (r.ok && r.data && r.data.id) { serverDeckId = r.data.id; announce('Deck saved to your account.'); }
    else if (r.status === 401) { await silentLogout(); }
    return;
  }
  const r = await api('/api/decks/' + encodeURIComponent(serverDeckId), { method: 'PUT', body });
  if (r.status === 401) { await silentLogout(); return; }
  if (r.status === 404) { serverDeckId = null; scheduleServerSync(); }
}

function loadDeckIntoUI(d) {
  deck = {
    name: d.name || 'My deck',
    format: ['commander', 'standard', 'modern'].includes(d.format) ? d.format : 'commander',
    cards: Array.isArray(d.cards) ? d.cards : [],
  };
  searchFormat = deck.format;
  $('#deck-name').value = deck.name;
  $('#deck-format').value = deck.format;
  $$('.format-btn').forEach((b) => {
    const on = b.dataset.format === deck.format;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  });
  saveDeck();
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
  me = null; serverDeckId = null; clearTimeout(syncTimer);
  updateAccountUI();
}

async function onLogin(user) {
  me = user;
  acctError(null);
  $('#acct-email').value = '';
  $('#acct-password').value = '';
  const before = JSON.parse(JSON.stringify(deck)); // local deck before login (for the move offer)
  updateAccountUI();
  announce('Logged in as ' + user.email + '.');
  try {
    const r = await api('/api/decks');
    if (r.ok && r.data.length) {
      const full = await api('/api/decks/' + encodeURIComponent(r.data[0].id));
      if (full.ok) {
        serverDeckId = full.data.id;
        loadDeckIntoUI({ name: full.data.name, format: full.data.format, cards: full.data.cards });
      }
    }
  } catch (e) { /* stay on local deck */ }
  // One-tap move of the pre-login local deck (non-destructive).
  if (before.cards && before.cards.length && !localStorage.getItem(MOVED_KEY)) {
    const row = $('#move-deck-row');
    row.hidden = false;
    $('#move-deck').onclick = async () => {
      const r = await api('/api/decks', {
        method: 'POST',
        body: JSON.stringify({ name: before.name, format: before.format, cards: before.cards, checks: checksOf(before) }),
      });
      if (r.ok) {
        localStorage.setItem(MOVED_KEY, '1');
        row.hidden = true;
        announce('Your deck was copied to your account. The copy on this device is still here too.');
      } else {
        announce('Could not move the deck right now. Please try again in a moment.');
      }
    };
  }
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
  await api('/api/auth/logout', { method: 'POST' });
  await silentLogout();
  $('#move-deck-row').hidden = true;
  announce('Logged out. Your deck is still saved on this device.');
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
      const r = await api('/api/decks');
      if (r.ok && r.data.length) {
        const full = await api('/api/decks/' + encodeURIComponent(r.data[0].id));
        if (full.ok) {
          serverDeckId = full.data.id;
          loadDeckIntoUI({ name: full.data.name, format: full.data.format, cards: full.data.cards });
        }
      }
    }
  } catch (e) { /* stay logged out, local mode */ }
}

// ---------- init ----------
applyPrefs();
renderDeck();
updateDeckPill();
initAccount();

// Register the service worker so the app can be added to the home screen.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
