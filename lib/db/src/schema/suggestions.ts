import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { attendeesTable } from "./attendees";
import { meetingsTable } from "./meetings";

export const suggestionsTable = pgTable("suggestions", {
  id: serial("id").primaryKey(),
  attendeeId: integer("attendee_id").references(() => attendeesTable.id).notNull(),
  meetingId: integer("meeting_id").references(() => meetingsTable.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSuggestionSchema = createInsertSchema(suggestionsTable).omit({ id: true, createdAt: true });
export type InsertSuggestion = z.infer<typeof insertSuggestionSchema>;
export type Suggestion = typeof suggestionsTable.$inferSelect;
