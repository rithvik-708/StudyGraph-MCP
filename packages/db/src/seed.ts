/**
 * CLI entrypoint: seeds DATABASE_PATH (default ./data/studygraph.db) with the demo dataset.
 * Safe to re-run: seedDemoData() wipes all rows before inserting (schema/tables are preserved).
 */
import { createDb } from "./client.js";
import { seedDemoData } from "./seedData.js";

async function main() {
  const dbPath = process.env.DATABASE_PATH ?? "./data/studygraph.db";
  const { sqlite, db } = createDb(dbPath);

  console.log(`Seeding ${dbPath} ...`);
  const { alice, bob } = await seedDemoData(db, sqlite);

  console.log(`Created users: alice (${alice.publicId}), bob (${bob.publicId})`);
  console.log("Seed complete.");
  console.log(`  alice public_id: ${alice.publicId} (subjects: Calculus II, Organic Chemistry, World History)`);
  console.log(`  bob   public_id: ${bob.publicId} (subject: Linear Algebra)`);
  console.log("Run `npm run login` to obtain a STUDYGRAPH_USER_TOKEN for either user.");

  sqlite.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
