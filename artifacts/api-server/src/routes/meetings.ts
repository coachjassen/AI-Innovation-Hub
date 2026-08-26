import { Router, type IRouter } from "express";
import { createHash, randomBytes } from "node:crypto";
import { eq, desc, asc, and, inArray, ne, lte, isNull } from "drizzle-orm";
import { SetMeetingAgendaBody, SetMeetingInviteesBody } from "@workspace/api-zod";
import {
  db,
  meetingsTable,
  attendeesTable,
  meetingInviteesTable,
  meetingResponsesTable,
  agendaItemsTable,
  circlesTable,
} from "@workspace/db";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth";
import {
  sendEmail,
  buildMeetingIcs,
  buildRsvpConfirmationEmail,
  buildMeetingRescheduledEmail,
  buildMeetingInvitationEmail,
  buildOneOffInvitationEmail,
  type AgendaSummaryItem,
} from "../lib/email";
import { getApplicationUrl } from "../lib/magic-link";
import { logger } from "../lib/logger";
import { ObjectStorageService } from "../lib/objectStorage";
import "../lib/session";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

function serializeMeeting(m: typeof meetingsTable.$inferSelect) {
  return {
    id: m.id,
    circleId: m.circleId,
    date: m.date,
    notes: m.notes,
    slidesPath: m.slidesPath,
    keyInsight: m.keyInsight,
    invitationBody: m.invitationBody,
    invitationAttachmentPath: m.invitationAttachmentPath,
    invitationAttachmentName: m.invitationAttachmentName,
    invitationAttachmentContentType: m.invitationAttachmentContentType,
    createdAt: m.createdAt.toISOString(),
  };
}

function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function createInvitationToken(): string {
  return randomBytes(32).toString("hex");
}

async function getMeetingCircle(meeting: typeof meetingsTable.$inferSelect) {
  const [circle] = await db
    .select({ id: circlesTable.id, name: circlesTable.name, cadence: circlesTable.cadence })
    .from(circlesTable)
    .where(eq(circlesTable.id, meeting.circleId));
  return circle ?? null;
}

function serializeAgendaItem(a: typeof agendaItemsTable.$inferSelect) {
  return {
    id: a.id,
    meetingId: a.meetingId,
    position: a.position,
    title: a.title,
    durationMinutes: a.durationMinutes,
    presenter: a.presenter,
    description: a.description,
  };
}

