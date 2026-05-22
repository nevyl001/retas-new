import React from "react";

export type CardVariant = "glass" | "elevated" | "flat";

export interface CardProps extends React.HTMLAttributes<HTMLElement> {
  variant?: CardVariant;
  interactive?: boolean;
  as?: "div" | "article" | "section";
  children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({
  variant = "glass",
  interactive = false,
  as: Component = "div",
  className = "",
  children,
  ...rest
}) => {
  const classes = [
    variant === "glass" ? "riviera-glass-card" : "riviera-card",
    variant === "elevated" && "riviera-card--elevated",
    variant === "flat" && "riviera-card--flat",
    interactive && "riviera-card--interactive",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Component className={classes} {...rest}>
      {children}
    </Component>
  );
};
