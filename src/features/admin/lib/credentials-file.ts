// Builds the downloadable credentials .txt the admin hands to a new user. Passwords exist in
// plaintext only at the moment of generation (auth.users stores a hash), so this file can only
// be produced right then; there is no "download again later" without regenerating.

export type CredentialsFileLabels = {
  title: string;
  subtitle: string;
  url: string;
  email: string;
  password: string;
  note: string;
};

// Windows-illegal filename characters plus whitespace; "@" and "." are legal and stay, so the
// file is recognizably named after the account.
const UNSAFE_FILENAME = /[\\/:*?"<>|\s]/g;

export function buildCredentialsFile({
  origin,
  email,
  password,
  labels,
}: {
  origin: string;
  email: string;
  password: string;
  labels: CredentialsFileLabels;
}): { filename: string; content: string } {
  const filename = `credenciales-${email.replace(UNSAFE_FILENAME, "_")}.txt`;
  const content = [
    labels.title,
    labels.subtitle,
    "",
    `${labels.url}: ${origin}/login`,
    `${labels.email}: ${email}`,
    `${labels.password}: ${password}`,
    "",
    labels.note,
    "",
  ].join("\r\n");
  return { filename, content };
}

// Browser-only: triggers a plain-text download. The BOM is prepended here, not in the builder,
// so accented Spanish survives legacy editors while the builder stays byte-exact testable.
export function downloadTextFile(filename: string, content: string): void {
  const bom = String.fromCharCode(0xfeff);
  const blob = new Blob([bom, content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
