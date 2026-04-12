/**
 * Rich slide SVG renderer for videos.
 *
 * Takes a slide in the same JSON format as the HTML slide deck
 * (tag, title, body components) and produces a 1920×1080 SVG rendering
 * on a dark background, suitable for conversion to PNG via resvg-js and
 * compositing into an MP4 video with FFmpeg.
 *
 * Reuses the existing video pipeline (resvg-js + DejaVu fonts + FFmpeg)
 * so it runs on Railway with zero new dependencies.
 *
 * Supported components (from slideDeckTemplate.ts):
 *   - bullets, sbox, grid2, grid3, quote, formula, icard, table, segments
 */

import type {
  Slide,
  SlideColor,
  SlideComponent,
  SBoxItem,
  BarItem,
  LineSeries,
  PieSlice,
  MetricItem,
  ProgressItem,
} from "./slideDeckTemplate";

const W = 1920;
const H = 1080;

// VIBRANT colors — bright and saturated for a punchy cinematic look on dark bg
const COLORS: Record<SlideColor, { fg: string; bg: string; border: string }> = {
  p: { fg: "#D4CFFF", bg: "#7B6EF6", border: "#B8B0FF" }, // vivid purple
  t: { fg: "#6EEDC8", bg: "#22C993", border: "#6EEDC8" }, // vivid teal
  c: { fg: "#FFAB91", bg: "#FF6E40", border: "#FFAB91" }, // vivid coral
  a: { fg: "#FFD54F", bg: "#FFB300", border: "#FFD54F" }, // vivid amber/gold
  b: { fg: "#90CAF9", bg: "#42A5F5", border: "#90CAF9" }, // vivid blue
  g: { fg: "#A5D66F", bg: "#7CB342", border: "#A5D66F" }, // vivid green
  r: { fg: "#FF8A80", bg: "#FF5252", border: "#FF8A80" }, // vivid red
};

const BG      = "#0A0C12";  // deep dark blue-black
const CARD_BG = "#161A24";  // slightly lighter card
const TEXT    = "#FFFFFF";   // pure white for maximum readability
const MUTED   = "#A8A0B4";  // lighter, cooler grey (was brownish)
const BORDER  = "#2D3244";  // cool-toned border

// ── XML escape ──
function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Strip **bold** markers (SVG doesn't support inline bold)
function stripBold(s: string): string {
  return s.replace(/\*\*(.+?)\*\*/g, "$1");
}

// Wrap text at word boundaries to fit a max character width
function wrapText(text: string, maxChars: number): string[] {
  const clean = stripBold(text);
  const words = clean.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > maxChars) {
      if (current.trim()) lines.push(current.trim());
      current = word;
    } else {
      current = current ? current + " " + word : word;
    }
  }
  if (current.trim()) lines.push(current.trim());
  return lines;
}

// ── Layout constants ──
const PAD_X = 100;
const BODY_W = W - PAD_X * 2; // 1720
const BODY_START_Y = 240;
const BODY_END_Y = 1000;
const BODY_H = BODY_END_Y - BODY_START_Y; // 760

// ── Component renderers (each returns SVG string + height consumed) ──

function renderSBox(box: SBoxItem, x: number, y: number, width: number, height: number): string {
  const color = COLORS[box.color] || COLORS.p;
  const titleLines = wrapText(box.title, Math.floor(width / 14));
  const bodyLines = wrapText(box.body, Math.floor(width / 11));
  const maxTitleLines = Math.min(titleLines.length, 2);
  const maxBodyLines = Math.min(bodyLines.length, Math.floor((height - 60) / 32));

  let out = "";
  // Background fill (semi-transparent) + border
  out += `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="14" fill="${color.bg}" fill-opacity="0.30" stroke="${color.bg}" stroke-opacity="0.80" stroke-width="2"/>\n`;

  // Title
  let cy = y + 42;
  for (let i = 0; i < maxTitleLines; i++) {
    out += `<text x="${x + 24}" y="${cy}" fill="${color.fg}" font-size="26" font-weight="bold" font-family="sans-serif">${esc(titleLines[i])}</text>\n`;
    cy += 32;
  }
  cy += 8;

  // Body
  for (let i = 0; i < maxBodyLines; i++) {
    out += `<text x="${x + 24}" y="${cy}" fill="${TEXT}" font-size="22" font-family="sans-serif">${esc(bodyLines[i])}</text>\n`;
    cy += 32;
  }
  return out;
}

