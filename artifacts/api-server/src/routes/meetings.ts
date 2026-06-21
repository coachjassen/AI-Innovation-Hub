import { Router, type IRouter } from "express";
import { eq, desc, and, inArray } from "drizzle-orm";
import { db, meetingsTable, attendeesTable, meetingResponsesTable } from "@workspace/db";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth";
import "../lib/session";

const router: IRouter = Router();

function serializeMeeting(m: typeof meetingsTable.$inferSelect) {
  return {
    id: m.id,
    circleId: m.circleId,
    date: m.date,
    notes: m.notes,
    slidesPath: m.slidesPath,
    keyInsight: m.keyInsight,
    createdAt: m.createdAt.toISOString(),
  };
}

// Augment meetings with RSVP counts, the requesting attendee's response, and
// the total number of invited circle members.
async function withResponses(
  rows: (typeof meetingsTable.$inferSelect)[],
  myAttendeeId: number | null,
) {
  if (rows.length === 0) return [];
  const meetingIds = rows.map((r) => r.id);
  const circleIds = [...new Set(rows.map((r) => r.circleId))];

  const responses = await db
    .select()
    .from(meetingResponsesTable)
    .where(inArray(meetingResponsesTable.meetingId, meetingIds));

  // The implicit invitee set is the attendee-role members of each circle.
  const invitedRows = await db
    .select({ id: attendeesTable.id, circleId: attendeesTable.circleId })
    .from(attendeesTable)
    .where(and(inArray(attendeesTable.circleId, circleIds), eq(attendeesTable.role, "attendee")));

  const invitedByCircle = new Map<number, Set<number>>();
  for (const a of invitedRows) {
    let set = invitedByCircle.get(a.circleId);
    if (!set) { set = new Set<number>(); invitedByCircle.set(a.circleId, set); }
    set.add(a.id);
  }

  return rows.map((m) => {
    const invited = invitedByCircle.get(m.circleId) ?? new Set<number>();
    // Only count responses from actual invitees, so counts stay consistent with totalInvited.
    const rs = responses.filter((r) => r.meetingId === m.id && invited.has(r.attendeeId));
    const mine = myAttendeeId
      ? responses.find((r) => r.meetingId === m.id && r.attendeeId === myAttendeeId)
      : undefined;
    return {
      ...serializeMeeting(m),
      myResponse: mine ? mine.status : null,
      attendingCount: rs.filter((r) => r.status === "attending").length,
      notAttendingCount: rs.filter((r) => r.status === "not_attending").length,
      totalInvited: invited.size,
    };
  });
}

router.get("/meetings", requireAuth, async (req, res): Promise<void> => {
  let rows;
  if (req.session.attendeeRole === "admin") {
    const qCircleId = Array.isArray(req.query.circleId) ? req.query.circleId[0] : req.query.circleId;
    const circleId = qCircleId !== undefined ? parseInt(String(qCircleId), 10) : NaN;
    rows = await db
      .select()
      .from(meetingsTable)
      .where(!isNaN(circleId) ? eq(meetingsTable.circleId, circleId) : undefined)
      .orderBy(desc(meetingsTable.date));
  } else {
    const [me] = await db.select().from(attendeesTable).where(eq(attendeesTable.id, req.session.attendeeId!));
    if (!me) { res.status(401).json({ error: "Not found" }); return; }
    rows = await db
      .select()
      .from(meetingsTable)
      .where(eq(meetingsTable.circleId, me.circleId))
      .orderBy(desc(meetingsTable.date));
  }
  res.json(await withResponses(rows, req.session.attendeeId ?? null));
});

router.post("/meetings", requireAdmin, async (req, res): Promise<void> => {
  const { circleId, date, notes, slidesPath, keyInsight } = req.body as {
    circleId?: number; date?: string; notes?: string; slidesPath?: string; keyInsight?: string;
  };
  if (!circleId || !date) {
    res.status(400).json({ error: "circleId and date are required" });
    return;
  }
  const [meeting] = await db
    .insert(meetingsTable)
    .values({ circleId, date, notes: notes ?? null, slidesPath: slidesPath ?? null, keyInsight: keyInsight ?? null })
    .returning();
  res.status(201).json(serializeMeeting(meeting));
});

