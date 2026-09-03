// The Spanish step-by-step guide CECODES supplied on 2026-09-03, served straight out of public/.
//
// The filename carries spaces and an accented character, so the href is percent-encoded once here
// rather than at each call site: an unencoded space in an href is the kind of thing that works in
// one browser and 404s in another. The `download` attribute takes the human-readable name, which
// is what the user ends up with on disk.
//
// NOTE for whoever touches src/proxy.ts: its matcher does not exclude .pdf, so this request runs
// through the auth middleware. That is intentional here (the guide is for signed-in users and the
// button only exists inside the app), but it does mean a signed-out deep link lands on /login
// rather than downloading.
export const USER_GUIDE_FILENAME = "Herramienta de Huella de Carbono - Guía.pdf";

export const USER_GUIDE_HREF = `/${encodeURIComponent(USER_GUIDE_FILENAME)}`;
