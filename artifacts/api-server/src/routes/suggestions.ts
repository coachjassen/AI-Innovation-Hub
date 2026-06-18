import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, suggestionsTable, attendeesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import "../lib/session";

const router: IRouter = Router();

router.get("/suggestions", requireAuth, async (req, res): Promise<void> => {
  const rows = await db
    .select({
      id: suggestionsTable.id,
      attendeeId: suggestionsTable.attendeeId,
      meetingId: suggestionsTable.meetingId,
      content: suggestionsTable.content,
      createdAt: suggestionsTable.createdAt,
      attendeeName: attendeesTable.name,
      attendeeCompany: attendeesTable.company,
    })
    .from(suggestionsTable)
    .leftJoin(attendeesTable, eq(suggestionsTable.attendeeId, attendeesTable.id))
    .orderBy(desc(suggestionsTable.createdAt));

  const result = rows.map(r => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    attendeeName: r.attendeeName ?? "",
    attendeeCompany: r.attendeeCompany ?? "",
  }));

  // Non-admins only see their own
  if (req.session.attendeeRole !== "admin") {
    res.json(result.filter(r => r.attendeeId === req.session.attendeeId));
    return;
  }
  res.json(result);
});

router.post("/suggestions", requireAuth, async (req, res): Promise<void> => {
  const { content, meetingId } = req.body as { content?: string; meetingId?: number };
  if (!content) { res.status(400).json({ error: "content is required" }); return; }
  const attendeeId = req.session.attendeeId!;
  const [suggestion] = await db
    .insert(suggestionsTable)
    .values({ attendeeId, content, meetingId: meetingId ?? null })
    .returning();
  res.status(201).json({ ...suggestion, createdAt: suggestion.createdAt.toISOString() });
});

export default router;
