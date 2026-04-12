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

// ── Graph / data-viz component interfaces ──

export interface BarItem {
  label: string;
  value: number;
  color?: SlideColor;
}

export interface LineSeries {
  label: string;
  points: [number, number][]; // [x, y] pairs
  color?: SlideColor;
}

export interface PieSlice {
  label: string;
  value: number;
  color?: SlideColor;
}

export interface MetricItem {
  label: string;
  value: string;        // e.g. "$12.5M"
  delta?: string;       // e.g. "+23%" or "↓8%"
  color?: SlideColor;
}

export interface ProgressItem {
  label: string;
  percent: number;      // 0–100
  color?: SlideColor;
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
  | { type: "segments"; items: SegmentItem[] }
  // ── New: graphs & data-viz ──
  | { type: "barchart"; title: string; bars: BarItem[]; unit?: string }
  | { type: "linechart"; title: string; series: LineSeries[]; xLabel?: string; yLabel?: string }
  | { type: "piechart"; title: string; slices: PieSlice[] }
  | { type: "metrics"; items: MetricItem[] }
  | { type: "progress"; title?: string; items: ProgressItem[] };

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

// ── Graph renderers (HTML + inline SVG) ──

function autoColor(i: number): SlideColor {
  const palette: SlideColor[] = ["t", "p", "a", "b", "c", "g"];
  return palette[i % palette.length];
}

function renderBarChart(c: { type: "barchart"; title: string; bars: BarItem[]; unit?: string }): string {
  const bars = c.bars.slice(0, 10);
  const maxValue = Math.max(...bars.map((b) => b.value), 1);
  const rows = bars
    .map((b, i) => {
      const pct = ((b.value / maxValue) * 100).toFixed(1);
      const color = b.color || autoColor(i);
      return `<div class="bar-row">
        <div class="bar-label">${esc(b.label)}</div>
        <div class="bar-track"><div class="bar-fill ${color}" style="width:${pct}%;"></div></div>
        <div class="bar-value ${color}">${esc(String(b.value))}${c.unit ? esc(c.unit) : ""}</div>
      </div>`;
    })
    .join("");
  return `<div class="chart-card"><div class="chart-title">${esc(c.title)}</div>${rows}</div>`;
}

function renderLineChart(c: { type: "linechart"; title: string; series: LineSeries[]; xLabel?: string; yLabel?: string }): string {
  const W2 = 720;
  const H2 = 240;
  const padL = 50, padR = 20, padT = 20, padB = 40;
  const plotW = W2 - padL - padR;
  const plotH = H2 - padT - padB;

  const allPoints = c.series.flatMap((s) => s.points);
  if (allPoints.length === 0) return `<div class="chart-card"><div class="chart-title">${esc(c.title)}</div></div>`;

  const xs = allPoints.map((p) => p[0]);
  const ys = allPoints.map((p) => p[1]);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(0, ...ys), yMax = Math.max(...ys);
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;

  const sx = (x: number) => padL + ((x - xMin) / xRange) * plotW;
  const sy = (y: number) => padT + plotH - ((y - yMin) / yRange) * plotH;

  const svgParts: string[] = [];
  // Axes
  svgParts.push(`<line x1="${padL}" y1="${padT + plotH}" x2="${padL + plotW}" y2="${padT + plotH}" stroke="var(--tx2)" stroke-width="1"/>`);
  svgParts.push(`<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" stroke="var(--tx2)" stroke-width="1"/>`);

  // Gridlines
  for (let g = 1; g <= 4; g++) {
    const gy = padT + plotH - (plotH * g) / 4;
    svgParts.push(`<line x1="${padL}" y1="${gy}" x2="${padL + plotW}" y2="${gy}" stroke="var(--bd)" stroke-width="1" stroke-dasharray="3 3"/>`);
    const val = yMin + (yRange * g) / 4;
    svgParts.push(`<text x="${padL - 8}" y="${gy + 4}" text-anchor="end" font-size="10" fill="var(--tx2)">${val.toFixed(yRange < 10 ? 1 : 0)}</text>`);
  }

  // Lines
  const colorMap: Record<string, string> = {
    p: "#534AB7", t: "#1D9E75", a: "#BA7517", b: "#378ADD", c: "#D85A30", g: "#639922", r: "#E24B4A",
  };

  for (let si = 0; si < c.series.length; si++) {
    const s = c.series[si];
    const col = colorMap[s.color || autoColor(si)];
    const path = s.points.map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p[0]).toFixed(1)} ${sy(p[1]).toFixed(1)}`).join(" ");
    svgParts.push(`<path d="${path}" fill="none" stroke="${col}" stroke-width="2.5" stroke-linecap="round"/>`);
    for (const p of s.points) {
      svgParts.push(`<circle cx="${sx(p[0]).toFixed(1)}" cy="${sy(p[1]).toFixed(1)}" r="3.5" fill="${col}"/>`);
    }
  }

  const legend = c.series.length > 1
    ? `<div class="chart-legend">${c.series
        .map((s, i) => `<span class="chart-legend-item"><span class="chart-dot" style="background:${colorMap[s.color || autoColor(i)]}"></span>${esc(s.label)}</span>`)
        .join("")}</div>`
    : "";

  return `<div class="chart-card"><div class="chart-title">${esc(c.title)}</div>
    <svg viewBox="0 0 ${W2} ${H2}" style="width:100%;height:auto;">${svgParts.join("")}</svg>
    ${legend}
  </div>`;
}

function renderPieChart(c: { type: "piechart"; title: string; slices: PieSlice[] }): string {
  const slices = c.slices.slice(0, 8);
  const total = slices.reduce((acc, s) => acc + s.value, 0) || 1;
  const colorMap: Record<string, string> = {
    p: "#534AB7", t: "#1D9E75", a: "#BA7517", b: "#378ADD", c: "#D85A30", g: "#639922", r: "#E24B4A",
  };

  const cx = 120, cy = 120, r = 100;
  let currentAngle = -Math.PI / 2;
  const paths: string[] = [];
  const legendItems: string[] = [];

  for (let i = 0; i < slices.length; i++) {
    const slice = slices[i];
    const col = colorMap[slice.color || autoColor(i)];
    const fraction = slice.value / total;
    const sliceAngle = fraction * Math.PI * 2;
    const endAngle = currentAngle + sliceAngle;

    const x1 = cx + r * Math.cos(currentAngle);
    const y1 = cy + r * Math.sin(currentAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc = sliceAngle > Math.PI ? 1 : 0;
    const d = `M ${cx} ${cy} L ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z`;
    paths.push(`<path d="${d}" fill="${col}" opacity="0.85" stroke="var(--bg)" stroke-width="2"/>`);

    const pct = ((slice.value / total) * 100).toFixed(0);
    legendItems.push(`<div class="pie-legend-row"><span class="chart-dot" style="background:${col}"></span><span class="pie-legend-label">${esc(slice.label)}</span><span class="pie-legend-pct">${pct}%</span></div>`);

    currentAngle = endAngle;
  }
  // Donut hole
  paths.push(`<circle cx="${cx}" cy="${cy}" r="55" fill="var(--bg)"/>`);

  return `<div class="chart-card"><div class="chart-title">${esc(c.title)}</div>
    <div class="pie-wrap">
      <svg viewBox="0 0 240 240" style="width:240px;flex-shrink:0;">${paths.join("")}</svg>
      <div class="pie-legend">${legendItems.join("")}</div>
    </div>
  </div>`;
}

function renderMetrics(c: { type: "metrics"; items: MetricItem[] }): string {
  const items = c.items.slice(0, 4);
  const cols = items
    .map((item, i) => {
      const color = item.color || autoColor(i);
      const isPositive = item.delta?.startsWith("+") || item.delta?.startsWith("↑");
      return `<div class="metric-card ${color}">
        <div class="metric-label">${esc(item.label)}</div>
        <div class="metric-value">${esc(item.value)}</div>
        ${item.delta ? `<div class="metric-delta ${isPositive ? "up" : "down"}">${esc(item.delta)}</div>` : ""}
      </div>`;
    })
    .join("");
  return `<div class="metrics-grid cols-${items.length}">${cols}</div>`;
}

function renderProgress(c: { type: "progress"; title?: string; items: ProgressItem[] }): string {
  const rows = c.items
    .slice(0, 6)
    .map((item, i) => {
      const color = item.color || autoColor(i);
      const pct = Math.min(100, Math.max(0, item.percent));
      return `<div class="progress-row">
        <div class="progress-label">${esc(item.label)}</div>
        <div class="progress-track"><div class="progress-fill ${color}" style="width:${pct}%;"></div></div>
        <div class="progress-pct ${color}">${pct.toFixed(0)}%</div>
      </div>`;
    })
    .join("");
  return `<div class="chart-card">${c.title ? `<div class="chart-title">${esc(c.title)}</div>` : ""}${rows}</div>`;
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
    case "barchart":
      return renderBarChart(c);
    case "linechart":
      return renderLineChart(c);
    case "piechart":
      return renderPieChart(c);
    case "metrics":
      return renderMetrics(c);
    case "progress":
      return renderProgress(c);
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

/* ── Graphs & data-viz ── */
.chart-card{background:var(--bg2);border-radius:var(--rad);padding:14px 16px;border:1px solid var(--bd);}
.chart-title{font-size:13px;font-weight:700;color:var(--tx);margin-bottom:10px;}
.chart-legend{display:flex;gap:16px;flex-wrap:wrap;margin-top:8px;font-size:11px;color:var(--tx2);}
.chart-legend-item{display:inline-flex;align-items:center;gap:5px;}
.chart-dot{display:inline-block;width:10px;height:10px;border-radius:50%;}
.bar-row{display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:12px;}
.bar-label{width:110px;color:var(--tx);font-weight:500;flex-shrink:0;}
.bar-track{flex:1;height:14px;background:var(--bd);border-radius:7px;overflow:hidden;}
.bar-fill{height:100%;border-radius:7px;transition:width .4s;}
.bar-fill.p{background:#534AB7;}
.bar-fill.t{background:#1D9E75;}
.bar-fill.c{background:#D85A30;}
.bar-fill.a{background:#BA7517;}
.bar-fill.b{background:#378ADD;}
.bar-fill.g{background:#639922;}
.bar-fill.r{background:#E24B4A;}
.bar-value{width:60px;text-align:right;font-weight:700;font-family:monospace;flex-shrink:0;}
.bar-value.p{color:#534AB7;} .bar-value.t{color:#1D9E75;} .bar-value.c{color:#D85A30;}
.bar-value.a{color:#BA7517;} .bar-value.b{color:#378ADD;} .bar-value.g{color:#639922;}
.pie-wrap{display:flex;gap:20px;align-items:center;}
.pie-legend{display:flex;flex-direction:column;gap:6px;flex:1;font-size:12px;}
.pie-legend-row{display:flex;align-items:center;gap:8px;}
.pie-legend-label{flex:1;color:var(--tx);}
.pie-legend-pct{font-weight:700;font-family:monospace;color:var(--tx);}
.metrics-grid{display:grid;gap:10px;}
.metrics-grid.cols-2{grid-template-columns:repeat(2,1fr);}
.metrics-grid.cols-3{grid-template-columns:repeat(3,1fr);}
.metrics-grid.cols-4{grid-template-columns:repeat(4,1fr);}
.metric-card{border-radius:var(--rad);padding:12px 14px;border:1px solid var(--bd);}
.metric-card.p{background:var(--p50);border-color:var(--p100);}
.metric-card.t{background:var(--t50);border-color:var(--t100);}
.metric-card.c{background:var(--c50);border-color:var(--c100);}
.metric-card.a{background:var(--a50);border-color:var(--a100);}
.metric-card.b{background:var(--b50);border-color:var(--b100);}
.metric-card.g{background:var(--g50);border-color:var(--g100);}
.metric-label{font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--tx2);margin-bottom:4px;}
.metric-value{font-size:26px;font-weight:700;font-family:'Playfair Display',serif;line-height:1.1;}
.metric-card.p .metric-value{color:var(--p800);}
.metric-card.t .metric-value{color:var(--t800);}
.metric-card.c .metric-value{color:var(--c800);}
.metric-card.a .metric-value{color:var(--a800);}
.metric-card.b .metric-value{color:var(--b800);}
.metric-card.g .metric-value{color:var(--g800);}
.metric-delta{font-size:12px;font-weight:700;margin-top:4px;}
.metric-delta.up{color:var(--g800);}
.metric-delta.down{color:var(--r800);}
.progress-row{display:flex;align-items:center;gap:10px;margin-bottom:8px;font-size:12px;}
.progress-label{width:140px;color:var(--tx);font-weight:500;flex-shrink:0;}
.progress-track{flex:1;height:10px;background:var(--bd);border-radius:5px;overflow:hidden;}
.progress-fill{height:100%;border-radius:5px;}
.progress-fill.p{background:#534AB7;}
.progress-fill.t{background:#1D9E75;}
.progress-fill.c{background:#D85A30;}
.progress-fill.a{background:#BA7517;}
.progress-fill.b{background:#378ADD;}
.progress-fill.g{background:#639922;}
.progress-pct{width:45px;text-align:right;font-weight:700;font-family:monospace;flex-shrink:0;}
.progress-pct.p{color:#534AB7;} .progress-pct.t{color:#1D9E75;} .progress-pct.c{color:#D85A30;}
.progress-pct.a{color:#BA7517;} .progress-pct.b{color:#378ADD;} .progress-pct.g{color:#639922;}
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
