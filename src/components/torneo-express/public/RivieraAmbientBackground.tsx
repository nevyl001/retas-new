import React from "react";

const DUST = [
  [5, 12, 0.65, 0],
  [12, 37, 0.45, 4],
  [19, 71, 0.8, 9],
  [27, 24, 0.5, 2],
  [34, 52, 0.7, 12],
  [42, 16, 0.4, 7],
  [49, 84, 0.85, 14],
  [57, 43, 0.55, 5],
  [64, 67, 0.75, 11],
  [71, 21, 0.45, 3],
  [78, 76, 0.65, 15],
  [85, 35, 0.5, 8],
  [92, 59, 0.8, 1],
  [96, 18, 0.4, 13],
] as const;

/** Decorative atmosphere only; never participates in application state. */
export const RivieraAmbientBackground: React.FC = () => (
  <div className="te-ambient" aria-hidden="true">
    <div className="te-ambient__vignette" />
    <div className="te-ambient__grain" />
    <div className="te-ambient__light te-ambient__light--warm" />
    <div className="te-ambient__light te-ambient__light--brand" />
    <svg
      className="te-ambient__dust"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      focusable="false"
    >
      <g className="te-ambient__dust-field">
        {DUST.map(([x, y, radius, delay], index) => (
          <circle
            key={`${x}-${y}`}
            className={
              index % 6 === 0
                ? "te-ambient__particle te-ambient__particle--brand"
                : "te-ambient__particle"
            }
            cx={x}
            cy={y}
            r={radius / 10}
            style={{ "--te-dust-delay": `${delay}s` } as React.CSSProperties}
          />
        ))}
      </g>
    </svg>
    <div className="te-ambient__readability-mask" />
  </div>
);
