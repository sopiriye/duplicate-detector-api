import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableShutdownHooks();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('UCARD Paystation Merchant Onboarding API')
    .setDescription(
      'Assessment backend for merchant onboarding, duplicate detection, and admin review.',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();

  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument);

  await app.listen(process.env.PORT ?? 3000);
}

(async () => {
  await bootstrap();
})().catch((error) => {
  console.error('Bootstrap failed:', error);
  process.exit(1);
}); //Codex Note: Dont change this to a normal function call, it needs to be an IIFE to properly handle async/await and error catching at the top level.
