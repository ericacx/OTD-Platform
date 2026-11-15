import type { Linter } from "eslint";
export function nodeConfig(options?: { ignores?: string[]; decorators?: boolean }): Linter.Config[];
