import { Router, type IRouter } from "express";
import { eq, desc, count, inArray } from "drizzle-orm";
import { db, attendeesTable, goalsTable, surveyResponsesTable, circlesTable } from "@workspace/db";
import { ImportAttendeesBody, ImportAttendeesResponse } from "@workspace/api-zod";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth";
import { sendAttendeeOnboardingEmail } from "../lib/magic-link";
import "../lib/session";

const router: IRouter = Router();

function serializeAttendee(attendee: typeof attendeesTable.$inferSelect) {
  return { ...attendee, createdAt: attendee.createdAt.toISOString() };
}

router.post("/attendees", requireAdmin, async (req, res): Promise<void> => {
  const body = req.body as {
    name?: string;
    email?: string;
    company?: string;
    circleId?: number;
  };
  const name = body.name?.trim();
  const email = body.email?.trim().toLowerCase();
  const company = body.company?.trim() ?? "";
  const circleId = Number(body.circleId);

  if (!name || !email || !email.includes("@") || !Number.isInteger(circleId) || circleId <= 0) {
    res.status(400).json({ error: "name, email, and a valid circleId are required" });
    return;
  }

  const [circle] = await db.select({ id: circlesTable.id }).from(circlesTable).where(eq(circlesTable.id, circleId));
  if (!circle) {
    res.status(400).json({ error: "Hub not found" });
    return;
  }

  const [existing] = await db
    .select({ id: attendeesTable.id })
    .from(attendeesTable)
    .where(eq(attendeesTable.email, email));
  if (existing) {
    res.status(409).json({ error: "An attendee with this email already exists" });
    return;
  }

  const [attendee] = await db
    .insert(attendeesTable)
    .values({ name, email, company, role: "attendee", circleId })
    .onConflictDoNothing({ target: attendeesTable.email })
    .returning();

  if (!attendee) {
    res.status(409).json({ error: "An attendee with this email already exists" });
    return;
  }

  res.status(201).json(serializeAttendee(attendee));
  void sendAttendeeOnboardingEmail(req, attendee).catch((err) => {
    // The attendee record is valid even when email delivery is unavailable.
    // The admin can retry sign-in delivery from the login page.
    req.log?.warn({ err, attendeeId: attendee.id }, "Failed to send attendee onboarding email");
  });
});

router.post("/attendees/import", requireAdmin, async (req, res): Promise<void> => {
  const rawBody = req.body as { attendees?: unknown };
  const bodyForValidation = Array.isArray(rawBody.attendees)
    ? {
      ...rawBody,
      attendees: rawBody.attendees.map((row) => {
        if (!row || typeof row !== "object") return row;
        const contact = row as Record<string, unknown>;
        return {
          ...contact,
          name: typeof contact.name === "string" ? contact.name.trim() : contact.name,
          email: typeof contact.email === "string" ? contact.email.trim().toLowerCase() : contact.email,
          company: typeof contact.company === "string" ? contact.company.trim() : contact.company,
        };
      }),
    }
    : req.body;
  const parsed = ImportAttendeesBody.safeParse(bodyForValidation);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid import payload", fieldErrors: parsed.error.flatten() });
    return;
  }

  const { circleId, attendees } = parsed.data;
  const [circle] = await db
    .select({ id: circlesTable.id, status: circlesTable.status })
    .from(circlesTable)
    .where(eq(circlesTable.id, circleId));
  if (!circle || circle.status !== "active") {
    res.status(400).json({ error: "Select an active Hub before importing attendees" });
    return;
  }

  const normalized = attendees.map((attendee, index) => ({
    row: index + 2,
    name: attendee.name.trim(),
    email: attendee.email.trim().toLowerCase(),
    company: attendee.company?.trim() ?? "",
  }));
  const malformed = normalized.find((attendee) =>
    !attendee.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(attendee.email),
  );
  if (malformed) {
    res.status(400).json({ error: `Invalid attendee data on row ${malformed.row}` });
    return;
  }

  const { created, skipped } = await db.transaction(async (tx) => {
    const emails = [...new Set(normalized.map((attendee) => attendee.email))];
    const existingRows = await tx
      .select({ email: attendeesTable.email })
      .from(attendeesTable)
      .where(inArray(attendeesTable.email, emails));
    const existingEmails = new Set(existingRows.map((attendee) => attendee.email.toLowerCase()));
    const seenEmails = new Set<string>();
    const skippedRows: Array<{ row: number; email: string; reason: "duplicate_file" | "duplicate_existing" }> = [];
    const toCreate: typeof normalized = [];

    for (const attendee of normalized) {
      if (existingEmails.has(attendee.email)) {
        skippedRows.push({ row: attendee.row, email: attendee.email, reason: "duplicate_existing" });
      } else if (seenEmails.has(attendee.email)) {
        skippedRows.push({ row: attendee.row, email: attendee.email, reason: "duplicate_file" });
      } else {
        seenEmails.add(attendee.email);
        toCreate.push(attendee);
      }
    }

    if (toCreate.length === 0) return { created: [], skipped: skippedRows };
    const createdRows = await tx
      .insert(attendeesTable)
      .values(toCreate.map(({ name, email, company }) => ({
        name,
        email,
        company,
        role: "attendee",
        circleId,
      })))
      .onConflictDoNothing({ target: attendeesTable.email })
      .returning();
    const insertedEmails = new Set(createdRows.map((attendee) => attendee.email.toLowerCase()));

    for (const attendee of toCreate) {
      if (!insertedEmails.has(attendee.email)) {
        skippedRows.push({ row: attendee.row, email: attendee.email, reason: "duplicate_existing" });
      }
    }

    return { created: createdRows, skipped: skippedRows };
  });

  res.json(ImportAttendeesResponse.parse({
    createdCount: created.length,
    skippedCount: skipped.length,
    created: created.map(serializeAttendee),
    skipped,
  }));
  void Promise.all(
    created.map((attendee) => sendAttendeeOnboardingEmail(req, attendee)),
  ).catch((err) => {
    req.log?.warn({ err, circleId }, "Failed to send one or more onboarding emails after import");
  });
});