function renderGrid(c: { type: "grid2" | "grid3"; boxes: SBoxItem[] }, y: number): { svg: string; height: number } {
  const isGrid2 = c.type === "grid2";
  const cols = isGrid2 ? 2 : 3;
  const gap = 24;
  const boxW = Math.floor((BODY_W - gap * (cols - 1)) / cols);
  const boxH = 280;

  let out = "";
  const boxes = c.boxes.slice(0, cols);
  for (let i = 0; i < boxes.length; i++) {
    const bx = PAD_X + i * (boxW + gap);
    out += renderSBox(boxes[i], bx, y, boxW, boxH);
  }
  return { svg: out, height: boxH + 20 };
}

function renderQuote(c: { type: "quote"; text: string; color?: "p" | "t" | "a" }, y: number): { svg: string; height: number } {
  const col = COLORS[(c.color || "p") as SlideColor];
  const lines = wrapText(c.text, 110);
  const maxLines = Math.min(lines.length, 4);
  const h = 40 + maxLines * 38 + 30;

  let out = "";
  // Background + left border — more visible on dark bg
  out += `<rect x="${PAD_X}" y="${y}" width="${BODY_W}" height="${h}" rx="12" fill="${col.bg}" fill-opacity="0.25"/>\n`;
  out += `<rect x="${PAD_X}" y="${y}" width="8" height="${h}" fill="${col.fg}"/>\n`;

  let cy = y + 45;
  for (let i = 0; i < maxLines; i++) {
    out += `<text x="${PAD_X + 32}" y="${cy}" fill="${col.fg}" font-size="26" font-style="italic" font-family="serif">${esc(lines[i])}</text>\n`;
    cy += 38;
  }
  return { svg: out, height: h + 20 };
}

function renderFormula(c: { type: "formula"; text: string }, y: number): { svg: string; height: number } {
  const h = 100;
  const text = stripBold(c.text);

  let out = "";
  // Formula panel with vivid blue accent border
  out += `<rect x="${PAD_X}" y="${y}" width="${BODY_W}" height="${h}" rx="12" fill="${CARD_BG}" stroke="${COLORS.b.bg}" stroke-opacity="0.6" stroke-width="2"/>\n`;
  out += `<text x="${W / 2}" y="${y + h / 2 + 12}" text-anchor="middle" fill="${COLORS.b.fg}" font-size="34" font-weight="bold" font-family="monospace">${esc(text)}</text>\n`;
  return { svg: out, height: h + 20 };
}

function renderICard(c: { type: "icard"; title: string; body: string }, y: number): { svg: string; height: number } {
  const lines = wrapText(c.body, 110);
  const maxLines = Math.min(lines.length, 5);
  const h = 50 + maxLines * 34 + 24;

  let out = "";
  // Card with amber accent border for examples/case studies
  out += `<rect x="${PAD_X}" y="${y}" width="${BODY_W}" height="${h}" rx="12" fill="${CARD_BG}" stroke="${COLORS.a.bg}" stroke-opacity="0.5" stroke-width="2"/>\n`;
  out += `<text x="${PAD_X + 24}" y="${y + 32}" fill="${COLORS.a.fg}" font-size="16" font-weight="bold" font-family="monospace" letter-spacing="2">${esc(c.title.toUpperCase())}</text>\n`;

  let cy = y + 66;
  for (let i = 0; i < maxLines; i++) {
    out += `<text x="${PAD_X + 24}" y="${cy}" fill="${TEXT}" font-size="22" font-family="sans-serif">${esc(lines[i])}</text>\n`;
    cy += 34;
  }
  return { svg: out, height: h + 20 };
}

