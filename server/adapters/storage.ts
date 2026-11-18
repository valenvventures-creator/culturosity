// Media storage boundary. Swap implementations (local / Netlify Blobs / Supabase Storage)
// without touching routes. Access control lives in the API layer, never in the storage key.
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { ServerConfig } from "../env";

export interface StorageAdapter {
  driver: string;
  put(key: string, bytes: Uint8Array, mime: string): Promise<void>;
  get(key: string): Promise<{ bytes: Uint8Array; mime: string } | null>;
  remove(key: string): Promise<void>;
}

export function createMemoryStorage(): StorageAdapter {
  const m = new Map<string, { bytes: Uint8Array; mime: string }>();
  return {
    driver: "memory",
    async put(key, bytes, mime) {
      m.set(key, { bytes, mime });
    },
    async get(key) {
      return m.get(key) ?? null;
    },
    async remove(key) {
      m.delete(key);
    },
  };
}

export function createLocalStorage(dir: string): StorageAdapter {
  const root = resolve(dir);
  const pathFor = (key: string) => {
    const p = resolve(join(root, key));
    if (!p.startsWith(root + "/")) throw new Error("Invalid storage key");
    return p;
  };
  return {
    driver: "local",
    async put(key, bytes, mime) {
      const p = pathFor(key);
      await mkdir(dirname(p), { recursive: true });
      await writeFile(p, bytes);
      await writeFile(p + ".mime", mime);
    },
    async get(key) {
      try {
        const p = pathFor(key);
        const [bytes, mime] = await Promise.all([readFile(p), readFile(p + ".mime", "utf8")]);
        return { bytes: new Uint8Array(bytes), mime };
      } catch {
        return null;
      }
    },
    async remove(key) {
      const p = pathFor(key);
      await unlink(p).catch(() => {});
      await unlink(p + ".mime").catch(() => {});
    },
  };
}

export async function createNetlifyBlobsStorage(): Promise<StorageAdapter> {
  // Connect lazily: a storage problem must not take down routes that never touch media.
  let storePromise: Promise<any> | null = null;
  const store = () =>
    (storePromise ??= import("@netlify/blobs").then(({ getStore }) => getStore({ name: "culturosity-assets", consistency: "strong" })).catch((e) => {
      storePromise = null;
      throw e;
    }));
  return {
    driver: "netlify-blobs",
    async put(key, bytes, mime) {
      const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      await (await store()).set(key, ab, { metadata: { mime } });
    },
    async get(key) {
      const r = await (await store()).getWithMetadata(key, { type: "arrayBuffer" });
      if (!r) return null;
      return { bytes: new Uint8Array(r.data as ArrayBuffer), mime: String((r.metadata as any)?.mime || "application/octet-stream") };
    },
    async remove(key) {
      await (await store()).delete(key);
    },
  };
}

export async function createStorageFromConfig(cfg: ServerConfig): Promise<StorageAdapter> {
  if (cfg.storageDriver === "netlify-blobs") return createNetlifyBlobsStorage();
  if (cfg.storageDriver === "memory") {
    if (cfg.mode === "production") throw new Error("STORAGE_DRIVER=memory is not durable and is refused in production.");
    return createMemoryStorage();
  }
  if (cfg.mode === "production") throw new Error("STORAGE_DRIVER=local is for the local demo only. Use netlify-blobs in production.");
  return createLocalStorage(cfg.uploadDir);
}

/** Verify file signature (magic bytes) instead of trusting the declared type. */
export function sniffImageMime(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (
    bytes.length > 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  )
    return "image/webp";
  return null;
}
