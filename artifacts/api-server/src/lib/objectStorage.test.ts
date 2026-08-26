import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import os from "os";
import path from "path";

const originalStorageBackend = process.env.STORAGE_BACKEND;
const originalStorageDir = process.env.LOCAL_OBJECT_STORAGE_DIR;
const temporaryDirs: string[] = [];

afterEach(async () => {
  vi.resetModules();
  if (originalStorageBackend === undefined) delete process.env.STORAGE_BACKEND;
  else process.env.STORAGE_BACKEND = originalStorageBackend;
  if (originalStorageDir === undefined) delete process.env.LOCAL_OBJECT_STORAGE_DIR;
  else process.env.LOCAL_OBJECT_STORAGE_DIR = originalStorageDir;
  await Promise.all(temporaryDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("self-hosted local object storage", () => {
  it("stores a private upload and reads it back without the Replit sidecar", async () => {
    const storageDir = await mkdtemp(path.join(os.tmpdir(), "kinetics-object-storage-"));
    temporaryDirs.push(storageDir);
    process.env.STORAGE_BACKEND = "local";
    process.env.LOCAL_OBJECT_STORAGE_DIR = storageDir;

    const { ObjectStorageService } = await import("./objectStorage");
    const storage = new ObjectStorageService();
    const uploadURL = await storage.getObjectEntityUploadURL();
    const objectPath = storage.normalizeObjectEntityPath(uploadURL);

    expect(uploadURL).toMatch(/^\/api\/storage\/uploads\/[0-9a-f-]{36}$/);
    expect(objectPath).toMatch(/^\/objects\/uploads\/[0-9a-f-]{36}$/);

    await storage.saveLocalObject(objectPath, Buffer.from("invitation content"), "application/pdf");
    const objectFile = await storage.getObjectEntityFile(objectPath);
    const [downloaded] = await objectFile.download();
    expect(downloaded.toString()).toBe("invitation content");

    const response = await storage.downloadObject(objectFile);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(await response.text()).toBe("invitation content");
  });
});