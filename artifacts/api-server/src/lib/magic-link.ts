import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, gte } from "drizzle-orm";
import type { Request } from "express";
import { db, attendeesTable, magicTokensTable } from "@workspace/db";
import { buildMagicLinkEmail, isSmtpConfigured, sendEmail } from "./email";
import { logger } from "./logger";

export const MAGIC_LINK_TTL_MS = 60 * 60 * 1000;
export const MAGIC_LINK_RATE_WINDOW_MS = 15 * 60 * 1000;
export const MAGIC_LINK_MAX_REQUESTS = 5;

export const GENERIC_MAGIC_LINK_MESSAGE =
  "If an account exists for that email, a sign-in link will be sent.";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function getForwardedValue(req: Request, header: string): string | undefined {
  return req.get(header)?.split(",")[0]?.trim() || undefined;
}

/**
 * APP_URL is the canonical public URL used in outbound links. The forwarded
 * request origin is a useful development fallback, including behind nginx.
 */
export function getApplicationUrl(req: Request): string | null {
  const configured = process.env.APP_URL ?? process.env.PUBLIC_APP_URL;
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      return configured.replace(/\/+$/, "");
    } catch {
      return null;
    }
  }

  const protocol = getForwardedValue(req, "x-forwarded-proto") ?? req.protocol;
  const host = getForwardedValue(req, "x-forwarded-host") ?? req.get("host");
  return host ? `${protocol}://${host}`.replace(/\/+$/, "") : null;
}

export type MagicLinkIssueResult =
  | { ok: true }
  | { ok: false; reason: "smtp_unavailable" | "rate_limited" | "application_url_missing" | "delivery_failed" };

/**
 * Issues the latest sign-in link for an attendee and sends it. Older pending
 * links are marked used so only the newest email can authenticate.
 */
export async function issueMagicLink(req: Request, attendee: typeof attendeesTable.$inferSelect): Promise<MagicLinkIssueResult> {
  if (!isSmtpConfigured()) return { ok: false, reason: "smtp_unavailable" };

  const applicationUrl = getApplicationUrl(req);
  if (!applicationUrl) return { ok: false, reason: "application_url_missing" };

  const windowStart = new Date(Date.now() - MAGIC_LINK_RATE_WINDOW_MS);
  const recentTokens = await db
    .select({ id: magicTokensTable.id })
    .from(magicTokensTable)
    .where(and(eq(magicTokensTable.attendeeId, attendee.id), gte(magicTokensTable.createdAt, windowStart)));
  if (recentTokens.length >= MAGIC_LINK_MAX_REQUESTS) {
    return { ok: false, reason: "rate_limited" };
  }

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MS);
  const link = `${applicationUrl}/login?token=${encodeURIComponent(rawToken)}`;

  const [tokenRecord] = await db.transaction(async (tx) => {
    await tx
      .update(magicTokensTable)
      .set({ used: true })
      .where(and(eq(magicTokensTable.attendeeId, attendee.id), eq(magicTokensTable.used, false)));

    return tx
      .insert(magicTokensTable)
      .values({
        token: tokenHash,
        attendeeId: attendee.id,
        expiresAt,
      })
      .returning({ id: magicTokensTable.id });
  });
  if (!tokenRecord) return { ok: false, reason: "delivery_failed" };

  try {
    const delivery = await sendEmail({
      to: attendee.email,
      subject: "Your Kinetics Group Innovation Hubs sign-in link",
      html: buildMagicLinkEmail(link, attendee.name),
    });
    if (!delivery.sent) {
      await db
        .update(magicTokensTable)
        .set({ used: true })
        .where(eq(magicTokensTable.id, tokenRecord.id));
      return { ok: false, reason: "smtp_unavailable" };
    }
    return { ok: true };
  } catch (err) {
    // Do not leave a valid token behind when delivery fails.
    await db
      .update(magicTokensTable)
      .set({ used: true })
      .where(eq(magicTokensTable.id, tokenRecord.id));
    logger.error({ err, attendeeId: attendee.id }, "Magic-link delivery failed");
    return { ok: false, reason: "delivery_failed" };
  }
}

export async function sendAttendeeOnboardingEmail(
  req: Request,
  attendee: typeof attendeesTable.$inferSelect,
): Promise<void> {
  const result = await issueMagicLink(req, attendee);
  if (!result.ok && result.reason !== "rate_limited") {
    logger.warn({ attendeeId: attendee.id, reason: result.reason }, "Attendee onboarding email was not sent");
  }
}

export async function verifyMagicLink(token: string): Promise<typeof attendeesTable.$inferSelect | null> {
  const tokenHash = hashToken(token);
  const now = new Date();

  // The conditional update makes verification single-use even when two
  // requests race to redeem the same raw token.
  const [claimed] = await db
    .update(magicTokensTable)
    .set({ used: true })
    .where(
      and(
        eq(magicTokensTable.token, tokenHash),
        eq(magicTokensTable.used, false),
        gt(magicTokensTable.expiresAt, now),
      ),
    )
    .returning({ attendeeId: magicTokensTable.attendeeId });

  if (!claimed) return null;

  const [attendee] = await db
    .select()
    .from(attendeesTable)
    .where(eq(attendeesTable.id, claimed.attendeeId));
  return attendee ?? null;
}