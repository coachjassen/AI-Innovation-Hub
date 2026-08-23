import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const circlesTable = pgTable("circles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  cadence: text("cadence").notNull(), // monthly | quarterly | one-off
  status: text("status").notNull().default("active"), // active | inactive
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCircleSchema = createInsertSchema(circlesTable).omit({ id: true, createdAt: true });
export type InsertCircle = z.infer<typeof insertCircleSchema>;
export type Circle = typeof circlesTable.$inferSelect;
