import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const storageMocks = vi.hoisted(() => ({
  saveLocalObject: vi.fn(),
}));

vi.mock("../middlewares/requireAuth", () => ({
  requireAdmin: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../lib/objectStorage", () => ({
  ObjectStorageService: class {
    isLocalStorage() {
      return true;
    }

    saveLocalObject = storageMocks.saveLocalObject;
  },
  ObjectNotFoundError: class ObjectNotFoundError extends Error {},
}));

import storageRouter from "./storage";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use("/api", storageRouter);
  server = await new Promise<Server>((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

describe("local invitation upload route", () => {
  it("accepts the UUID path segment and stores the object under uploads/", async () => {
    const uploadId = "9d550753-a3f0-456e-8b66-122b868e4f61";
    const response = await fetch(`${baseUrl}/api/storage/uploads/${uploadId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/pdf" },
      body: "invitation content",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(storageMocks.saveLocalObject).toHaveBeenCalledWith(
      `/objects/uploads/${uploadId}`,
      expect.any(Buffer),
      "application/pdf",
    );
    expect(storageMocks.saveLocalObject.mock.calls[0][1].toString()).toBe("invitation content");
  });
});