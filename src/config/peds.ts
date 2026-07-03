/** PEDS v1 — Public Experience Design System (Sprint 2+). */
/** ON por defecto; rollback con REACT_APP_PUB_DS_V2=false en build. */
export const isPubDsV2Enabled =
  process.env.REACT_APP_PUB_DS_V2 !== "false";
