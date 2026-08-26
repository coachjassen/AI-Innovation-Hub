import { eq } from "drizzle-orm";
import { attendeesTable, circlesTable, db } from "@workspace/db";
import { logger } from "./logger";

const RECOVERY_ADMIN = {
  name: "Jassen Elliott",
  email: "jassen.elliott@kambium.co.nz",
  company: "Kambium",
  circleId: 1,
} as const;

/**
 * One-shot production recovery for the confirmed administrator account.
 *
 * This is deliberately opt-in and hard-coded to the confirmed identity so a
 * deployment mistake cannot turn it into a general account-creation path.
 * Existing records are never updated or deleted.
 */
export async function runRecoveryBootstrap(): Promise<void> {
  if (process.env.NODE_ENV !== "production" || process.env.RECOVERY_ADMIN_BOOTSTRAP !== "true") {
    return;
  }

  const [circle] = await db
    .select({ id: circlesTable.id })
    .from(circlesTable)
    .where(eq(circlesTable.id, RECOVERY_ADMIN.circleId));

  if (!circle) {
    logger.error({ circleId: RECOVERY_ADMIN.circleId }, "Recovery bootstrap skipped: Hub not found");
    return;
  }

  const [existing] = await db
    .select({
      id: attendeesTable.id,
      role: attendeesTable.role,
      circleId: attendeesTable.circleId,
    })
    .from(attendeesTable)
    .where(eq(attendeesTable.email, RECOVERY_ADMIN.email));

  if (existing) {
    logger.info(
      {
        attendeeId: existing.id,
        role: existing.role,
        circleId: existing.circleId,
      },
      "Recovery administrator already exists; no changes made",
    );
    return;
  }

  const [created] = await db
    .insert(attendeesTable)
    .values({
      name: RECOVERY_ADMIN.name,
      email: RECOVERY_ADMIN.email,
      company: RECOVERY_ADMIN.company,
      role: "admin",
      circleId: RECOVERY_ADMIN.circleId,
    })
    .onConflictDoNothing({ target: attendeesTable.email })
    .returning({ id: attendeesTable.id });

  if (created) {
    logger.info({ attendeeId: created.id }, "Recovery administrator created");
  } else {
    logger.info("Recovery administrator was created concurrently; no changes made");
  }
}