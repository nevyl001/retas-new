import React, { useEffect, useState } from "react";
import {
  confirmarVerificacionCorreo,
  inspeccionarVerificacionCorreo,
} from "../../services/ligaNotificacionesService";
import { tokenDesdeQuery } from "../../lib/liga/notificaciones/verificacionPolicy";
import { Button } from "../ui";
import { LigaPageShell } from "./LigaPageShell";
import "./liga-verificar-correo.css";

type Vista =
  | "cargando"
  | "listo"
  | "confirmando"
  | "exito"
  | "vencido"
  | "utilizado"
  | "invalido"
  | "cancelado"
  | "invalidado"
  | "correo_cambio"
  | "error_temporal";

const MENSAJES: Record<Exclude<Vista, "cargando" | "listo" | "confirmando">, string> = {
  exito: "Tu correo quedó verificado. El club puede avisarte cuando corresponda.",
  vencido: "Este enlace ya caducó. Pide uno nuevo al organizador de tu liga.",
  utilizado: "Este enlace ya se usó. Si necesitas otro, pídelo al organizador.",
  invalido: "Este enlace no es válido.",
  cancelado: "Esta solicitud fue cancelada.",
  invalidado: "Este enlace ya no está activo.",
  correo_cambio: "El correo asociado cambió. Pide una verificación nueva.",
  error_temporal: "No pudimos completar la verificación. Inténtalo de nuevo en unos minutos.",
};

function vistaDesdeEstado(estado: string): Vista {
  if (estado === "pendiente") return "listo";
  if (estado === "confirmado") return "exito";
  if (estado === "utilizado") return "utilizado";
  if (estado === "vencido") return "vencido";
  if (estado === "cancelado") return "cancelado";
  if (estado === "invalidado") return "invalidado";
  if (estado === "correo_cambio") return "correo_cambio";
  if (estado === "error_temporal") return "error_temporal";
  return "invalido";
}

export const LigaVerificarCorreoPublica: React.FC = () => {
  const [vista, setVista] = useState<Vista>("cargando");
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const parsed = tokenDesdeQuery(params.get("t"));
    setToken(parsed);
    if (!parsed) {
      setVista("invalido");
      return;
    }
    let activo = true;
    void inspeccionarVerificacionCorreo(parsed).then((resultado) => {
      if (!activo) return;
      setVista(vistaDesdeEstado(resultado.estado));
    });
    return () => {
      activo = false;
    };
  }, []);

  async function confirmar() {
    if (!token || vista !== "listo") return;
    setVista("confirmando");
    const resultado = await confirmarVerificacionCorreo(token);
    setVista(vistaDesdeEstado(resultado.ok ? "confirmado" : resultado.estado));
  }

  return (
    <LigaPageShell>
      <section className="liga-verificar-correo" aria-label="Verificación de correo">
        <p className="liga-verificar-correo__eyebrow">Riviera Open</p>
        <h1 className="liga-verificar-correo__title">Confirma tu correo electrónico</h1>
        <p className="liga-verificar-correo__copy">
          Estamos verificando que esta dirección de correo te pertenece para
          mantenerte informado sobre tu participación deportiva.
        </p>

        {vista === "cargando" || vista === "confirmando" ? (
          <p className="liga-verificar-correo__status" role="status">
            {vista === "confirmando" ? "Confirmando…" : "Revisando el enlace…"}
          </p>
        ) : null}

        {vista === "listo" ? (
          <Button
            type="button"
            variant="primary"
            className="liga-verificar-correo__cta"
            onClick={() => void confirmar()}
          >
            CONFIRMAR MI CORREO
          </Button>
        ) : null}

        {vista !== "cargando" &&
        vista !== "listo" &&
        vista !== "confirmando" ? (
          <p className="liga-verificar-correo__status" role="status">
            {MENSAJES[vista]}
          </p>
        ) : null}

        <p className="liga-verificar-correo__note">
          Confirmar el correo no activa notificaciones por sí solo. El club
          administra esas preferencias.
        </p>
      </section>
    </LigaPageShell>
  );
};

export default LigaVerificarCorreoPublica;
