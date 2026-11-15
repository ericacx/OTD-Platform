#!/usr/bin/env node
/**
 * Post-build clean-up.
 *
 * MSW ships a service-worker file at `public/mockServiceWorker.js` so the
 * dev worker can register itself from a same-origin URL. Vite copies every
 * `public/*` file into `dist/` verbatim, which would ship the worker to
 * production even though the client code that registers it has already
 * been dead-code-eliminated (see `src/app/main.tsx`). We delete it here so
 * the production artifact contains only what production actually needs.
 */
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const distDir = join(projectRoot, "dist");

const filesToRemove = ["mockServiceWorker.js"];

for (const relative of filesToRemove) {
  const absolute = join(distDir, relative);
  if (existsSync(absolute)) {
    rmSync(absolute, { force: true });
    process.stdout.write(`postbuild: removed dist/${relative}\n`);
  }
}