// Augment meetings with RSVP counts, the requesting attendee's response, and
// the total number of explicitly invited attendees.
async function withResponses(
  rows: (typeof meetingsTable.$inferSelect)[],
  myAttendeeId: number | null,
) {
  if (rows.length === 0) return [];
  const meetingIds = rows.map((r) => r.id);

  const responses = await db
    .select()
    .from(meetingResponsesTable)
    .where(inArray(meetingResponsesTable.meetingId, meetingIds));

  const invitedRows = await db
    .select({ meetingId: meetingInviteesTable.meetingId, attendeeId: meetingInviteesTable.attendeeId })
    .from(meetingInviteesTable)
    .where(inArray(meetingInviteesTable.meetingId, meetingIds));

  const invitedByMeeting = new Map<number, Set<number>>();
  for (const invitee of invitedRows) {
    let set = invitedByMeeting.get(invitee.meetingId);
    if (!set) { set = new Set<number>(); invitedByMeeting.set(invitee.meetingId, set); }
    set.add(invitee.attendeeId);
  }

  return rows.map((m) => {
    const invited = invitedByMeeting.get(m.id) ?? new Set<number>();
    // Only count responses from actual invitees, so counts stay consistent with totalInvited.
    const rs = responses.filter((r) => r.meetingId === m.id && invited.has(r.attendeeId));
    const mine = myAttendeeId && invited.has(myAttendeeId)
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
    const invitations = await db
      .select({ meetingId: meetingInviteesTable.meetingId })
      .from(meetingInviteesTable)
      .where(eq(meetingInviteesTable.attendeeId, me.id));
    const meetingIds = invitations.map((invitation) => invitation.meetingId);
    rows = meetingIds.length === 0
      ? []
      : await db
        .select()
        .from(meetingsTable)
        .where(and(eq(meetingsTable.circleId, me.circleId), inArray(meetingsTable.id, meetingIds)))
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
  const [circle] = await db.select().from(circlesTable).where(eq(circlesTable.id, circleId));
  if (!circle) {
    res.status(400).json({ error: "Hub not found" });
    return;
  }
  const [meeting] = await db
    .insert(meetingsTable)
    .values({ circleId, date, notes: notes ?? null, slidesPath: slidesPath ?? null, keyInsight: keyInsight ?? null })
    .returning();

  // Carry the agenda forward: recurring hub meetings typically reuse the same
  // agenda, so seed the new meeting with a copy of the most recent existing
  // meeting's agenda in this hub. Admins can then tweak it via the agenda editor.
  // Best-effort — a failure here must not fail meeting creation.
  if (circle.cadence !== "one-off") {
    try {
      await copyLatestAgendaInto(meeting.id, circleId, meeting.date);
    } catch (err) {
      logger.error({ err, meetingId: meeting.id, circleId }, "Failed to seed agenda from previous meeting");
    }
  }

  res.status(201).json(serializeMeeting(meeting));
});

// Seed a newly created meeting's agenda from the most recent PRIOR meeting in
// the same hub (circle) that actually has agenda items. "Prior" is relative to
// the new meeting's own date (dated on or before it), so backfilling an earlier
// meeting inherits the agenda that preceded it rather than a future meeting's.
// This lets recurring meetings inherit the running agenda, which admins can then
// modify.
async function copyLatestAgendaInto(
  newMeetingId: number,
  circleId: number,
  newMeetingDate: string,
): Promise<void> {
  // Candidate source meetings: same hub, dated on/before the new meeting,
  // excluding the new one, newest first.
  const priorMeetings = await db
    .select({ id: meetingsTable.id })
    .from(meetingsTable)
    .where(
      and(
        eq(meetingsTable.circleId, circleId),
        ne(meetingsTable.id, newMeetingId),
        lte(meetingsTable.date, newMeetingDate),
      ),
    )
    .orderBy(desc(meetingsTable.date), desc(meetingsTable.id));

  for (const prior of priorMeetings) {
    const sourceItems = await db
      .select()
      .from(agendaItemsTable)
      .where(eq(agendaItemsTable.meetingId, prior.id))
      .orderBy(asc(agendaItemsTable.position));

    if (sourceItems.length === 0) continue;

    await db.insert(agendaItemsTable).values(
      sourceItems.map((item, idx) => ({
        meetingId: newMeetingId,
        position: idx + 1,
        title: item.title,
        durationMinutes: item.durationMinutes,
        presenter: item.presenter,
        description: item.description,
      })),
    );
    return; // Only copy from the single most-recent meeting that has an agenda.
  }
}

router.get("/meetings/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [meeting] = await db.select().from(meetingsTable).where(eq(meetingsTable.id, id));
  if (!meeting) { res.status(404).json({ error: "Meeting not found" }); return; }
  if (req.session.attendeeRole !== "admin") {
    const [invitation] = await db
      .select({ attendeeId: meetingInviteesTable.attendeeId })
      .from(meetingInviteesTable)
      .where(and(eq(meetingInviteesTable.meetingId, id), eq(meetingInviteesTable.attendeeId, req.session.attendeeId!)));
    if (!invitation) { res.status(404).json({ error: "Meeting not found" }); return; }
  }
  const [out] = await withResponses([meeting], req.session.attendeeId ?? null);
  res.json(out);
});

