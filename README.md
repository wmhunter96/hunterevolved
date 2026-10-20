# hunterevolved.com

Personal site — Gear, MTG, homelab rack viz. Plain HTML/CSS/JS, GitHub Pages (HOST-38).

## Structure

```
index.html               Home
gear/index.html            Gear landing — links to sub-pages
gear/garage.html           Garage — Corolla Hybrid fuel/mileage (HOST-52/53/54)
gear/desktop-pc.html       Desktop PC BOM (HOST-32/33)
gear/homelab.html          Homelab — real rack inventory table, plus a
                          #rack-viewer mount point for the future
                          interactive 3D rack (Three.js, HOST-63/65)
mtg.html                  MTG — EDH decks (HOST-56/57/58), auto-synced from Archidekt
scripts/sync-archidekt.mjs  Regenerates mtg.html's deck cards from Archidekt
warehouse.html            Warehouse — parts + tooling inventory, rendered by
                          js/warehouse.js from data/warehouse.json
css/style.css             Shared styles
js/main.js                Nav toggle + footer year
CNAME                     Custom domain for GitHub Pages
```

## Status

Scaffold only (HOST-60/HOST-70). `gear/homelab.html` now has a real rack
inventory (HOST-67/HOST-61 done). Remaining sub-page content (Desktop PC
BOM, Garage MPG data, the homelab 3D rack view) is tracked in separate
open tickets.

## Archidekt sync

`mtg.html`'s deck cards are generated from the ["Owned" Archidekt
folder](https://archidekt.com/folders/1610461), not hand-maintained. A
GitHub Action (`.github/workflows/sync-archidekt.yml`) runs
`scripts/sync-archidekt.mjs` daily (and can be run on demand from the
Actions tab) to pick up new/removed decks and any renames; it commits
straight to `master` when something changed, which then triggers the
normal Pages deploy.

This has to run server-side (in CI, or locally with `node
scripts/sync-archidekt.mjs`) rather than as a button on the live site:
Archidekt's API only sends `Access-Control-Allow-Origin` for its own
frontend, so a browser on hunterevolved.com can't call it directly.

Each card's blurb `<p>` is hand-written and preserved across syncs (matched
by the card's `data-deck-id`); a newly-added deck gets a placeholder blurb
to fill in.

## Warehouse

`warehouse.html` is the inventory of misc parts (Parts tab) and tools
(Tooling tab, each tool assigned to a toolbox drawer). The published data
is `data/warehouse.json`; there's no backend, so to change it:

1. Open the page and click **Manage**. Add, edit, delete, or +/- quantities.
   Edits are saved as a draft in that browser only.
2. Click **Download JSON** and commit the file over `data/warehouse.json`.
   Once it deploys, everyone sees the update and you can **Discard** the draft.

Each item has `kind` (`part` or `tool`), `name`, `category`, `location`
(the drawer, for tools), `qty`, optional `minQty` (parts: flags low stock),
optional `status` (tools: `Loaned out`, `Needs repair`, `Missing`), `link`,
and `notes`.
