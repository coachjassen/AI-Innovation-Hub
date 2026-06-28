import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { meetingsTable } from "./meetings";

export const agendaItemsTable = pgTable("agenda_items", {
  id: serial("id").primaryKey(),
  meetingId: integer("meeting_id")
    .references(() => meetingsTable.id, { onDelete: "cascade" })
    .notNull(),
  position: integer("position").notNull(),
  title: text("title").notNull(),
  durationMinutes: integer("duration_minutes"),
  presenter: text("presenter"),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AgendaItem = typeof agendaItemsTable.$inferSelect;
