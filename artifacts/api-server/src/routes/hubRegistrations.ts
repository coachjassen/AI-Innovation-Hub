import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, ne } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  circlesTable,
  db,
  hubRegistrationsTable,
} from "@workspace/db";
import {
  CreateHubRegistrationLinkParams,
  CreateHubRegistrationLinkResponse,
  DeleteHubRegistrationParams,
  GetPublicHubRegistrationParams,
  GetPublicHubRegistrationResponse,
  ListHubRegistrationsParams,
  ListHubRegistrationsResponse,
  SubmitHubRegistrationBody,
  SubmitHubRegistrationParams,
  SubmitHubRegistrationResponse,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/requireAuth";
import { getApplicationUrl } from "../lib/magic-link";

const router: IRouter = Router();

const REGISTRATION_SUCCESS_MESSAGE =
  "Thanks for registering your interest. We’ll be in touch when the Hub’s next meeting is ready.";

function hashRegistrationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function createRegistrationToken(): string {
  return randomBytes(32).toString("hex");
}

async function findRecurringCircleByToken(token: string) {
  const [circle] = await db
    .select()
    .from(circlesTable)
    .where(and(
      eq(circlesTable.registrationTokenHash, hashRegistrationToken(token)),
      ne(circlesTable.cadence, "one-off"),
    ));
  return circle ?? null;
}

router.post("/circles/:id/registration-link", requireAdmin, async (req, res): Promise<void> => {
  const params = CreateHubRegistrationLinkParams.safeParse(req.params);
  if (!params.success || !Number.isInteger(params.data.id) || params.data.id <= 0) {
    res.status(400).json({ error: "Invalid Hub id" });
    return;
  }

  const [circle] = await db
    .select({ id: circlesTable.id, cadence: circlesTable.cadence })
    .from(circlesTable)
    .where(eq(circlesTable.id, params.data.id));
  if (!circle) {
    res.status(404).json({ error: "Hub not found" });
    return;
  }
  if (circle.cadence === "one-off") {
    res.status(400).json({ error: "Public registration is only available for recurring Hubs" });
    return;
  }

  const applicationUrl = getApplicationUrl(req);
  if (!applicationUrl) {
    res.status(503).json({ error: "The public application URL is not configured" });
    return;
  }

  const token = createRegistrationToken();
  await db
    .update(circlesTable)
    .set({ registrationTokenHash: hashRegistrationToken(token) })
    .where(eq(circlesTable.id, circle.id));

  res.json(CreateHubRegistrationLinkResponse.parse({
    url: `${applicationUrl}/register/${encodeURIComponent(token)}`,
  }));
});

router.get("/circles/:id/registrations", requireAdmin, async (req, res): Promise<void> => {
  const params = ListHubRegistrationsParams.safeParse(req.params);
  if (!params.success || !Number.isInteger(params.data.id) || params.data.id <= 0) {
    res.status(400).json({ error: "Invalid Hub id" });
    return;
  }

  const [circle] = await db
    .select({ id: circlesTable.id })
    .from(circlesTable)
    .where(eq(circlesTable.id, params.data.id));
  if (!circle) {
    res.status(404).json({ error: "Hub not found" });
    return;
  }

  const rows = await db
    .select()
    .from(hubRegistrationsTable)
    .where(eq(hubRegistrationsTable.circleId, circle.id))
    .orderBy(desc(hubRegistrationsTable.createdAt));

  res.json(ListHubRegistrationsResponse.parse(rows.map((registration) => ({
    ...registration,
    promotedAt: registration.promotedAt?.toISOString() ?? null,
    createdAt: registration.createdAt.toISOString(),
  }))));
});

router.delete(
  "/circles/:id/registrations/:registrationId",
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = DeleteHubRegistrationParams.safeParse(req.params);
    if (
      !params.success
      || !Number.isInteger(params.data.id)
      || params.data.id <= 0
      || !Number.isInteger(params.data.registrationId)
      || params.data.registrationId <= 0
    ) {
      res.status(400).json({ error: "Invalid registration" });
      return;
    }

    const [deleted] = await db
      .delete(hubRegistrationsTable)
      .where(and(
        eq(hubRegistrationsTable.id, params.data.registrationId),
        eq(hubRegistrationsTable.circleId, params.data.id),
      ))
      .returning({ id: hubRegistrationsTable.id });
    if (!deleted) {
      res.status(404).json({ error: "Registration not found" });
      return;
    }

    res.status(204).send();
  },
);

router.get("/registration/:token", async (req, res): Promise<void> => {
  const params = GetPublicHubRegistrationParams.safeParse(req.params);
  if (!params.success) {
    res.status(404).json({ error: "Registration link not found" });
    return;
  }

  const circle = await findRecurringCircleByToken(params.data.token);
  if (!circle || circle.status !== "active") {
    res.status(404).json({ error: "Registration link not found" });
    return;
  }

  res.json(GetPublicHubRegistrationResponse.parse({
    circleName: circle.name,
    cadence: circle.cadence,
    description: circle.registrationDescription,
    registrationOpen: circle.registrationOpen,
  }));
});

router.post("/registration/:token", async (req, res): Promise<void> => {
  const params = SubmitHubRegistrationParams.safeParse(req.params);
  const parsed = SubmitHubRegistrationBody.safeParse(req.body);
  if (!params.success) {
    res.status(404).json({ error: "Registration link not found" });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid name, email address, and company" });
    return;
  }

  const circle = await findRecurringCircleByToken(params.data.token);
  if (!circle || circle.status !== "active") {
    res.status(404).json({ error: "Registration link not found" });
    return;
  }
  if (!circle.registrationOpen) {
    res.status(400).json({ error: "Registration is currently closed for this Hub" });
    return;
  }

  const name = parsed.data.name.trim();
  const email = parsed.data.email.trim().toLowerCase();
  const company = parsed.data.company?.trim() ?? "";
  if (!name) {
    res.status(400).json({ error: "Name is required" });
    return;
  }

  await db
    .insert(hubRegistrationsTable)
    .values({
      circleId: circle.id,
      name,
      email,
      company,
    })
    .onConflictDoNothing()
    .returning({ id: hubRegistrationsTable.id });

  res.json(SubmitHubRegistrationResponse.parse({ message: REGISTRATION_SUCCESS_MESSAGE }));
});

export default router;