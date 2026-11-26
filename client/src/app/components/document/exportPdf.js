// html2canvas + jsPDF are only ever needed once an admin actually clicks
// "Export as PDF" -- importing them dynamically (below, inside
// exportElementAsPdf) keeps them out of the main bundle every visitor
// downloads, splitting them into their own chunk loaded on demand instead.
//
// Generating the PDF ourselves (instead of window.print()) sidesteps the
// browser's print pipeline entirely -- window.print() depends on the OS
// print dialog/driver to honor the page's `@page { size: landscape }` CSS
// hint, and that isn't reliable across browsers/printers (some silently
// fall back to portrait and rotate the landscape-rendered content onto it
// instead of reflowing it). html2canvas + jsPDF give full control over the
// exported file's exact page size, orientation, and margins in code.
const PAGE_WIDTH_MM = 297; // A4 landscape
const PAGE_HEIGHT_MM = 210;
const MARGIN_MM = 12; // within the requested 10-15mm range
const BAND_WIDTH_MM = 9; // vertical academic-year band along the right edge
const NAVY = [31, 78, 121]; // matches --navy in globals.css

const MIN_CAPTURE_WIDTH = 700; // px -- floor so tiny-content terms don't cram text
const MAX_CAPTURE_WIDTH = 2200; // px -- ceiling so huge-content terms don't over-widen

async function settle() {
  // Two rAFs: one for the browser to apply the style/class change, one for
  // layout to actually reflow before the next measurement/capture reads it.
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

// `.print-compact` (globals.css) is the same class real printing toggles
// via beforeprint/afterprint -- html2canvas renders in normal screen mode
// where @media print never applies, so the class has to be added for real
// before capture, not relied on implicitly.
export async function exportElementAsPdf(element, { filename, academicYear }) {
  // Kicked off immediately (not awaited yet) so the chunk fetch overlaps
  // with the settle()/measurement work below instead of adding its own
  // latency on top.
  const librariesPromise = Promise.all([import("html2canvas"), import("jspdf")]);

  const availableWidth = PAGE_WIDTH_MM - MARGIN_MM * 2 - BAND_WIDTH_MM;
  const availableHeight = PAGE_HEIGHT_MM - MARGIN_MM * 2;
  const availableRatio = availableWidth / availableHeight;

  document.body.classList.add("print-compact");
  // Inter is loaded via @font-face (tokens.css) with font-display: swap --
  // without this, a capture that happens to land before the swap finishes
  // would silently render with the Segoe UI fallback instead.
  await Promise.all([settle(), document.fonts.ready]);

  // This layout's block heights (fixed-column month grids, a fixed-column
  // key-dates table) don't change with container width -- only cell widths
  // do. So rather than guess a width, measure the natural (width-
  // independent) content height first, then solve for the width that
  // makes the capture's aspect ratio match the printable page's, however
  // long the content is for this particular term. Without this, the
  // compact font sizes (tuned for a physical print page, not this capture)
  // produce a much wider-than-tall capture that leaves huge letterboxing
  // gaps above/below when fit to an A4 landscape page.
  const naturalHeight = element.getBoundingClientRect().height;
  const targetWidth = Math.round(
    Math.min(MAX_CAPTURE_WIDTH, Math.max(MIN_CAPTURE_WIDTH, naturalHeight * availableRatio))
  );
  const prevWidth = element.style.width;
  const prevMaxWidth = element.style.maxWidth;
  element.style.width = `${targetWidth}px`;
  element.style.maxWidth = `${targetWidth}px`;
  await settle();

  const [{ default: html2canvas }, { jsPDF }] = await librariesPromise;

  let canvas;
  try {
    // scale: 4 -- at this layout's typical content height, scale: 2 works
    // out to roughly 140 DPI once fit to an A4 page, well short of the
    // ~300 DPI needed for crisp small print-compact text (6.5-8px). 4x
    // brings that to ~285 DPI.
    canvas = await html2canvas(element, { scale: 4, backgroundColor: "#ffffff", useCORS: true });
  } finally {
    element.style.width = prevWidth;
    element.style.maxWidth = prevMaxWidth;
    document.body.classList.remove("print-compact");
  }

  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const canvasRatio = canvas.width / canvas.height;

  // Fit the captured image inside the available box without distorting it
  // -- fit-to-width or fit-to-height, whichever keeps it fully on the page.
  let renderWidth, renderHeight;
  if (canvasRatio > availableRatio) {
    renderWidth = availableWidth;
    renderHeight = availableWidth / canvasRatio;
  } else {
    renderHeight = availableHeight;
    renderWidth = availableHeight * canvasRatio;
  }
  const x = MARGIN_MM + (availableWidth - renderWidth) / 2;
  const y = MARGIN_MM + (availableHeight - renderHeight) / 2;

  // PNG (lossless), not JPEG -- this capture is entirely flat-color fills,
  // grid lines, and small text, exactly the content JPEG's photo-oriented
  // lossy compression softens/rings at the edges of, even at high quality.
  pdf.addImage(canvas.toDataURL("image/png"), "PNG", x, y, renderWidth, renderHeight);

  // Vector year-band on the right edge -- drawn natively rather than
  // captured by html2canvas, which has known trouble with
  // `writing-mode: vertical-rl` -- and sharper than a rasterized one
  // besides. jsPDF's `align: "center"` combined with `angle` miscalculates
  // a rotated string's position (verified: it lands outside the band
  // entirely), so the center is computed by hand from the text's own
  // width instead of relying on that option.
  if (academicYear) {
    const bandX = PAGE_WIDTH_MM - BAND_WIDTH_MM;
    pdf.setFillColor(...NAVY);
    pdf.rect(bandX, 0, BAND_WIDTH_MM, PAGE_HEIGHT_MM, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(16);
    const textLength = pdf.getTextWidth(academicYear);
    pdf.text(academicYear, bandX + BAND_WIDTH_MM / 2, PAGE_HEIGHT_MM / 2 + textLength / 2, { angle: 90 });
  }

  pdf.save(filename);
}