router.patch("/meetings/:id", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const {
    date,
    notes,
    slidesPath,
    keyInsight,
    invitationBody,
    invitationAttachmentPath,
    invitationAttachmentName,
    invitationAttachmentContentType,
  } = req.body as {
    date?: string; notes?: string; slidesPath?: string; keyInsight?: string;
    invitationBody?: string; invitationAttachmentPath?: string;
    invitationAttachmentName?: string; invitationAttachmentContentType?: string;
  };

  // Capture the prior date so we can detect a reschedule after the update.
  const [existing] = await db.select().from(meetingsTable).where(eq(meetingsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Meeting not found" }); return; }

  const isInvitationUpdate = invitationBody !== undefined
    || invitationAttachmentPath !== undefined
    || invitationAttachmentName !== undefined
    || invitationAttachmentContentType !== undefined;
  if (isInvitationUpdate) {
    const circle = await getMeetingCircle(existing);
    if (!circle || circle.cadence !== "one-off") {
      res.status(400).json({ error: "Invitation details are only available for one-off events" });
      return;
    }
    const attachmentValues = [invitationAttachmentPath, invitationAttachmentName, invitationAttachmentContentType];
    if (attachmentValues.some((value) => value !== undefined) && attachmentValues.some((value) => !value)) {
      res.status(400).json({ error: "Attachment path, name, and content type must be saved together" });
      return;
    }
    if (invitationAttachmentPath && !invitationAttachmentPath.startsWith("/objects/")) {
      res.status(400).json({ error: "Invitation attachment must use private object storage" });
      return;
    }
    if (
      invitationAttachmentContentType
      && ![
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ].includes(invitationAttachmentContentType)
    ) {
      res.status(400).json({ error: "Invitation attachment must be a PDF, DOC, or DOCX file" });
      return;
    }
    if (invitationAttachmentName && invitationAttachmentName.length > 255) {
      res.status(400).json({ error: "Invitation attachment name is too long" });
      return;
    }
    if (invitationBody !== undefined && invitationBody.length > 10_000) {
      res.status(400).json({ error: "Invitation message is too long" });
      return;
    }
  }

  const updates: Partial<{
    date: string; notes: string; slidesPath: string; keyInsight: string;
    invitationBody: string; invitationAttachmentPath: string;
    invitationAttachmentName: string; invitationAttachmentContentType: string;
  }> = {};
  if (date !== undefined) updates.date = date;
  if (notes !== undefined) updates.notes = notes;
  if (slidesPath !== undefined) updates.slidesPath = slidesPath;
  if (keyInsight !== undefined) updates.keyInsight = keyInsight;
  if (invitationBody !== undefined) updates.invitationBody = invitationBody;
  if (invitationAttachmentPath !== undefined) updates.invitationAttachmentPath = invitationAttachmentPath;
  if (invitationAttachmentName !== undefined) updates.invitationAttachmentName = invitationAttachmentName;
  if (invitationAttachmentContentType !== undefined) updates.invitationAttachmentContentType = invitationAttachmentContentType;
  const [meeting] = await db.update(meetingsTable).set(updates).where(eq(meetingsTable.id, id)).returning();
  if (!meeting) { res.status(404).json({ error: "Meeting not found" }); return; }
  res.json(serializeMeeting(meeting));

  // If the meeting was rescheduled, send everyone who already RSVP'd
  // "attending" an updated calendar invite. Reusing the stable UID with
  // METHOD:REQUEST and a strictly increasing SEQUENCE makes calendars
  // supersede the existing event instead of creating a duplicate. Like the
  // other email triggers, this runs post-response and swallows errors so a
  // failed (or absent, in POC mode) mailer never breaks the update.
  const dateChanged = date !== undefined && date !== existing.date;
  if (dateChanged) {
    void sendRescheduleInvites(id, meeting.circleId, meeting.date).catch((err) => {
      logger.error({ err, meetingId: id }, "Failed to send reschedule calendar invites");
    });
  }
});

// Send updated .ics invites to attendees who responded "attending" to a meeting
// that has just been rescheduled. SEQUENCE is derived from the current time (in
// seconds) so it strictly increases across successive reschedules.
async function sendRescheduleInvites(
  meetingId: number,
  circleId: number,
  dateIso: string,
): Promise<void> {
  const [circle] = await db.select().from(circlesTable).where(eq(circlesTable.id, circleId));
  const circleName = circle?.name ?? "Kinetics Group Innovation Hub";

  // Invited attendees who said "attending".
  const recipients = await db
    .select({ name: attendeesTable.name, email: attendeesTable.email })
    .from(meetingResponsesTable)
    .innerJoin(attendeesTable, eq(meetingResponsesTable.attendeeId, attendeesTable.id))
    .innerJoin(
      meetingInviteesTable,
      and(
        eq(meetingInviteesTable.meetingId, meetingResponsesTable.meetingId),
        eq(meetingInviteesTable.attendeeId, meetingResponsesTable.attendeeId),
      ),
    )
    .where(
      and(
        eq(meetingResponsesTable.meetingId, meetingId),
        eq(meetingResponsesTable.status, "attending"),
        ne(attendeesTable.role, "admin"),
        eq(attendeesTable.circleId, circleId),
      ),
    );

  if (recipients.length === 0) return;

  const agendaRows = await db
    .select()
    .from(agendaItemsTable)
    .where(eq(agendaItemsTable.meetingId, meetingId))
    .orderBy(asc(agendaItemsTable.position));

  const agenda: AgendaSummaryItem[] = agendaRows.map((a) => ({
    position: a.position,
    title: a.title,
    durationMinutes: a.durationMinutes,
    presenter: a.presenter,
    description: a.description,
  }));

  const icsContent = await buildMeetingIcs({
    meetingId,
    circleName,
    dateIso,
    agenda,
    method: "REQUEST",
    sequence: Math.floor(Date.now() / 1000),
  });

  for (const r of recipients) {
    try {
      await sendEmail({
        to: r.email,
        subject: `Updated: ${circleName} meeting rescheduled`,
        html: buildMeetingRescheduledEmail(r.name, circleName, dateIso, agenda),
        attachments: icsContent
          ? [{ filename: "meeting.ics", content: icsContent, contentType: "text/calendar; method=REQUEST" }]
          : undefined,
      });
    } catch (err) {
      logger.error({ err, meetingId, email: r.email }, "Failed to send reschedule invite to attendee");
    }
  }
}

router.delete("/meetings/:id", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [deleted] = await db.delete(meetingsTable).where(eq(meetingsTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Meeting not found" }); return; }
  res.sendStatus(204);
});

// Read a meeting's ordered agenda. Attendees may only read agendas for meetings
// they are invited to; admins may read any.
router.get("/meetings/:id/agenda", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [meeting] = await db.select().from(meetingsTable).where(eq(meetingsTable.id, id));
  if (!meeting) { res.status(404).json({ error: "Meeting not found" }); return; }
  const circle = await getMeetingCircle(meeting);
  if (circle?.cadence === "one-off") {
    res.status(400).json({ error: "One-off events do not use agendas" });
    return;
  }

  if (req.session.attendeeRole !== "admin") {
    const [invitation] = await db
      .select({ attendeeId: meetingInviteesTable.attendeeId })
      .from(meetingInviteesTable)
      .where(and(eq(meetingInviteesTable.meetingId, id), eq(meetingInviteesTable.attendeeId, req.session.attendeeId!)));
    if (!invitation) { res.status(404).json({ error: "Meeting not found" }); return; }
  }

  const items = await db
    .select()
    .from(agendaItemsTable)
    .where(eq(agendaItemsTable.meetingId, id))
    .orderBy(asc(agendaItemsTable.position));

  res.json(items.map(serializeAgendaItem));
});

// Replace the full ordered agenda for a meeting (admin only).
router.put("/meetings/:id/agenda", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [meeting] = await db.select().from(meetingsTable).where(eq(meetingsTable.id, id));
  if (!meeting) { res.status(404).json({ error: "Meeting not found" }); return; }
  const circle = await getMeetingCircle(meeting);
  if (circle?.cadence === "one-off") {
    res.status(400).json({ error: "One-off events do not use agendas" });
    return;
  }

  const parsed = SetMeetingAgendaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid agenda payload",
      fieldErrors: parsed.error.flatten(),
    });
    return;
  }

  // Business rule (not expressible in the JSON-schema contract): titles must be
  // non-empty after trimming.
  for (const item of parsed.data.items) {
    if (item.title.trim() === "") {
      res.status(400).json({ error: "each agenda item requires a non-empty title" }); return;
    }
  }

  const values = parsed.data.items.map((item, idx) => ({
    meetingId: id,
    position: idx + 1,
    title: item.title.trim(),
    durationMinutes: item.durationMinutes ?? null,
    presenter: item.presenter ?? null,
    description: item.description ?? null,
  }));

  const saved = await db.transaction(async (tx) => {
    await tx.delete(agendaItemsTable).where(eq(agendaItemsTable.meetingId, id));
    if (values.length === 0) return [];
    return tx.insert(agendaItemsTable).values(values).returning();
  });

  res.json(saved.map(serializeAgendaItem));
});

