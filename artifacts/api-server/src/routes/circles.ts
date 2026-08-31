import { Router, type IRouter } from "express";
import { and, eq, ne, sql, asc } from "drizzle-orm";
import { db, circlesTable, attendeesTable } from "@workspace/db";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth";

const router: IRouter = Router();

const CADENCES = ["monthly", "quarterly", "one-off"] as const;
const STATUSES = ["active", "inactive"] as const;

function serializeCircle(
  circle: Pick<
    typeof circlesTable.$inferSelect,
    | "id"
    | "name"
    | "cadence"
    | "status"
    | "createdAt"
    | "registrationDescription"
    | "registrationOpen"
    | "registrationTokenHash"
  >,
  memberCount?: number,
) {
  return {
    id: circle.id,
    name: circle.name,
    cadence: circle.cadence,
    status: circle.status,
    createdAt: circle.createdAt.toISOString(),
    ...(memberCount === undefined ? {} : { memberCount }),
    registrationDescription: circle.registrationDescription,
    registrationOpen: circle.registrationOpen,
    hasRegistrationLink: Boolean(circle.registrationTokenHash),
  };
}

router.get("/circles", requireAuth, async (req, res): Promise<void> => {
  const memberCount = sql<number>`(
    select count(*) from attendees members where members.circle_id = ${circlesTable.id}
  )`;
  const baseSelection = {
    id: circlesTable.id,
    name: circlesTable.name,
    cadence: circlesTable.cadence,
    status: circlesTable.status,
    createdAt: circlesTable.createdAt,
    memberCount,
    registrationDescription: circlesTable.registrationDescription,
    registrationOpen: circlesTable.registrationOpen,
    registrationTokenHash: circlesTable.registrationTokenHash,
  };

  if (req.session.attendeeRole === "admin") {
    const rows = await db
      .select(baseSelection)
      .from(circlesTable)
      .orderBy(asc(circlesTable.name));
    res.json(rows.map((c) => serializeCircle(c, Number(c.memberCount))));
    return;
  }

  const [current] = await db
    .select({ email: attendeesTable.email })
    .from(attendeesTable)
    .where(eq(attendeesTable.id, req.session.attendeeId!));
  if (!current) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const rows = await db
    .select({
      ...baseSelection,
    })
    .from(circlesTable)
    .innerJoin(attendeesTable, and(
      eq(attendeesTable.circleId, circlesTable.id),
      eq(attendeesTable.email, current.email),
    ))
    .where(and(eq(circlesTable.status, "active"), ne(circlesTable.cadence, "one-off")))
    .orderBy(asc(circlesTable.name));
  res.json(rows.map((c) => serializeCircle(c, Number(c.memberCount))));
});

router.post("/circles", requireAdmin, async (req, res): Promise<void> => {
  const {
    name,
    cadence,
    status,
    registrationDescription,
    registrationOpen,
  } = req.body as {
    name?: string;
    cadence?: string;
    status?: string;
    registrationDescription?: string;
    registrationOpen?: boolean;
  };
  if (!name || !cadence || !status) {
    res.status(400).json({ error: "name, cadence, and status are required" });
    return;
  }
  if (!CADENCES.includes(cadence as (typeof CADENCES)[number])) {
    res.status(400).json({ error: `cadence must be one of: ${CADENCES.join(", ")}` });
    return;
  }
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
    res.status(400).json({ error: `status must be one of: ${STATUSES.join(", ")}` });
    return;
  }
  const isOneOff = cadence === "one-off";
  if (isOneOff && registrationOpen) {
    res.status(400).json({ error: "Public registration is only available for recurring Hubs" });
    return;
  }
  const [circle] = await db.insert(circlesTable).values({
    name,
    cadence,
    status,
    registrationDescription: isOneOff ? null : registrationDescription?.trim() || null,
    registrationOpen: isOneOff ? false : registrationOpen ?? false,
  }).returning();
  res.status(201).json(serializeCircle(circle, 0));
});

router.get("/circles/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  if (req.session.attendeeRole !== "admin") {
    const [current] = await db
      .select({ email: attendeesTable.email })
      .from(attendeesTable)
      .where(eq(attendeesTable.id, req.session.attendeeId!));
    const [membership] = current
      ? await db
        .select({ id: attendeesTable.id })
        .from(attendeesTable)
        .innerJoin(circlesTable, eq(attendeesTable.circleId, circlesTable.id))
        .where(and(
          eq(attendeesTable.email, current.email),
          eq(attendeesTable.circleId, id),
          ne(circlesTable.cadence, "one-off"),
          eq(circlesTable.status, "active"),
        ))
      : [];
    if (!membership) {
      res.status(403).json({ error: "You do not belong to this Hub" });
      return;
    }
  }
  const [circle] = await db.select().from(circlesTable).where(eq(circlesTable.id, id));
  if (!circle) { res.status(404).json({ error: "Circle not found" }); return; }
  res.json(serializeCircle(circle));
});

router.patch("/circles/:id", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const {
    name,
    cadence,
    status,
    registrationDescription,
    registrationOpen,
  } = req.body as {
    name?: string;
    cadence?: string;
    status?: string;
    registrationDescription?: string;
    registrationOpen?: boolean;
  };
  if (cadence !== undefined && !CADENCES.includes(cadence as (typeof CADENCES)[number])) {
    res.status(400).json({ error: `cadence must be one of: ${CADENCES.join(", ")}` });
    return;
  }
  if (status !== undefined && !STATUSES.includes(status as (typeof STATUSES)[number])) {
    res.status(400).json({ error: `status must be one of: ${STATUSES.join(", ")}` });
    return;
  }
  const [current] = await db.select().from(circlesTable).where(eq(circlesTable.id, id));
  if (!current) { res.status(404).json({ error: "Circle not found" }); return; }
  const nextCadence = cadence ?? current.cadence;
  if (nextCadence === "one-off" && registrationOpen) {
    res.status(400).json({ error: "Public registration is only available for recurring Hubs" });
    return;
  }

  const updates: Partial<{
    name: string;
    cadence: string;
    status: string;
    registrationDescription: string | null;
    registrationOpen: boolean;
    registrationTokenHash: string | null;
    registrationTokenEncrypted: string | null;
  }> = {};
  if (name !== undefined) updates.name = name;
  if (cadence !== undefined) updates.cadence = cadence;
  if (status !== undefined) updates.status = status;
  if (registrationDescription !== undefined) {
    updates.registrationDescription = registrationDescription.trim() || null;
  }
  if (registrationOpen !== undefined) updates.registrationOpen = registrationOpen;
  if (nextCadence === "one-off") {
    updates.registrationDescription = null;
    updates.registrationOpen = false;
    updates.registrationTokenHash = null;
    updates.registrationTokenEncrypted = null;
  }
  const [circle] = await db.update(circlesTable).set(updates).where(eq(circlesTable.id, id)).returning();
  if (!circle) { res.status(404).json({ error: "Circle not found" }); return; }
  res.json(serializeCircle(circle));
});

export default router;
