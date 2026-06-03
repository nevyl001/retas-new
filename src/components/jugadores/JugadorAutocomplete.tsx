import React, { useEffect, useState } from "react";
import { searchRivieraJugadoresQuick } from "../../lib/rivieraJugadores/rivieraJugadoresService";
import type { RivieraJugador } from "../../lib/rivieraJugadores/types";
import { JugadorAvatar } from "./JugadorAvatar";
import { JugadorCategoriaBadge } from "./JugadorCategoriaBadge";

interface JugadorAutocompleteProps {
  organizadorId: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (jugador: RivieraJugador) => void;
  placeholder?: string;
  className?: string;
}

export const JugadorAutocomplete: React.FC<JugadorAutocompleteProps> = ({
  organizadorId,
  value,
  onChange,
  onSelect,
  placeholder = "Buscar en registro Riviera…",
  className = "",
}) => {
  const [suggestions, setSuggestions] = useState<RivieraJugador[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!value.trim() || value.length < 2) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const rows = await searchRivieraJugadoresQuick(organizadorId, value);
        setSuggestions(rows);
        setOpen(rows.length > 0);
      } catch {
        setSuggestions([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [organizadorId, value]);

  return (
    <div className={`rj-autocomplete ${className}`.trim()}>
      <input
        className="rj-search"
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
      />
      {open && suggestions.length > 0 && (
        <ul className="rj-autocomplete__list">
          {suggestions.map((j) => (
            <li key={j.id}>
              <button
                type="button"
                className="rj-autocomplete__item"
                style={{ width: "100%", border: "none", background: "none", color: "inherit" }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect(j);
                  onChange(j.nombre);
                  setOpen(false);
                }}
              >
                <JugadorAvatar fotoUrl={j.foto_url} nombre={j.nombre} size="sm" />
                <span style={{ flex: 1, textAlign: "left" }}>{j.nombre}</span>
                <JugadorCategoriaBadge categoria={j.categoria} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
