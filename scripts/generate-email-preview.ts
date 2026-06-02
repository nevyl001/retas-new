/**
 * Genera /tmp/email-preview.html con muestra asignacion_grupo.
 * Uso: npx tsx scripts/generate-email-preview.ts
 */
import { writeFileSync } from "node:fs";

(globalThis as { Deno?: { env: { get: (k: string) => string | undefined } } })
  .Deno = {
  env: {
    get: (k: string) =>
      k === "APP_PUBLIC_URL" ? "http://localhost:3000" : undefined,
  },
};

async function main() {
  const { buildRivieraEmail } = await import(
    "../supabase/functions/_shared/emailTemplates.ts"
  );

  const torneoId = "00000000-0000-4000-8000-000000000001";
  const grupoId = "00000000-0000-4000-8000-000000000002";

  const samples = [
    buildRivieraEmail({
      kind: "asignacion_grupo",
      playerName: "Nevyl",
      torneoNombre: "Vip Smash Padel House",
      torneoId,
      grupoId,
      categoria: "5ta Fuerza",
      compañero: "Ale / Marco",
      grupoNombre: "Grupo A",
      rivales: "Pedro / Luis, Ana / Sofía",
    }),
    buildRivieraEmail({
      kind: "bienvenida_torneo",
      playerName: "Nevyl",
      torneoNombre: "Vip Smash Padel House",
      torneoId,
      categoria: "5ta Fuerza",
    }),
  ];

  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"/><title>Email preview</title></head>
<body style="margin:0;padding:24px;background:#0a0a0b;">
${samples.map((s, i) => `<section style="margin-bottom:48px;"><h2 style="color:#fff;font-family:sans-serif;font-size:14px;margin:0 0 12px;">${i + 1}. ${s.subject}</h2>${s.html}</section>`).join("\n")}
</body></html>`;

  const out = "/tmp/email-preview.html";
  const outLocal = "public/email-preview.html";
  writeFileSync(out, html);
  writeFileSync(outLocal, html);
  console.log(`Written ${out}`);
  console.log(`Written ${outLocal} — abre http://localhost:3000/email-preview.html (con npm start)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
