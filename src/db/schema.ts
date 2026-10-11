import { pgTable, serial, varchar, text, timestamp, jsonb, integer, boolean, doublePrecision } from "drizzle-orm/pg-core";
import type { SavedAnalysis } from "@/lib/map-analysis";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const floorMaps = pgTable("floor_maps", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  sourceImage: text("source_image"),
  analysis: jsonb("analysis").$type<SavedAnalysis>(),
  gridWidth: integer("grid_width").notNull().default(30),
  gridHeight: integer("grid_height").notNull().default(30),
  gridData: jsonb("grid_data").notNull().default("{}"), // { ["x,y"]: cellType }
  exits: jsonb("exits").notNull().default("[]"),
  starts: jsonb("starts").notNull().default("[]"),
  obstacles: jsonb("obstacles").notNull().default("[]"),
  isPublic: boolean("is_public").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const runs = pgTable("runs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  mapId: integer("map_id").references(() => floorMaps.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  heuristic: varchar("heuristic", { length: 50 }).notNull().default("manhattan"),
  startPoints: jsonb("start_points").notNull().default("[]"),
  exitPoints: jsonb("exit_points").notNull().default("[]"),
  obstaclePoints: jsonb("obstacle_points").notNull().default("[]"),
  pathResult: jsonb("path_result").notNull().default("[]"), // { path: [x,y][], explored: [x,y][], openList: [...], closedList: [...], stats: {...} }
  totalPathCost: doublePrecision("total_path_cost"),
  nodesExplored: integer("nodes_explored").default(0),
  nodesInOpen: integer("nodes_in_open").default(0),
  nodesInClosed: integer("nodes_in_closed").default(0),
  timeTakenMs: integer("time_taken_ms").default(0),
  config: jsonb("config").notNull().default("{}"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
