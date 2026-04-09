export interface SlideData {
  title: string;
  points: string[];
  narration: string;
  icon?: string;        // emoji icon for the slide
  formulas?: string[];  // formulas/calculations to display
}

const W = 1920;
const H = 1080;

// XML-escape text for safe SVG embedding
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Wrap text at word boundaries to fit a max character width
function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
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

// Build SVG markup for a single slide
export function buildSlideSvg(
  slide: SlideData,
  slideIndex: number,
  totalSlides: number,
  accentColor: string,
  courseName: string
): string {
  // ── Title section ──
  const icon = slide.icon || "";
  const titleLines = wrapText(slide.title, 42);
  const titleStartY = 135;
  const titleLineHeight = 65;

  const titleSvg = titleLines
    .map(
      (line, i) =>
        `<text x="960" y="${titleStartY + i * titleLineHeight}" text-anchor="middle" ` +
        `fill="${accentColor}" font-size="50" font-weight="bold" ` +
        `font-family="serif">${esc(line)}</text>`
    )
    .join("\n    ");

  // Icon above title
  const iconSvg = icon
    ? `<text x="960" y="${titleStartY - 55}" text-anchor="middle" font-size="42">${esc(icon)}</text>`
    : "";

  // ── Divider line under title ──
  const dividerY = titleStartY + titleLines.length * titleLineHeight + 20;
  const dividerSvg =
    `<line x1="120" y1="${dividerY}" x2="1800" y2="${dividerY}" ` +
    `stroke="${accentColor}" stroke-opacity="0.25" stroke-width="1.5"/>`;

  // ── Bullet points ──
  const hasFormulas = slide.formulas && slide.formulas.length > 0;
  const bulletZoneTop = dividerY + 35;
  // If formulas present, bullets get left half; formulas get right half
  const bulletMaxX = hasFormulas ? 900 : 1750;
  const bulletCharsPerLine = hasFormulas ? 38 : 60;
  const bulletFontSize = 32;
  const bulletLineHeight = 44;
  const bulletSpacing = 22;

  let bulletsSvg = "";
  let cursorY = bulletZoneTop;

  for (const point of slide.points.slice(0, 6)) {
    const lines = wrapText(point, bulletCharsPerLine);

    // Accent-colored bullet circle
    bulletsSvg +=
      `<circle cx="148" cy="${cursorY + 2}" r="7" fill="${accentColor}"/>\n    `;

    for (let li = 0; li < lines.length; li++) {
      bulletsSvg +=
        `<text x="178" y="${cursorY + li * bulletLineHeight}" ` +
        `fill="#E4DED4" font-size="${bulletFontSize}" ` +
        `font-family="sans-serif">${esc(lines[li])}</text>\n    `;
    }
    cursorY += lines.length * bulletLineHeight + bulletSpacing;
  }

  // ── Formulas / Calculations panel ──
  let formulasSvg = "";
  if (hasFormulas && slide.formulas) {
    const formulaX = 1000;
    const formulaMaxW = 780;
    let formulaY = bulletZoneTop + 5;

    // Formula panel background
    const panelHeight = Math.min(550, slide.formulas.length * 120 + 40);
    formulasSvg +=
      `<rect x="${formulaX - 20}" y="${formulaY - 30}" width="${formulaMaxW + 40}" height="${panelHeight}" ` +
      `rx="16" fill="#161922" stroke="${accentColor}" stroke-opacity="0.2" stroke-width="1"/>\n    `;

    // Label
    formulasSvg +=
      `<text x="${formulaX}" y="${formulaY}" fill="${accentColor}" font-size="18" ` +
      `font-weight="bold" font-family="sans-serif" ` +
      `letter-spacing="2">FORMULAS &amp; CALCULATIONS</text>\n    `;
    formulaY += 40;

    for (const formula of slide.formulas.slice(0, 5)) {
      const fLines = wrapText(formula, 42);
      for (const fLine of fLines) {
        formulasSvg +=
          `<text x="${formulaX + 10}" y="${formulaY}" fill="#8ECAE6" font-size="26" ` +
          `font-family="monospace">${esc(fLine)}</text>\n    `;
        formulaY += 38;
      }
      formulaY += 18; // gap between formulas
    }
  }

  // ── Footer ──
  const footerSvg =
    `<text x="120" y="1035" fill="#555B66" font-size="22" ` +
    `font-family="sans-serif">${esc(courseName)}</text>` +
    `<text x="${W - 120}" y="1035" text-anchor="end" fill="#555B66" font-size="22" ` +
    `font-family="sans-serif">${slideIndex + 1} / ${totalSlides}</text>`;

  // ── Progress bar at very bottom ──
  const progressWidth = totalSlides > 1 ? ((slideIndex + 1) / totalSlides) * W : W;
  const progressSvg =
    `<rect x="0" y="${H - 4}" width="${progressWidth}" height="4" fill="${accentColor}" opacity="0.6"/>` +
    `<rect x="${progressWidth}" y="${H - 4}" width="${W - progressWidth}" height="4" fill="#1A1D24"/>`;

  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="#0B0D10"/>
    <rect x="0" y="0" width="${W}" height="5" fill="${accentColor}"/>
    ${iconSvg}
    ${titleSvg}
    ${dividerSvg}
    ${bulletsSvg}
    ${formulasSvg}
    ${footerSvg}
    ${progressSvg}
  </svg>`;
}

// Render SVG string to PNG buffer using resvg-js (handles fonts reliably on Linux)
export async function renderSlideToPng(svgString: string): Promise<Buffer> {
  const { Resvg } = await import("@resvg/resvg-js");
  const resvg = new Resvg(svgString, {
    fitTo: { mode: "width" as const, value: W },
    font: {
      loadSystemFonts: true,
      // Explicitly scan apt-installed font dirs on Railway (Linux)
      fontDirs: ["/usr/share/fonts", "/usr/local/share/fonts"],
      defaultFontFamily: "DejaVu Sans",
      sansSerifFamily: "DejaVu Sans",
      serifFamily: "DejaVu Serif",
      monospaceFamily: "DejaVu Sans Mono",
    },
  });
  const pngData = resvg.render();
  return Buffer.from(pngData.asPng());
}
