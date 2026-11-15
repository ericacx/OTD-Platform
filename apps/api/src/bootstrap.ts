import "reflect-metadata";
import multipart from "@fastify/multipart";
import type { INestApplication } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";

export function createAdapter(): FastifyAdapter {
  return new FastifyAdapter({ trustProxy: true, bodyLimit: 60 * 1024 * 1024 });
}

export async function configureApp(app: INestApplication, corsOrigin?: string): Promise<void> {
  const fastify = app as NestFastifyApplication;
  await fastify.register(multipart as unknown as Parameters<NestFastifyApplication["register"]>[0], { limits: { fileSize: 50 * 1024 * 1024 } });
  app.setGlobalPrefix("api/v1");
  if (corsOrigin) app.enableCors({ origin: corsOrigin.split(","), credentials: true });
  app.enableShutdownHooks();
}
