#!/usr/bin/env node
/**
 * Generate curated, printer-friendly CV PDFs — one per supported language.
 *
 * Source of truth for all four languages is the `#i18n` JSON embedded in
 * index.html, so the PDFs and the website never drift apart. Rendering is done
 * with headless Google Chrome (full CSS + custom fonts + CJK support).
 *
 *   node scripts/generate-cv-pdfs.mjs            # build all languages
 *   node scripts/generate-cv-pdfs.mjs --qa       # also write QA PNG screenshots
 *
 * Output: assets/Mark-Conway-Greenslade-CV-<lang>.pdf
 */
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHROME =
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const QA = process.argv.includes("--qa");

const NAME = "Mark A. Conway-Greenslade";
const CONTACT = {
    email: "macg@enthropic.io",
    github: "github.com/siajasl",
};
// Localised micro-labels not present in the site i18n block.
const PROFILE_LABEL = {
    en: "Profile",
    fr: "Profil",
    zh: "简介",
    de: "Profil",
};

/* ---------- load data + assets ---------------------------------------- */
const html = readFileSync(join(ROOT, "index.html"), "utf8");
const i18n = JSON.parse(
    html.match(
        /<script type="application\/json" id="i18n">([\s\S]*?)<\/script>/,
    )[1],
);

const b64 = (p, mime) =>
    `data:${mime};base64,${readFileSync(join(ROOT, p)).toString("base64")}`;
const fonts = {
    light: b64("fonts/Lato-Light.woff", "font/woff"),
    regular: b64("fonts/Lato-Regular.woff", "font/woff"),
    bold: b64("fonts/Lato-Bold.woff", "font/woff"),
    black: b64("fonts/Lato-Black.woff", "font/woff"),
};
const headshot = b64("assets/headshot-web.jpg", "image/jpeg");

/* Chrome's --print-to-pdf cannot embed macOS system .ttc collections, so CJK
   text renders blank unless the font is supplied via @font-face. We embed
   Hiragino Sans GB (Simplified Chinese) as a data URI for the zh build only;
   Chrome subsets it, keeping the output PDF small. */
const CJK_TTC = "/System/Library/Fonts/Hiragino Sans GB.ttc";
let _cjkFont;
const cjkFontDataURI = () =>
    (_cjkFont ??= `data:font/ttf;base64,${readFileSync(CJK_TTC).toString("base64")}`);

const esc = (s) =>
    String(s).replace(
        /[&<>]/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c],
    );

const ICON = {
    mail: `<svg viewBox="0 0 16 16"><path d="M1.75 2A1.75 1.75 0 0 0 0 3.75v8.5C0 13.216.784 14 1.75 14h12.5A1.75 1.75 0 0 0 16 12.25v-8.5A1.75 1.75 0 0 0 14.25 2H1.75Zm-.25 2.482 6.07 4.045a.75.75 0 0 0 .86 0L14.5 4.482v7.768a.25.25 0 0 1-.25.25H1.75a.25.25 0 0 1-.25-.25V4.482ZM13.7 3.5 8 7.298 2.3 3.5h11.4Z"/></svg>`,
    github: `<svg viewBox="0 0 16 16"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>`,
};

