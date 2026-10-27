CREATE TABLE IF NOT EXISTS "users" (
  "id" serial PRIMARY KEY NOT NULL,
  "email" varchar(255) NOT NULL UNIQUE,
  "password_hash" varchar(255) NOT NULL,
  "name" varchar(255),
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "floor_maps" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer REFERENCES "users"("id") ON DELETE CASCADE,
  "title" varchar(255) NOT NULL,
  "description" text,
  "image_url" text,
  "source_image" text,
  "analysis" jsonb,
  "grid_width" integer DEFAULT 30 NOT NULL,
  "grid_height" integer DEFAULT 30 NOT NULL,
  "grid_data" jsonb DEFAULT '{}' NOT NULL,
  "exits" jsonb DEFAULT '[]' NOT NULL,
  "starts" jsonb DEFAULT '[]' NOT NULL,
  "obstacles" jsonb DEFAULT '[]' NOT NULL,
  "is_public" boolean DEFAULT false,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "runs" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer REFERENCES "users"("id") ON DELETE CASCADE,
  "map_id" integer REFERENCES "floor_maps"("id") ON DELETE CASCADE,
  "title" varchar(255) NOT NULL,
  "heuristic" varchar(50) DEFAULT 'manhattan' NOT NULL,
  "start_points" jsonb DEFAULT '[]' NOT NULL,
  "exit_points" jsonb DEFAULT '[]' NOT NULL,
  "obstacle_points" jsonb DEFAULT '[]' NOT NULL,
  "path_result" jsonb DEFAULT '[]' NOT NULL,
  "total_path_cost" double precision,
  "nodes_explored" integer DEFAULT 0,
  "nodes_in_open" integer DEFAULT 0,
  "nodes_in_closed" integer DEFAULT 0,
  "time_taken_ms" integer DEFAULT 0,
  "config" jsonb DEFAULT '{}' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