async function listInviteesForMeeting(meeting: typeof meetingsTable.$inferSelect) {
  const members = await db
    .select({
      attendeeId: attendeesTable.id,
      attendeeName: attendeesTable.name,
      attendeeEmail: attendeesTable.email,
      attendeeCompany: attendeesTable.company,
    })
    .from(attendeesTable)
    .where(and(eq(attendeesTable.circleId, meeting.circleId), ne(attendeesTable.role, "admin")))
    .orderBy(asc(attendeesTable.name));
  const selected = await db
    .select({
      attendeeId: meetingInviteesTable.attendeeId,
      invitationSentAt: meetingInviteesTable.invitationSentAt,
      invitationSendCount: meetingInviteesTable.invitationSendCount,
    })
    .from(meetingInviteesTable)
    .where(eq(meetingInviteesTable.meetingId, meeting.id));
  const selectedByAttendeeId = new Map(selected.map((invitee) => [invitee.attendeeId, invitee]));

  return members.map((member) => ({
    ...member,
    invited: selectedByAttendeeId.has(member.attendeeId),
    invitationSentAt: selectedByAttendeeId.get(member.attendeeId)?.invitationSentAt?.toISOString() ?? null,
    invitationSendCount: selectedByAttendeeId.get(member.attendeeId)?.invitationSendCount ?? 0,
  }));
}

