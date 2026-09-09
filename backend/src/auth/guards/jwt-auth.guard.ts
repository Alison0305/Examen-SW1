import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AuthService } from "../auth.service";
import type { AuthenticatedRequest } from "../auth.types";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(@Inject(JwtService) private readonly jwt: JwtService, @Inject(AuthService) private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) {
      throw new UnauthorizedException();
    }

    try {
      const payload = await this.jwt.verifyAsync<{ sub?: string }>(authorization.slice(7));
      if (!payload.sub) throw new UnauthorizedException();
      const user = await this.auth.findAuthenticatedUser(payload.sub);
      if (!user) throw new UnauthorizedException();
      request.authenticatedUser = user;
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
