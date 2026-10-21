# hunterevolved.com

Personal site — Gear, MTG, Gunpla, homelab rack viz. Plain HTML/CSS/JS, GitHub Pages (HOST-38).

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
gunpla.html               Gunpla — every kit built, rendered by js/gunpla.js
                          from data/gunpla.json, grouped by grade
warehouse.html            Warehouse — parts + tooling inventory and projects, rendered by
                          js/warehouse.js from data/warehouse.json
css/style.css             Shared styles
js/main.js                Nav toggle + footer year
CNAME                     Custom domain for GitHub Pages
```

## Design system

All styling lives in `css/style.css`, built on the tokens at the top of the
file (technical industrial look, dark graphite):

- **Colour**: `--color-bg` / `--color-surface` / `--color-surface-elevated` /
  `--color-surface-subtle`, text `--color-text` (+ `-secondary`, `-muted`,
  `-disabled`), `--color-border` / `--color-border-strong`, and one accent
  `--color-accent` (#E14A15) reserved for primary buttons, active/selected
  states, focus and key indicators. Status: `--color-success`, `-warning`,
  `-error`, `-info`. Don't hardcode colours in components; add a token.
  The drawn maps use `--color-object-*` tokens for the real objects they
  depict (DEWALT-yellow toolbox lids, the red drill bag, the Detolf
  aluminium and wood headers).
- **Type**: IBM Plex Sans for everything, IBM Plex Mono only for small
  uppercase labels, numbers, IDs and counts (`.label`). Scale tokens
  `--text-display` ... `--text-micro`.
- **Space / radius / motion**: 4px scale `--space-1`...`--space-8`; radii
  4 (badges) / 6 (controls) / 8 (cards) / 10 (modals); 150ms ease-out
  transitions, disabled under `prefers-reduced-motion`.
- The nav marks the current section with `aria-current="page"` (set by
  `js/main.js`), shown as a thin orange underline.

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
(Tooling tab, each tool assigned to a toolbox drawer or `Top of toolbox`: three stacked DEWALT
ToughSystem 2.0 three-drawer units, so `Drawer 1`-`Drawer 9` numbered top to
bottom, drawn as a clickable map above the table).
Clicking a drawer opens its Gridfinity preview: each drawer is 450 x 285 mm
inside, so a 10 x 6 grid of 42 mm units (columns A-J, rows 1-6 from the back;
`GRID` in `js/warehouse.js`). A tool's optional `gridX`/`gridY` (1-based spot,
entered as e.g. `B3`) and `gridW`/`gridH` (size in units, e.g. `1x4`) place it
on that grid. Saving a spot that overlaps another tool in the drawer or runs off
the grid is refused (overlaps already in the JSON still show red). The Projects tab
consumes parts: in Manage mode, "Use part" on a project takes that quantity
out of stock and logs it on the project; "Return to stock" undoes it. The published data
is `data/warehouse.json`; there's no backend, so to change it:

1. Open the page and click **Manage**. Add, edit, delete, or +/- quantities.
   Edits are saved as a draft in that browser only.
2. Click **Download JSON** and commit the file over `data/warehouse.json`.
   Once it deploys, everyone sees the update and you can **Discard** the draft.

The **export** icon copies everything (parts, tools, projects) as tidy JSON
(empty fields dropped, drawer/grid spots and statuses included), e.g. to paste
into an LLM chat. It downloads `warehouse-export.json` instead if the clipboard
isn't available.

On the Tooling tab there's no drawer dropdown or attention checkbox: click a
drawer (or the red drill bag on top) to filter to it, and click the **Needs
attention** tile to light up broken/missing tools and low consumables. An item can carry an optional `fixLink`
(where to replace or reorder it), shown as a link next to it while it needs attention.
The import icon next to export reads that export JSON, or a Download JSON `warehouse.json`, back in (it needs a `tools`
or `items` array), lists every move, edit, addition and removal before you replace anything, and saves it as the local draft, so export, edit, import round-trips.
Drawer names shown on the map come from `drawers` in `data/warehouse.json` (`"1"`-`"9"` and `"top"`).
If the live data changes after you made local changes, the page shows the live data and offers to restore or delete the older local copy.
On the Tooling tab, the arrows icon between export and import suggests drawer moves: each tool
belongs in the drawer named after its category (`drawers` names), or else where most of that category already is; tick the
ones you want and they're applied to the local draft.

Tools can be flagged **consumable** (glue, tape, screws...): they stay in the
toolbox map but, like parts, get a "Low at" threshold, count toward "Needs
attention", and can be used in projects.

Each item has `kind` (`part` or `tool`), `name`, `category`, `location`
(the drawer, for tools), `qty`, optional `minQty` (parts: flags low stock),
`consumable` (tools only), optional `status` (tools: `Needs repair`, `Missing`), `link`,
and `notes`.

`projects[]` entries have `name`, `status` (`active` or `done`), `notes`, and
`uses[]`: `{ itemId, name, qty, date }`, where `itemId` points at a part's
`id` and `name` is a snapshot so the record survives deleting the part.

## Gunpla

`gunpla.html` lists every kit built, rendered by `js/gunpla.js` from
`data/gunpla.json`. To add a build, add an entry to `kits[]`:

```json
{
  "name": "RX-78-2 Gundam (Revive)",
  "grade": "HG",
  "scale": "1/144",
  "series": "Mobile Suit Gundam",
  "source": "Gundam The Origin",
  "year": 2024,
  "finish": "Panel lined",
  "photo": "images/gunpla/rx-78-2.jpg",
  "link": "",
  "notes": "One-line blurb.",
  "brand": "Bandai",
  "room": "Living room",
  "shelf": "Detolf 1",
  "level": "Shelf 2"
}
```

Only `name` and `grade` are required. Grades are grouped PG, MGEX, MG, FM, RG,
HG, EG, SD, then Other; within a grade, newest builds first. Photos go in
`images/gunpla/` and show as the card background. With no kits the page
shows a "coming soon" placeholder.

`series` is the show or franchise a kit belongs to ("Gundam 00", "The Witch from
Mercury"); `source` is optional and names the specific title within it
("Gundam 00P", "Endless Waltz"). Both show as clickable tags. `brand` defaults to Bandai. Set `"status": "backlog"` on a kit that isn't built yet;
it moves to the page's Backlog tab (`gunpla.html?status=backlog`). When you
build it, delete the `status` line and give it its display location. `room` > `shelf` > `level` say where a kit is
displayed; leave any of them out if unknown. The page has a **shelf map**, drawn like the Warehouse toolbox: each Detolf
is a case with an aluminium header, its Top sitting on the roof and Shelf 1-4
as numbered rows; other spots (windowsill, top display, the backlog closet)
get a wood header. Each row lists its kits as chips with a grade badge. Click a
row or a case header to filter to it, click a kit to jump to its card; rows
with nothing matching the other filters fade and collapse. Any `shelf` whose
name starts with "Detolf" is drawn as a case. There's also a search box and
Room / Grade / Brand / Series dropdowns that narrow each other;
the grade stat tiles filter to that grade and the total tile clears filters,
and every tag on a card (grade, brand, series, source, room, shelf, level, finish) is a
button that filters to matching kits. Filters live in the URL, so a view can be
linked, e.g. `gunpla.html?brand=Kotobukiya+Maruttoys` or
`gunpla.html?shelf=Detolf+2&level=Shelf+4`.
