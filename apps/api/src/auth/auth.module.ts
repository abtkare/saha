import { Global, Module } from '@nestjs/common';
import { KvService } from './kv';
import { RateLimitService } from './rate-limit.service';
import { OtpService } from './otp.service';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { AuthController } from './auth.controller';
import { MeController } from './me.controller';
import { AdminController, ScopedController } from './admin.controller';

@Global()
@Module({
  controllers: [AuthController, MeController, AdminController, ScopedController],
  providers: [KvService, RateLimitService, OtpService, AuthService, AuthGuard],
  exports: [AuthService, AuthGuard, RateLimitService],
})
export class AuthModule {}
