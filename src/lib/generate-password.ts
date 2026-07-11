// A read-only temporary password an admin can share. Built from a safe alphabet (no 0/O,
// 1/l/I, so it can be dictated) with crypto.getRandomValues so it is unpredictable. Used by
// the user create dialog and the new-company onboarding wizard.
export function generateTempPassword(length = 16): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}
