import { ConflictException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthenticatedUser } from "./auth.types";

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

@Injectable()
export class AuthService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(JwtService) private readonly jwt: JwtService) {}

  async register(email: string, password: string) {
    try {
      const user = await this.prisma.user.create({
        data: { email: normalizeEmail(email), passwordHash: await argon2.hash(password, { type: argon2.argon2id }) },
        select: { id: true, email: true, createdAt: true },
      });
      return user;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("El email ya está registrado.");
      }
      throw error;
    }
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
    if (!user || !(await argon2.verify(user.passwordHash, password))) {
      throw new UnauthorizedException("Credenciales inválidas.");
    }
    const accessToken = await this.jwt.signAsync({ sub: user.id });
    return { accessToken, tokenType: "Bearer" };
  }

  async findAuthenticatedUser(id: string): Promise<AuthenticatedUser | null> {
    return this.prisma.user.findUnique({ where: { id }, select: { id: true, email: true } });
  }
}
