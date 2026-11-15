import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { Clock } from "./clock.js";

export type JobSpec = {
  name: string;
  everyMinutes?: number;
  dailyAt?: string;
  run: () => Promise<unknown>;
};

@Injectable()
export class Scheduler implements OnModuleDestroy {
  private readonly logger = new Logger("Scheduler");
  private readonly jobs = new Map<string, JobSpec & { lastRun?: number; running?: boolean }>();
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly clock: Clock) {}

  register(spec: JobSpec): void {
    this.jobs.set(spec.name, { ...spec });
  }

  list(): string[] {
    return [...this.jobs.keys()];
  }

  async runNow(name: string): Promise<unknown> {
    const job = this.jobs.get(name);
    if (!job) throw new Error(`unknown job ${name}`);
    return this.execute(job);
  }

  start(tickMs = 30_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), tickMs);
    this.logger.log(`started with ${this.jobs.size} jobs: ${this.list().join(", ")}`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    const now = this.clock.now();
    for (const job of this.jobs.values()) {
      if (job.running || !isDue(job, now)) continue;
      try {
        await this.execute(job);
      } catch {
        job.lastRun = now.getTime();
      }
    }
  }

  private async execute(job: JobSpec & { lastRun?: number; running?: boolean }): Promise<unknown> {
    job.running = true;
    try {
      const result = await job.run();
      job.lastRun = this.clock.now().getTime();
      return result;
    } catch (err) {
      this.logger.error(`${job.name} failed: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    } finally {
      job.running = false;
    }
  }
}

function isDue(job: JobSpec & { lastRun?: number }, now: Date): boolean {
  if (job.everyMinutes) return !job.lastRun || now.getTime() - job.lastRun >= job.everyMinutes * 60_000;
  if (job.dailyAt) {
    const [h, m] = job.dailyAt.split(":").map(Number);
    const target = new Date(now);
    target.setHours(h ?? 0, m ?? 0, 0, 0);
    return now >= target && (!job.lastRun || job.lastRun < target.getTime());
  }
  return false;
}
