// Pack screenshots for a batch artifact: resize + JPEG so a page of 40–60
// figures stays well under the artifact size cap.
//
//   node tours/pack-shots.mjs <outDir> <shot.png> [<shot.png>…]
//   node tours/pack-shots.mjs <outDir> --from list.txt      (one path per line)
//
// Desktop shots → 1200px wide; mobile shots → 520px wide (2× source is 780).
// Tall "full" captures keep their aspect. Prints "<src> -> <dst> <kb>".
import sharp from "sharp"
import { mkdirSync, readFileSync } from "node:fs"
import { basename, join } from "node:path"

const [outDir, ...rest] = process.argv.slice(2)
if (!outDir) throw new Error("usage: pack-shots <outDir> <png…>")
mkdirSync(outDir, { recursive: true })
const files = rest[0] === "--from" ? readFileSync(rest[1], "utf8").split("\n").map(s => s.trim()).filter(Boolean) : rest

for (const src of files) {
  const name = basename(src).replace(/\.png$/, ".jpg")
  const width = /__mobile__/.test(name) ? 520 : 1200
  const dst = join(outDir, name)
  const info = await sharp(src).resize({ width, withoutEnlargement: true }).jpeg({ quality: 78, mozjpeg: true }).toFile(dst)
  console.log(`${basename(src)} -> ${name} ${Math.round(info.size / 1024)}kb`)
}