function renderBullets(
  c: { type: "bullets"; items: { text: string; color?: SlideColor }[] },
  y: number
): { svg: string; height: number } {
  let out = "";
  let cy = y + 8;
  const items = c.items.slice(0, 6);

  for (const item of items) {
    const col = COLORS[item.color || "p"];
    const lines = wrapText(item.text, 95);
    const maxLines = Math.min(lines.length, 3);
    // Colored dot
    out += `<circle cx="${PAD_X + 16}" cy="${cy + 2}" r="8" fill="${col.fg}"/>\n`;
    for (let i = 0; i < maxLines; i++) {
      // First line uses the accent color, remaining lines are white
      const fill = i === 0 ? col.fg : TEXT;
      out += `<text x="${PAD_X + 40}" y="${cy + i * 34}" fill="${fill}" font-size="24" font-family="sans-serif">${esc(lines[i])}</text>\n`;
    }
    cy += maxLines * 34 + 16;
  }
  return { svg: out, height: cy - y + 10 };
}

function renderTable(
  c: { type: "table"; headers: string[]; rows: { cells: string[] }[] },
  y: number
): { svg: string; height: number } {
  const cols = c.headers.length || 1;
  const colW = Math.floor(BODY_W / cols);
  const rowH = 50;
  const maxRows = Math.min(c.rows.length, 8);
  const h = rowH * (maxRows + 1) + 24;

  let out = "";
  out += `<rect x="${PAD_X}" y="${y}" width="${BODY_W}" height="${h}" rx="12" fill="${CARD_BG}" stroke="${BORDER}" stroke-width="1.5"/>\n`;

  // Header row — colored for visual pop
  for (let i = 0; i < cols; i++) {
    const hx = PAD_X + i * colW + 24;
    out += `<text x="${hx}" y="${y + 40}" fill="${COLORS.b.fg}" font-size="18" font-weight="bold" font-family="monospace" letter-spacing="1">${esc(stripBold(c.headers[i] || "").toUpperCase())}</text>\n`;
  }
  // Divider under header
  out += `<line x1="${PAD_X + 16}" y1="${y + rowH + 4}" x2="${PAD_X + BODY_W - 16}" y2="${y + rowH + 4}" stroke="${BORDER}" stroke-width="1"/>\n`;

  // Data rows
  for (let r = 0; r < maxRows; r++) {
    const row = c.rows[r];
    const ry = y + rowH * (r + 1) + 38;
    for (let i = 0; i < cols; i++) {
      const cx = PAD_X + i * colW + 24;
      const txt = stripBold(row.cells[i] || "").slice(0, 32);
      out += `<text x="${cx}" y="${ry}" fill="${TEXT}" font-size="20" font-family="sans-serif">${esc(txt)}</text>\n`;
    }
    if (r < maxRows - 1) {
      out += `<line x1="${PAD_X + 16}" y1="${ry + 12}" x2="${PAD_X + BODY_W - 16}" y2="${ry + 12}" stroke="${BORDER}" stroke-opacity="0.5" stroke-width="1"/>\n`;
    }
  }
  return { svg: out, height: h + 20 };
}

function renderSegments(
  c: { type: "segments"; items: { color: "con" | "trd" | "ind"; name: string; text: string }[] },
  y: number
): { svg: string; height: number } {
  const segColors: Record<string, SlideColor> = { con: "b", trd: "p", ind: "t" };
  const cols = 3;
  const gap = 24;
  const boxW = Math.floor((BODY_W - gap * (cols - 1)) / cols);
  const boxH = 280;

  let out = "";
  const items = c.items.slice(0, 3);
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const box: SBoxItem = {
      color: segColors[item.color] || "p",
      title: item.name,
      body: item.text,
    };
    const bx = PAD_X + i * (boxW + gap);
    out += renderSBox(box, bx, y, boxW, boxH);
  }
  return { svg: out, height: boxH + 20 };
}

// ── Graph / data-viz renderers ──

function pickColors(count: number): SlideColor[] {
  const palette: SlideColor[] = ["t", "p", "a", "b", "c", "g", "r"];
  return Array.from({ length: count }, (_, i) => palette[i % palette.length]);
}

