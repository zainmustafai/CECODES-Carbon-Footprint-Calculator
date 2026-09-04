import { renderTemplate } from "@/lib/mail/render";
import type { MailMessage } from "@/lib/mail/transport";

// The three messages this app sends, as pure functions of their data.
//
// Copy is inline Spanish rather than next-intl. next-intl resolves a locale from the request, and
// these messages are also built from paths that have no request: an admin creating a user, and any
// future scheduled send. A translator that works in one path and throws in another is worse than a
// fixed string, and es-CO is the product language anyway.

function expiry(minutes: number): string {
  return `${minutes} ${minutes === 1 ? "minuto" : "minutos"}`;
}

/** es-CO, no time zone shown: the reader's question is "was that me", not "which second". */
function spanishDate(value: Date): string {
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "long", timeStyle: "short", timeZone: "America/Bogota" })
    .format(value);
}

export function resetPasswordMessage(input: {
  to: string;
  resetUrl: string;
  expiresInMinutes: number;
}): MailMessage {
  const window = expiry(input.expiresInMinutes);
  return {
    to: input.to,
    subject: "Restablece tu contraseña",
    html: renderTemplate("reset-password", { resetUrl: input.resetUrl, expiry: window }),
    text: [
      "Restablece tu contraseña",
      "",
      "Recibimos una solicitud para restablecer la contraseña de tu cuenta en Huella de Carbono CECODES.",
      "",
      "Abre este enlace para crear una nueva contraseña:",
      input.resetUrl,
      "",
      `El enlace vence en ${window} y solo se puede usar una vez.`,
      "",
      "Si no solicitaste el cambio, ignora este mensaje. Tu contraseña actual sigue siendo válida.",
    ].join("\n"),
  };
}

export function welcomeMessage(input: {
  to: string;
  name: string | null;
  setPasswordUrl: string;
  expiresInMinutes: number;
}): MailMessage {
  const window = expiry(input.expiresInMinutes);
  const greeting = input.name ? `Hola ${input.name}: se creó` : "Se creó";
  return {
    to: input.to,
    subject: "Tu cuenta en Huella de Carbono CECODES",
    html: renderTemplate("welcome", {
      name: input.name,
      email: input.to,
      setPasswordUrl: input.setPasswordUrl,
      expiry: window,
    }),
    text: [
      "Tu cuenta en Huella de Carbono",
      "",
      `${greeting} una cuenta para ti en Huella de Carbono CECODES.`,
      `Tu usuario es ${input.to}.`,
      "",
      "Define tu contraseña con este enlace:",
      input.setPasswordUrl,
      "",
      `El enlace vence en ${window}. Si vence, pide uno nuevo desde "Olvidé mi contraseña".`,
    ].join("\n"),
  };
}

export function passwordChangedMessage(input: {
  to: string;
  changedAt: Date;
  byAdmin: boolean;
}): MailMessage {
  const when = spanishDate(input.changedAt);
  const how = input.byAdmin ? "fue restablecida por un administrador de CECODES" : "se cambió";
  return {
    to: input.to,
    subject: "Tu contraseña cambió",
    html: renderTemplate("password-changed", { changedAt: when, byAdmin: input.byAdmin }),
    text: [
      "Tu contraseña cambió",
      "",
      `La contraseña de tu cuenta en Huella de Carbono CECODES ${how} el ${when}.`,
      "Todas las sesiones abiertas se cerraron, así que tendrás que ingresar de nuevo.",
      "",
      "Si no fuiste tú, escribe a CECODES de inmediato: alguien más tiene acceso a tu cuenta.",
    ].join("\n"),
  };
}
