/**
 * Rich HTML slide deck template.
 *
 * Takes a structured slide-deck definition and returns a complete self-contained
 * HTML document with CSS styling, navigation, and progress tracking — modeled on
 * the Chernev marketing lecture example.
 *
 * Components supported (each slide's body is an array of these):
 *   - bullets       — colored-dot bullet list
 *   - sbox          — single styled callout box (colored)
 *   - grid2 / grid3 — 2 or 3 column grid of sboxes
 *   - quote         — colored quote block with left border
 *   - formula       — centered monospace formula panel
 *   - icard         — plain info card with small-caps title
 *   - table         — data table with headers
 *   - segments      — 3-column labeled segment cards
 *   - badges        — list of hi/med/lo labeled items
 */

export type SlideColor = "p" | "t" | "c" | "a" | "g" | "b" | "r";

export interface BulletItem {
  text: string;
  color?: SlideColor;
}

export interface SBoxItem {
  color: SlideColor;
  title: string;
  body: string;
}

export interface SegmentItem {
  color: "con" | "trd" | "ind";
  name: string;
  text: string;
}

export interface TableRow {
  cells: string[];
}

export type SlideComponent =
  | { type: "bullets"; items: BulletItem[] }
  | { type: "sbox"; box: SBoxItem }
  | { type: "grid2"; boxes: SBoxItem[] }
  | { type: "grid3"; boxes: SBoxItem[] }
  | { type: "quote"; text: string; color?: "p" | "t" | "a" }
  | { type: "formula"; text: string }
  | { type: "icard"; title: string; body: string }
  | { type: "table"; headers: string[]; rows: TableRow[] }
  | { type: "segments"; items: SegmentItem[] };

export interface Slide {
  tag: string;
  tagColor?: SlideColor;
  title: string;
  body: SlideComponent[];
  /** Optional 120–200 word spoken narration for TTS when rendering as video */
  narration?: string;
}

export interface SlideDeckInput {
  courseName: string;
  deckTitle: string;
  subtitle?: string;
  slides: Slide[];
}

// ── HTML helpers ─────────────────────────────────────────────────────────────

const esc = (s: string): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Allows **bold** in body text but escapes everything else
const richText = (s: string): string => {
  let out = esc(s ?? "");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return out;
};

// ── Component renderers ──────────────────────────────────────────────────────

function renderBullets(items: BulletItem[]): string {
  return `<div class="blist">${items
    .map(
      (it) =>
        `<div class="b"><div class="dot${it.color ? " " + it.color : ""}"></div><span>${richText(
          it.text
        )}</span></div>`
    )
    .join("")}</div>`;
}

function renderSBox(box: SBoxItem): string {
  return `<div class="sbox ${box.color}"><div class="sbox-title">${richText(
    box.title
  )}</div><div class="sbox-body">${richText(box.body)}</div></div>`;
}

function renderGrid(boxes: SBoxItem[], cls: "grid2" | "grid3"): string {
  return `<div class="${cls}">${boxes.map(renderSBox).join("")}</div>`;
}

function renderQuote(text: string, color?: "p" | "t" | "a"): string {
  const extra = color === "t" ? " teal" : color === "a" ? " amber" : "";
  return `<div class="quote${extra}">${richText(text)}</div>`;
}

function renderFormula(text: string): string {
  return `<div class="formula">${esc(text)}</div>`;
}

function renderICard(title: string, body: string): string {
  return `<div class="icard"><div class="ictitle">${esc(
    title
  )}</div><div style="font-size:13px;line-height:1.6;">${richText(body)}</div></div>`;
}

function renderTable(headers: string[], rows: TableRow[]): string {
  const head = headers.map((h) => `<th>${esc(h)}</th>`).join("");
  const body = rows
    .map((r) => `<tr>${r.cells.map((c) => `<td>${richText(c)}</td>`).join("")}</tr>`)
    .join("");
  return `<div style="overflow-x:auto;"><table class="ctable"><tr>${head}</tr>${body}</table></div>`;
}

function renderSegments(items: SegmentItem[]): string {
  return `<div class="seg-grid">${items
    .map(
      (s) =>
        `<div class="seg ${s.color}"><div class="seg-name">${esc(
          s.name
        )}</div><div class="seg-text">${richText(s.text)}</div></div>`
    )
    .join("")}</div>`;
}

function renderComponent(c: SlideComponent): string {
  switch (c.type) {
    case "bullets":
      return renderBullets(c.items);
    case "sbox":
      return renderSBox(c.box);
    case "grid2":
      return renderGrid(c.boxes, "grid2");
    case "grid3":
      return renderGrid(c.boxes, "grid3");
    case "quote":
      return renderQuote(c.text, c.color);
    case "formula":
      return renderFormula(c.text);
    case "icard":
      return renderICard(c.title, c.body);
    case "table":
      return renderTable(c.headers, c.rows);
    case "segments":
      return renderSegments(c.items);
    default:
      return "";
  }
}

function renderSlideBody(slide: Slide): string {
  return slide.body.map(renderComponent).join("\n");
}

// ── Main builder ─────────────────────────────────────────────────────────────

