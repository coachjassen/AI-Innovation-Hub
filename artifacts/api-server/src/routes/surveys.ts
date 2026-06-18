import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, surveysTable, surveyResponsesTable } from "@workspace/db";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth";
import "../lib/session";

const router: IRouter = Router();

function serializeSurvey(s: typeof surveysTable.$inferSelect) {
  return {
    id: s.id,
    meetingId: s.meetingId,
    type: s.type,
    questions: s.questions as string[],
    createdAt: s.createdAt.toISOString(),
  };
}

function serializeResponse(r: typeof surveyResponsesTable.$inferSelect) {
  return {
    id: r.id,
    surveyId: r.surveyId,
    attendeeId: r.attendeeId,
    answers: r.answers as string[],
    createdAt: r.createdAt.toISOString(),
  };
}

router.get("/surveys", requireAuth, async (_req, res): Promise<void> => {
  const surveys = await db.select().from(surveysTable).orderBy(surveysTable.createdAt);
  res.json(surveys.map(serializeSurvey));
});

router.post("/surveys", requireAdmin, async (req, res): Promise<void> => {
  const { meetingId, type, questions } = req.body as { meetingId?: number; type?: string; questions?: string[] };
  if (!meetingId || !type || !questions) {
    res.status(400).json({ error: "meetingId, type, and questions are required" });
    return;
  }
  const [survey] = await db.insert(surveysTable).values({ meetingId, type, questions }).returning();
  res.status(201).json(serializeSurvey(survey));
});

router.get("/surveys/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [survey] = await db.select().from(surveysTable).where(eq(surveysTable.id, id));
  if (!survey) { res.status(404).json({ error: "Survey not found" }); return; }
  res.json(serializeSurvey(survey));
});

router.post("/surveys/:id/responses", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const surveyId = parseInt(raw, 10);
  if (isNaN(surveyId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { answers } = req.body as { answers?: string[] };
  if (!answers) { res.status(400).json({ error: "answers is required" }); return; }
  const attendeeId = req.session.attendeeId!;
  const [response] = await db
    .insert(surveyResponsesTable)
    .values({ surveyId, attendeeId, answers })
    .returning();
  res.status(201).json(serializeResponse(response));
});

router.get("/surveys/:id/responses", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const surveyId = parseInt(raw, 10);
  if (isNaN(surveyId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const responses = await db
    .select()
    .from(surveyResponsesTable)
    .where(eq(surveyResponsesTable.surveyId, surveyId));
  res.json(responses.map(serializeResponse));
});

export default router;
