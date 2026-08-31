import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const CIPHERTEXT_VERSION = "v1";
const MINIMUM_SECRET_LENGTH = 32;

function deriveKey(secret: string): Buffer {
  return createHash("sha256")
    .update(`kinetics-hub-registration:${secret}`)
    .digest();
}

function configuredSecrets(): string[] {
  const active = process.env.REGISTRATION_LINK_ENCRYPTION_KEY;
  const previous = process.env.REGISTRATION_LINK_PREVIOUS_ENCRYPTION_KEY;

  if (active) {
    return [active, previous].filter((secret): secret is string => Boolean(secret));
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "REGISTRATION_LINK_ENCRYPTION_KEY is required in production and must be at least 32 characters",
    );
  }

  const developmentSecret = process.env.SESSION_SECRET;
  if (!developmentSecret) {
    throw new Error(
      "REGISTRATION_LINK_ENCRYPTION_KEY or SESSION_SECRET is required to protect saved registration links",
    );
  }
  return [developmentSecret];
}

function validateSecret(secret: string, name: string): void {
  if (secret.length < MINIMUM_SECRET_LENGTH) {
    throw new Error(`${name} must be at least ${MINIMUM_SECRET_LENGTH} characters`);
  }
}

export function validateRegistrationLinkEncryptionConfig(): void {
  const active = process.env.REGISTRATION_LINK_ENCRYPTION_KEY;
  const previous = process.env.REGISTRATION_LINK_PREVIOUS_ENCRYPTION_KEY;

  if (process.env.NODE_ENV === "production" && !active) {
    throw new Error(
      "REGISTRATION_LINK_ENCRYPTION_KEY is required in production and must be at least 32 characters",
    );
  }
  if (active) validateSecret(active, "REGISTRATION_LINK_ENCRYPTION_KEY");
  if (previous) {
    validateSecret(previous, "REGISTRATION_LINK_PREVIOUS_ENCRYPTION_KEY");
  }
}

export function encryptRegistrationToken(token: string): string {
  const [activeSecret] = configuredSecrets();
  validateSecret(activeSecret, "Registration link encryption key");

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(activeSecret), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [
    CIPHERTEXT_VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

function decryptWithConfiguredKey(
  encrypted: string,
): { token: string; usedPreviousKey: boolean } | null {
  const [version, ivEncoded, authTagEncoded, ciphertextEncoded] = encrypted.split(".");
  if (
    version !== CIPHERTEXT_VERSION
    || !ivEncoded
    || !authTagEncoded
    || !ciphertextEncoded
  ) {
    return null;
  }

  for (const [index, secret] of configuredSecrets().entries()) {
    try {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        deriveKey(secret),
        Buffer.from(ivEncoded, "base64url"),
      );
      decipher.setAuthTag(Buffer.from(authTagEncoded, "base64url"));
      return {
        token: Buffer.concat([
          decipher.update(Buffer.from(ciphertextEncoded, "base64url")),
          decipher.final(),
        ]).toString("utf8"),
        usedPreviousKey: index > 0,
      };
    } catch {
      // Try the previous configured key before treating the value as unreadable.
    }
  }
  return null;
}

export function decryptRegistrationToken(encrypted: string): string | null {
  return decryptWithConfiguredKey(encrypted)?.token ?? null;
}

export function rewrapRegistrationToken(encrypted: string): string | null {
  const decrypted = decryptWithConfiguredKey(encrypted);
  if (!decrypted) return null;
  return decrypted.usedPreviousKey
    ? encryptRegistrationToken(decrypted.token)
    : encrypted;
}