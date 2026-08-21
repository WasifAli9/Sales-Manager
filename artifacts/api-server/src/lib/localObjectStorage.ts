import { createReadStream, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";

export type StorageObjectHandle = {
  name: string;
  exists(): Promise<[boolean]>;
  getMetadata(): Promise<
    [
      {
        contentType?: string;
        size?: number | string;
        metadata?: Record<string, string>;
      },
    ]
  >;
  setMetadata(meta: { metadata?: Record<string, string> }): Promise<void>;
  createReadStream(): Readable;
  save(data: Buffer | Uint8Array, options?: { contentType?: string }): Promise<void>;
  delete(): Promise<void>;
  download(): Promise<[Buffer]>;
};

type SidecarMeta = {
  contentType?: string;
  metadata?: Record<string, string>;
};

function storageRoot(): string {
  return resolve(process.env.STORAGE_ROOT || "/data");
}

function absPath(bucketName: string, objectName: string): string {
  return join(storageRoot(), bucketName, objectName);
}

function metaPath(filePath: string): string {
  return `${filePath}.meta.json`;
}

function readSidecar(filePath: string): SidecarMeta {
  try {
    return JSON.parse(readFileSync(metaPath(filePath), "utf8")) as SidecarMeta;
  } catch {
    return {};
  }
}

function writeSidecar(filePath: string, meta: SidecarMeta): void {
  writeFileSync(metaPath(filePath), JSON.stringify(meta));
}

export class LocalObjectFile implements StorageObjectHandle {
  constructor(
    public readonly bucketName: string,
    public readonly name: string,
  ) {}

  private path(): string {
    return absPath(this.bucketName, this.name);
  }

  async exists(): Promise<[boolean]> {
    return [existsSync(this.path())];
  }

  async getMetadata(): Promise<
    [{ contentType?: string; size?: number | string; metadata?: Record<string, string> }]
  > {
    const filePath = this.path();
    if (!existsSync(filePath)) {
      throw new Error(`Object not found: ${this.name}`);
    }
    const sidecar = readSidecar(filePath);
    const size = readFileSync(filePath).byteLength;
    return [
      {
        contentType: sidecar.contentType || "application/octet-stream",
        size,
        metadata: sidecar.metadata,
      },
    ];
  }

  async setMetadata(meta: { metadata?: Record<string, string> }): Promise<void> {
    const filePath = this.path();
    const sidecar = readSidecar(filePath);
    sidecar.metadata = { ...(sidecar.metadata || {}), ...(meta.metadata || {}) };
    writeSidecar(filePath, sidecar);
  }

  createReadStream(): Readable {
    return createReadStream(this.path());
  }

  async save(data: Buffer | Uint8Array, options?: { contentType?: string }): Promise<void> {
    const filePath = this.path();
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, data);
    const sidecar = readSidecar(filePath);
    if (options?.contentType) sidecar.contentType = options.contentType;
    writeSidecar(filePath, sidecar);
  }

  async delete(): Promise<void> {
    const filePath = this.path();
    if (existsSync(filePath)) unlinkSync(filePath);
    if (existsSync(metaPath(filePath))) unlinkSync(metaPath(filePath));
  }

  async download(): Promise<[Buffer]> {
    return [readFileSync(this.path())];
  }
}

export function localBucket(bucketName: string) {
  return {
    file(objectName: string): LocalObjectFile {
      return new LocalObjectFile(bucketName, objectName);
    },
  };
}
