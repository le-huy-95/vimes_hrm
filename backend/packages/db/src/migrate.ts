import { createPool } from "./client.js";
import { MIGRATIONS } from "./migrations.js";

async function main() {
  const url = process.env.POSTGRES_URL ?? "postgresql://mt:mt@localhost:15432/manage_teams";
  const db = createPool(url);
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    for (const m of MIGRATIONS) {
      const exists = await db.query(`SELECT 1 FROM schema_migrations WHERE id = $1`, [m.id]);
      if (exists.rowCount && exists.rowCount > 0) {
        console.log(`skip ${m.id}`);
        continue;
      }
      await db.query("BEGIN");
      try {
        await db.query(m.sql);
        await db.query(`INSERT INTO schema_migrations (id) VALUES ($1)`, [m.id]);
        await db.query("COMMIT");
        console.log(`applied ${m.id}`);
      } catch (err) {
        await db.query("ROLLBACK");
        throw err;
      }
    }
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
