import 'dotenv/config';
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

function parseOrigins(): string[] {
  const raw = (process.env.FRONTEND_URL ?? 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => s !== '*');
  // Fail-closed: không bao giờ cho * khi credentials:true.
  return raw.length > 0 ? raw : ['http://localhost:3000'];
}

async function bootstrap() {
  const isProd = process.env.NODE_ENV === 'production';
  const app = await NestFactory.create(AppModule, {
    // Prod: chỉ log warn/error để nhẹ disk; dev giữ đầy đủ.
    logger: isProd ? ['warn', 'error'] : undefined,
  });
  app.use(helmet());
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );
  app.enableCors({
    origin: parseOrigins(),
    credentials: true,
  });
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  new Logger('Bootstrap').log(`Aurel backend listening on :${port}`);
}
bootstrap();
