import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module.js";
import { configureApp, createAdapter } from "./bootstrap.js";
import { loadEnv } from "./core/env.js";
import { Scheduler } from "./core/scheduler.js";

const env = loadEnv();
const app = await NestFactory.create<NestFastifyApplication>(AppModule, createAdapter(), { bufferLogs: false });
await configureApp(app, env.CORS_ORIGIN);
if (process.argv.includes("--with-worker") || env.DATABASE_URL.startsWith("pglite:")) app.get(Scheduler).start();
await app.listen(env.PORT, "0.0.0.0");
new Logger("Bootstrap").log(`OTD api listening on http://localhost:${env.PORT}/api/v1`);
