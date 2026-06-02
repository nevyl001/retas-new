/**
 * Envío de email vía Resend.
 */

export const RESEND_FROM = "Riviera Open <noreply@appriviera.rivieraopen.com>";

export interface ResendSendResult {
  ok: boolean;
  status: number;
  responseBody: string;
  error?: string;
}

/** Remitente fijo: dominio verificado appriviera.rivieraopen.com */
export function resolveResendFrom(): string {
  const env = (Deno.env.get("RESEND_FROM") ?? "").trim();
  if (env && env !== RESEND_FROM) {
    console.warn(
      JSON.stringify({
        event: "resend_from_env_ignored",
        env_from: env,
        using: RESEND_FROM,
      }),
    );
  }
  return RESEND_FROM;
}

export function resendApiKeyConfigured(): boolean {
  const key = Deno.env.get("RESEND_API_KEY") ?? "";
  return key.length > 0 && key.startsWith("re_");
}

export function logResendConfig(functionName: string): void {
  const key = Deno.env.get("RESEND_API_KEY") ?? "";
  console.log(
    JSON.stringify({
      event: "resend_config",
      function: functionName,
      resend_from: RESEND_FROM,
      resend_api_key_present: key.length > 0,
      resend_api_key_prefix: key ? `${key.slice(0, 8)}...` : null,
    }),
  );
}

export async function sendByResend(
  to: string,
  subject: string,
  message: string,
  html?: string,
  context?: Record<string, unknown>,
): Promise<ResendSendResult> {
  const apiKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const from = resolveResendFrom();

  if (!apiKey) {
    const err = "RESEND_API_KEY no configurada en secrets de Supabase.";
    console.error(
      JSON.stringify({
        event: "resend_send_error",
        from,
        to,
        subject,
        status: 0,
        responseBody: err,
        ...context,
      }),
    );
    return { ok: false, status: 0, responseBody: err, error: err };
  }

  const payload = {
    from,
    to: [to],
    subject,
    html: html ?? message.replace(/\n/g, "<br/>"),
    text: message,
  };

  console.log(
    JSON.stringify({
      event: "resend_send_attempt",
      from,
      to,
      subject,
      ...context,
    }),
  );

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const responseBody = await res.text();

  console.log(
    JSON.stringify({
      event: res.ok ? "resend_send_success" : "resend_send_failed",
      from,
      to,
      subject,
      status: res.status,
      responseBody,
      ...context,
    }),
  );

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      responseBody,
      error: `Resend ${res.status}: ${responseBody}`,
    };
  }

  return { ok: true, status: res.status, responseBody };
}
