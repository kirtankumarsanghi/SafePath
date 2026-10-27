import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { SAMPLE_MAPS, SAMPLE_RUNS } from "@/lib/sample-data";

const rawDatabaseUrl = process.env.DATABASE_URL;
const isVercel = Boolean(process.env.VERCEL);
const isLocalhost =
  !rawDatabaseUrl ||
  rawDatabaseUrl.includes("127.0.0.1") ||
  rawDatabaseUrl.includes("localhost");

// When deployed on Vercel, a localhost connection string won't work because
// serverless lambdas do not run a local PostgreSQL daemon.
export const isDatabaseConfigured = Boolean(
  rawDatabaseUrl && (!isVercel || !isLocalhost)
);

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
  __arenaNextJsDbInitialized?: boolean;
};

// Cloud providers (Neon, Supabase, AWS RDS, etc.) require SSL.
// Support explicit CA verification via DATABASE_CA_CERT or DB_REJECT_UNAUTHORIZED=true.
const sslConfig = isLocalhost
  ? false
  : process.env.DATABASE_CA_CERT
  ? { rejectUnauthorized: true, ca: process.env.DATABASE_CA_CERT }
  : { rejectUnauthorized: process.env.DB_REJECT_UNAUTHORIZED === "true" };

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString:
      rawDatabaseUrl || "postgresql://postgres:postgres@127.0.0.1:5432/app_db",
    ssl: sslConfig,
    connectionTimeoutMillis: 5000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);

let initPromise: Promise<void> | null = null;

/**
 * Automatically ensures PostgreSQL tables exist and seeds default blueprints
 * if the database is newly provisioned.
 */
export async function ensureDatabaseReady(): Promise<void> {
  if (globalForDb.__arenaNextJsDbInitialized) return;
  if (!isDatabaseConfigured) return;

  if (!initPromise) {
    initPromise = (async () => {
      try {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email VARCHAR(255) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            name VARCHAR(255),
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS floor_maps (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            image_url TEXT,
            source_image TEXT,
            analysis JSONB,
            grid_width INTEGER NOT NULL DEFAULT 30,
            grid_height INTEGER NOT NULL DEFAULT 30,
            grid_data JSONB NOT NULL DEFAULT '{}',
            exits JSONB NOT NULL DEFAULT '[]',
            starts JSONB NOT NULL DEFAULT '[]',
            obstacles JSONB NOT NULL DEFAULT '[]',
            is_public BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS runs (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            map_id INTEGER REFERENCES floor_maps(id) ON DELETE CASCADE,
            title VARCHAR(255) NOT NULL,
            heuristic VARCHAR(50) NOT NULL DEFAULT 'manhattan',
            start_points JSONB NOT NULL DEFAULT '[]',
            exit_points JSONB NOT NULL DEFAULT '[]',
            obstacle_points JSONB NOT NULL DEFAULT '[]',
            path_result JSONB NOT NULL DEFAULT '[]',
            total_path_cost DOUBLE PRECISION,
            nodes_explored INTEGER DEFAULT 0,
            nodes_in_open INTEGER DEFAULT 0,
            nodes_in_closed INTEGER DEFAULT 0,
            time_taken_ms INTEGER DEFAULT 0,
            config JSONB NOT NULL DEFAULT '{}',
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
          );
        `);

        const countRes = await pool.query(
          "SELECT COUNT(*)::int as count FROM floor_maps"
        );
        const count = countRes.rows[0]?.count ?? 0;

        if (count === 0) {
          const userRes = await pool.query(`
            INSERT INTO users (email, password_hash, name)
            VALUES ('demo@university.edu', '$2a$10$demoUserPasswordHashSafePath2026', 'Demo Administrator')
            ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
            RETURNING id;
          `);
          const userId = userRes.rows[0]?.id ?? 1;

          for (const m of SAMPLE_MAPS) {
            await pool.query(
              `INSERT INTO floor_maps (id, user_id, title, description, grid_width, grid_height, grid_data, exits, starts, obstacles, is_public)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
               ON CONFLICT (id) DO NOTHING;`,
              [
                m.id,
                userId,
                m.title,
                m.description,
                m.gridWidth,
                m.gridHeight,
                JSON.stringify(m.gridData),
                JSON.stringify(m.exits),
                JSON.stringify(m.starts),
                JSON.stringify(m.obstacles),
                true,
              ]
            );
          }

          try {
            await pool.query(
              `SELECT setval(pg_get_serial_sequence('floor_maps', 'id'), (SELECT COALESCE(MAX(id), 1) FROM floor_maps));`
            );
          } catch {}

          for (const r of SAMPLE_RUNS) {
            await pool.query(
              `INSERT INTO runs (id, user_id, map_id, title, heuristic, start_points, exit_points, obstacle_points, path_result, total_path_cost, nodes_explored, nodes_in_open, nodes_in_closed, time_taken_ms, config)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
               ON CONFLICT (id) DO NOTHING;`,
              [
                r.id,
                userId,
                r.mapId,
                r.title,
                r.heuristic,
                JSON.stringify(r.startPoints),
                JSON.stringify(r.exitPoints),
                JSON.stringify(r.obstaclePoints),
                JSON.stringify(r.pathResult),
                r.totalPathCost,
                r.nodesExplored,
                r.nodesInOpen,
                r.nodesInClosed,
                r.timeTakenMs,
                JSON.stringify(r.config),
              ]
            );
          }

          try {
            await pool.query(
              `SELECT setval(pg_get_serial_sequence('runs', 'id'), (SELECT COALESCE(MAX(id), 1) FROM runs));`
            );
          } catch {}
        }

        globalForDb.__arenaNextJsDbInitialized = true;
      } catch (err) {
        console.warn(
          "[SafePath] PostgreSQL initialization notice:",
          (err as Error).message
        );
      } finally {
        initPromise = null;
      }
    })();
  }

  await initPromise;
}
