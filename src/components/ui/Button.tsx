import React from "react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "back";

export type ButtonSize = "sm" | "md" | "lg";

type ButtonBaseProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  className?: string;
  children: React.ReactNode;
};

export type ButtonProps = ButtonBaseProps &
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    as?: "button";
  };

export type ButtonLinkProps = ButtonBaseProps &
  React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    as: "a";
  };

function buildButtonClasses(
  variant: ButtonVariant,
  size: ButtonSize,
  loading: boolean,
  className: string
): string {
  const parts: string[] = [];

  if (variant === "back") {
    parts.push("riviera-btn-back");
  } else {
    parts.push("riviera-btn", `riviera-btn-${variant}`, `riviera-btn--${size}`);
  }

  if (loading) {
    parts.push("riviera-btn--loading");
  }

  if (className) {
    parts.push(className);
  }

  return parts.join(" ");
}

export const Button = React.forwardRef<
  HTMLButtonElement | HTMLAnchorElement,
  ButtonProps | ButtonLinkProps
>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    className = "",
    children,
    as = "button",
    ...rest
  },
  ref
) {
  const classes = buildButtonClasses(variant, size, loading, className);
  const isDisabled =
    loading ||
    ("disabled" in rest && Boolean(rest.disabled)) ||
    ("aria-disabled" in rest && rest["aria-disabled"] === true);

  if (as === "a") {
    const { href, ...anchorRest } = rest as ButtonLinkProps;
    return (
      <a
        ref={ref as React.Ref<HTMLAnchorElement>}
        href={href}
        className={classes}
        aria-disabled={isDisabled || undefined}
        {...anchorRest}
      >
        {children}
      </a>
    );
  }

  const buttonRest = rest as ButtonProps;

  return (
    <button
      ref={ref as React.Ref<HTMLButtonElement>}
      type={buttonRest.type ?? "button"}
      className={classes}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      {...buttonRest}
    >
      {children}
    </button>
  );
});
