export function OrbitalDiagram() {
  return (
    <svg className="orbital-diagram" viewBox="0 0 320 112" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="orbital-horizon-fill" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.24" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M56 107A145 94 0 0 1 306 107" fill="url(#orbital-horizon-fill)" opacity="0.6" />
        <path d="M22.3 100.4A206 106 -10 0 1 309.4 26.7" strokeDasharray="5 7" opacity="0.65" />
        <g className="orbital-satellite" transform="translate(195.5 24.3) rotate(-7.8)">
          <path d="M-14 0h7m14 0h7M0-7v-6l5-3" />
          <circle cx="5" cy="-16" r="1.2" />
          <rect x="-7" y="-7" width="14" height="14" rx="2" fill="var(--canvas)" />
          <rect x="-31" y="-5" width="17" height="10" rx="1" fill="var(--canvas)" />
          <rect x="14" y="-5" width="17" height="10" rx="1" fill="var(--canvas)" />
          <path d="M-25-5V5m5-10V5M20-5V5m5-10V5" />
          <circle cy="1" r="2.3" />
        </g>
      </g>
    </svg>
  );
}