export function buildSlideDeckHtml(input: SlideDeckInput): string {
  const { courseName, deckTitle, subtitle, slides } = input;

  const slideData = slides
    .map((s, i) => {
      const tagColor = s.tagColor || "p";
      return `/* ${i} */ {tag:${JSON.stringify(s.tag)},cls:${JSON.stringify(
        tagColor
      )},title:${JSON.stringify(s.title)},body:${JSON.stringify(renderSlideBody(s))}}`;
    })
    .join(",\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${esc(deckTitle)} — ${esc(courseName)}</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{
  --p50:#EEEDFE;--p100:#CECBF6;--p200:#AFA9EC;--p400:#7F77DD;--p600:#534AB7;--p800:#3C3489;
  --t50:#E1F5EE;--t100:#9FE1CB;--t400:#1D9E75;--t800:#085041;
  --c50:#FAECE7;--c100:#F5C4B3;--c400:#D85A30;--c800:#712B13;
  --a50:#FAEEDA;--a100:#FAC775;--a400:#BA7517;--a800:#633806;
  --b50:#E6F1FB;--b100:#B5D4F4;--b400:#378ADD;--b800:#0C447C;
  --g50:#EAF3DE;--g100:#C0DD97;--g400:#639922;--g800:#27500A;
  --r50:#FCEBEB;--r400:#E24B4A;--r800:#791F1F;
  --bg:#fff;--bg2:#f7f6f3;--tx:#1a1a1a;--tx2:#666;--bd:rgba(0,0,0,0.1);
  --rad:10px;--radlg:14px;
}
@media(prefers-color-scheme:dark){:root{--bg:#1a1918;--bg2:#252422;--tx:#f0ede8;--tx2:#9e9a94;--bd:rgba(255,255,255,0.1);}}
body{font-family:'Helvetica Neue',Arial,sans-serif;background:var(--bg2);color:var(--tx);min-height:100vh;padding:2rem 1rem;}
.outer{max-width:820px;margin:0 auto;}
.page-eyebrow{font-size:11px;font-weight:700;color:var(--p600);letter-spacing:.08em;text-transform:uppercase;margin-bottom:5px;}
.page-title{font-size:24px;font-weight:700;color:var(--tx);line-height:1.2;margin-bottom:10px;}
.page-sub{font-size:14px;color:var(--tx2);margin-bottom:1rem;}
.prog-wrap{display:flex;gap:3px;margin-bottom:1.1rem;flex-wrap:wrap;}
.pb{height:4px;flex:1;min-width:10px;border-radius:2px;background:var(--bd);transition:background .3s;}
.pb.done{background:var(--p600);}
.pb.active{background:var(--p400);}
.card{background:var(--bg);border:1px solid var(--bd);border-radius:var(--radlg);overflow:hidden;min-height:460px;display:flex;flex-direction:column;}
.card-head{padding:1.25rem 1.5rem 1rem;border-bottom:1px solid var(--bd);}
.stag{font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;margin-bottom:5px;}
.stag.p{color:var(--p600);}
.stag.t{color:var(--t400);}
.stag.c{color:var(--c400);}
.stag.a{color:var(--a400);}
.stag.g{color:var(--g400);}
.stag.b{color:var(--b400);}
.stag.r{color:var(--r400);}
.stitle{font-size:22px;font-weight:700;color:var(--tx);line-height:1.25;}
.sbody{padding:1.25rem 1.5rem;flex:1;display:flex;flex-direction:column;gap:.9rem;}
.quote{background:var(--p50);border-left:3px solid var(--p600);border-radius:0 var(--rad) var(--rad) 0;padding:.8rem 1rem;font-size:14px;color:var(--p800);line-height:1.65;font-style:italic;}
.quote.teal{background:var(--t50);border-left-color:var(--t400);color:var(--t800);}
.quote.amber{background:var(--a50);border-left-color:var(--a400);color:var(--a800);}
.blist{display:flex;flex-direction:column;gap:10px;}
.b{display:flex;gap:10px;align-items:flex-start;font-size:14px;color:var(--tx);line-height:1.6;}
.dot{width:8px;height:8px;border-radius:50%;background:var(--p400);flex-shrink:0;margin-top:6px;}
.dot.t{background:var(--t400);}
.dot.c{background:var(--c400);}
.dot.a{background:var(--a400);}
.dot.g{background:var(--g400);}
.dot.b{background:var(--b400);}
.dot.r{background:var(--r400);}
.dot.p{background:var(--p400);}
.icard{background:var(--bg2);border-radius:var(--rad);padding:.8rem 1.05rem;border:1px solid var(--bd);}
.ictitle{font-size:11px;font-weight:700;color:var(--tx2);margin-bottom:5px;text-transform:uppercase;letter-spacing:.04em;}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
.grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;}
.sbox{border-radius:var(--rad);padding:.8rem .95rem;}
.sbox.p{background:var(--p50);border:1px solid var(--p100);}
.sbox.t{background:var(--t50);border:1px solid var(--t100);}
.sbox.a{background:var(--a50);border:1px solid var(--a100);}
.sbox.c{background:var(--c50);border:1px solid var(--c100);}
.sbox.b{background:var(--b50);border:1px solid var(--b100);}
.sbox.g{background:var(--g50);border:1px solid var(--g100);}
.sbox.r{background:var(--r50);border:1px solid #f09595;}
.sbox-title{font-size:13px;font-weight:700;margin-bottom:5px;}
.sbox.p .sbox-title{color:var(--p800);}
.sbox.t .sbox-title{color:var(--t800);}
.sbox.a .sbox-title{color:var(--a800);}
.sbox.c .sbox-title{color:var(--c800);}
.sbox.b .sbox-title{color:var(--b800);}
.sbox.g .sbox-title{color:var(--g800);}
.sbox.r .sbox-title{color:var(--r800);}
.sbox-body{font-size:12.5px;line-height:1.55;}
.sbox.p .sbox-body{color:var(--p800);}
.sbox.t .sbox-body{color:var(--t800);}
.sbox.a .sbox-body{color:var(--a800);}
.sbox.c .sbox-body{color:var(--c800);}
.sbox.b .sbox-body{color:var(--b800);}
.sbox.g .sbox-body{color:var(--g800);}
.sbox.r .sbox-body{color:var(--r800);}
.ctable{width:100%;border-collapse:collapse;font-size:12.5px;}
.ctable th{font-size:11px;font-weight:700;color:var(--tx2);text-align:left;padding:6px 9px;border-bottom:1px solid var(--bd);}
.ctable td{padding:6px 9px;border-bottom:1px solid var(--bd);color:var(--tx);}
.nav-row{display:flex;justify-content:space-between;align-items:center;margin-top:1.1rem;gap:12px;}
.nbtn{font-size:13px;font-weight:700;padding:9px 20px;border-radius:var(--rad);border:1px solid var(--bd);background:var(--bg);color:var(--tx);cursor:pointer;transition:background .15s;font-family:inherit;}
.nbtn:hover{background:var(--bg2);}
.nbtn.pri{background:var(--p600);color:#fff;border-color:var(--p600);}
.nbtn.pri:hover{background:var(--p800);}
.nbtn:disabled{opacity:.35;cursor:default;}
.scounter{font-size:13px;color:var(--tx2);}
.formula{background:var(--bg2);border:1px solid var(--bd);border-radius:var(--rad);padding:.85rem 1rem;font-size:14px;font-weight:700;color:var(--tx);text-align:center;letter-spacing:.01em;font-family:'SF Mono','Monaco','Consolas',monospace;}
.seg-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;}
.seg{border-radius:var(--rad);padding:.85rem 1rem;}
.seg.con{background:var(--b50);border:1px solid var(--b100);}
.seg.trd{background:var(--p50);border:1px solid var(--p100);}
.seg.ind{background:var(--t50);border:1px solid var(--t100);}
.seg-name{font-size:13px;font-weight:700;margin-bottom:5px;}
.seg.con .seg-name{color:var(--b800);}
.seg.trd .seg-name{color:var(--p800);}
.seg.ind .seg-name{color:var(--t800);}
.seg-text{font-size:12px;color:var(--tx2);line-height:1.5;}
</style>
</head>
<body>
<div class="outer">
  <div class="page-eyebrow">${esc(courseName)}</div>
  <div class="page-title">${esc(deckTitle)}</div>
  ${subtitle ? `<div class="page-sub">${esc(subtitle)}</div>` : ""}
  <div class="prog-wrap" id="prog"></div>
  <div class="card">
    <div class="card-head">
      <div class="stag" id="stag"></div>
      <div class="stitle" id="stitle"></div>
    </div>
    <div class="sbody" id="sbody"></div>
  </div>
  <div class="nav-row">
    <button class="nbtn" id="pbtn" onclick="nav(-1)">← Back</button>
    <span class="scounter" id="sctr"></span>
    <button class="nbtn pri" id="nbtn" onclick="nav(1)">Next →</button>
  </div>
</div>
<script>
const S=[
${slideData}
];
let cur=0;
function rp(){document.getElementById('prog').innerHTML=S.map((_,i)=>'<div class="pb '+(i<cur?'done':i===cur?'active':'')+'"></div>').join('');}
function rs(){
  const s=S[cur];
  const el=document.getElementById('stag');
  el.textContent=s.tag; el.className='stag '+s.cls;
  document.getElementById('stitle').textContent=s.title;
  document.getElementById('sbody').innerHTML=s.body;
  document.getElementById('sctr').textContent=(cur+1)+' of '+S.length;
  document.getElementById('pbtn').disabled=cur===0;
  const nb=document.getElementById('nbtn');
  nb.disabled=cur===S.length-1;
  nb.textContent=cur===S.length-1?'Complete':'Next →';
  rp();
}
function nav(d){cur=Math.max(0,Math.min(S.length-1,cur+d));rs();window.scrollTo(0,0);}
document.addEventListener('keydown',(e)=>{if(e.key==='ArrowLeft')nav(-1);if(e.key==='ArrowRight')nav(1);});
rs();
</script>
</body>
</html>`;
}
