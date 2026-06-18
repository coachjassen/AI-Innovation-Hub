import type { Request, Response, NextFunction } from "express";
import "../lib/session";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.attendeeId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.attendeeId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  if (req.session.attendeeRole !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}
