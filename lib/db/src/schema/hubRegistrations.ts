import { integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { attendeesTable } from "./attendees";
import { circlesTable } from "./circles";

export const hubRegistrationsTable = pgTable(
  "hub_registrations",
  {
    id: serial("id").primaryKey(),
    circleId: integer("circle_id").references(() => circlesTable.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    company: text("company").notNull().default(""),
    attendeeId: integer("attendee_id").references(() => attendeesTable.id, { onDelete: "set null" }),
    promotedAt: timestamp("promoted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("hub_registrations_circle_id_email_unique").on(table.circleId, table.email),
  ],
);

export const insertHubRegistrationSchema = createInsertSchema(hubRegistrationsTable).omit({
  id: true,
  attendeeId: true,
  promotedAt: true,
  createdAt: true,
});
export type InsertHubRegistration = z.infer<typeof insertHubRegistrationSchema>;
export type HubRegistration = typeof hubRegistrationsTable.$inferSelect;