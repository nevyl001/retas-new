import React from "react";

export const CourtLines: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 320 480" fill="none" aria-hidden="true" focusable="false">
    <rect x="18" y="18" width="284" height="444" rx="6" stroke="currentColor" strokeWidth="1.5" />
    <line x1="18" y1="240" x2="302" y2="240" stroke="currentColor" strokeWidth="2" />
    <line x1="86" y1="18" x2="86" y2="150" stroke="currentColor" strokeWidth="1.25" />
    <line x1="234" y1="18" x2="234" y2="150" stroke="currentColor" strokeWidth="1.25" />
    <line x1="86" y1="150" x2="234" y2="150" stroke="currentColor" strokeWidth="1.25" />
    <line x1="86" y1="462" x2="86" y2="330" stroke="currentColor" strokeWidth="1.25" />
    <line x1="234" y1="462" x2="234" y2="330" stroke="currentColor" strokeWidth="1.25" />
    <line x1="86" y1="330" x2="234" y2="330" stroke="currentColor" strokeWidth="1.25" />
    <line x1="160" y1="18" x2="160" y2="78" stroke="currentColor" strokeWidth="1" />
    <line x1="160" y1="462" x2="160" y2="402" stroke="currentColor" strokeWidth="1" />
  </svg>
);
