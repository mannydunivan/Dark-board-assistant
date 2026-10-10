// The Dark Board Assistant — server
// Serves the single-page frontend and proxies api.scryfall.com so the
// browser never hits Scryfall rate limits directly. Simple in-memory cache
// keeps repeat queries fast and polite to the Scryfall API.
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const SCRYFALL = 'https://api.scryfall.com';

// ---- polite Scryfall client: tiny throttle + short-lived cache ----
const cache = new Map();
const TTL_MS = 10 * 60 * 1000; // 10 minutes
let lastCall = 0;

async function scryfallFetch(url) {
  const now = Date.now();
  const hit = cache.get(url);
  if (hit && now - hit.t < TTL_MS) return hit.data;
  const wait = Math.max(0, 80 - (now - lastCall));
  if (wait) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  const res = await fetch(url, {
    headers: { 'User-Agent': 'TheDarkBoardAssistant/1.4 (fan project)' },
  });
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

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log('The Dark Board Assistant listening on port ' + PORT);
});
