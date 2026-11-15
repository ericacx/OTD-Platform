import { type PipeTransform } from "@nestjs/common";
import { commonErrors } from "@otd/contracts/errors";
import type { ZodType } from "zod";
import { AppError } from "./errors.js";

export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value ?? {});
    if (!result.success) {
      throw new AppError(commonErrors.COMMON_VALIDATION_FAILED, {
        fields: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    return result.data;
  }
}

export const zod = <T>(schema: ZodType<T>) => new ZodPipe(schema);
