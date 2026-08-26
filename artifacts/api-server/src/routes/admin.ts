import { Router, type IRouter } from "express";
import { eq, count, desc, asc, and, ne, lte, gte } from "drizzle-orm";
import {
  db,
  attendeesTable,
  meetingInviteesTable,
  meetingsTable,
  goalsTable,
  invitesTable,
  circlesTable,
  surveysTable,
} from "@workspace/db";
import { requireAdmin } from "../middlewares/requireAuth";
import { sendEmail, buildReminderEmail, buildSurveyEmail } from "../lib/email";
import { getApplicationUrl } from "../lib/magic-link";

const router: IRouter = Router();

router.get("/admin/dashboard", requireAdmin, async (req, res): Promise<void> => {
  const qCircleId = Array.isArray(req.query.circleId) ? req.query.circleId[0] : req.query.circleId;
  const circleId = qCircleId !== undefined ? parseInt(String(qCircleId), 10) : NaN;
  const hasCircle = !isNaN(circleId);

  const [attendeeCnt] = await db
    .select({ cnt: count() })
    .from(attendeesTable)
    .where(hasCircle ? eq(attendeesTable.circleId, circleId) : undefined);
  const [meetingCnt] = await db
    .select({ cnt: count() })
    .from(meetingsTable)
    .where(hasCircle ? eq(meetingsTable.circleId, circleId) : undefined);
  const [goalCnt] = await db
    .select({ cnt: count() })
    .from(goalsTable)
    .leftJoin(attendeesTable, eq(goalsTable.attendeeId, attendeesTable.id))
    .where(hasCircle ? eq(attendeesTable.circleId, circleId) : undefined);
  const [pendingInviteCnt] = await db
    .select({ cnt: count() })
    .from(invitesTable)
    .where(
      hasCircle
        ? and(eq(invitesTable.status, "pending"), eq(invitesTable.circleId, circleId))
        : eq(invitesTable.status, "pending"),
    );

  const goalsByStatusRows = await db
    .select({ status: goalsTable.status, cnt: count() })
    .from(goalsTable)
    .leftJoin(attendeesTable, eq(goalsTable.attendeeId, attendeesTable.id))
    .where(hasCircle ? eq(attendeesTable.circleId, circleId) : undefined)
    .groupBy(goalsTable.status);

  const goalsByStatus = { new: 0, inProgress: 0, completed: 0, notStarted: 0 };
  for (const r of goalsByStatusRows) {
    const n = Number(r.cnt);
    if (r.status === "New") goalsByStatus.new += n;
    else if (r.status === "In Progress") goalsByStatus.inProgress += n;
    else if (r.status === "Completed") goalsByStatus.completed += n;
    else if (r.status === "Not Started") goalsByStatus.notStarted += n;
  }

  // Recent activity: last 10 goal updates
  const recentGoals = await db
    .select({
      id: goalsTable.id,
      updatedAt: goalsTable.updatedAt,
      status: goalsTable.status,
      timeframe: goalsTable.timeframe,
      attendeeName: attendeesTable.name,
    })
    .from(goalsTable)
    .leftJoin(attendeesTable, eq(goalsTable.attendeeId, attendeesTable.id))
    .where(hasCircle ? eq(attendeesTable.circleId, circleId) : undefined)
    .orderBy(desc(goalsTable.updatedAt))
    .limit(10);

  const recentActivity = recentGoals.map(g => ({
    type: "goal_update",
    description: `Goal "${g.timeframe}" updated to ${g.status}`,
    createdAt: g.updatedAt.toISOString(),
    attendeeName: g.attendeeName ?? null,
  }));

  res.json({
    totalAttendees: Number(attendeeCnt?.cnt ?? 0),
    totalMeetings: Number(meetingCnt?.cnt ?? 0),
    totalGoals: Number(goalCnt?.cnt ?? 0),
    goalsByStatus,
    pendingInvites: Number(pendingInviteCnt?.cnt ?? 0),
    recentActivity,
  });
});