function renderBarChart(
  c: { type: "barchart"; title: string; bars: BarItem[]; unit?: string },
  y: number
): { svg: string; height: number } {
  const h = 380;
  const chartX = PAD_X + 40;
  const chartY = y + 80;
  const chartW = BODY_W - 80;
  const chartH = 240;

  const bars = c.bars.slice(0, 8);
  const maxValue = Math.max(...bars.map((b) => b.value), 1);
  const barGap = 16;
  const barW = Math.floor((chartW - barGap * (bars.length - 1)) / bars.length);

  let out = "";
  // Card background
  out += `<rect x="${PAD_X}" y="${y}" width="${BODY_W}" height="${h}" rx="12" fill="${CARD_BG}" stroke="${BORDER}" stroke-width="1.5"/>\n`;

  // Title
  out += `<text x="${PAD_X + 24}" y="${y + 40}" fill="${TEXT}" font-size="26" font-weight="bold" font-family="sans-serif">${esc(stripBold(c.title))}</text>\n`;

  // Y-axis line
  out += `<line x1="${chartX}" y1="${chartY}" x2="${chartX}" y2="${chartY + chartH}" stroke="${BORDER}" stroke-width="1.5"/>\n`;
  // X-axis line
  out += `<line x1="${chartX}" y1="${chartY + chartH}" x2="${chartX + chartW}" y2="${chartY + chartH}" stroke="${BORDER}" stroke-width="1.5"/>\n`;

  // Gridlines (horizontal, 4 steps)
  for (let g = 1; g <= 4; g++) {
    const gy = chartY + chartH - (chartH * g) / 4;
    out += `<line x1="${chartX}" y1="${gy}" x2="${chartX + chartW}" y2="${gy}" stroke="${BORDER}" stroke-opacity="0.4" stroke-width="1" stroke-dasharray="4 4"/>\n`;
  }

  // Bars
  const barColors = pickColors(bars.length);
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const col = COLORS[bar.color || barColors[i]];
    const bh = (bar.value / maxValue) * chartH;
    const bx = chartX + 10 + i * (barW + barGap);
    const by = chartY + chartH - bh;
    // Bar fill with gradient-like double rect
    out += `<rect x="${bx}" y="${by}" width="${barW - 20}" height="${bh}" rx="4" fill="${col.bg}" fill-opacity="0.85"/>\n`;
    out += `<rect x="${bx}" y="${by}" width="${barW - 20}" height="6" rx="3" fill="${col.fg}"/>\n`;
    // Value label above bar
    out += `<text x="${bx + (barW - 20) / 2}" y="${by - 10}" text-anchor="middle" fill="${col.fg}" font-size="20" font-weight="bold" font-family="sans-serif">${esc(String(bar.value))}${c.unit ? esc(c.unit) : ""}</text>\n`;
    // Label below bar
    out += `<text x="${bx + (barW - 20) / 2}" y="${chartY + chartH + 28}" text-anchor="middle" fill="${TEXT}" font-size="18" font-family="sans-serif">${esc(stripBold(bar.label).slice(0, 14))}</text>\n`;
  }

  return { svg: out, height: h + 20 };
}

