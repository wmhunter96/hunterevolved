#!/usr/bin/env node
// Regenerates the deck cards on mtg.html from the "Owned" Archidekt folder.
//
// Archidekt's API only sets Access-Control-Allow-Origin for its own frontend,
// so this can't run as a button in the browser (see README) — it runs here,
// server-side (in CI or locally), where CORS doesn't apply.
//
// For each deck this pulls: name, commander(s), color identity (as mana
// symbol icons), and featured art, then rewrites the <div class="card-grid">
// block in mtg.html. Each card's hand-written blurb <p> is matched by
// data-deck-id and carried over untouched; a deck seen for the first time
// gets a placeholder blurb to fill in by hand. Decks removed from the
// Archidekt folder are dropped from the page.
//
// Usage: node scripts/sync-archidekt.mjs

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const FOLDER_ID = 1610461;
const FOLDER_URL = `https://archidekt.com/folders/${FOLDER_ID}`;
const MTG_HTML_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "mtg.html",
);
const USER_AGENT = "hunterevolved-sync/1.0 (+https://hunterevolved.com)";
const PLACEHOLDER_BLURB = "Add a strategy blurb for this deck.";

const COLOR_LETTER = { White: "W", Blue: "U", Black: "B", Red: "R", Green: "G" };
const COLOR_NAME = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" };
const WUBRG = ["W", "U", "B", "R", "G"];

// Guild / wedge / shard / nephilim names, keyed by their letters in strict
// WUBRG order — must match the order archetypeFor() below produces, NOT the
// traditional guild-pair mnemonic order (e.g. Selesnya is conventionally
// "G/W" but its key here is "WG" since W precedes G in WUBRG).
const ARCHETYPE_NAMES = {
  "": "Colorless",
  W: "Mono-White",
  U: "Mono-Blue",
  B: "Mono-Black",
  R: "Mono-Red",
  G: "Mono-Green",
  WU: "Azorius",
  UB: "Dimir",
  BR: "Rakdos",
  RG: "Gruul",
  WG: "Selesnya",
  WB: "Orzhov",
  UR: "Izzet",
  BG: "Golgari",
  WR: "Boros",
  UG: "Simic",
  WUB: "Esper",
  UBR: "Grixis",
  BRG: "Jund",
  WRG: "Naya",
  WUG: "Bant",
  WBG: "Abzan",
  WUR: "Jeskai",
  UBG: "Sultai",
  WBR: "Mardu",
  URG: "Temur",
  WUBR: "Four-color (no green)",
  UBRG: "Four-color (no white)",
  WBRG: "Four-color (no blue)",
  WURG: "Four-color (no black)",
  WUBG: "Four-color (no red)",
  WUBRG: "Five-color",
};

async function fetchJson5xxRetry(url, options, retries = 2) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, options);
    if (res.ok) return res;
    if (attempt >= retries || res.status < 500) {
      throw new Error(`${url} -> HTTP ${res.status}`);
    }
    await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
  }
}

async function fetchFolderDecks() {
  const res = await fetchJson5xxRetry(FOLDER_URL, {
    headers: { "User-Agent": USER_AGENT },
  });
  const html = await res.text();
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
  );
  if (!match) throw new Error("Could not find __NEXT_DATA__ in the folder page");
  const data = JSON.parse(match[1]);
  const decks = data?.props?.pageProps?.redux?.folders?.rootFolder?.decks;
  if (!Array.isArray(decks)) throw new Error("Folder JSON did not contain a decks array");
  return decks;
}

async function fetchDeckDetail(id) {
  const res = await fetchJson5xxRetry(`https://archidekt.com/api/decks/${id}/`, {
    headers: { "User-Agent": USER_AGENT },
  });
  return res.json();
}

function archetypeFor(colorIdentityNames) {
  const letters = [...new Set(colorIdentityNames.map((c) => COLOR_LETTER[c]).filter(Boolean))];
  const ordered = WUBRG.filter((c) => letters.includes(c));
  const key = ordered.join("");
  return { letters: ordered, name: ARCHETYPE_NAMES[key] ?? key };
}

