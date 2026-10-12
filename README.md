# D&D Combat Tracker

A realtime combat tracker for the DM, with a read-only player screen and a shared battle map. Rewritten from a single 1,400-line HTML file into a typed, modular app that can grow into a game.

## Running it

**Just want to open it?** Double-click `combat-tracker.html`. It is a self-contained build (like the original single file) and works straight from disk. Don't open `index.html`: that is only the development shell, and it loads TypeScript sources that need Vite.

After changing the code, regenerate that file with `npm run build:single`.

For development:

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # domain unit tests
npm run build        # static site in dist/ (works from any host or sub-path)
```

Copy `.env.example` to `.env.local` to configure it. Set `VITE_SYNC_BACKEND=local` to run without Firebase: data lives in `localStorage` and syncs between tabs, which lets you open a DM tab and a player tab side by side for development.

| URL           | Screen                                |
| ------------- | ------------------------------------- |
| `#/`          | Player view (what the table sees)     |
| `#/admin`     | Battle order: initiative, HP, turns   |
| `#/encounters`| Saved encounters and the roster       |
| `#/campaign`  | Campaign notes                        |
| `#/info`      | DM reference (conditions)             |
| `#/play`      | The solo game: party, adventures, skirmishes |
| `#/adventures`| Adventure editor                      |

Old `#admin` style links redirect automatically.

## Stack

| Concern            | Library                         | Why                                                                 |
| ------------------ | ------------------------------- | ------------------------------------------------------------------- |
| UI                 | React 19 + TypeScript, Vite     | Components replace hand-built `innerHTML` strings and the focus/caret restore hacks |
| Styling            | Tailwind CSS v4 (compiled)      | Same utility style as before, without the dev-only CDN; themes are CSS variables |
| State              | Zustand + Immer                 | Small store, mutations written as plain "recipes"                    |
| Validation         | Zod                             | Every synced document is parsed, so bad or old data can't crash the UI |
| Realtime sync      | Firebase Firestore (unchanged)  | Behind a `SyncAdapter` interface so it can be replaced later          |
| Battle map         | Konva via react-konva           | Canvas scene graph with drag, rotate/scale handles and hit testing built in |
| Floating map window| react-rnd                       | Drag and resize                                                     |
| Initiative reorder | dnd-kit                         | Accessible drag-and-drop (mouse, touch and keyboard)                 |
| Rich text          | TipTap, sanitised with DOMPurify| Replaces deprecated `document.execCommand`; stored HTML can't inject scripts |
| Routing / toasts   | React Router (hash), Sonner     |                                                                     |

## Layout

```
src/
  domain/   pure game rules and data model: no React, no Firebase (unit tested)
    types.ts    Zod schemas: Combatant, map, encounters…
    combat.ts   initiative, turns/rounds, damage & healing, conditions, encounters
    grid.ts     square/hex grid math, snapping, hit testing, distances
    legacy.ts   one-time import of the old single-document format
  sync/     SyncAdapter interface + Firestore and localStorage backends
  store/    game.ts (synced docs), ui.ts (per-device prefs), actions.ts (intents)
  map/      Konva battle map, tokens, area templates, floating window
  components/ views/   React UI
```

All game rules live in `domain/` and take plain data in and out. A future game client, AI-driven monsters, or an authoritative server can reuse them unchanged. Only the views and the sync backend would be swapped out.

## Data

Shared state is split into three Firestore documents under the original path, `artifacts/{appId}/public/data/tracker/{combat|library|notes}`, so your existing security rules still apply. The first time the new app finds no data there, it imports the old `encounter/state` document automatically. The old document is left untouched.

Display preferences (theme, custom colours, sidebar, map layout) are stored per device instead of being synced, so a DM changing their layout no longer changes every player's screen.

## Known limits / next steps

- **No roles yet.** Anyone with the URL can open `#/admin`, as before. Firebase Auth with DM/player roles and matching Firestore rules is the next step toward a game.
- **Last write wins.** Each document is written whole. That's fine for one DM, but simultaneous editors should move to per-combatant documents or transactions.
- **Portraits are stored inline** as small JPEG data URLs (Firestore caps a document at 1 MiB). Firebase Storage would remove that limit.

## Game

A solo 5e (2024 rules) game built on top of the tracker: story scenes with choices and skill checks, tactical grid battles, spells, levels 1–3, a character builder, and an editor for writing your own adventures. See [docs/game-design.md](docs/game-design.md) for the design and what each milestone delivered.

## Credits

This work includes material from the System Reference Document 5.2 ("SRD 5.2") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.
