import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { circlesTable } from "./circles";

export const attendeesTable = pgTable("attendees", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  company: text("company").notNull().default(""),
  role: text("role").notNull().default("attendee"), // attendee | admin
  circleId: integer("circle_id").references(() => circlesTable.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAttendeeSchema = createInsertSchema(attendeesTable).omit({ id: true, createdAt: true });
export type InsertAttendee = z.infer<typeof insertAttendeeSchema>;
export type Attendee = typeof attendeesTable.$inferSelect;
