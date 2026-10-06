import React from "react";
import { useRetryableImage } from "../../../hooks/useRetryableImage";
import { getJugadorInitials, JugadorAvatar } from "../../jugadores/JugadorAvatar";

export type TEPublicPairPlayer = {
  id: string | null;
  nombre: string;
  fotoUrl?: string | null;
  rating?: number | null;
};

export type TEPublicPairSide = {
  player1: TEPublicPairPlayer;
  player2: TEPublicPairPlayer | null;
};

export type TEPublicPairVariant = "match" | "standings";

export type TEPublicPairLookupEntry = {
  id: string;
  name: string;
};

function cleanId(id?: string | null): string | null {
  const trimmed = id?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Identidad visual de una plaza. Una virtual, o un label sin " / ",
 * queda en un solo jugador: no se inventa un segundo nombre ni se busca foto.
 */
export function pairSideFromRoster(input: {
  isVirtual?: boolean;
  display: string;
  player1Id?: string | null;
  player2Id?: string | null;
}): TEPublicPairSide {
  const display = input.display.trim() || "Pareja";
  if (input.isVirtual) {
    return {
      player1: { id: null, nombre: display },
      player2: null,
    };
  }

  const parts = display
    .split(/\s*\/\s*/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2) {
    return {
      player1: { id: null, nombre: parts[0] || display },
      player2: null,
    };
  }

  return {
    player1: { id: cleanId(input.player1Id), nombre: parts[0]! },
    player2: { id: cleanId(input.player2Id), nombre: parts[1]! },
  };
}

/** Ids únicos para una sola llamada a resolvePlayerPublicProfiles. */
export function collectPairPlayerEntries(
  sides: readonly TEPublicPairSide[],
  extra: ReadonlyArray<{ id?: string | null; name?: string | null }> = []
): TEPublicPairLookupEntry[] {
  const seen = new Set<string>();
  const entries: TEPublicPairLookupEntry[] = [];

  const add = (id?: string | null, name?: string | null) => {
    const trimmed = id?.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    entries.push({ id: trimmed, name: name?.trim() || trimmed });
  };

  for (const side of sides) {
    add(side.player1.id, side.player1.nombre);
    if (side.player2) add(side.player2.id, side.player2.nombre);
  }
  for (const player of extra) add(player.id, player.name);

  entries.sort((a, b) => a.id.localeCompare(b.id));
  return entries;
}

export function paintPairSide(
  side: TEPublicPairSide,
  photos: Readonly<Record<string, string | null>>,
  ratings?: Readonly<Record<string, number | null>>
): TEPublicPairSide {
  const paint = (player: TEPublicPairPlayer): TEPublicPairPlayer => {
    if (!player.id) return { ...player, fotoUrl: null, rating: null };
    return {
      ...player,
      fotoUrl: photos[player.id] ?? null,
      rating: ratings?.[player.id] ?? null,
    };
  };
  return {
    player1: paint(side.player1),
    player2: side.player2 ? paint(side.player2) : null,
  };
}

function formatPlayerLevel(rating?: number | null): string | null {
  if (rating == null || !Number.isFinite(rating)) return null;
  return rating.toFixed(2);
}

function MatchPortrait({ player }: { player: TEPublicPairPlayer }) {
  const { src, onError } = useRetryableImage(player.fotoUrl);
  const level = formatPlayerLevel(player.rating);
  const initials = getJugadorInitials(player.nombre);

  return (
    <div className="te-public-pair__portrait">
      {src ? (
        <img
          className="te-public-pair__photo"
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={onError}
        />
      ) : (
        <span className="te-public-pair__fallback" aria-hidden="true">
          {initials}
        </span>
      )}
      <span className="te-public-pair__shade" aria-hidden="true" />
      <span className="te-public-pair__caption">
        <span className="te-public-pair__name">{player.nombre}</span>
        {level ? (
          <span className="te-public-pair__level" aria-label={`Nivel ${level}`}>
            {level}
          </span>
        ) : null}
      </span>
    </div>
  );
}

export const TEPublicPairIdentity: React.FC<{
  player1: TEPublicPairPlayer;
  player2?: TEPublicPairPlayer | null;
  variant: TEPublicPairVariant;
  className?: string;
}> = ({ player1, player2 = null, variant, className = "" }) => {
  const rootClass = [
    "te-public-pair",
    `te-public-pair--${variant}`,
    variant === "match" && !player2 ? "te-public-pair--solo" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (variant === "match") {
    return (
      <div className={rootClass}>
        <MatchPortrait player={player1} />
        {player2 ? <MatchPortrait player={player2} /> : null}
      </div>
    );
  }

  return (
    <div className={rootClass}>
      <div className="te-public-pair__avatars" aria-hidden="true">
        <JugadorAvatar
          fotoUrl={player1.fotoUrl}
          nombre={player1.nombre}
          size="sm"
          className="te-public-pair__avatar"
        />
        {player2 ? (
          <JugadorAvatar
            fotoUrl={player2.fotoUrl}
            nombre={player2.nombre}
            size="sm"
            className="te-public-pair__avatar te-public-pair__avatar--overlap"
          />
        ) : null}
      </div>
      <div className="te-public-pair__names">
        <span className="te-public-pair__name">{player1.nombre}</span>
        {player2 ? (
          <span className="te-public-pair__name">{player2.nombre}</span>
        ) : null}
      </div>
    </div>
  );
};
