import React, { useCallback, useState } from "react";
import { createEvento, formatSupabaseError } from "../../services/torneoExpressService";
import { Button, Input, Modal } from "../ui";

type CrearEventoModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (eventoId: string) => void;
};

export const CrearEventoModal: React.FC<CrearEventoModalProps> = ({
  open,
  onClose,
  onCreated,
}) => {
  const [nombre, setNombre] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [timezone, setTimezone] = useState("America/Mexico_City");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setNombre("");
    setFechaInicio("");
    setFechaFin("");
    setTimezone("America/Mexico_City");
    setError(null);
    setSubmitting(false);
  }, []);

  const handleClose = useCallback(() => {
    if (submitting) return;
    reset();
    onClose();
  }, [onClose, reset, submitting]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) {
      setError("El nombre del evento es obligatorio");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const evento = await createEvento({
        nombre: nombre.trim(),
        timezone: timezone.trim() || "America/Mexico_City",
        fecha_inicio: fechaInicio.trim() || null,
        fecha_fin: fechaFin.trim() || null,
      });
      reset();
      onCreated(evento.id);
    } catch (err) {
      setError(formatSupabaseError(err));
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Crear evento"
      size="md"
      footer={
        <>
          <Button
            type="button"
            variant="ghost"
            disabled={submitting}
            onClick={handleClose}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            form="te-crear-evento-form"
            variant="primary"
            loading={submitting}
            disabled={submitting}
          >
            Crear evento
          </Button>
        </>
      }
    >
      <form id="te-crear-evento-form" onSubmit={(e) => void handleSubmit(e)}>
        {error ? <p className="te-error">{error}</p> : null}
        <div className="te-evento-form-grid">
          <label className="te-evento-field">
            <span className="te-evento-field__label">Nombre</span>
            <Input
              value={nombre}
              onChange={(ev) => setNombre(ev.target.value)}
              placeholder="Ej. Riviera Open Rush Series #4"
              required
              autoFocus
            />
          </label>
          <label className="te-evento-field">
            <span className="te-evento-field__label">Fecha inicio (opcional)</span>
            <Input
              type="date"
              value={fechaInicio}
              onChange={(ev) => setFechaInicio(ev.target.value)}
            />
          </label>
          <label className="te-evento-field">
            <span className="te-evento-field__label">Fecha fin (opcional)</span>
            <Input
              type="date"
              value={fechaFin}
              onChange={(ev) => setFechaFin(ev.target.value)}
            />
          </label>
          <label className="te-evento-field">
            <span className="te-evento-field__label">Zona horaria</span>
            <Input
              value={timezone}
              onChange={(ev) => setTimezone(ev.target.value)}
              placeholder="America/Mexico_City"
            />
          </label>
        </div>
      </form>
    </Modal>
  );
};
