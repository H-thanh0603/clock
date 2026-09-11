import 'dotenv/config';
import 'reflect-metadata';
import { join } from 'path';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { initObservability } from './common/observability';

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
  // Sentry noop khi không có SENTRY_DSN (dev/CI) — xem common/observability.
  initObservability();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Prod: chỉ log warn/error để nhẹ disk; dev giữ đầy đủ.
    logger: isProd ? ['warn', 'error'] : undefined,
    // Cap body chủ động (nếu không Nest/express default 100kb). Payload
    // lớn nhất là inquiry (đã cap 4KB riêng) — 256kb dư sức, chặn CPU-DoS
    // qua JSON khổng lồ.
    bodyParser: true,
    rawBody: false,
  });
  app.useBodyParser('json', { limit: '256kb' });
  app.useBodyParser('urlencoded', { limit: '256kb', extended: true });
  // Phục vụ ảnh upload (volume). Prod sau Caddy: /backend/uploads/*.
  // Tên file có random hex nên nội dung bất biến → cache dài tối đa.
  app.useStaticAssets(process.env.UPLOADS_DIR ?? join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
    maxAge: '365d',
    immutable: true,
  });
  app.use(helmet());
  // HSTS cho client sau khi Caddy lo TLS (chỉ prod; dev http sẽ tự bỏ qua).
  if (isProd) {
    app.use(
      helmet({
        strictTransportSecurity: {
          maxAge: 31536000,
          includeSubDomains: true,
        },
      }),
    );
  }
  // API trả dữ liệu cá nhân (khách hàng, giỏ, đơn) — không cho proxy/browser cache.
  app.use((req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
    if (req.path.startsWith('/uploads/')) return next();
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
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