router.get("/meetings/:id/invitees", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [meeting] = await db.select().from(meetingsTable).where(eq(meetingsTable.id, id));
  if (!meeting) { res.status(404).json({ error: "Meeting not found" }); return; }
  res.json(await listInviteesForMeeting(meeting));
});

router.put("/meetings/:id/invitees", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = SetMeetingInviteesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid invitee payload", fieldErrors: parsed.error.flatten() });
    return;
  }
  const attendeeIds = parsed.data.attendeeIds;
  if (
    attendeeIds.some((attendeeId) => !Number.isInteger(attendeeId) || attendeeId <= 0) ||
    new Set(attendeeIds).size !== attendeeIds.length
  ) {
    res.status(400).json({ error: "attendeeIds must contain unique positive integers" });
    return;
  }

  const [meeting] = await db.select().from(meetingsTable).where(eq(meetingsTable.id, id));
  if (!meeting) { res.status(404).json({ error: "Meeting not found" }); return; }

  const eligibleAttendees = await db
    .select({ id: attendeesTable.id })
    .from(attendeesTable)
    .where(and(eq(attendeesTable.circleId, meeting.circleId), ne(attendeesTable.role, "admin")));
  const eligibleIds = new Set(eligibleAttendees.map((attendee) => attendee.id));
  if (attendeeIds.some((attendeeId) => !eligibleIds.has(attendeeId))) {
    res.status(400).json({ error: "All invitees must be non-admin members of this Hub" });
    return;
  }

  const existingInvitees = await db
    .select({ attendeeId: meetingInviteesTable.attendeeId })
    .from(meetingInviteesTable)
    .where(eq(meetingInviteesTable.meetingId, id));
  const nextInviteeIds = new Set(attendeeIds);
  const existingInviteeIds = new Set(existingInvitees.map((invitee) => invitee.attendeeId));
  const addedAttendeeIds = attendeeIds.filter((attendeeId) => !existingInviteeIds.has(attendeeId));
  const removedAttendeeIds = existingInvitees
    .map((invitee) => invitee.attendeeId)
    .filter((attendeeId) => !nextInviteeIds.has(attendeeId));

  await db.transaction(async (tx) => {
    if (removedAttendeeIds.length > 0) {
      await tx
        .delete(meetingResponsesTable)
        .where(and(eq(meetingResponsesTable.meetingId, id), inArray(meetingResponsesTable.attendeeId, removedAttendeeIds)));
    }
    if (removedAttendeeIds.length > 0) {
      await tx
        .delete(meetingInviteesTable)
        .where(and(eq(meetingInviteesTable.meetingId, id), inArray(meetingInviteesTable.attendeeId, removedAttendeeIds)));
    }
    if (addedAttendeeIds.length > 0) {
      await tx.insert(meetingInviteesTable).values(
        addedAttendeeIds.map((attendeeId) => ({ meetingId: id, attendeeId })),
      );
    }
  });

  res.json(await listInviteesForMeeting(meeting));

  // Meeting invitations are best-effort and never roll back a valid invitee
  // selection if SMTP is unavailable or an individual recipient fails.
  const circle = await getMeetingCircle(meeting);
  if (addedAttendeeIds.length > 0 && circle?.cadence !== "one-off") {
    const applicationUrl = getApplicationUrl(req);
    if (applicationUrl) {
      void sendMeetingInvitationEmails(meeting, addedAttendeeIds, `${applicationUrl}/meetings`).catch((err) => {
        logger.error({ err, meetingId: meeting.id }, "Failed to send meeting invitation emails");
      });
    }
  }
});

