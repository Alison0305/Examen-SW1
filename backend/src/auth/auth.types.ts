import type { FastifyRequest } from "fastify";

export interface AuthenticatedUser {
  id: string;
  email: string;
}

export type AuthenticatedRequest = FastifyRequest & {
  authenticatedUser?: AuthenticatedUser;
};
