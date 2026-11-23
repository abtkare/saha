import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { hasPermission } from '@saha/shared';
import { AppModule } from './app.module';
import { ArabicErrorFilter } from './common/arabic-error.filter';
import { AuthService } from './auth/auth.service';
import { authConfig } from './auth/config';

async function bootstrap() {
  // يفشل الإقلاع في الإنتاج إن كانت الأسرار مفقودة
  void authConfig.jwtSecret; void authConfig.refreshSecret;

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.set('trust proxy', 1); // الموقع يمرّر الطلبات من داخل شبكة Docker
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ArabicErrorFilter());
  app.enableShutdownHooks();

  // Swagger للمدير العام فقط (دخول الإدارة بـ TOTP): Authorization: Bearer <accessToken>
  if (process.env.SWAGGER_ENABLED === 'true') {
    const auth = app.get(AuthService);
    app.use('/api/docs', async (req: Request, res: Response, next: NextFunction) => {
      try {
        const ctx = await auth.authenticate(req.headers.authorization);
        if (hasPermission(ctx.grants, 'audit.verify', {}, ctx.mfa)) return next();
      } catch { /* يُرفض أدناه */ }
      res.status(401).json({ statusCode: 401, code: 'UNAUTHORIZED', message: 'توثيق الـ API للمديرين فقط.' });
    });
    const config = new DocumentBuilder().setTitle('ساحة API').setVersion('0.2').addBearerAuth().build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  }

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, '0.0.0.0');
  console.log(`ساحة API تعمل على المنفذ ${port}`);
}
bootstrap();
