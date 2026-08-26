import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { circlesTable } from "./circles";

export const meetingsTable = pgTable("meetings", {
  id: serial("id").primaryKey(),
  circleId: integer("circle_id").references(() => circlesTable.id).notNull(),
  date: text("date").notNull(), // ISO date string
  notes: text("notes"),
  slidesPath: text("slides_path"),
  keyInsight: text("key_insight"),
  invitationBody: text("invitation_body"),
  invitationAttachmentPath: text("invitation_attachment_path"),
  invitationAttachmentName: text("invitation_attachment_name"),
  invitationAttachmentContentType: text("invitation_attachment_content_type"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMeetingSchema = createInsertSchema(meetingsTable).omit({ id: true, createdAt: true });
export type InsertMeeting = z.infer<typeof insertMeetingSchema>;
export type Meeting = typeof meetingsTable.$inferSelect;