async function sendMeetingInvitationEmails(
  meeting: typeof meetingsTable.$inferSelect,
  attendeeIds: number[],
  meetingLink: string,
): Promise<void> {
  const [circle] = await db.select().from(circlesTable).where(eq(circlesTable.id, meeting.circleId));
  const circleName = circle?.name ?? "Kinetics Group Innovation Hub";
  const recipients = await db
    .select({ name: attendeesTable.name, email: attendeesTable.email })
    .from(attendeesTable)
    .where(inArray(attendeesTable.id, attendeeIds));

  for (const recipient of recipients) {
    try {
      await sendEmail({
        to: recipient.email,
        subject: `You're invited: ${circleName} meeting`,
        html: buildMeetingInvitationEmail(recipient.name, circleName, meeting.date, meetingLink),
      });
    } catch (err) {
      logger.error({ err, meetingId: meeting.id, email: recipient.email }, "Failed to send meeting invitation");
    }
  }
}

type OneOffInvitationFailure = {
  attendeeId: number;
  attendeeName: string;
  error: string;
};

async function sendOneOffInvitationEmails(
  req: Parameters<typeof getApplicationUrl>[0],
  meeting: typeof meetingsTable.$inferSelect,
  attendeeIds: number[],
  options: { forceResend: boolean },
): Promise<{ sentCount: number; failures: OneOffInvitationFailure[] }> {
  const circle = await getMeetingCircle(meeting);
  if (!circle || circle.cadence !== "one-off") {
    throw new Error("One-off event not found");
  }
  if (
    !meeting.invitationAttachmentPath
    || !meeting.invitationAttachmentName
    || !meeting.invitationAttachmentContentType
  ) {
    throw new Error("Upload an invitation file before sending invitations");
  }

  const applicationUrl = getApplicationUrl(req);
  if (!applicationUrl) {
    throw new Error("The public application URL is not configured");
  }

  let attachmentContent: Buffer;
  try {
    const attachmentFile = await objectStorageService.getObjectEntityFile(meeting.invitationAttachmentPath);
    const [content] = await attachmentFile.download();
    attachmentContent = content;
  } catch (err) {
    logger.error({ err, meetingId: meeting.id }, "Unable to load one-off invitation attachment");
    throw new Error("The uploaded invitation file is unavailable");
  }

  const recipients = await db
    .select({
      inviteeId: meetingInviteesTable.id,
      attendeeId: attendeesTable.id,
      attendeeName: attendeesTable.name,
      attendeeEmail: attendeesTable.email,
      invitationSentAt: meetingInviteesTable.invitationSentAt,
      invitationSendCount: meetingInviteesTable.invitationSendCount,
    })
    .from(meetingInviteesTable)
    .innerJoin(attendeesTable, eq(meetingInviteesTable.attendeeId, attendeesTable.id))
    .where(
      and(
        eq(meetingInviteesTable.meetingId, meeting.id),
        inArray(meetingInviteesTable.attendeeId, attendeeIds),
        options.forceResend ? undefined : isNull(meetingInviteesTable.invitationSentAt),
      ),
    );

  const icsContent = await buildMeetingIcs({
    meetingId: meeting.id,
    circleName: circle.name,
    dateIso: meeting.date,
    agenda: [],
    method: "REQUEST",
  });

  let sentCount = 0;
  const failures: OneOffInvitationFailure[] = [];
  for (const recipient of recipients) {
    const rawToken = createInvitationToken();
    const rsvpLink = `${applicationUrl}/one-off-rsvp/${encodeURIComponent(rawToken)}`;
    try {
      const delivery = await sendEmail({
        to: recipient.attendeeEmail,
        subject: `You're invited: ${circle.name}`,
        html: buildOneOffInvitationEmail(
          recipient.attendeeName,
          circle.name,
          meeting.date,
          meeting.invitationBody,
          rsvpLink,
        ),
        attachments: [
          {
            filename: meeting.invitationAttachmentName,
            content: attachmentContent,
            contentType: meeting.invitationAttachmentContentType,
          },
          ...(icsContent
            ? [{ filename: "event.ics", content: icsContent, contentType: "text/calendar; method=REQUEST" }]
            : []),
        ],
      });

      if (!delivery.sent) {
        failures.push({
          attendeeId: recipient.attendeeId,
          attendeeName: recipient.attendeeName,
          error: "SMTP is not configured",
        });
        continue;
      }

      await db
        .update(meetingInviteesTable)
        .set({
          invitationTokenHash: hashInvitationToken(rawToken),
          invitationSentAt: new Date(),
          invitationSendCount: recipient.invitationSendCount + 1,
        })
        .where(eq(meetingInviteesTable.id, recipient.inviteeId));
      sentCount += 1;
    } catch (err) {
      logger.error(
        { err, meetingId: meeting.id, attendeeId: recipient.attendeeId },
        "Failed to send one-off invitation",
      );
      failures.push({
        attendeeId: recipient.attendeeId,
        attendeeName: recipient.attendeeName,
        error: "Email delivery failed",
      });
    }
  }
  return { sentCount, failures };
}

