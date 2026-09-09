import { describe, expect, it, vi } from "vitest";
import * as argon2 from "argon2";
import { JwtService } from "@nestjs/jwt";
import { AuthService, normalizeEmail } from "./auth.service";

describe("AuthService", () => {
  it("normaliza el email una sola vez", () => {
    expect(normalizeEmail("  USER@Example.COM  ")).toBe("user@example.com");
  });

  it("registra con hash Argon2id y no devuelve passwordHash", async () => {
    const create = vi.fn().mockImplementation(async ({ data }) => ({ id: "user-id", email: data.email, createdAt: new Date() }));
    const service = new AuthService({ user: { create } } as never, new JwtService());

    const user = await service.register(" USER@Example.COM ", "password-123");
    const hash = create.mock.calls[0]?.[0].data.passwordHash as string;

    expect(create.mock.calls[0]?.[0].data.email).toBe("user@example.com");
    expect(hash).not.toBe("password-123");
    await expect(argon2.verify(hash, "password-123")).resolves.toBe(true);
    expect(user).not.toHaveProperty("passwordHash");
  });
});
