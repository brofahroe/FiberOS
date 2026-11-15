import React from 'react';

interface FiberOsLogoProps {
  className?: string;
}

export default function FiberOsLogo({ className = 'w-10 h-10' }: FiberOsLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      fill="none"
      className={className}
      aria-label="FiberOS FTTH Logo"
    >
      <defs>
        <linearGradient id="fiberos-bg" x1="0" y1="512" x2="512" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0f172a" />
          <stop offset="50%" stopColor="#1e40af" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>
        <linearGradient id="fiberos-cyan" x1="120" y1="400" x2="380" y2="120" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#34d399" />
        </linearGradient>
        <linearGradient id="fiberos-bolt" x1="330" y1="180" x2="410" y2="390" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fde047" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
      </defs>

      {/* Squircle Background */}
      <rect x="16" y="16" width="480" height="480" rx="112" fill="url(#fiberos-bg)" />
      <rect x="24" y="24" width="464" height="464" rx="104" stroke="#38bdf8" strokeOpacity="0.3" strokeWidth="6" />

      {/* Subtle Tech Grid Arcs */}
      <circle cx="400" cy="112" r="190" stroke="#38bdf8" strokeOpacity="0.14" strokeWidth="4" strokeDasharray="12 12" />
      <circle cx="112" cy="400" r="160" stroke="#34d399" strokeOpacity="0.14" strokeWidth="4" />

      {/* Secondary Parallel Fiber Optic Circuit Strand */}
      <path
        d="M208 392V312H300"
        stroke="#38bdf8"
        strokeOpacity="0.8"
        strokeWidth="20"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Optical Fiber Strands Forming Stylized 'F' */}
      <path
        d="M140 392V128H356"
        stroke="url(#fiberos-cyan)"
        strokeWidth="40"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M140 248H284"
        stroke="url(#fiberos-cyan)"
        strokeWidth="36"
        strokeLinecap="round"
      />

      {/* High-Speed Pulse Bolt Accent */}
      <path
        d="M388 184L332 276H380L342 384L430 260H378L388 184Z"
        fill="url(#fiberos-bolt)"
      />

      {/* Glowing Optical Nodes (FTTH OLT / FDT / FAT Terminals) */}
      <circle cx="356" cy="128" r="26" fill="#34d399" />
      <circle cx="356" cy="128" r="11.5" fill="#ffffff" />

      <circle cx="284" cy="248" r="22" fill="#38bdf8" />
      <circle cx="284" cy="248" r="10" fill="#ffffff" />

      <circle cx="140" cy="392" r="24" fill="#38bdf8" />
      <circle cx="140" cy="392" r="10.5" fill="#ffffff" />

      <circle cx="300" cy="312" r="16" fill="#34d399" />
      <circle cx="300" cy="312" r="7" fill="#ffffff" />
    </svg>
  );
}
