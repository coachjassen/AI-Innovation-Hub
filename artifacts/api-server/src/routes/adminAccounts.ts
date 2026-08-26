import { Router, type IRouter } from "express";
import { and, asc, eq } from "drizzle-orm";
import { db, attendeesTable, circlesTable } from "@workspace/db";
import { requireAdmin } from "../middlewares/requireAuth";
import { issueMagicLink } from "../lib/magic-link";

const router: IRouter = Router();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function serializeAdminAccount(
  attendee: typeof attendeesTable.$inferSelect,
  circleName: string,
) {
  return {
    id: attendee.id,
    name: attendee.name,
    email: attendee.email,
    company: attendee.company,
    role: "admin" as const,
    circleId: attendee.circleId,
    circleName,
    createdAt: attendee.createdAt.toISOString(),
  };
}

router.get("/admin/accounts", requireAdmin, async (_req, res): Promise<void> => {
  const accounts = await db
    .select({
      attendee: attendeesTable,
      circleName: circlesTable.name,
    })
    .from(attendeesTable)
    .innerJoin(circlesTable, eq(attendeesTable.circleId, circlesTable.id))
    .where(eq(attendeesTable.role, "admin"))
    .orderBy(asc(attendeesTable.name));

  res.json(accounts.map(({ attendee, circleName }) => serializeAdminAccount(attendee, circleName)));
});

router.post("/admin/accounts", requireAdmin, async (req, res): Promise<void> => {
  const body = req.body as {
    name?: unknown;
    email?: unknown;
    company?: unknown;
    circleId?: unknown;
  };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const company = typeof body.company === "string" ? body.company.trim() : "";
  const circleId = Number(body.circleId);

  if (
    !name ||
    name.length > 200 ||
    !emailPattern.test(email) ||
    email.length > 320 ||
    !Number.isInteger(circleId) ||
    circleId <= 0
  ) {
    res.status(400).json({ error: "name, email, and a valid Hub are required" });
    return;
  }

  const [circle] = await db
    .select({ id: circlesTable.id, name: circlesTable.name })
    .from(circlesTable)
    .where(eq(circlesTable.id, circleId));
  if (!circle) {
    res.status(400).json({ error: "Hub not found" });
    return;
  }

  const [created] = await db
    .insert(attendeesTable)
    .values({
      name,
      email,
      company,
      role: "admin",
      circleId,
    })
    .onConflictDoNothing({ target: attendeesTable.email })
    .returning();

  if (!created) {
    res.status(409).json({ error: "An account with this email already exists" });
    return;
  }

  const onboarding = await issueMagicLink(req, created);
  const onboardingEmailStatus =
    onboarding.ok
      ? "sent"
      : onboarding.reason === "smtp_unavailable" || onboarding.reason === "application_url_missing"
        ? "unavailable"
        : onboarding.reason === "rate_limited"
          ? "rate_limited"
          : "failed";

  res.status(201).json({
    ...serializeAdminAccount(created, circle.name),
    onboardingEmailStatus,
    message:
      onboardingEmailStatus === "sent"
        ? "Administrator created and onboarding email sent."
        : "Administrator created, but onboarding email could not be sent. They can request a sign-in link once email is configured.",
  });
});

export default router;