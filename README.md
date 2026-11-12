# WoW Forever for Hermes

[Español](README.es.md)

![WoW Forever in Hermes Desktop](docs/media/banner.png)

An offline guide to **World of Warcraft: Forever** inside Hermes, for any race, class and
faction, with a skill so your agent answers from the same data.

## Status

- **In development** on the `agent/claude-code/fuente-y-datos` branch. `main` still has the
  previous version, which covered three classes only.
- Not yet in the Hermes plugin catalog. Tested on Linux with Hermes Agent v0.23.0, which is
  the minimum version.
- WoW Forever is Blizzard's official game (product `wowf`, client 1.60), not a private
  server. This project is not affiliated with Blizzard.

## Install

```sh
hermes plugins install Grizaceo/wow-forever --ref <40-character commit>
hermes plugins enable wow-forever
```

In Hermes Desktop, open **Capabilities → Plugins**, find **WoW Forever** and switch it on: the
page arrives switched off even when the plugin is enabled. It then shows up in the sidebar. The
`wow-forever:wow-forever` skill works on every Hermes surface.

## What it does

- **Character**: faction, race (all 10, Skyborne included), class (all 9 in both factions),
  level and professions. It marks the combinations that are new in Forever, such as Undead
  Paladin or Dwarf Shaman.
- **Class**: your faction's trainers with coordinates, spells by level, class quests, and the
  weapons and armor you can use.
- **Route**: zones for your level with your faction's quests, plus the curated guide's level
  bands when your class has one.
- **Professions**: recipes with their difficulty, reagents and how they are learned; cost and
  margin with your prices; a leveling plan; where each material comes from; and the trainers
  for your next tier.
- **Dungeons**: bosses in order with their loot, a filter for what your class can use, and the
  9 new Forever dungeons with their bosses.
- **Market**: imports your `Auctionator.lua`, builds up price history, flags deals and suggests
  where to farm.
- **Curated guide** (Horde Hunter, and Shaman for both factions) and **Legacy**.
- **Agent skill**: answers questions such as "I'm a level 24 Undead Paladin, where do I
  train?" or "what do I craft at 120 Blacksmithing?" by querying the plugin's data. The
  **Copy profile for the agent** button on the Character tab hands your character to the chat.

The interface is in Spanish, with a button for English, in light or dark theme. Every piece of
data says whether it comes from WoW Classic 1.12 (approximate for Forever), from the Forever
client or from the curated guide. Whatever no publishable source covers is shown as **no
data**.

### Auctionator prices

1. In the game, run a **full scan** with Auctionator.
2. Type `/reload` or log out and back in, so the game saves the data.
3. In the guide, go to **Market** → **Read Auctionator.lua**. The first time, Hermes opens its
   folder picker: choose `WTF/Account/<your account>/SavedVariables`. Hermes remembers that
   grant, and you can revoke it under **Capabilities → Plugins → Folder access**. You can also
   import the file by hand with **Import Auctionator.lua**.

Each import adds its days to every item's history, even though Auctionator keeps only about
three weeks.

## What it reads, stores and runs

- **Reads** only `Auctionator.lua` inside the folder you grant with the Hermes picker (it looks
  up to 4 subfolder levels inside it), and its own `data/`. The file is parsed as data: Lua is
  never run.
- **Stores** your profile, guide progress and normalized prices in the plugin's own storage on
  your machine. You can delete them from the app.
- **No network**: the page blocks every connection (`connect-src 'none'`). No telemetry.
- **No processes** and no access to the running game. The page launches nothing.
- **The skill** registers no tools. It ships a read-only Python script,
  `skills/wow-forever/scripts/consultar.py`, that the agent runs with its own terminal (under
  Hermes approvals). It uses the standard library only, reads only the plugin's `data/`, writes
  no files and uses no network.

## How it works

```
tools/fuentes.json ── tools/descargar-fuentes.py ──▶ ~/.cache/wow-forever-drops
   (pinned versions and sha256)                         │
                         tools/build-drop-data.py ◀──────┤──▶ tools/build-datos-juego.py
                                   │                                 │
                         standalone/drop-data.js                    data/*.json ──▶ skills/wow-forever/scripts/consultar.py
                                   │                                 │
                                   │                 tools/build-catalogo-mercado.py
                                   │                                 │
                                   │                  standalone/market-catalog.js
                                   └───────────────┬─────────────────┘
                        desktop/src/ (React + SDK) ── desktop/build.mjs ──▶ desktop/plugin.js

standalone/guide-*.js (curated) ── tools/build-referencias-skill.mjs ──▶ skills/wow-forever/references/*.md
```

- Data sources are pinned by version and sha256 in `tools/fuentes.json`: CMaNGOS classic-db
  (commit `28ef625`), and the client tables of Classic Era 1.15.9.70576 and WoW Forever
  1.60.1.70888 (English and Spanish), through wago.tools. Details are in
  `docs/MODELO-DATOS.md`.
- The generators are deterministic: the same inputs give the same bytes, and a test checks
  that against `data/MANIFEST.json`.
- The desktop half is React components on the Hermes SDK (`desktop/src/`), bundled unminified
  by esbuild into a single `desktop/plugin.js`. `desktop/BUNDLE.json` records its sha256, and a
  test rebuilds and compares it. It imports only `@hermes/plugin-sdk` and React. See
  `docs/DESKTOP.md`.
- The page keeps the previous version's internal id (`wow-hunter-guide`): Hermes stores data
  and grants per id, so progress, prices and the folder grant carry over.
- The skill and the page share the data and the rules. A test compares every recipe's
  difficulty in the Python script and in the page's logic.

Tests:

```sh
python3 -m unittest discover -s tests     # data, Hermes lint, reproducible bundle, skill
node --test tests/                         # pure logic (profile, crafting, market, route, guide, references)
PLAYWRIGHT_MODULE=… CHROMIUM_PATH=… node desktop/test/navegador.mjs   # and desktop/test/vista-*.mjs
```

## How this was built

The maintainer decided the scope, which data sources are allowed and what gets published, and
reviews every branch before merging it. AI agents (Claude Code and Devin) wrote the code under
that direction. What each step verified is in the repository's tests. Not verified in the
game: macros, routes and gold-per-hour estimates.

## Limits

- The 1.12 data (quests, trainers, loot, spawns) is a reference: Forever changed zones, items
  and loot. New Forever content that exists only on the server has no publishable source yet,
  and the guide shows it as **no data**. That includes new quests, Horde Paladin and Alliance
  Shaman trainers, the Skyborne starting zone, loot from the new dungeons and how most new
  recipes are learned.
- Forever moved some maps: the 1.12 coordinates in Mulgore, Eastern Plaguelands, Redridge and
  Stormwind may not match the game.
- Gold per hour, ROI and deals are estimates over listed prices, not sales.
- The curated macros and routes were not tested in the game.
- Some classic items have no Spanish name in the esMX client and show in English.

## License

GPL-3.0-or-later (`LICENSE`). The origin and license of each dataset are in `LICENSE-DATA.md`.
World of Warcraft and its names are trademarks of Blizzard Entertainment. This project is not
affiliated with Blizzard and is non-commercial.
