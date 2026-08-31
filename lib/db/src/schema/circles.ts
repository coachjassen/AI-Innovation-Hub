import { boolean, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const circlesTable = pgTable("circles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  cadence: text("cadence").notNull(), // monthly | quarterly | one-off
  status: text("status").notNull().default("active"), // active | inactive
  registrationDescription: text("registration_description"),
  registrationOpen: boolean("registration_open").notNull().default(false),
  registrationTokenHash: text("registration_token_hash"),
  registrationTokenEncrypted: text("registration_token_encrypted"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("circles_registration_token_hash_unique").on(table.registrationTokenHash),
]);

export const insertCircleSchema = createInsertSchema(circlesTable).omit({ id: true, createdAt: true });
export type InsertCircle = z.infer<typeof insertCircleSchema>;
export type Circle = typeof circlesTable.$inferSelect;
