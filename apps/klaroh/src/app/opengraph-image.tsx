import { ImageResponse } from 'next/og';

export const alt = "Klaroh: see every client's outbound in one place";
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Share card for Open Graph and Twitter. Brand colors from the design system; system font so it never needs a network fetch.
export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: '#F8F9FF', padding: 80 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: '#003E2A' }} />
          <div style={{ fontSize: 40, fontWeight: 600, color: '#003E2A' }}>Klaroh</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ fontSize: 76, lineHeight: 1.1, color: '#0B1C30', fontWeight: 600, letterSpacing: -2 }}>See every client&apos;s outbound in one place.</div>
          <div style={{ fontSize: 32, color: '#545F73' }}>Results, replies, mailbox status and client reports for cold email agencies.</div>
        </div>
        <div style={{ height: 8, width: 160, borderRadius: 4, background: '#0F573E' }} />
      </div>
    ),
    size,
  );
}
