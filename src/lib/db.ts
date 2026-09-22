import { Pool, type QueryResultRow } from "pg";

const globalForDb = globalThis as unknown as { pgPool: Pool | undefined };

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Add it to your .env file (see .env.example)."
    );
  }
  // Neon / most managed Postgres providers require SSL. Local dev (localhost)
  // typically doesn't support or need it, so only enable it for remote hosts.
  const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);
  return new Pool({
    connectionString,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
    max: 5,
  });
}

// Created lazily (on first query) rather than at module load time. Route
// handler modules get imported while Next.js collects build-time metadata,
// even though they never actually run then — an eager `new Pool()` here
// would throw during `next build` on any machine where DATABASE_URL isn't
// set yet (e.g. before the database has been provisioned on Vercel).
function getPool(): Pool {
  if (!globalForDb.pgPool) {
    globalForDb.pgPool = createPool();
  }
  return globalForDb.pgPool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
