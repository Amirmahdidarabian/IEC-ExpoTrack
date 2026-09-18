import Link from "next/link";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="brand" aria-label="International Energy Club home">
      <svg className="brand-mark" viewBox="0 0 64 64" aria-hidden="true">
        <defs>
          <filter id="iec-remove-white" colorInterpolationFilters="sRGB">
            <feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  -1 -1 -1 3 0" />
          </filter>
        </defs>
        <image href="/iec-logo.png" width="64" height="64" preserveAspectRatio="xMidYMid meet" filter="url(#iec-remove-white)" />
      </svg>
      {!compact && <span><strong>International</strong><strong>Energy Club</strong></span>}
    </Link>
  );
}