function renderLineChart(
  c: { type: "linechart"; title: string; series: LineSeries[]; xLabel?: string; yLabel?: string },
  y: number
): { svg: string; height: number } {
  const h = 380;
  const chartX = PAD_X + 80;
  const chartY = y + 80;
  const chartW = BODY_W - 120;
  const chartH = 230;

  const allPoints = c.series.flatMap((s) => s.points);
  if (allPoints.length === 0) return { svg: "", height: 0 };
  const xs = allPoints.map((p) => p[0]);
  const ys = allPoints.map((p) => p[1]);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(0, ...ys), yMax = Math.max(...ys);
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;

  const scaleX = (x: number) => chartX + ((x - xMin) / xRange) * chartW;
  const scaleY = (y2: number) => chartY + chartH - ((y2 - yMin) / yRange) * chartH;

  let out = "";
  out += `<rect x="${PAD_X}" y="${y}" width="${BODY_W}" height="${h}" rx="12" fill="${CARD_BG}" stroke="${BORDER}" stroke-width="1.5"/>\n`;
  out += `<text x="${PAD_X + 24}" y="${y + 40}" fill="${TEXT}" font-size="26" font-weight="bold" font-family="sans-serif">${esc(stripBold(c.title))}</text>\n`;

  // Axes
  out += `<line x1="${chartX}" y1="${chartY}" x2="${chartX}" y2="${chartY + chartH}" stroke="${BORDER}" stroke-width="1.5"/>\n`;
  out += `<line x1="${chartX}" y1="${chartY + chartH}" x2="${chartX + chartW}" y2="${chartY + chartH}" stroke="${BORDER}" stroke-width="1.5"/>\n`;

  // Y-axis gridlines & labels (4 steps)
  for (let g = 0; g <= 4; g++) {
    const val = yMin + (yRange * g) / 4;
    const gy = scaleY(val);
    if (g > 0) {
      out += `<line x1="${chartX}" y1="${gy}" x2="${chartX + chartW}" y2="${gy}" stroke="${BORDER}" stroke-opacity="0.35" stroke-width="1" stroke-dasharray="4 4"/>\n`;
    }
    out += `<text x="${chartX - 10}" y="${gy + 6}" text-anchor="end" fill="${MUTED}" font-size="16" font-family="sans-serif">${esc(val.toFixed(yRange < 10 ? 1 : 0))}</text>\n`;
  }

  // Plot each series
  const seriesColors = pickColors(c.series.length);
  for (let si = 0; si < c.series.length; si++) {
    const s = c.series[si];
    const col = COLORS[s.color || seriesColors[si]];
    // Line
    const pathPoints = s.points.map((p, i) => `${i === 0 ? "M" : "L"} ${scaleX(p[0]).toFixed(1)} ${scaleY(p[1]).toFixed(1)}`).join(" ");
    out += `<path d="${pathPoints}" fill="none" stroke="${col.bg}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>\n`;
    // Data points
    for (const p of s.points) {
      out += `<circle cx="${scaleX(p[0]).toFixed(1)}" cy="${scaleY(p[1]).toFixed(1)}" r="5" fill="${col.fg}" stroke="${col.bg}" stroke-width="2"/>\n`;
    }
  }

  // Legend (top-right, if multiple series)
  if (c.series.length > 1) {
    let lx = PAD_X + BODY_W - 40;
    const ly = y + 40;
    for (let si = c.series.length - 1; si >= 0; si--) {
      const s = c.series[si];
      const col = COLORS[s.color || seriesColors[si]];
      const label = stripBold(s.label).slice(0, 16);
      const labelW = label.length * 10 + 40;
      lx -= labelW;
      out += `<rect x="${lx}" y="${ly - 14}" width="14" height="14" fill="${col.bg}" rx="2"/>\n`;
      out += `<text x="${lx + 20}" y="${ly - 2}" fill="${TEXT}" font-size="16" font-family="sans-serif">${esc(label)}</text>\n`;
      lx -= 12;
    }
  }

  return { svg: out, height: h + 20 };
}

