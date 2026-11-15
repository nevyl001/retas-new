import React from "react";
import type { CoachProfessionalProfile } from "../../lib/coaching/types";

const POSITION_LABEL: Record<string, string> = {
  reves: "Revés",
  drive: "Drive",
  ambas: "Ambas",
};

export function coachHasPublicStory(profile: CoachProfessionalProfile): boolean {
  return Boolean(
    profile.bio ||
      profile.anosExperiencia != null ||
      profile.certificaciones ||
      profile.metodologiaEnsenanza ||
      profile.enfoqueTecnico ||
      profile.objetivosAlumnos ||
      profile.estructuraEntrenamientos ||
      profile.areasEntrenamiento.length ||
      profile.fortalezas.length ||
      profile.habilidadesPrincipales.length
  );
}

function Block({ label, text }: { label: string; text?: string | null }) {
  if (!text) return null;
  return (
    <div className="coach-story-block">
      <span>{label}</span>
      <p>{text}</p>
    </div>
  );
}

export const CoachPublicDetails: React.FC<{ profile: CoachProfessionalProfile }> = ({
  profile,
}) => (
  <div className="coach-story-details">
    {profile.posicionJuego ? (
      <Block label="Posición habitual" text={POSITION_LABEL[profile.posicionJuego]} />
    ) : null}
    <Block label="Certificaciones" text={profile.certificaciones} />
    <Block label="Enfoque técnico y táctico" text={profile.enfoqueTecnico} />
    <Block label="Objetivos con sus alumnos" text={profile.objetivosAlumnos} />
    <Block label="Estructura de los entrenamientos" text={profile.estructuraEntrenamientos} />
    {profile.areasEntrenamiento.length > 0 ? (
      <Block label="Áreas" text={profile.areasEntrenamiento.join(" · ")} />
    ) : null}
    {profile.fortalezas.length > 0 ? (
      <Block label="Fortalezas" text={profile.fortalezas.join(" · ")} />
    ) : null}
    {profile.habilidadesPrincipales.length > 0 ? (
      <Block label="Habilidades que trabaja" text={profile.habilidadesPrincipales.join(" · ")} />
    ) : null}
  </div>
);
