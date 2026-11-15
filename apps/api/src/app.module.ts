import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { AuthGuard } from "./core/access/auth.guard.js";
import { CoreModule } from "./core/core.module.js";
import { AllExceptionsFilter, EnvelopeInterceptor } from "./core/http.js";
import { HealthController } from "./health.controller.js";
import { FEATURE_MODULES } from "./modules/index.js";

@Module({
  imports: [CoreModule, ...FEATURE_MODULES],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_INTERCEPTOR, useClass: EnvelopeInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
