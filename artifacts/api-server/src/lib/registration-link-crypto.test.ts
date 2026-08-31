import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  decryptRegistrationToken,
  encryptRegistrationToken,
  rewrapRegistrationToken,
  validateRegistrationLinkEncryptionConfig,
} from "./registration-link-crypto";

const originalNodeEnv = process.env.NODE_ENV;
const originalActiveKey = process.env.REGISTRATION_LINK_ENCRYPTION_KEY;
const originalPreviousKey = process.env.REGISTRATION_LINK_PREVIOUS_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.NODE_ENV = "test";
  process.env.REGISTRATION_LINK_ENCRYPTION_KEY = "a".repeat(32);
  delete process.env.REGISTRATION_LINK_PREVIOUS_ENCRYPTION_KEY;
});

afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;

  if (originalActiveKey === undefined) delete process.env.REGISTRATION_LINK_ENCRYPTION_KEY;
  else process.env.REGISTRATION_LINK_ENCRYPTION_KEY = originalActiveKey;

  if (originalPreviousKey === undefined) {
    delete process.env.REGISTRATION_LINK_PREVIOUS_ENCRYPTION_KEY;
  } else {
    process.env.REGISTRATION_LINK_PREVIOUS_ENCRYPTION_KEY = originalPreviousKey;
  }
});

describe("registration link token encryption", () => {
  it("round-trips a token without storing it in plaintext", () => {
    const token = "public-registration-token";
    const encrypted = encryptRegistrationToken(token);

    expect(encrypted).toMatch(/^v1\./);
    expect(encrypted).not.toContain(token);
    expect(decryptRegistrationToken(encrypted)).toBe(token);
  });

  it("decrypts existing links with the previous key during key rotation", () => {
    const token = "public-registration-token";
    const encrypted = encryptRegistrationToken(token);

    process.env.REGISTRATION_LINK_ENCRYPTION_KEY = "b".repeat(32);
    expect(decryptRegistrationToken(encrypted)).toBeNull();

    process.env.REGISTRATION_LINK_PREVIOUS_ENCRYPTION_KEY = "a".repeat(32);
    expect(decryptRegistrationToken(encrypted)).toBe(token);

    const rewrapped = rewrapRegistrationToken(encrypted);
    expect(rewrapped).not.toBeNull();
    expect(rewrapped).not.toBe(encrypted);

    delete process.env.REGISTRATION_LINK_PREVIOUS_ENCRYPTION_KEY;
    expect(decryptRegistrationToken(rewrapped as string)).toBe(token);
  });

  it("requires a dedicated key in production", () => {
    process.env.NODE_ENV = "production";
    delete process.env.REGISTRATION_LINK_ENCRYPTION_KEY;

    expect(() => validateRegistrationLinkEncryptionConfig()).toThrow(
      "REGISTRATION_LINK_ENCRYPTION_KEY is required in production",
    );
  });
});