router.post("/meetings/:id/one-off-invitations/send", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [meeting] = await db.select().from(meetingsTable).where(eq(meetingsTable.id, id));
  if (!meeting) { res.status(404).json({ error: "Meeting not found" }); return; }
  if (
    !meeting.invitationAttachmentPath
    || !meeting.invitationAttachmentName
    || !meeting.invitationAttachmentContentType
  ) {
    res.status(400).json({ error: "Upload an invitation file before sending invitations" });
    return;
  }

  const pending = await db
    .select({ attendeeId: meetingInviteesTable.attendeeId })
    .from(meetingInviteesTable)
    .where(and(eq(meetingInviteesTable.meetingId, id), isNull(meetingInviteesTable.invitationSentAt)));
  if (pending.length === 0) {
    res.json({ sentCount: 0, failures: [] });
    return;
  }

  try {
    const result = await sendOneOffInvitationEmails(req, meeting, pending.map((row) => row.attendeeId), {
      forceResend: false,
    });
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to send invitations";
    res.status(400).json({ error: message });
  }
});

router.post("/meetings/:id/one-off-invitations/:attendeeId/resend", requireAdmin, async (req, res): Promise<void> => {
  const rawMeetingId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const rawAttendeeId = Array.isArray(req.params.attendeeId) ? req.params.attendeeId[0] : req.params.attendeeId;
  const id = parseInt(rawMeetingId, 10);
  const attendeeId = parseInt(rawAttendeeId, 10);
  if (isNaN(id) || isNaN(attendeeId)) { res.status(400).json({ error: "Invalid identifier" }); return; }
  const [meeting] = await db.select().from(meetingsTable).where(eq(meetingsTable.id, id));
  if (!meeting) { res.status(404).json({ error: "Meeting not found" }); return; }
  const [invitee] = await db
    .select({ id: meetingInviteesTable.id })
    .from(meetingInviteesTable)
    .where(and(eq(meetingInviteesTable.meetingId, id), eq(meetingInviteesTable.attendeeId, attendeeId)));
  if (!invitee) { res.status(404).json({ error: "Invitee not found" }); return; }

  try {
    const result = await sendOneOffInvitationEmails(req, meeting, [attendeeId], { forceResend: true });
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to resend invitation";
    res.status(400).json({ error: message });
  }
});

async function findOneOffRsvp(token: string) {
  if (!/^[a-f0-9]{64}$/i.test(token)) return null;
  const [invitation] = await db
    .select({
      attendeeId: attendeesTable.id,
      attendeeName: attendeesTable.name,
      meetingId: meetingsTable.id,
      meetingDate: meetingsTable.date,
      circleName: circlesTable.name,
      circleCadence: circlesTable.cadence,
      invitationBody: meetingsTable.invitationBody,
    })
    .from(meetingInviteesTable)
    .innerJoin(meetingsTable, eq(meetingInviteesTable.meetingId, meetingsTable.id))
    .innerJoin(attendeesTable, eq(meetingInviteesTable.attendeeId, attendeesTable.id))
    .innerJoin(circlesTable, eq(meetingsTable.circleId, circlesTable.id))
    .where(eq(meetingInviteesTable.invitationTokenHash, hashInvitationToken(token)));
  return invitation?.circleCadence === "one-off" ? invitation : null;
}

async function serializeOneOffRsvp(invitation: NonNullable<Awaited<ReturnType<typeof findOneOffRsvp>>>) {
  const [response] = await db
    .select({ status: meetingResponsesTable.status })
    .from(meetingResponsesTable)
    .where(
      and(
        eq(meetingResponsesTable.meetingId, invitation.meetingId),
        eq(meetingResponsesTable.attendeeId, invitation.attendeeId),
      ),
    );
  return {
    meetingId: invitation.meetingId,
    circleName: invitation.circleName,
    date: invitation.meetingDate,
    invitationBody: invitation.invitationBody,
    status: response?.status ?? "no_response",
  };
}

