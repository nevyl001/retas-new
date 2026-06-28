import React from "react";
import { ActionBar } from "../platform/ActionBar";
import { GameModeShell } from "../platform/GameModeShell";
import { Button } from "../ui";

interface AmericanoModeShellProps {
  children: React.ReactNode;
  onBack?: () => void;
  showToolbar?: boolean;
}

export const AmericanoModeShell: React.FC<AmericanoModeShellProps> = ({
  children,
  onBack,
  showToolbar = true,
}) => (
  <GameModeShell className="americano-screen">
    {showToolbar && onBack ? (
      <ActionBar className="americano-screen__header riviera-back-toolbar">
        <Button type="button" variant="back" onClick={onBack}>
          ← Volver al inicio
        </Button>
      </ActionBar>
    ) : null}
    {children}
  </GameModeShell>
);
