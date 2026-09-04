// The password reset message, as a pure function of the link and its lifetime.
//
// The copy is inline Spanish rather than next-intl. next-intl resolves a locale from the request,
// and this message is also built from paths that have no request: an admin triggering a reset for
// someone else, and any future scheduled or scripted send. A translator that works in one path and
// throws in another is worse than a fixed string, and es-CO is the product language anyway: the
// English toggle exists for the interface, not for a two paragraph email.
//
// The HTML is tables and inline attributes on purpose. Outlook renders through Word, Gmail strips
// <style> blocks and anything it did not expect, and neither honours a stylesheet it has to fetch.
// There is no image and no tracking pixel: a message whose only job is to carry one link should
// not ask the reader's client to phone anywhere, and a remote image is also the thing that gets
// the message blocked before the link is ever seen.

/** --primary from globals.css, spelled in hex because an email client will not resolve oklch(). */
const BRAND = "#002060";

export function passwordResetEmail(input: { resetUrl: string; expiresInMinutes: number }): {
  subject: string;
  html: string;
  text: string;
} {
  const { resetUrl, expiresInMinutes } = input;
  const expiry = `${expiresInMinutes} ${expiresInMinutes === 1 ? "minuto" : "minutos"}`;
  const subject = "Restablece tu contraseña";

  const text = [
    "Restablece tu contraseña",
    "",
    "Recibimos una solicitud para restablecer la contraseña de tu cuenta en Huella de Carbono CECODES.",
    "",
    "Abre este enlace para crear una nueva contraseña:",
    resetUrl,
    "",
    `El enlace vence en ${expiry} y solo se puede usar una vez.`,
    "",
    "Si no solicitaste el cambio, ignora este mensaje. Tu contraseña actual sigue siendo válida.",
  ].join("\n");

  // The link is escaped even though the server builds it: it carries a token, and a token is the
  // one part of this document that is not a literal written here.
  const href = escapeHtml(resetUrl);

  // The link appears twice by design. Some clients drop the styled cell that makes the button, and
  // some readers forward the message as plain text, so the address is also there to be copied.
  const html = `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#f4f5f7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f5f7;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background-color:#ffffff;border-radius:8px;">
<tr><td style="padding:32px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:#1a1a1a;">
<p style="margin:0 0 16px;font-size:20px;font-weight:bold;color:${BRAND};">Restablece tu contraseña</p>
<p style="margin:0 0 16px;">Recibimos una solicitud para restablecer la contraseña de tu cuenta en Huella de Carbono CECODES.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
<tr><td align="center" bgcolor="${BRAND}" style="border-radius:6px;">
<a href="${href}" style="display:inline-block;padding:12px 24px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;">Crear una nueva contraseña</a>
</td></tr>
</table>
<p style="margin:0 0 8px;">Si el botón no funciona, copia este enlace en tu navegador:</p>
<p style="margin:0 0 16px;word-break:break-all;"><a href="${href}" style="color:${BRAND};">${href}</a></p>
<p style="margin:0 0 16px;">El enlace vence en ${expiry} y solo se puede usar una vez.</p>
<p style="margin:0;color:#555555;">Si no solicitaste el cambio, ignora este mensaje. Tu contraseña actual sigue siendo válida.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  return { subject, html, text };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
