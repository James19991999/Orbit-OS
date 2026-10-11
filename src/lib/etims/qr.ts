import 'server-only';
import QRCode from 'qrcode';

/** QR code as a module matrix (for the PDF builder) and as an SVG string (for the invoice page). */
export function qrModules(text: string): boolean[][] {
  const q = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = q.modules.size;
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => !!q.modules.get(r, c)));
}

export async function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: 'svg', errorCorrectionLevel: 'M', margin: 2, color: { dark: '#000000', light: '#ffffff' } });
}
