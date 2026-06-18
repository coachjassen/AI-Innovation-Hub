import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { attendeesTable } from "./attendees";
import { circlesTable } from "./circles";

export const invitesTable = pgTable("invites", {
  id: serial("id").primaryKey(),
  invitedByAttendeeId: integer("invited_by_attendee_id").references(() => attendeesTable.id).notNull(),
  email: text("email").notNull(),
  circleId: integer("circle_id").references(() => circlesTable.id).notNull(),
  status: text("status").notNull().default("pending"), // pending | accepted | rejected
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertInviteSchema = createInsertSchema(invitesTable).omit({ id: true, createdAt: true });
export type InsertInvite = z.infer<typeof insertInviteSchema>;
export type Invite = typeof invitesTable.$inferSelect;
