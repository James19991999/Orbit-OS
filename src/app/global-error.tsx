'use client';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#0b1326', color: '#dae2fd', fontFamily: 'system-ui, sans-serif' }}>
        <main style={{ maxWidth: 480, margin: '15vh auto', padding: 16 }}>
          <h1 style={{ fontSize: 24 }}>OrbitOS hit an unexpected error</h1>
          <p style={{ color: '#c3c6d7' }}>{error.message || 'Please try again.'}</p>
          {error.digest && <p style={{ color: '#8d90a0', fontSize: 12 }}>Reference: {error.digest}</p>}
          <button type="button" onClick={reset} style={{ marginTop: 16, background: '#2563eb', color: '#fff', border: 0, borderRadius: 4, padding: '10px 16px', fontWeight: 600 }}>Try again</button>
        </main>
      </body>
    </html>
  );
}
