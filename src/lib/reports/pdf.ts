import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

export interface PdfTable { head: string[]; rows: string[][]; widths?: number[] }
export interface PdfSection { heading: string; lines?: string[]; kv?: [string, string][]; table?: PdfTable }
export interface PdfDoc { title: string; subtitle?: string; sections: PdfSection[]; footer?: string }

/** Standard PDF fonts only cover WinAnsi; map common Unicode punctuation and drop the rest. */
export function winAnsi(s: string): string {
  return s
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
    .replace(/→/g, '->').replace(/…/g, '...').replace(/ /g, ' ').replace(/•/g, '-')
    .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '');
}

const A4 = { w: 595.28, h: 841.89 };
const M = 48;

/** Small, dependency-light PDF builder: headings, key/value blocks and paginated tables. */
export async function buildPdf(doc: PdfDoc): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(winAnsi(doc.title));
  pdf.setProducer('OrbitOS');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage = pdf.addPage([A4.w, A4.h]);
  let y = A4.h - M;
  const ink = rgb(0.06, 0.09, 0.16); const muted = rgb(0.39, 0.45, 0.55); const line = rgb(0.89, 0.91, 0.94);

  const newPage = () => { page = pdf.addPage([A4.w, A4.h]); y = A4.h - M; };
  const ensure = (h: number) => { if (y - h < M + 20) newPage(); };
  const text = (t: string, x: number, size: number, f: PDFFont = font, color = ink, maxW?: number) => {
    let s = winAnsi(t);
    if (maxW && f.widthOfTextAtSize(s, size) > maxW) { while (s.length > 1 && f.widthOfTextAtSize(s + '...', size) > maxW) s = s.slice(0, -1); s += '...'; }
    page.drawText(s, { x, y, size, font: f, color });
  };
  const wrap = (t: string, size: number, maxW: number): string[] => {
    const words = winAnsi(t).split(/\s+/); const out: string[] = []; let cur = '';
    for (const w of words) { const n = cur ? `${cur} ${w}` : w; if (font.widthOfTextAtSize(n, size) > maxW && cur) { out.push(cur); cur = w; } else cur = n; }
    if (cur) out.push(cur);
    return out;
  };

  text(doc.title, M, 20, bold); y -= 24;
  if (doc.subtitle) { text(doc.subtitle, M, 10, font, muted); y -= 18; }
  page.drawLine({ start: { x: M, y }, end: { x: A4.w - M, y }, thickness: 1, color: line }); y -= 22;

  for (const s of doc.sections) {
    ensure(40);
    text(s.heading, M, 13, bold); y -= 18;
    for (const l of s.lines ?? []) for (const w of wrap(l, 10, A4.w - 2 * M)) { ensure(14); text(w, M, 10); y -= 14; }
    for (const [k, v] of s.kv ?? []) { ensure(14); text(k, M, 10, font, muted); text(v, M + 190, 10, bold, ink, A4.w - 2 * M - 190); y -= 15; }
    if (s.table) {
      const widths = s.table.widths ?? s.table.head.map(() => (A4.w - 2 * M) / s.table!.head.length);
      const drawHead = () => {
        let x = M;
        s.table!.head.forEach((h, i) => { text(h.toUpperCase(), x, 8, bold, muted, widths[i] - 6); x += widths[i]; });
        y -= 6; page.drawLine({ start: { x: M, y }, end: { x: A4.w - M, y }, thickness: 0.6, color: line }); y -= 12;
      };
      ensure(30); drawHead();
      for (const row of s.table.rows) {
        if (y - 14 < M + 20) { newPage(); drawHead(); }
        let x = M;
        row.forEach((c, i) => { text(c, x, 9, font, ink, widths[i] - 6); x += widths[i]; });
        y -= 14;
      }
    }
    y -= 12;
  }
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawText(winAnsi(`${doc.footer ?? 'OrbitOS'} · page ${i + 1} of ${pages.length}`), { x: M, y: 24, size: 8, font, color: muted });
  });
  return pdf.save();
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v);
    // neutralise spreadsheet formula injection
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