router.post("/admin/send-reminder", requireAdmin, async (req, res): Promise<void> => {
  const { circleId } = req.body as { circleId?: number };
  if (!circleId) { res.status(400).json({ error: "circleId is required" }); return; }

  const [circle] = await db.select().from(circlesTable).where(eq(circlesTable.id, circleId));
  if (!circle) { res.status(404).json({ error: "Circle not found" }); return; }

  const attendees = await db
    .select()
    .from(attendeesTable)
    .where(and(eq(attendeesTable.circleId, circleId), ne(attendeesTable.role, "admin")));

  // Get next upcoming meeting
  const [nextMeeting] = await db
    .select()
    .from(meetingsTable)
    .where(and(eq(meetingsTable.circleId, circleId), gte(meetingsTable.date, new Date().toISOString())))
    .orderBy(asc(meetingsTable.date))
    .limit(1);

  let sent = 0;
  let suppressed = 0;
  let failed = 0;
  for (const attendee of attendees) {
    const openGoals = await db
      .select()
      .from(goalsTable)
      .where(eq(goalsTable.attendeeId, attendee.id));

    const html = buildReminderEmail(
      attendee.name,
      circle.name,
      nextMeeting?.date ?? "TBD",
      openGoals.filter(g => g.status !== "Completed").map(g => ({
        timeframe: g.timeframe,
        status: g.status,
        comments: g.comments,
      })),
    );

    try {
      const delivery = await sendEmail({ to: attendee.email, subject: `Upcoming ${circle.name} Meeting Reminder`, html });
      if (delivery.sent) sent += 1;
      else suppressed += 1;
    } catch {
      failed += 1;
    }
  }

  res.json({
    message: `Reminder processed for ${attendees.length} attendees`,
    sent,
    suppressed,
    failed,
  });
});

router.post("/admin/send-survey", requireAdmin, async (req, res): Promise<void> => {
  const { circleId, meetingId } = req.body as { circleId?: number; meetingId?: number };
  if (!circleId) { res.status(400).json({ error: "circleId is required" }); return; }

  const [circle] = await db.select().from(circlesTable).where(eq(circlesTable.id, circleId));
  if (!circle) { res.status(404).json({ error: "Circle not found" }); return; }

  const defaultQuestions = [
    "How would you rate today's session overall? (1-5)",
    "What was the most valuable topic discussed?",
    "What would you like to explore in the next session?",
    "Any other feedback or suggestions?",
  ];

  const [meeting] = meetingId
    ? await db
      .select()
      .from(meetingsTable)
      .where(and(eq(meetingsTable.id, meetingId), eq(meetingsTable.circleId, circleId)))
    : await db
      .select()
      .from(meetingsTable)
      .where(and(eq(meetingsTable.circleId, circleId), lte(meetingsTable.date, new Date().toISOString())))
      .orderBy(desc(meetingsTable.date))
      .limit(1);
  if (!meeting) {
    res.status(400).json({ error: "Select a completed meeting before sending a survey" });
    return;
  }

  let [survey] = await db.select().from(surveysTable).where(eq(surveysTable.meetingId, meeting.id));
  if (!survey) {
    [survey] = await db
      .insert(surveysTable)
      .values({ meetingId: meeting.id, type: "post_meeting", questions: defaultQuestions })
      .returning();
  }

  const applicationUrl = getApplicationUrl(req);
  if (!applicationUrl) {
    res.status(503).json({ error: "Survey email is not configured with a public application URL" });
    return;
  }

  const attendees = await db
    .select({ name: attendeesTable.name, email: attendeesTable.email })
    .from(meetingInviteesTable)
    .innerJoin(attendeesTable, eq(meetingInviteesTable.attendeeId, attendeesTable.id))
    .where(and(eq(meetingInviteesTable.meetingId, meeting.id), ne(attendeesTable.role, "admin")));
  const questions = survey.questions as string[];
  const surveyLink = `${applicationUrl}/survey/${survey.id}`;

  let sent = 0;
  let suppressed = 0;
  let failed = 0;
  for (const attendee of attendees) {
    const html = buildSurveyEmail(attendee.name, circle.name, surveyLink, questions);
    try {
      const delivery = await sendEmail({ to: attendee.email, subject: `${circle.name} — Post-Meeting Feedback`, html });
      if (delivery.sent) sent += 1;
      else suppressed += 1;
    } catch {
      failed += 1;
    }
  }

  res.json({
    message: `Survey processed for ${attendees.length} attendees`,
    sent,
    suppressed,
    failed,
  });
});

export default router;
