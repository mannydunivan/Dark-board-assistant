# The Dark Board Assistant

A Magic: The Gathering card search and deck-building web app with a warm dark
theme that is gentle on sensitive eyes. Search cards from 1993 to today, see
market prices and pictures (including every printing), build Commander /
Standard / Modern decks, check off cards you own, and share deck lists.

Unofficial fan app. Not affiliated with or endorsed by Wizards of the Coast.
Card data and prices come from Scryfall (api.scryfall.com).

## Run it locally

Requirements: Node.js 18 or newer.

```bash
cd dark-board-assistant
npm install
node server.js
```

Open http://localhost:3000 (or whatever `PORT` is set to).

The server proxies api.scryfall.com for card search, printings, and prices, so
the browser never talks to Scryfall directly. Decks are saved in each visitor's
own browser (localStorage) — nothing is stored on the server.

## Deploy to Render (free)

Option A — with this repo on GitHub:
1. Push the `dark-board-assistant` folder to a GitHub repo.
2. In the Render dashboard, click **New → Web Service** and connect the repo.
3. Render reads `render.yaml`: Node runtime, build command `npm install`,
   start command `node server.js`, health check `/healthz`.
4. Click **Create Web Service** and wait for the deploy to finish.

Option B — manual:
1. In Render: **New → Web Service**, point it at your repo.
2. Environment: **Node**. Build command: `npm install`. Start command: `node server.js`.
3. Set health check path to `/healthz`. Deploy.

Free web services sleep after inactivity and wake on the next visit, so the
first page load after a while may take a few seconds.

## What is in the box

- `server.js` — Express server, static frontend hosting, Scryfall proxy
  endpoints (`/api/search`, `/api/autocomplete`, `/api/named`,
  `/api/card/:id`, `/api/printings`, `/api/theme`, `/api/sets`).
- `public/index.html`, `public/styles.css`, `public/app.js` — the app.
- `render.yaml` — Render Blueprint for one-click deploy.
- No secrets are used or stored anywhere.

## Updating later

Ask Muse in chat to change this app (for example, "add a feature to
The Dark Board Assistant"), then rebuild and redeploy from the updated folder.