function renderPieChart(
  c: { type: "piechart"; title: string; slices: PieSlice[] },
  y: number
): { svg: string; height: number } {
  const h = 380;
  const cx = PAD_X + 220;
  const cy = y + h / 2 + 20;
  const r = 140;

  const slices = c.slices.slice(0, 8);
  const total = slices.reduce((acc, s) => acc + s.value, 0) || 1;
  const sliceColors = pickColors(slices.length);

  let out = "";
  out += `<rect x="${PAD_X}" y="${y}" width="${BODY_W}" height="${h}" rx="12" fill="${CARD_BG}" stroke="${BORDER}" stroke-width="1.5"/>\n`;
  out += `<text x="${PAD_X + 24}" y="${y + 40}" fill="${TEXT}" font-size="26" font-weight="bold" font-family="sans-serif">${esc(stripBold(c.title))}</text>\n`;

  // Pie slices
  let currentAngle = -Math.PI / 2; // start at top
  for (let i = 0; i < slices.length; i++) {
    const slice = slices[i];
    const col = COLORS[slice.color || sliceColors[i]];
    const fraction = slice.value / total;
    const sliceAngle = fraction * Math.PI * 2;
    const endAngle = currentAngle + sliceAngle;

    const x1 = cx + r * Math.cos(currentAngle);
    const y1 = cy + r * Math.sin(currentAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc = sliceAngle > Math.PI ? 1 : 0;

    const pathD = `M ${cx} ${cy} L ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z`;
    out += `<path d="${pathD}" fill="${col.bg}" fill-opacity="0.85" stroke="${BG}" stroke-width="3"/>\n`;

    currentAngle = endAngle;
  }

  // Donut hole for aesthetic
  out += `<circle cx="${cx}" cy="${cy}" r="70" fill="${CARD_BG}"/>\n`;

  // Legend on the right
  const legendX = PAD_X + 480;
  let ly = y + 80;
  for (let i = 0; i < slices.length; i++) {
    const slice = slices[i];
    const col = COLORS[slice.color || sliceColors[i]];
    const pct = ((slice.value / total) * 100).toFixed(0);
    out += `<rect x="${legendX}" y="${ly - 16}" width="20" height="20" rx="3" fill="${col.bg}" fill-opacity="0.85"/>\n`;
    out += `<text x="${legendX + 30}" y="${ly}" fill="${TEXT}" font-size="22" font-family="sans-serif">${esc(stripBold(slice.label).slice(0, 26))}</text>\n`;
    out += `<text x="${legendX + 30 + 420}" y="${ly}" fill="${col.fg}" font-size="22" font-weight="bold" font-family="monospace">${pct}%</text>\n`;
    ly += 38;
  }

  return { svg: out, height: h + 20 };
}

function renderMetrics(
  c: { type: "metrics"; items: MetricItem[] },
  y: number
): { svg: string; height: number } {
  const h = 200;
  const items = c.items.slice(0, 4);
  const gap = 20;
  const cardW = Math.floor((BODY_W - gap * (items.length - 1)) / items.length);

  let out = "";
  const itemColors = pickColors(items.length);
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const col = COLORS[item.color || itemColors[i]];
    const bx = PAD_X + i * (cardW + gap);

    // Card
    out += `<rect x="${bx}" y="${y}" width="${cardW}" height="${h}" rx="14" fill="${col.bg}" fill-opacity="0.15" stroke="${col.bg}" stroke-opacity="0.5" stroke-width="2"/>\n`;
    // Label (small caps)
    out += `<text x="${bx + 24}" y="${y + 40}" fill="${MUTED}" font-size="16" font-weight="bold" font-family="monospace" letter-spacing="2">${esc(stripBold(item.label).toUpperCase().slice(0, 22))}</text>\n`;
    // Big value
    out += `<text x="${bx + 24}" y="${y + 110}" fill="${col.fg}" font-size="54" font-weight="bold" font-family="serif">${esc(stripBold(item.value).slice(0, 10))}</text>\n`;
    // Delta (if present)
    if (item.delta) {
      const isPositive = item.delta.startsWith("+") || item.delta.startsWith("↑");
      const deltaColor = isPositive ? COLORS.g.fg : COLORS.r.fg;
      out += `<text x="${bx + 24}" y="${y + 155}" fill="${deltaColor}" font-size="22" font-weight="bold" font-family="sans-serif">${esc(stripBold(item.delta))}</text>\n`;
    }
  }
  return { svg: out, height: h + 20 };
}

function renderProgress(
  c: { type: "progress"; title?: string; items: ProgressItem[] },
  y: number
): { svg: string; height: number } {
  const items = c.items.slice(0, 6);
  const rowH = 56;
  const titleOffset = c.title ? 50 : 20;
  const h = titleOffset + items.length * rowH + 24;

  let out = "";
  out += `<rect x="${PAD_X}" y="${y}" width="${BODY_W}" height="${h}" rx="12" fill="${CARD_BG}" stroke="${BORDER}" stroke-width="1.5"/>\n`;

  if (c.title) {
    out += `<text x="${PAD_X + 24}" y="${y + 40}" fill="${TEXT}" font-size="24" font-weight="bold" font-family="sans-serif">${esc(stripBold(c.title))}</text>\n`;
  }

  const itemColors = pickColors(items.length);
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const col = COLORS[item.color || itemColors[i]];
    const ry = y + titleOffset + i * rowH;
    const pct = Math.min(100, Math.max(0, item.percent));

    // Label
    out += `<text x="${PAD_X + 24}" y="${ry + 24}" fill="${TEXT}" font-size="22" font-family="sans-serif">${esc(stripBold(item.label).slice(0, 40))}</text>\n`;
    // Percent label
    out += `<text x="${PAD_X + BODY_W - 24}" y="${ry + 24}" text-anchor="end" fill="${col.fg}" font-size="22" font-weight="bold" font-family="monospace">${pct.toFixed(0)}%</text>\n`;
    // Track background
    out += `<rect x="${PAD_X + 24}" y="${ry + 32}" width="${BODY_W - 48}" height="14" rx="7" fill="${BORDER}"/>\n`;
    // Fill
    const fillW = ((BODY_W - 48) * pct) / 100;
    out += `<rect x="${PAD_X + 24}" y="${ry + 32}" width="${fillW.toFixed(1)}" height="14" rx="7" fill="${col.bg}"/>\n`;
  }
  return { svg: out, height: h + 20 };
}

