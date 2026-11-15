import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { Scheduler } from "./core/scheduler.js";

const app = await NestFactory.createApplicationContext(AppModule);
app.enableShutdownHooks();
const scheduler = app.get(Scheduler);
scheduler.start();
new Logger("Worker").log(`worker running jobs: ${scheduler.list().join(", ") || "none"}`);
