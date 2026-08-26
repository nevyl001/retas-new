import React, { useEffect, useRef, useState } from "react";

type Props = {
  value: React.ReactNode;
  className?: string;
  /** Remount key source — when this changes, play morph. */
  morphKey: string | number;
};

/**
 * Short vertical morph when a displayed value changes (scores, PTS).
 * Does not count 0→N; swaps with a ~180–250ms slide.
 */
export const LigaMotionValue: React.FC<Props> = ({
  value,
  className,
  morphKey,
}) => {
  const prev = useRef(morphKey);
  const [bump, setBump] = useState(0);

  useEffect(() => {
    if (prev.current === morphKey) return;
    prev.current = morphKey;
    setBump((n) => n + 1);
  }, [morphKey]);

  return (
    <span
      key={`${String(morphKey)}-${bump}`}
      className={`liga-motion-value${className ? ` ${className}` : ""}`}
    >
      {value}
    </span>
  );
};
