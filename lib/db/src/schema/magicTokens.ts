import { pgTable, serial, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { attendeesTable } from "./attendees";

export const magicTokensTable = pgTable("magic_tokens", {
  id: serial("id").primaryKey(),
  // SHA-256 digest of the raw token. Raw tokens only travel in email links.
  token: text("token").notNull().unique(),
  attendeeId: integer("attendee_id").references(() => attendeesTable.id, { onDelete: "cascade" }).notNull(),
  used: boolean("used").notNull().default(false),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMagicTokenSchema = createInsertSchema(magicTokensTable).omit({ id: true, createdAt: true });
export type InsertMagicToken = z.infer<typeof insertMagicTokenSchema>;
export type MagicToken = typeof magicTokensTable.$inferSelect;
