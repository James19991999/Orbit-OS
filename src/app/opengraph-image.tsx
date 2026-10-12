import { ImageResponse } from 'next/og';

// The picture shown when an OrbitOS link is shared (WhatsApp, LinkedIn, X, Facebook, Slack).
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'OrbitOS — remote team management software built for Africa';

export default function OgImage() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 80, background: 'radial-gradient(circle at 30% 20%, #1e3a8a 0%, #0b1326 60%)', color: '#dae2fd' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <svg width="76" height="76" viewBox="0 0 32 32">
            <rect width="32" height="32" rx="7" fill="#2563eb" />
            <circle cx="16" cy="16" r="6" fill="none" stroke="#fff" strokeWidth="2.4" />
            <ellipse cx="16" cy="16" rx="12" ry="4.5" fill="none" stroke="#89ceff" strokeWidth="1.6" transform="rotate(-25 16 16)" />
            <circle cx="26" cy="11.5" r="1.8" fill="#4edea3" />
          </svg>
          <div style={{ fontSize: 52, fontWeight: 700, color: '#ffffff' }}>OrbitOS</div>
        </div>
        <div style={{ fontSize: 66, fontWeight: 700, marginTop: 34, lineHeight: 1.1, maxWidth: 1000 }}>Run your remote team in one place — built for Africa</div>
        <div style={{ fontSize: 30, marginTop: 30, color: '#c3c6d7' }}>Tasks · Check-ins · Meetings · M-Pesa · KRA eTIMS · Compliance</div>
        <div style={{ fontSize: 26, marginTop: 14, color: '#89ceff' }}>English · Kiswahili · Français</div>
      </div>
    ),
    size,
  );
}