// ── Render a single body component ──
function renderComponent(c: SlideComponent, y: number): { svg: string; height: number } {
  switch (c.type) {
    case "sbox": {
      const svg = renderSBox(c.box, PAD_X, y, BODY_W, 220);
      return { svg, height: 240 };
    }
    case "grid2":
    case "grid3":
      return renderGrid(c, y);
    case "quote":
      return renderQuote(c, y);
    case "formula":
      return renderFormula(c, y);
    case "icard":
      return renderICard(c, y);
    case "bullets":
      return renderBullets(c, y);
    case "table":
      return renderTable(c, y);
    case "segments":
      return renderSegments(c, y);
    case "barchart":
      return renderBarChart(c, y);
    case "linechart":
      return renderLineChart(c, y);
    case "piechart":
      return renderPieChart(c, y);
    case "metrics":
      return renderMetrics(c, y);
    case "progress":
      return renderProgress(c, y);
    default:
      return { svg: "", height: 0 };
  }
}

// ── Main: build rich slide SVG ──

export function buildRichSlideSvg(
  slide: Slide,
  slideIndex: number,
  totalSlides: number,
  accentColor: string,
  courseName: string
): string {
  const tagColor = COLORS[slide.tagColor || "p"];

  // ── Title area ──
  const tagText = slide.tag ? slide.tag.toUpperCase() : "";
  const titleLines = wrapText(slide.title, 46);
  const maxTitleLines = Math.min(titleLines.length, 2);

  // Accent top bar
  let header = `<rect x="0" y="0" width="${W}" height="6" fill="${accentColor}"/>\n`;

  // Eyebrow tag
  if (tagText) {
    header += `<text x="${PAD_X}" y="70" fill="${tagColor.fg}" font-size="22" font-weight="bold" font-family="monospace" letter-spacing="3">${esc(tagText)}</text>\n`;
  }

  // Title — uses the TAG accent color for vibrant headings
  let titleY = 130;
  for (let i = 0; i < maxTitleLines; i++) {
    header += `<text x="${PAD_X}" y="${titleY}" fill="${tagColor.fg}" font-size="56" font-weight="bold" font-family="serif">${esc(stripBold(titleLines[i]))}</text>\n`;
    titleY += 70;
  }

  // Divider
  const dividerY = titleY - 50;
  header += `<line x1="${PAD_X}" y1="${dividerY + 20}" x2="${W - PAD_X}" y2="${dividerY + 20}" stroke="${accentColor}" stroke-opacity="0.3" stroke-width="2"/>\n`;

  // ── Body components ──
  let body = "";
  let cursorY = BODY_START_Y;

  for (const comp of slide.body || []) {
    if (cursorY >= BODY_END_Y - 60) break; // stop if we run out of room
    const { svg, height } = renderComponent(comp, cursorY);
    body += svg;
    cursorY += height;
  }

  // ── Footer ──
  const footer =
    `<text x="${PAD_X}" y="1040" fill="${COLORS.p.fg}" fill-opacity="0.5" font-size="22" font-family="sans-serif">${esc(courseName)}</text>\n` +
    `<text x="${W - PAD_X}" y="1040" text-anchor="end" fill="${COLORS.p.fg}" fill-opacity="0.5" font-size="22" font-family="sans-serif">${slideIndex + 1} / ${totalSlides}</text>\n`;

  // Progress bar — vivid accent color, thicker
  const progressW = totalSlides > 1 ? ((slideIndex + 1) / totalSlides) * W : W;
  const progress =
    `<rect x="0" y="${H - 6}" width="${progressW}" height="6" fill="${tagColor.fg}"/>\n` +
    `<rect x="${progressW}" y="${H - 6}" width="${W - progressW}" height="6" fill="#12151D"/>\n`;

  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  ${header}
  ${body}
  ${footer}
  ${progress}
</svg>`;
}