function manaIconsHtml(letters) {
  if (letters.length === 0) return "";
  const imgs = letters
    .map((c) => `<img src="https://svgs.scryfall.io/card-symbols/${c}.svg" alt="${COLOR_NAME[c]}">`)
    .join("");
  return ` <span class="mana">${imgs}</span>`;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function extractExistingBlurbs(html) {
  const blurbs = new Map();
  const cardRegex = /<a class="card"[^>]*data-deck-id="(\d+)"[^>]*>([\s\S]*?)<\/a>/g;
  let match;
  while ((match = cardRegex.exec(html))) {
    const [, id, body] = match;
    const paragraphs = [...body.matchAll(/<p( class="meta")?>([\s\S]*?)<\/p>/g)];
    const blurb = paragraphs.find((p) => !p[1]); // the plain <p>, not <p class="meta">
    if (blurb) blurbs.set(id, blurb[2].trim());
  }
  return blurbs;
}

async function buildCard(deckSummary, existingBlurbs) {
  const detail = await fetchDeckDetail(deckSummary.id);
  const commanderEntries = (detail.cards || []).filter((c) =>
    (c.categories || []).includes("Commander"),
  );
  const commanderNames = commanderEntries.map((c) => c.card.oracleCard.name);
  const colorIdentityNames = [
    ...new Set(commanderEntries.flatMap((c) => c.card.oracleCard.colorIdentity || [])),
  ];
  const { letters, name: archetype } = archetypeFor(colorIdentityNames);
  const commanderLabel = commanderNames.length ? commanderNames.join(" + ") : "Commander TBD";
  const isNew = !existingBlurbs.has(String(deckSummary.id));
  const blurb = existingBlurbs.get(String(deckSummary.id)) ?? PLACEHOLDER_BLURB;
  const art = deckSummary.featured || "";

  const html = `    <a class="card" style="--card-art: url('${art}')" href="https://archidekt.com/decks/${deckSummary.id}" target="_blank" rel="noopener" data-deck-id="${deckSummary.id}">
      <h3>${escapeHtml(deckSummary.name)}</h3>
      <p class="meta">${escapeHtml(commanderLabel)} &middot; ${archetype}${manaIconsHtml(letters)}</p>
      <p>${escapeHtml(blurb)}</p>
      <span class="badge">Commander</span>
    </a>`;

  return { html, isNew, name: deckSummary.name, id: deckSummary.id };
}

async function main() {
  const html = await readFile(MTG_HTML_PATH, "utf8");
  const existingBlurbs = extractExistingBlurbs(html);
  const existingIds = new Set(existingBlurbs.keys());

  const decks = await fetchFolderDecks();
  const cards = [];
  for (const deck of decks) {
    // Sequential + a small delay: this is a personal decks page, not a load test.
    cards.push(await buildCard(deck, existingBlurbs));
    await new Promise((r) => setTimeout(r, 150));
  }

  const seenIds = new Set(cards.map((c) => String(c.id)));
  const removed = [...existingIds].filter((id) => !seenIds.has(id));
  const added = cards.filter((c) => c.isNew);

  const gridInner = cards.map((c) => c.html).join("\n");
  const newHtml = html.replace(
    /(<div class="card-grid">\n)[\s\S]*?(\n\s*<\/div>)/,
    `$1${gridInner}$2`,
  );

  if (newHtml === html) {
    console.log(`No changes — ${cards.length} decks, all up to date.`);
    return;
  }

  await writeFile(MTG_HTML_PATH, newHtml, "utf8");
  console.log(`Synced ${cards.length} decks.`);
  if (added.length) {
    console.log(
      `New deck(s) added with a placeholder blurb: ${added.map((c) => c.name).join(", ")}`,
    );
  }
  if (removed.length) {
    console.log(`Deck(s) removed (no longer in the Archidekt folder): ${removed.join(", ")}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