router.get("/attendees", requireAdmin, async (req, res): Promise<void> => {
  const rows = await db.select().from(attendeesTable).orderBy(attendeesTable.name);

  // Get goal counts and survey response counts per attendee
  const goalCounts = await db
    .select({ attendeeId: goalsTable.attendeeId, cnt: count() })
    .from(goalsTable)
    .groupBy(goalsTable.attendeeId);

  const surveyCounts = await db
    .select({ attendeeId: surveyResponsesTable.attendeeId, cnt: count() })
    .from(surveyResponsesTable)
    .groupBy(surveyResponsesTable.attendeeId);

  const goalMap = new Map(goalCounts.map(r => [r.attendeeId, Number(r.cnt)]));
  const surveyMap = new Map(surveyCounts.map(r => [r.attendeeId, Number(r.cnt)]));

  const result = rows.map(a => ({
    id: a.id,
    name: a.name,
    email: a.email,
    company: a.company,
    role: a.role,
    circleId: a.circleId,
    createdAt: a.createdAt.toISOString(),
    lastActivityAt: null,
    goalCount: goalMap.get(a.id) ?? 0,
    surveyResponseCount: surveyMap.get(a.id) ?? 0,
  }));

  // Non-admins only see their own circle
  if (req.session.attendeeRole !== "admin") {
    const [me] = await db.select().from(attendeesTable).where(eq(attendeesTable.id, req.session.attendeeId!));
    const filtered = result.filter(a => a.circleId === me?.circleId);
    res.json(filtered);
    return;
  }

  // Admins may scope to a single circle via ?circleId
  const qCircleId = Array.isArray(req.query.circleId) ? req.query.circleId[0] : req.query.circleId;
  const circleId = qCircleId !== undefined ? parseInt(String(qCircleId), 10) : NaN;
  if (!isNaN(circleId)) {
    res.json(result.filter(a => a.circleId === circleId));
    return;
  }

  res.json(result);
});

router.get("/attendees/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [attendee] = await db.select().from(attendeesTable).where(eq(attendeesTable.id, id));
  if (!attendee) { res.status(404).json({ error: "Attendee not found" }); return; }

  const [goalCnt] = await db
    .select({ cnt: count() })
    .from(goalsTable)
    .where(eq(goalsTable.attendeeId, id));

  const [surveyCnt] = await db
    .select({ cnt: count() })
    .from(surveyResponsesTable)
    .where(eq(surveyResponsesTable.attendeeId, id));

  res.json({
    id: attendee.id,
    name: attendee.name,
    email: attendee.email,
    company: attendee.company,
    role: attendee.role,
    circleId: attendee.circleId,
    createdAt: attendee.createdAt.toISOString(),
    lastActivityAt: null,
    goalCount: Number(goalCnt?.cnt ?? 0),
    surveyResponseCount: Number(surveyCnt?.cnt ?? 0),
  });
});

router.patch("/attendees/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  // Non-admin can only update themselves
  if (req.session.attendeeRole !== "admin" && req.session.attendeeId !== id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { name, company } = req.body as { name?: string; company?: string };
  const updates: Partial<{ name: string; company: string }> = {};
  if (name !== undefined) updates.name = name;
  if (company !== undefined) updates.company = company;

  const [updated] = await db.update(attendeesTable).set(updates).where(eq(attendeesTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Attendee not found" }); return; }
  res.json({ ...updated, createdAt: updated.createdAt.toISOString() });
});

export default router;
