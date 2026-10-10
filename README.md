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
the browser never talks to Scryfall directly.

## Multiple decks & deck value (v2.3)

The Deck tab now holds **several decks at once**: use the "Choose a deck"
menu to switch, and the **New deck**, **Rename**, and **Delete** buttons to
manage them (deleting asks for a confirming second tap). Each deck keeps its
own name, format, cards, and check-offs.

- Logged out: decks save in the browser (`dba-decks` in localStorage). The
  very first run migrates the old single-deck save automatically — nothing is
  lost.
- Logged in: each deck is stored on the account (one server deck per deck),
  so the whole collection follows you across devices.

The Deck tab also shows a **market price total** under the format checks:
"Deck value: $X.XX", counting every copy. Cards with no listed price are
noted separately (e.g. "2 cards have no listed price"). The total is
included when you copy or share the deck list.

## Deck stats (v2.4)

The Deck tab now has a **Deck stats** section with visual charts for the
active deck, updating live as you add or remove cards: a **mana curve**
(cost 0–6+), **colors** (white/blue/black/red/green/colorless), **card
types**, **speed** (average mana cost of non-land cards plus an
early/mid/late split), **creature size** (average power/toughness plus
small/medium/big buckets), and **synergy hints** (your most common creature
types and keywords). Below the charts you'll find a one-sentence summary of
your deck, plain-language takeaways under each chart, a **Standouts** block
(highest mana cost, priciest cards, most used keyword), and a short
**Tips for your deck** list — all generated from your deck's real cards,
with actual card names. Every chart also carries a text summary for screen
readers, and all bars are labeled with their numbers.

Cards added from search bring their stats with them. Decks saved before v2.4
get their stats through a one-time automatic lookup when you open them
(the server asks Scryfall for just the cards that are missing stats).

## Accounts (v2.0, optional)

Set these two environment variables to turn on email/password accounts.
Without them the app runs exactly as before: decks save in each visitor's
own browser (localStorage) and the Account tab shows a short notice.

- `DATABASE_URL` — connection string for a Postgres database. A free option
  is Neon (neon.tech): make a free project and copy its connection string.
- `SESSION_SECRET` — a long random string used to sign login sessions.
  Generate one with `openssl rand -hex 32`. Never commit it to the repo.

When both are set, visitors can sign up and log in from the Account tab;
their decks save to their account and follow them across devices. When
logged out, decks still save in the browser as before.

## Deploy to Render (free)

> Note: this repo is deployed on Render through the **public Git repository**
> flow, which has **no auto-deploy**. After pushing code changes, open the
> Render dashboard for the `dark-board-assistant` service and click
> **Manual Deploy → Deploy latest commit**.

Option A — with this repo on GitHub:
1. Push the `dark-board-assistant` folder to a GitHub repo.
2. In the Render dashboard, click **New → Web Service** and connect the repo.
3. Render reads `render.yaml`: Node runtime, build command `npm install`,
   start command `node server.js`, health check `/healthz`.
4. Click **Create Web Service** and wait for the deploy to finish.

To turn on accounts on Render: add `DATABASE_URL` and `SESSION_SECRET` in
the service's **Environment** tab (generate the secret with
`openssl rand -hex 32`), then redeploy.

Option B — manual:
1. In Render: **New → Web Service**, point it at your repo.
2. Environment: **Node**. Build command: `npm install`. Start command: `node server.js`.
3. Set health check path to `/healthz`. Deploy.

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
