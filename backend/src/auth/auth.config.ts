import type { JwtSignOptions } from "@nestjs/jwt";

export interface AuthConfig {
  secret: string;
  expiresIn: JwtSignOptions["expiresIn"];
}

export function getAuthConfig(): AuthConfig {
  const secret = process.env.JWT_SECRET?.trim();
  const expiresIn = process.env.JWT_EXPIRES_IN?.trim();

  if (!secret || !expiresIn) {
    throw new Error("Faltan las variables de entorno obligatorias JWT_SECRET y JWT_EXPIRES_IN.");
  }
  if (!/^(\d+|\d+[smhdwy])$/.test(expiresIn)) {
    throw new Error("JWT_EXPIRES_IN debe ser segundos o una duración como 30m, 1h o 7d.");
  }

  return { secret, expiresIn: expiresIn as JwtSignOptions["expiresIn"] };
}
