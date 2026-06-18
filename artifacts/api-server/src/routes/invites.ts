import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, invitesTable, attendeesTable, circlesTable } from "@workspace/db";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth";
import "../lib/session";

const router: IRouter = Router();

router.get("/invites", requireAuth, async (req, res): Promise<void> => {
  const rows = await db
    .select({
      id: invitesTable.id,
      invitedByAttendeeId: invitesTable.invitedByAttendeeId,
      email: invitesTable.email,
      circleId: invitesTable.circleId,
      status: invitesTable.status,
      createdAt: invitesTable.createdAt,
      invitedByName: attendeesTable.name,
      circleName: circlesTable.name,
    })
    .from(invitesTable)
    .leftJoin(attendeesTable, eq(invitesTable.invitedByAttendeeId, attendeesTable.id))
    .leftJoin(circlesTable, eq(invitesTable.circleId, circlesTable.id))
    .orderBy(desc(invitesTable.createdAt));

  const result = rows.map(r => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    invitedByName: r.invitedByName ?? "",
    circleName: r.circleName ?? "",
  }));

  if (req.session.attendeeRole !== "admin") {
    res.json(result.filter(r => r.invitedByAttendeeId === req.session.attendeeId));
    return;
  }
  res.json(result);
});

router.post("/invites", requireAuth, async (req, res): Promise<void> => {
  const { email } = req.body as { email?: string };
  if (!email) { res.status(400).json({ error: "email is required" }); return; }
  const attendeeId = req.session.attendeeId!;
  const [me] = await db.select().from(attendeesTable).where(eq(attendeesTable.id, attendeeId));
  if (!me) { res.status(401).json({ error: "Not found" }); return; }
  const [invite] = await db
    .insert(invitesTable)
    .values({ invitedByAttendeeId: attendeeId, email: email.trim().toLowerCase(), circleId: me.circleId })
    .returning();
  res.status(201).json({ ...invite, createdAt: invite.createdAt.toISOString() });
});

router.patch("/invites/:id", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { status } = req.body as { status?: string };
  if (!status) { res.status(400).json({ error: "status is required" }); return; }
  const [invite] = await db.update(invitesTable).set({ status }).where(eq(invitesTable.id, id)).returning();
  if (!invite) { res.status(404).json({ error: "Invite not found" }); return; }
  res.json({ ...invite, createdAt: invite.createdAt.toISOString() });
});

export default router;
