// DOM ids built from domain strings. Category and element names contain spaces and accents
// ("Fuentes Fijas", "Emisiones Fugitivas"), and an id with a space breaks every idref that
// points at it: aria-describedby="hint-Fuentes Fijas" reads as TWO ids, "hint-Fuentes" and
// "Fijas", so assistive tech resolves neither.
export function domId(...parts: string[]): string {
  return parts
    .join("-")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-");
}
