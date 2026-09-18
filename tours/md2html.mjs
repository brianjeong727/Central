// Turn a batch markdown report into the styled artifact page (same design as
// batches 1–3), inserting screenshot galleries at named headings.
//
//   node tours/md2html.mjs <batch.md> <out.html> --title "…" --eyebrow "…" --meta "…" [--figures figures.json]
//
// figures.json: { "<heading text prefix>": [ { "file": "N6.1__desktop__…png", "caption": "…", "phone": true } ] }
// Figures are inserted right AFTER the first paragraph under the matching heading.
// Images are referenced as shots/<basename>.jpg (pack them with tours/pack-shots.mjs).
import { readFileSync, writeFileSync } from "node:fs"
import { basename } from "node:path"

const [mdPath, outPath, ...rest] = process.argv.slice(2)
const opt = (k, d = "") => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : d }
const title = opt("--title", "Review"), eyebrow = opt("--eyebrow", "Design pass"), meta = opt("--meta", "")
const figures = opt("--figures") ? JSON.parse(readFileSync(opt("--figures"), "utf8")) : {}

const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
const inline = s => esc(s)
  .replace(/`([^`]+)`/g, "<code>$1</code>")
  .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  .replace(/\*([^*]+)\*/g, "<em>$1</em>")
  .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

const lines = readFileSync(mdPath, "utf8").split("\n")
let html = "", i = 0
const toc = []
let h1 = title, lede = ""
const galleryFor = heading => {
  const key = Object.keys(figures).find(k => heading.startsWith(k))
  if (!key) return ""
  return `<div class="gallery">` + figures[key].map(f => {
    const jpg = basename(f.file).replace(/\.png$/, ".jpg")
    const tall = /__full\.jpg$/.test(jpg) ? " tall" : ""
    return `<figure${f.phone ? ' class="phone"' : ""}><div class="frame${tall}"><img src="shots/${jpg}" alt="${esc(f.alt ?? f.caption)}"></div><figcaption>${inline(f.caption)}</figcaption></figure>`
  }).join("") + `</div>`
}
let pendingGallery = "", paraSinceHeading = 0
const flushGallery = () => { if (pendingGallery && paraSinceHeading >= 1) { html += pendingGallery; pendingGallery = "" } }

while (i < lines.length) {
  const L = lines[i]
  if (/^# /.test(L)) { h1 = L.slice(2).replace(/^Design pass · Batch \d+ — /, ""); i++; continue }
  if (/^---\s*$/.test(L)) { i++; continue }
  if (/^## /.test(L)) {
    flushGallery(); if (pendingGallery) { html += pendingGallery; pendingGallery = "" }
    if (html) html += "</section>"
    const text = L.slice(3); const id = slug(text); toc.push([id, text])
    html += `<section id="${id}"><h2>${inline(text)}</h2>`
    pendingGallery = galleryFor(text); paraSinceHeading = 0; i++; continue
  }
  if (/^### /.test(L)) { html += `<h3>${inline(L.slice(4))}</h3>`; i++; continue }
  if (/^\|/.test(L)) {
    const rows = []; while (i < lines.length && /^\|/.test(lines[i])) { rows.push(lines[i]); i++ }
    const cells = r => r.replace(/^\||\|$/g, "").split("|").map(c => inline(c.trim()))
    const head = cells(rows[0]); const body = rows.slice(2).map(cells)
    html += `<div class="wide"><table><tr>${head.map(c => `<th>${c}</th>`).join("")}</tr>${body.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")}</table></div>`
    paraSinceHeading++; flushGallery(); continue
  }
  if (/^- /.test(L)) {
    const items = []; while (i < lines.length && /^- /.test(lines[i])) { items.push(lines[i].slice(2)); i++ }
    html += `<ul>${items.map(t => `<li>${inline(t)}</li>`).join("")}</ul>`; paraSinceHeading++; flushGallery(); continue
  }
  if (/^\d+\. /.test(L)) {
    const items = []; while (i < lines.length && /^\d+\. /.test(lines[i])) { items.push(lines[i].replace(/^\d+\. /, "")); i++ }
    const isDecisions = /decisions/i.test(toc[toc.length - 1]?.[1] ?? "")
    html += `<ol class="${isDecisions ? "decisions" : "plain"}">${items.map(t => `<li>${inline(t)}</li>`).join("")}</ol>`; paraSinceHeading++; flushGallery(); continue
  }
  if (/^_\(.*\)_\s*$/.test(L)) { i++; continue }
  if (L.trim() === "") { i++; continue }
  // paragraph (may span lines)
  const para = []; while (i < lines.length && lines[i].trim() !== "" && !/^(#|- |\d+\. |\||---)/.test(lines[i])) { para.push(lines[i]); i++ }
  const text = para.join(" ")
  if (!lede && !html) { lede = text; continue }
  html += `<p>${inline(text)}</p>`; paraSinceHeading++; flushGallery()
}
if (pendingGallery) html += pendingGallery
if (html) html += "</section>"

const page = `<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
  :root { --cream:#FDFCF8; --panel:#FBF8F2; --ivory:#F1ECDE; --line:#E8E2D2; --line-2:#E2DDCF; --ink:#13101A; --body:#474251; --muted:#6E687B; --faint:#8E8777; --plum:#3E1540; --plum-tint:color-mix(in srgb,#3E1540 12%,#FDFCF8); --danger:#9F3030; --gold:#B8862F; --sans:"Bricolage Grotesque","Helvetica Neue",Arial,sans-serif; --mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --cream:#15121B; --panel:#1C1824; --ivory:#241F2E; --line:#2E2839; --line-2:#372F44; --ink:#F6F4EF; --body:#CFC9D6; --muted:#9F98AB; --faint:#766F82; --plum:#C9A3CC; --plum-tint:color-mix(in srgb,#C9A3CC 16%,#15121B); --danger:#E08A8A; --gold:#D9B25E; } }
  :root[data-theme="dark"] { --cream:#15121B; --panel:#1C1824; --ivory:#241F2E; --line:#2E2839; --line-2:#372F44; --ink:#F6F4EF; --body:#CFC9D6; --muted:#9F98AB; --faint:#766F82; --plum:#C9A3CC; --plum-tint:color-mix(in srgb,#C9A3CC 16%,#15121B); --danger:#E08A8A; --gold:#D9B25E; }
  * { box-sizing:border-box } body { margin:0; background:var(--cream); color:var(--body); font-family:var(--sans); font-size:16px; line-height:1.55; font-optical-sizing:auto } a { color:var(--plum) }
  .page { display:grid; grid-template-columns:220px minmax(0,1fr); gap:56px; max-width:1240px; margin:0 auto; padding:48px 40px 96px }
  @media (max-width:900px) { .page { grid-template-columns:1fr; gap:24px; padding:24px 20px 64px } .index { position:static!important } }
  .index { position:sticky; top:24px; align-self:start; font-size:13px } .index .eyebrow { margin-bottom:14px } .index ol { list-style:none; padding:0; margin:0; border-left:1px solid var(--line) }
  .index li a { display:block; padding:5px 0 5px 14px; color:var(--muted); text-decoration:none; margin-left:-1px; border-left:1px solid transparent } .index li a:hover,.index li a:focus-visible { color:var(--ink); border-left-color:var(--plum); outline:none } .index .meta { margin-top:22px; color:var(--faint); line-height:1.5 }
  main { max-width:72ch } main > section { margin-top:56px }
  .eyebrow { font-family:var(--mono); font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:var(--muted) }
  h1 { font-size:40px; line-height:1.08; font-weight:600; letter-spacing:-.02em; color:var(--ink); margin:10px 0 14px; text-wrap:balance } h2 { font-size:26px; line-height:1.15; font-weight:600; letter-spacing:-.02em; color:var(--ink); margin:8px 0 18px; text-wrap:balance } h3 { font-size:18px; font-weight:600; color:var(--ink); margin:28px 0 8px }
  p { margin:0 0 14px } .lede { font-size:18px; color:var(--ink) } strong { color:var(--ink) } code { font-family:var(--mono); font-size:.86em; color:var(--muted) }
  table { border-collapse:collapse; width:100%; font-size:14px; margin:8px 0 18px } th,td { text-align:left; vertical-align:top; padding:9px 12px 9px 0; border-bottom:1px solid var(--line) } th { font-family:var(--mono); font-size:11px; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); font-weight:500 } .wide { overflow-x:auto }
  ul { padding-left:20px } ul li { margin:8px 0 } ol.plain { padding-left:22px } ol.plain li { margin:8px 0 }
  ol.decisions { padding-left:0; list-style:none; counter-reset:q } ol.decisions li { counter-increment:q; padding:14px 0 14px 44px; border-bottom:1px solid var(--line); position:relative; margin:0 } ol.decisions li::before { content:counter(q); position:absolute; left:0; top:14px; width:28px; height:28px; border-radius:50%; background:var(--plum-tint); color:var(--plum); font-family:var(--mono); font-size:12px; display:grid; place-items:center }
  .gallery { display:grid; gap:22px; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); width:min(1100px,calc(100vw - 80px)); margin:24px 0 18px } figure { margin:0 } figure .frame { border:1px solid var(--line); border-radius:10px; overflow:hidden; background:var(--panel) } figure .frame.tall { max-height:560px; overflow-y:auto } figure img { display:block; width:100%; height:auto } figure.phone { max-width:300px } figcaption { font-size:13px; color:var(--muted); margin-top:8px; line-height:1.45 }
  @media (prefers-reduced-motion:no-preference) { .index li a { transition:color 120ms ease-out,border-color 120ms ease-out } }
</style>
<div class="page">
  <nav class="index" aria-label="Sections">
    <div class="eyebrow">${esc(eyebrow)}</div>
    <ol>${toc.map(([id, t]) => `<li><a href="#${id}">${inline(t)}</a></li>`).join("")}</ol>
    <div class="meta">${inline(meta)}</div>
  </nav>
  <main>
    <header><div class="eyebrow">Central · ${esc(eyebrow)}</div><h1>${inline(h1)}</h1>${lede ? `<p class="lede">${inline(lede)}</p>` : ""}</header>
    ${html}
  </main>
</div>
`
writeFileSync(outPath, page)
console.log(`wrote ${outPath} (${toc.length} sections)`)
