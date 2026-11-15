import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export interface FileStorage {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

export class DiskStorage implements FileStorage {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  private path(key: string): string {
    const p = resolve(join(this.root, key));
    if (!p.startsWith(this.root)) throw new Error("invalid storage key");
    return p;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, data);
  }

  get(key: string): Promise<Buffer> {
    return readFile(this.path(key));
  }

  async remove(key: string): Promise<void> {
    await unlink(this.path(key)).catch(() => undefined);
  }
}

export class MemoryStorage implements FileStorage {
  private readonly items = new Map<string, Buffer>();

  async put(key: string, data: Buffer): Promise<void> {
    this.items.set(key, data);
  }

  async get(key: string): Promise<Buffer> {
    const v = this.items.get(key);
    if (!v) throw new Error("not found");
    return v;
  }

  async remove(key: string): Promise<void> {
    this.items.delete(key);
  }
}
