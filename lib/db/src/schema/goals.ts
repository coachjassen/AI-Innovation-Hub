import { pgTable, serial, text, integer, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { attendeesTable } from "./attendees";

export const goalsTable = pgTable("goals", {
  id: serial("id").primaryKey(),
  attendeeId: integer("attendee_id").references(() => attendeesTable.id).notNull(),
  timeframe: text("timeframe").notNull(),
  status: text("status").notNull().default("New"), // New | In Progress | Completed | Not Started
  comments: text("comments"),
  dueDate: date("due_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertGoalSchema = createInsertSchema(goalsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertGoal = z.infer<typeof insertGoalSchema>;
export type Goal = typeof goalsTable.$inferSelect;
