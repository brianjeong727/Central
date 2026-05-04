import sharp from "sharp"
import { writeFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dirname, "../public")

// SVG template: plum rounded square + "C" in ivory Instrument Serif
function makeSvg(size) {
  const radius = size * 0.18
  const fontSize = size * 0.58
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#3E1540"/>
  <text
    x="${size / 2}"
    y="${size / 2}"
    font-family="Georgia, 'Times New Roman', serif"
    font-size="${fontSize}"
    font-weight="400"
    fill="#F6F4EF"
    text-anchor="middle"
    dominant-baseline="central"
  >C</text>
</svg>`
}

const sizes = [
  { name: "icon-192x192.png", size: 192 },
  { name: "icon-512x512.png", size: 512 },
  { name: "apple-touch-icon.png", size: 180 },
]

for (const { name, size } of sizes) {
  const svg = Buffer.from(makeSvg(size))
  await sharp(svg)
    .png()
    .toFile(join(publicDir, name))
  console.log(`Generated ${name}`)
}