router.get("/meetings/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [meeting] = await db.select().from(meetingsTable).where(eq(meetingsTable.id, id));
  if (!meeting) { res.status(404).json({ error: "Meeting not found" }); return; }
  if (req.session.attendeeRole !== "admin") {
    const [me] = await db.select().from(attendeesTable).where(eq(attendeesTable.id, req.session.attendeeId!));
    if (!me || me.circleId !== meeting.circleId) { res.status(404).json({ error: "Meeting not found" }); return; }
  }
  const [out] = await withResponses([meeting], req.session.attendeeId ?? null);
  res.json(out);
});

router.patch("/meetings/:id", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { date, notes, slidesPath, keyInsight } = req.body as {
    date?: string; notes?: string; slidesPath?: string; keyInsight?: string;
  };
  const updates: Partial<{ date: string; notes: string; slidesPath: string; keyInsight: string }> = {};
  if (date !== undefined) updates.date = date;
  if (notes !== undefined) updates.notes = notes;
  if (slidesPath !== undefined) updates.slidesPath = slidesPath;
  if (keyInsight !== undefined) updates.keyInsight = keyInsight;
  const [meeting] = await db.update(meetingsTable).set(updates).where(eq(meetingsTable.id, id)).returning();
  if (!meeting) { res.status(404).json({ error: "Meeting not found" }); return; }
  res.json(serializeMeeting(meeting));
});

router.delete("/meetings/:id", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [deleted] = await db.delete(meetingsTable).where(eq(meetingsTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Meeting not found" }); return; }
  res.sendStatus(204);
});

// Set / change the current attendee's RSVP for a meeting (opt in or out).
router.put("/meetings/:id/response", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { status } = req.body as { status?: string };
  if (status !== "attending" && status !== "not_attending") {
    res.status(400).json({ error: "status must be 'attending' or 'not_attending'" });
    return;
  }

  const attendeeId = req.session.attendeeId!;
  const [meeting] = await db.select().from(meetingsTable).where(eq(meetingsTable.id, id));
  if (!meeting) { res.status(404).json({ error: "Meeting not found" }); return; }

  const [me] = await db.select().from(attendeesTable).where(eq(attendeesTable.id, attendeeId));
  if (!me) { res.status(401).json({ error: "Not found" }); return; }
  // Only invitees (attendee-role members of the meeting's circle) may RSVP.
  if (me.role !== "attendee" || meeting.circleId !== me.circleId) {
    res.status(403).json({ error: "Only invited members can RSVP" }); return;
  }

  await db
    .insert(meetingResponsesTable)
    .values({ meetingId: id, attendeeId, status, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [meetingResponsesTable.meetingId, meetingResponsesTable.attendeeId],
      set: { status, updatedAt: new Date() },
    });

  const [out] = await withResponses([meeting], attendeeId);
  res.json(out);
});

// Admin: full RSVP roster for a meeting (every circle member + their status).
router.get("/meetings/:id/responses", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [meeting] = await db.select().from(meetingsTable).where(eq(meetingsTable.id, id));
  if (!meeting) { res.status(404).json({ error: "Meeting not found" }); return; }

  const members = await db
    .select()
    .from(attendeesTable)
    .where(and(eq(attendeesTable.circleId, meeting.circleId), eq(attendeesTable.role, "attendee")));
  const responses = await db
    .select()
    .from(meetingResponsesTable)
    .where(eq(meetingResponsesTable.meetingId, id));
  const byAttendee = new Map(responses.map((r) => [r.attendeeId, r.status]));

  res.json(
    members.map((a) => ({
      attendeeId: a.id,
      attendeeName: a.name,
      attendeeCompany: a.company,
      status: byAttendee.get(a.id) ?? "no_response",
    })),
  );
});

export default router;
