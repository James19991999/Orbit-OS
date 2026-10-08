import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'OrbitOS — the distributed operating system for remote-first companies';

export default function OgImage() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 80, background: 'radial-gradient(circle at 30% 20%, #1e3a8a 0%, #0b1326 60%)', color: '#dae2fd' }}>
        <div style={{ fontSize: 34, color: '#89ceff', letterSpacing: 2 }}>ORBITOS</div>
        <div style={{ fontSize: 68, fontWeight: 700, marginTop: 20, lineHeight: 1.1, maxWidth: 980 }}>The distributed operating system for remote-first companies</div>
        <div style={{ fontSize: 30, marginTop: 30, color: '#c3c6d7' }}>Health · Runway · Time zones · Culture · Compliance</div>
      </div>
    ),
    size,
  );
}