/* ---------- HTML template --------------------------------------------- */
function buildHTML(lang) {
    const d = i18n[lang];
    const isZh = lang === "zh";
    const cjk = isZh ? `"CJK",` : "";
    const cjkFace = isZh
        ? `@font-face{font-family:CJK;src:url(${cjkFontDataURI()}) format("truetype")}`
        : "";

    const skills = d.skills
        .map(
            (g) => `<div class="skill-group">
        <h4>${esc(g.category)}</h4>
        <ul class="chips">${g.items
            .map((it) => `<li>${esc(it)}</li>`)
            .join("")}</ul>
      </div>`,
        )
        .join("");

    const work = d.work
        .map(
            (w) => `<li>
        <span class="when">${esc(w.when)}</span>
        <h3 class="role">${esc(w.role)}</h3>
        <div class="org">${esc(w.org)}</div>
        <p>${esc(w.summary)}</p>
      </li>`,
        )
        .join("");

    const edu = d.edu
        .map(
            (e) => `<li>
        <span class="y">${esc(e.year)}</span>
        <h4>${esc(e.name)}</h4>
        <p>${esc(e.where)}</p>
      </li>`,
        )
        .join("");

    const details = d.other
        .map(
            (r) =>
                `<div class="detail"><dt>${esc(r[0])}</dt><dd>${esc(r[1])}</dd></div>`,
        )
        .join("");

    const mailHref =
        `mailto:${CONTACT.email}?subject=` +
        encodeURIComponent(d.ui.mailsubject || "CV Enquiry");

    return `<!doctype html><html lang="${isZh ? "zh-CN" : lang}"><head>
<meta charset="utf-8">
<style>
@font-face{font-family:Lato;src:url(${fonts.light}) format("woff");font-weight:300}
@font-face{font-family:Lato;src:url(${fonts.regular}) format("woff");font-weight:400}
@font-face{font-family:Lato;src:url(${fonts.bold}) format("woff");font-weight:700}
@font-face{font-family:Lato;src:url(${fonts.black}) format("woff");font-weight:900}
${cjkFace}
:root{
  --paper:#ffffff;--ink:#1f2937;--body:#374151;--muted:#6b7280;
  --rule:#e5e7eb;--rule2:#d1d5db;
  --accent:#0b7a5b;--accent2:#6d28d9;--chip:#f4f5f7;
  --sans:"Lato",${cjk}system-ui,"Noto Sans",sans-serif;
  --mono:"SF Mono","Menlo","Consolas",ui-monospace,${cjk}monospace;
}
*{margin:0;padding:0;box-sizing:border-box}
html{background:var(--paper);-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{
  background:var(--paper);color:var(--body);font-family:var(--sans);font-weight:400;
  font-size:9.4px;line-height:1.6;-webkit-print-color-adjust:exact;print-color-adjust:exact;
}
@page{size:A4;margin:12mm 14mm 14mm 14mm}
a{color:inherit;text-decoration:none}

/* Single letterhead on the first page only. */
.head{
  display:flex;align-items:center;gap:11px;
  padding-bottom:8px;margin-bottom:12px;border-bottom:1.5px solid var(--accent);
}
.head .photo{width:44px;height:44px;border-radius:50%;object-fit:cover;
  border:1.5px solid var(--accent);flex:none}
.head .who h1{font-size:15px;font-weight:900;color:var(--ink);line-height:1.12;letter-spacing:.2px}
.head .who .tagline{font-family:var(--mono);font-size:8.4px;color:var(--accent);letter-spacing:.2px;margin-top:1px}
.head .contact{margin-left:auto;display:flex;flex-direction:column;gap:3px;
  font-family:var(--mono);font-size:8.2px;color:var(--body)}
.head .contact .c{display:flex;align-items:center;gap:6px;justify-content:flex-end}
.head .contact svg{width:10px;height:10px;fill:var(--accent);flex:none}

/* sections — tall sections (e.g. Experience) must be free to flow across
   pages, so NO break-inside:avoid here; we instead keep each heading glued to
   the content beneath it and keep individual items intact (rules below). */
section{margin-bottom:14px}
.h{font-family:var(--mono);font-size:10.5px;color:var(--ink);font-weight:700;
  display:flex;align-items:center;gap:7px;margin-bottom:8px;letter-spacing:.3px;
  break-after:avoid;page-break-after:avoid}
.h::before{content:"//";color:var(--accent2)}
.h::after{content:"";flex:1;height:1px;background:var(--rule)}
.lead{color:var(--body);font-size:9.6px;line-height:1.72;text-align:justify}

/* experience timeline */
.timeline{list-style:none;position:relative;padding-left:15px}
.timeline::before{content:"";position:absolute;left:3px;top:4px;bottom:4px;width:1.5px;background:var(--accent)}
.timeline>li{position:relative;padding-bottom:10px;break-inside:avoid}
.timeline>li::before{content:"";position:absolute;left:-15px;top:3px;width:7px;height:7px;border-radius:50%;
  background:var(--paper);border:1.5px solid var(--accent)}
.when{font-family:var(--mono);font-size:8px;color:var(--accent2);letter-spacing:.2px}
.role{font-size:10.5px;color:var(--ink);font-weight:700;margin-top:1px}
.org{font-family:var(--mono);font-size:8.2px;color:var(--muted);margin-bottom:3px}
.timeline p{color:var(--body);font-size:9.1px;line-height:1.64;text-align:justify}

/* skills — label + chips rows */
.skill-group{display:grid;grid-template-columns:120px 1fr;gap:10px;align-items:baseline;
  padding:6px 0;border-bottom:1px solid var(--rule)}
.skill-group:last-child{border-bottom:0}
.skill-group h4{font-family:var(--mono);font-size:8.2px;text-transform:uppercase;letter-spacing:.06em;color:var(--accent)}
.chips{list-style:none;display:flex;flex-wrap:wrap;gap:4px}
.chips li{font-family:var(--mono);font-size:8px;color:var(--ink);background:var(--chip);
  border:1px solid var(--rule2);border-radius:99px;padding:2px 8px}

/* education — two even tracks */
.edu{list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:8px 18px}
.edu li{padding-bottom:7px;border-bottom:1px solid var(--rule)}
.edu .y{font-family:var(--mono);font-size:8.2px;color:var(--accent2)}
.edu h4{font-size:9.6px;color:var(--ink);font-weight:700;margin:1px 0}
.edu p{font-size:8.6px;color:var(--muted)}

/* other — key/value rows */
.detail{display:grid;grid-template-columns:120px 1fr;gap:10px;align-items:baseline;
  padding:5px 0;border-bottom:1px solid var(--rule)}
.detail:last-child{border-bottom:0}
.detail dt{font-family:var(--mono);font-size:8.2px;text-transform:uppercase;letter-spacing:.06em;color:var(--accent)}
.detail dd{font-size:9px;color:var(--body)}
</style></head><body>
  <header class="head">
    <img class="photo" src="${headshot}" alt="">
    <div class="who">
      <h1>${esc(NAME)}</h1>
      <div class="tagline">${esc(d.hero.tagline)}</div>
    </div>
    <div class="contact">
      <a class="c" href="${mailHref}">${ICON.mail}${esc(CONTACT.email)}</a>
      <span class="c">${ICON.github}${esc(CONTACT.github)}</span>
    </div>
  </header>

  <main>
    <section>
      <div class="h">${esc(PROFILE_LABEL[lang])}</div>
      <p class="lead">${esc(d.overview)}</p>
    </section>
    <section>
      <div class="h">${esc(d.nav.experience)}</div>
      <ol class="timeline">${work}</ol>
    </section>
    <section>
      <div class="h">${esc(d.nav.skills)}</div>
      ${skills}
    </section>
    <section>
      <div class="h">${esc(d.nav.education)}</div>
      <ul class="edu">${edu}</ul>
    </section>
    <section>
      <div class="h">${esc(d.nav.other)}</div>
      ${details}
    </section>
  </main>
</body></html>`;
}

/* ---------- render ----------------------------------------------------- */
const work = mkdtempSync(join(tmpdir(), "cvpdf-"));
const langs = ["en", "fr", "zh", "de"];
for (const lang of langs) {
    const htmlPath = join(work, `cv-${lang}.html`);
    writeFileSync(htmlPath, buildHTML(lang));
    const out = join(ROOT, "assets", `Mark-Conway-Greenslade-CV-${lang}.pdf`);
    execFileSync(
        CHROME,
        [
            "--headless=new",
            "--disable-gpu",
            "--no-pdf-header-footer",
            `--print-to-pdf=${out}`,
            `file://${htmlPath}`,
        ],
        { stdio: "ignore" },
    );
    console.log(`✓ ${out.replace(ROOT + "/", "")}`);
    if (QA) {
        const png = join(ROOT, "assets", `_qa-${lang}.png`);
        execFileSync(
            CHROME,
            [
                "--headless=new",
                "--disable-gpu",
                "--hide-scrollbars",
                "--window-size=794,2400",
                `--screenshot=${png}`,
                `file://${htmlPath}`,
            ],
            { stdio: "ignore" },
        );
        console.log(`  qa → ${png.replace(ROOT + "/", "")}`);
    }
}
console.log("Done.");
