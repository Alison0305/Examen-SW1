import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { getAuthConfig } from "./auth.config";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";

@Module({
  imports: [JwtModule.registerAsync({ useFactory: () => {
    const config = getAuthConfig();
    return { secret: config.secret, signOptions: { expiresIn: config.expiresIn } };
  } })],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
