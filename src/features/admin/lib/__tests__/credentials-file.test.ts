import { describe, expect, it } from "vitest";
import { buildCredentialsFile } from "../credentials-file";

const labels = {
  title: "CECODES Huella de Carbono",
  subtitle: "Credenciales de acceso",
  url: "Plataforma",
  email: "Correo",
  password: "Contraseña temporal",
  note: "Esta contraseña es temporal.",
};

describe("buildCredentialsFile", () => {
  it("names the file after the account email", () => {
    const { filename } = buildCredentialsFile({
      origin: "https://huella.cecodes.org.co",
      email: "persona@empresa.com",
      password: "x".repeat(16),
      labels,
    });
    expect(filename).toBe("credenciales-persona@empresa.com.txt");
  });

  it("sanitizes characters Windows refuses in filenames", () => {
    const { filename } = buildCredentialsFile({
      origin: "http://localhost:3000",
      email: 'we?ird"user <x>@empresa.com',
      password: "x".repeat(16),
      labels,
    });
    expect(filename).toBe("credenciales-we_ird_user__x_@empresa.com.txt");
  });

  it("writes the login URL, the credentials, and the note", () => {
    const { content } = buildCredentialsFile({
      origin: "https://huella.cecodes.org.co",
      email: "persona@empresa.com",
      password: "Abcdefgh12345678",
      labels,
    });
    expect(content).toContain("Plataforma: https://huella.cecodes.org.co/login");
    expect(content).toContain("Correo: persona@empresa.com");
    expect(content).toContain("Contraseña temporal: Abcdefgh12345678");
    expect(content).toContain("Esta contraseña es temporal.");
    // The BOM belongs to the download helper, never the builder output.
    expect(content.charCodeAt(0)).not.toBe(0xfeff);
  });
});