router.get("/one-off-rsvp/:token", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
  const invitation = await findOneOffRsvp(raw);
  if (!invitation) { res.status(404).json({ error: "Invitation not found" }); return; }
  res.json(await serializeOneOffRsvp(invitation));
});

router.put("/one-off-rsvp/:token", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
  const { status } = req.body as { status?: string };
  if (status !== "attending" && status !== "not_attending") {
    res.status(400).json({ error: "status must be 'attending' or 'not_attending'" });
    return;
  }
  const invitation = await findOneOffRsvp(raw);
  if (!invitation) { res.status(404).json({ error: "Invitation not found" }); return; }
  await db
    .insert(meetingResponsesTable)
    .values({
      meetingId: invitation.meetingId,
      attendeeId: invitation.attendeeId,
      status,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [meetingResponsesTable.meetingId, meetingResponsesTable.attendeeId],
      set: { status, updatedAt: new Date() },
    });
  res.json(await serializeOneOffRsvp(invitation));
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
  const [invitation] = await db
    .select({ attendeeId: meetingInviteesTable.attendeeId })
    .from(meetingInviteesTable)
    .where(and(eq(meetingInviteesTable.meetingId, id), eq(meetingInviteesTable.attendeeId, attendeeId)));
  if (me.role === "admin" || !invitation) {
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

  // After persisting the RSVP and responding, send a confirmation email with an
  // .ics invite for "attending" responses. Email failures (or absent SMTP) must
  // never break the RSVP write, so this runs post-response and swallows errors.
  if (status === "attending") {
    void (async () => {
      try {
        const [circle] = await db.select().from(circlesTable).where(eq(circlesTable.id, meeting.circleId));
        const circleName = circle?.name ?? "Kinetics Group Innovation Hub";

        const agendaRows = await db
          .select()
          .from(agendaItemsTable)
          .where(eq(agendaItemsTable.meetingId, id))
          .orderBy(asc(agendaItemsTable.position));

        const agenda: AgendaSummaryItem[] = agendaRows.map((a) => ({
          position: a.position,
          title: a.title,
          durationMinutes: a.durationMinutes,
          presenter: a.presenter,
          description: a.description,
        }));

        const icsContent = await buildMeetingIcs({
          meetingId: id,
          circleName,
          dateIso: meeting.date,
          agenda,
        });

        await sendEmail({
          to: me.email,
          subject: `You're confirmed: ${circleName} meeting`,
          html: buildRsvpConfirmationEmail(me.name, circleName, meeting.date, agenda),
          attachments: icsContent
            ? [{ filename: "meeting.ics", content: icsContent, contentType: "text/calendar" }]
            : undefined,
        });
      } catch (err) {
        logger.error({ err, meetingId: id, attendeeId }, "Failed to send RSVP confirmation email");
      }
    })();
  }
});

// Admin: full RSVP roster for a meeting (only invited attendees + their status).
router.get("/meetings/:id/responses", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [meeting] = await db.select().from(meetingsTable).where(eq(meetingsTable.id, id));
  if (!meeting) { res.status(404).json({ error: "Meeting not found" }); return; }

  const members = await db
    .select({
      attendeeId: attendeesTable.id,
      attendeeName: attendeesTable.name,
      attendeeCompany: attendeesTable.company,
    })
    .from(meetingInviteesTable)
    .innerJoin(attendeesTable, eq(meetingInviteesTable.attendeeId, attendeesTable.id))
    .where(eq(meetingInviteesTable.meetingId, id))
    .orderBy(asc(attendeesTable.name));
  const responses = await db
    .select()
    .from(meetingResponsesTable)
    .where(eq(meetingResponsesTable.meetingId, id));
  const byAttendee = new Map(responses.map((r) => [r.attendeeId, r.status]));

  res.json(
    members.map((a) => ({
      attendeeId: a.attendeeId,
      attendeeName: a.attendeeName,
      attendeeCompany: a.attendeeCompany,
      status: byAttendee.get(a.attendeeId) ?? "no_response",
    })),
  );
});

export default router;
