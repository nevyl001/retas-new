import React from "react";

export const CourtLines: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 480 640" fill="none" aria-hidden="true" focusable="false">
    <rect x="28" y="28" width="424" height="584" stroke="currentColor" strokeWidth="1" />
    <path stroke="currentColor" strokeWidth="1" d="M28 52H52M28 28v24M452 52h-24M452 28v24M28 588h24M28 612v-24M452 588h-24M452 612v-24" />
    <rect x="108" y="86" width="264" height="468" stroke="currentColor" strokeWidth="1.4" />
    <line x1="108" y1="320" x2="372" y2="320" stroke="currentColor" strokeWidth="1.6" />
    <line x1="174" y1="86" x2="174" y2="214" stroke="currentColor" strokeWidth="1.15" />
    <line x1="306" y1="86" x2="306" y2="214" stroke="currentColor" strokeWidth="1.15" />
    <line x1="174" y1="214" x2="306" y2="214" stroke="currentColor" strokeWidth="1.15" />
    <line x1="174" y1="554" x2="174" y2="426" stroke="currentColor" strokeWidth="1.15" />
    <line x1="306" y1="554" x2="306" y2="426" stroke="currentColor" strokeWidth="1.15" />
    <line x1="174" y1="426" x2="306" y2="426" stroke="currentColor" strokeWidth="1.15" />
    <line x1="240" y1="86" x2="240" y2="132" stroke="currentColor" strokeWidth="1" />
    <line x1="240" y1="554" x2="240" y2="508" stroke="currentColor" strokeWidth="1" />
    <path stroke="currentColor" strokeWidth="1" d="M84 86h12M84 320h12M84 554h12M396 86h-12M396 320h-12M396 554h-12" />
    <circle cx="240" cy="320" r="18" stroke="currentColor" strokeWidth="1" />
    <path stroke="currentColor" strokeWidth="1" d="M240 294v12M240 334v12M214 320h12M254 320h12" />
  </svg>
);
