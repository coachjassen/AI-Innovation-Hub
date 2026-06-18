import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { meetingsTable } from "./meetings";

export const surveysTable = pgTable("surveys", {
  id: serial("id").primaryKey(),
  meetingId: integer("meeting_id").references(() => meetingsTable.id).notNull(),
  type: text("type").notNull(), // pre-meeting | post-meeting
  questions: jsonb("questions").notNull().$type<string[]>().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSurveySchema = createInsertSchema(surveysTable).omit({ id: true, createdAt: true });
export type InsertSurvey = z.infer<typeof insertSurveySchema>;
export type Survey = typeof surveysTable.$inferSelect;
