import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, circlesTable } from "@workspace/db";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/circles", requireAuth, async (_req, res): Promise<void> => {
  const circles = await db.select().from(circlesTable).orderBy(circlesTable.name);
  res.json(circles.map(c => ({ ...c, createdAt: c.createdAt.toISOString() })));
});

router.post("/circles", requireAdmin, async (req, res): Promise<void> => {
  const { name, cadence, status } = req.body as { name?: string; cadence?: string; status?: string };
  if (!name || !cadence || !status) {
    res.status(400).json({ error: "name, cadence, and status are required" });
    return;
  }
  const [circle] = await db.insert(circlesTable).values({ name, cadence, status }).returning();
  res.status(201).json({ ...circle, createdAt: circle.createdAt.toISOString() });
});

router.get("/circles/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [circle] = await db.select().from(circlesTable).where(eq(circlesTable.id, id));
  if (!circle) { res.status(404).json({ error: "Circle not found" }); return; }
  res.json({ ...circle, createdAt: circle.createdAt.toISOString() });
});

router.patch("/circles/:id", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { name, cadence, status } = req.body as { name?: string; cadence?: string; status?: string };
  const updates: Partial<{ name: string; cadence: string; status: string }> = {};
  if (name !== undefined) updates.name = name;
  if (cadence !== undefined) updates.cadence = cadence;
  if (status !== undefined) updates.status = status;
  const [circle] = await db.update(circlesTable).set(updates).where(eq(circlesTable.id, id)).returning();
  if (!circle) { res.status(404).json({ error: "Circle not found" }); return; }
  res.json({ ...circle, createdAt: circle.createdAt.toISOString() });
});

export default router;
