import React from "react";

interface TablerIconProps {
  name: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  "aria-hidden"?: boolean;
}

/** Icono outline Tabler (`ti-*`). CSS empaquetado desde @tabler/icons-webfont (ver index.tsx). */
export const TablerIcon: React.FC<TablerIconProps> = ({
  name,
  size = 16,
  className = "",
  style = {},
  "aria-hidden": ariaHidden = true,
}) => (
  <i
    className={["ti", `ti-${name}`, className].filter(Boolean).join(" ")}
    style={{
      fontSize: size,
      width: size,
      height: size,
      lineHeight: 1,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      ...style,
    }}
    aria-hidden={ariaHidden}
  />
);
