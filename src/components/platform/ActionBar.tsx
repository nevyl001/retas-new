import React from "react";

interface ActionBarProps {
  children: React.ReactNode;
  sticky?: boolean;
  className?: string;
}

export const ActionBar: React.FC<ActionBarProps> = ({
  children,
  sticky = false,
  className = "",
}) => (
  <div
    className={`rv-action-bar${sticky ? " rv-action-bar--sticky" : ""} ${className}`.trim()}
  >
    {children}
  </div>
);
