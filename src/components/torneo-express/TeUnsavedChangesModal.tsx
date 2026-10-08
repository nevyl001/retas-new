import React from "react";
import { Button, Modal } from "../ui";

type TeUnsavedChangesModalProps = {
  /** Secciones con cambios, p. ej. ["Reglas", "Branding"]. */
  sections: ReadonlyArray<string>;
  /** `signout` = intentó cerrar sesión; `navigate` = intentó salir de la pantalla. */
  kind?: "navigate" | "signout";
  onStay: () => void;
  onLeave: () => void;
};

function joinSections(sections: ReadonlyArray<string>): string {
  if (sections.length <= 1) return sections[0] ?? "este evento";
  return `${sections.slice(0, -1).join(", ")} y ${sections[sections.length - 1]}`;
}

export const TeUnsavedChangesModal: React.FC<TeUnsavedChangesModalProps> = ({
  sections,
  kind = "navigate",
  onStay,
  onLeave,
}) => (
  <Modal open onClose={onStay} title="Cambios sin guardar" size="sm">
    <p className="te-modal-text">
      Tienes cambios sin guardar en <strong>{joinSections(sections)}</strong>.
      {kind === "signout"
        ? " Si cierras sesión ahora, se perderán."
        : " Si sales ahora, se perderán."}
    </p>
    <div className="riviera-modal__actions te-modal-actions">
      <Button type="button" variant="secondary" onClick={onLeave}>
        {kind === "signout" ? "Cerrar sesión sin guardar" : "Salir sin guardar"}
      </Button>
      <Button type="button" variant="primary" onClick={onStay}>
        Seguir editando
      </Button>
    </div>
  </Modal>
);
