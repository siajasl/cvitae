#!/usr/bin/env node
/**
 * Generate a pixel-mosaic "identicon" favicon derived from the headshot.
 *
 * The headshot (assets/headshot-web.jpg) is downsampled to a small square grid
 * with macOS `sips`, the averaged block colours are read straight out of the
 * resulting BMP, and the grid is emitted as a crisp, scalable SVG mosaic. PNG
 * fallbacks (apple-touch + 32px) are rasterised from that SVG with headless
 * Chrome — the same renderer the CV PDFs already use.
 *
 *   node scripts/generate-identicon.mjs
 *
 * Outputs:
 *   assets/favicon.svg            primary, scalable
 *   assets/favicon-32.png         legacy tab-icon fallback
 *   assets/apple-touch-icon.png   iOS home-screen (180×180)
 */
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SRC = join(ROOT, "assets", "headshot-web.jpg");

const GRID = 16; // mosaic resolution (GRID×GRID blocks)
const RADIUS = 3; // rounded-corner radius, in SVG viewBox units (0–GRID/2)

const work = mkdtempSync(join(tmpdir(), "identicon-"));

/* ---------- 1. downsample to a GRID×GRID BMP via sips ------------------- */
const bmpPath = join(work, "tiny.bmp");
execFileSync(
    "sips",
    [
        "-z",
        String(GRID),
        String(GRID), // -z height width (square source ⇒ no distortion)
        "-s",
        "format",
        "bmp",
        SRC,
        "--out",
        bmpPath,
    ],
    { stdio: "ignore" },
);

/* ---------- 2. read averaged block colours out of the BMP -------------- */
/* Uncompressed 24/32-bit BMP: BGR(A), rows stored bottom-up and padded to a
   4-byte boundary. We read the DIB header to stay format-agnostic. */
const bmp = readFileSync(bmpPath);
const pixelOffset = bmp.readUInt32LE(10);
const dibSize = bmp.readUInt32LE(14);
const width = bmp.readInt32LE(18);
const heightRaw = bmp.readInt32LE(22);
const bpp = bmp.readUInt16LE(28);
const bytesPP = bpp / 8;
const topDown = heightRaw < 0;
const height = Math.abs(heightRaw);
const rowSize = Math.floor((bpp * width + 31) / 32) * 4; // padded to 4 bytes

if (bpp !== 24 && bpp !== 32) {
    throw new Error(`Unexpected BMP depth ${bpp}bpp (dibSize=${dibSize})`);
}

const colorAt = (col, row) => {
    const srcRow = topDown ? row : height - 1 - row;
    const i = pixelOffset + srcRow * rowSize + col * bytesPP;
    return [bmp[i + 2], bmp[i + 1], bmp[i]]; // BGR → RGB
};

/* ---------- 3. emit the SVG mosaic ------------------------------------- */
const hex = (n) => n.toString(16).padStart(2, "0");
let rects = "";
for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
        const [r, g, b] = colorAt(col, row);
        rects += `<rect x="${col}" y="${row}" width="1.02" height="1.02" fill="#${hex(r)}${hex(g)}${hex(b)}"/>`;
    }
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges" role="img" aria-label="Mark A. Conway-Greenslade">
<defs><clipPath id="r"><rect width="${width}" height="${height}" rx="${RADIUS}" ry="${RADIUS}"/></clipPath></defs>
<g clip-path="url(#r)">${rects}</g>
</svg>`;
const svgOut = join(ROOT, "assets", "favicon.svg");
writeFileSync(svgOut, svg);
console.log(`✓ assets/favicon.svg (${width}×${height} mosaic)`);

/* ---------- 4. rasterise PNG fallbacks with headless Chrome ------------ */
function rasterise(px, outName) {
    // Wrap the SVG so Chrome renders it at an exact pixel box on transparent bg.
    const htmlPath = join(work, `wrap-${px}.html`);
    writeFileSync(
        htmlPath,
        `<!doctype html><meta charset="utf-8"><style>html,body{margin:0}#i{width:${px}px;height:${px}px}</style><img id="i" src="file://${svgOut}">`,
    );
    const out = join(ROOT, "assets", outName);
    execFileSync(
        CHROME,
        [
            "--headless=new",
            "--disable-gpu",
            "--hide-scrollbars",
            "--default-background-color=00000000",
            `--window-size=${px},${px}`,
            `--screenshot=${out}`,
            `file://${htmlPath}`,
        ],
        { stdio: "ignore" },
    );
    console.log(`✓ assets/${outName} (${px}×${px})`);
}
rasterise(32, "favicon-32.png");
rasterise(180, "apple-touch-icon.png");

console.log("Done.");
