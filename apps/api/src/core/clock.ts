import { Injectable } from "@nestjs/common";

@Injectable()
export class Clock {
  private fixed: Date | null = null;

  now(): Date {
    return this.fixed ? new Date(this.fixed) : new Date();
  }

  today(): string {
    return this.now().toISOString().slice(0, 10);
  }

  set(date: Date | string): void {
    this.fixed = new Date(date);
  }

  advanceDays(days: number): void {
    this.fixed = new Date(this.now().getTime() + days * 86_400_000);
  }

  reset(): void {
    this.fixed = null;
  }
}
