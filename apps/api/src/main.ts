import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ArabicErrorFilter } from './common/arabic-error.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ArabicErrorFilter());
  app.enableShutdownHooks();

  // Swagger: يُقيَّد للمديرين في الجلسة 2 (الدخول والأدوار). الآن مفعّل في بيئة التطوير فقط.
  if (process.env.SWAGGER_ENABLED === 'true') {
    const config = new DocumentBuilder().setTitle('ساحة API').setVersion('0.1').build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  }

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, '0.0.0.0');
  console.log(`ساحة API تعمل على المنفذ ${port}`);
}
bootstrap();
