#!/usr/bin/env node
// Regenerates data/gunpla-wiki.json from the Gundam Fandom wiki.
//
// Each kit in data/gunpla.json can name its mobile suit's wiki page in a
// `wiki` field (the page title, e.g. "XVX-016 Gundam Aerial"). For every
// distinct page this reads the {{Infobox/Mobile Weapon}} fields through the
// MediaWiki API, cleans the wiki markup out of them, resolves the first
// infobox image to a thumbnail URL, and writes them keyed by page title.
// js/gunpla.js shows them in the kit details dialog.
//
// Usage: node scripts/sync-gundam-wiki.mjs

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const KITS_PATH = path.join(ROOT, "data", "gunpla.json");
const OUT_PATH = path.join(ROOT, "data", "gunpla-wiki.json");
const API = "https://gundam.fandom.com/api.php";
const WIKI = "https://gundam.fandom.com/wiki/";
const USER_AGENT = "hunterevolved-sync/1.0 (+https://hunterevolved.com)";
const IMAGE_WIDTH = 480;

async function api(params) {
  const url = `${API}?${new URLSearchParams({ ...params, format: "json" })}`;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt >= 3) throw new Error(`${url}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
}

// The {{Infobox ...}} template as { field: raw value }, splitting only on
// top-level pipes so links and nested templates stay intact.
function parseInfobox(wikitext) {
  const start = wikitext.indexOf("{{Infobox");
  if (start < 0) return {};
  let depth = 0, end = start;
  for (let i = start; i < wikitext.length; i++) {
    const two = wikitext.slice(i, i + 2);
    if (two === "{{") { depth++; i++; } else if (two === "}}") {
      depth--; i++;
      if (depth === 0) { end = i - 1; break; }
    }
  }
  const body = wikitext.slice(start + 2, end);
  const parts = [];
  let cur = "";
  depth = 0;
  for (let i = 0; i < body.length; i++) {
    const two = body.slice(i, i + 2);
    if (two === "{{" || two === "[[") { depth++; cur += two; i++; continue; }
    if (two === "}}" || two === "]]") { depth--; cur += two; i++; continue; }
    if (body[i] === "|" && depth === 0) { parts.push(cur); cur = ""; continue; }
    cur += body[i];
  }
  parts.push(cur);
  const fields = {};
  for (const p of parts.slice(1)) {
    const eq = p.indexOf("=");
    if (eq > 0) fields[p.slice(0, eq).trim()] = p.slice(eq + 1).trim();
  }
  return fields;
}

// One infobox entry to plain text. Entries look like
// "[[Link|Text]]~qualifier[ref:...]" or "Page name;Display text".
function cleanEntry(s) {
  s = s
    .replace(/<ref[^>]*\/>|<ref[^>]*>[\s\S]*?<\/ref>/g, "")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/\[ref:[^\]]*\]/g, "")
    .replace(/\s*\[[^\]]*\]/g, "") // appearance tags like [MSG]
    .replace(/<[^>]+>/g, "")
    .replace(/'{2,}/g, "")
    .replace(/"/g, "");
  // Leading dashes mark a part of the entry above ("-Grenade Launcher").
  const sub = /^\s*-+/.test(s) ? "↳ " : "";
  s = s.replace(/^\s*-+\s*/, "");
  let [main, qual] = s.split("~");
  if (main.includes(";")) main = main.slice(main.indexOf(";") + 1);
  main = main.trim();
  qual = (qual || "").trim();
  if (!main) return "";
  return sub + (qual ? `${main} (${qual})` : main);
}

// A field as a list of entries: one per line, and for name-like fields
// also one per comma.
function list(raw, commas) {
  if (!raw) return [];
  const lines = raw.replace(/<br\s*\/?>/gi, "\n").split("\n");
  const entries = commas ? lines.flatMap((l) => l.split(",")) : lines;
  return [...new Set(entries.map(cleanEntry).filter(Boolean))];
}

function text(raw) {
  return list(raw, false).join(", ");
}

// "18.0" -> "18.0 m"; keeps any qualifier: "18~1st-5th" -> "18 m (1st-5th)".
function measure(raw, unit) {
  return list(raw, true)
    .map((e) => e.replace(/^([\d.]+)/, `$1 ${unit}`))
    .join(", ");
}

// "XVX-016 Gundam Aerial" -> "XVX-016": the leading tokens that look like a
// model number (have a digit, or a hyphen for the first one, e.g.
// "Concept-X 6-1-2"). "00" starts the name in 00 Qan[T] etc.
function modelNumber(title) {
  const tokens = title.split(" ");
  const model = [];
  for (const t of tokens) {
    if (t === "00" || !(/\d/.test(t) || (!model.length && t.includes("-")))) break;
    model.push(t);
  }
  return model.length < tokens.length ? model.join(" ") : "";
}

function firstImage(raw) {
  for (const line of (raw || "").split("\n")) {
    const file = line.split(";")[0].trim();
    if (/\.(png|jpe?g|gif|webp)$/i.test(file)) return file;
  }
  return "";
}

function entry(title, f) {
  const weight = f.weight || f.weightCEBF;
  return {
    url: WIKI + encodeURIComponent(title.replace(/ /g, "_")).replace(/%2F/g, "/"),
    model: modelNumber(title),
    era: text(f.era),
    production: text(f.production),
    manufacturer: list(f.manufacturer || f.developer || f.developers, true),
    operator: list(f.operator, true),
    pilot: list(f.pilot, true),
    designer: list(f.mechdesigner, true),
    height: measure(f.height || f.headheight, "m"),
    weight: weight ? measure(weight, "t") : f.emptyweight ? `${measure(f.emptyweight, "t")} (empty)` : "",
    powerplant: text(f.powerplant),
    armor: text(f.armor),
    equipment: list(f.standardEquipment, false),
    fixedArmaments: list(f.fixedArmaments, false),
    handheldArmaments: list(f.handheldArmaments, false),
    imageFile: firstImage(f.image),
  };
}

async function main() {
  const { kits } = JSON.parse(await readFile(KITS_PATH, "utf8"));
  const titles = [...new Set(kits.map((k) => k.wiki).filter(Boolean))].sort();
  const pages = {};
  for (const title of titles) {
    const data = await api({ action: "parse", page: title, prop: "wikitext", redirects: 1 });
    if (!data.parse) {
      console.warn(`skipped "${title}": ${data.error?.info || "no page"}`);
      continue;
    }
    pages[title] = entry(title, parseInfobox(data.parse.wikitext["*"]));
    await new Promise((r) => setTimeout(r, 300));
  }

  // Image file names -> thumbnail URLs, 50 per request.
  const files = [...new Set(Object.values(pages).map((p) => p.imageFile).filter(Boolean))];
  const thumbs = {};
  for (let i = 0; i < files.length; i += 50) {
    const data = await api({
      action: "query", prop: "imageinfo", iiprop: "url", iiurlwidth: IMAGE_WIDTH,
      titles: files.slice(i, i + 50).map((f) => `File:${f}`).join("|"),
    });
    const norm = Object.fromEntries((data.query.normalized || []).map((n) => [n.to, n.from]));
    for (const p of Object.values(data.query.pages)) {
      const info = p.imageinfo && p.imageinfo[0];
      if (info) thumbs[(norm[p.title] || p.title).replace(/^File:/, "")] = info.thumburl || info.url;
    }
  }
  for (const p of Object.values(pages)) {
    p.image = thumbs[p.imageFile] || "";
    delete p.imageFile;
    for (const k of Object.keys(p)) if (p[k] === "" || (Array.isArray(p[k]) && !p[k].length)) delete p[k];
  }

  await writeFile(OUT_PATH, JSON.stringify({ source: "https://gundam.fandom.com", pages }, null, 2) + "\n");
  console.log(`wrote ${Object.keys(pages).length} pages to ${path.relative(ROOT, OUT_PATH)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
