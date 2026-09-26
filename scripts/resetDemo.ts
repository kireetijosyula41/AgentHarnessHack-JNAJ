/**
 * Full demo reset.
 *
 * Wipes ALL Antibody state and restores the pristine "vulnerable v1" baseline,
 * so the exploit -> harden -> replay -> rollback loop can be demonstrated from a
 * clean slate.
 *
 * Behaviour:
 *   - With MONGODB_URI set  → drops every Antibody collection in Atlas, then
 *     re-seeds harness v1, deployment pointer, and the baseline regressions.
 *   - Without MONGODB_URI   → resets the in-memory demo store (no-op for a
 *     fresh process, but resets a long-running dev server on next request).
 *
 * Run:
 *   node --env-file=.env --import tsx scripts/resetDemo.ts
 *   (or: npm run reset)
 */

import { getDatabase, isMongoConfigured, pingMongo } from "../src/db/mongo";
import { resetDemoStore } from "../src/db/demoStore";
import { serialize, type MongoShape } from "../src/db/serialization";

const COLLECTIONS = [
  "harness_versions",
  "attack_traces",
  "regression_cases",
  "evaluation_runs",
  "deployment_state",
  "agent_runs",
] as const;

async function reset() {
  const seedData = resetDemoStore();

  if (!isMongoConfigured()) {
    console.log(
      "Local demo store reset (no MONGODB_URI). A running dev server will " +
        "reinitialize on its next request.",
    );
    return;
  }

  const db = await getDatabase();

  // 1. Wipe every collection so no stale attacks / versions / runs remain.
  //    deleteMany (rather than drop) is safe when a collection doesn't exist yet.
  await Promise.all(
    COLLECTIONS.map((name) => db.collection(name).deleteMany({})),
  );

  // 2. Re-seed the pristine baseline: harness v1, deployment -> v1, regressions.
  await Promise.all([
    db.collection<MongoShape>("harness_versions").replaceOne(
      { _id: seedData.harnesses[0].id },
      serialize.harness(seedData.harnesses[0]),
      { upsert: true },
    ),
    db.collection<MongoShape>("deployment_state").replaceOne(
      { _id: "global" },
      serialize.deployment(seedData.deployment),
      { upsert: true },
    ),
    ...seedData.regressions.map((item) =>
      db.collection<MongoShape>("regression_cases").replaceOne(
        { _id: item.id },
        serialize.regression(item),
        { upsert: true },
      ),
    ),
  ]);

  // 3. Ensure indexes exist (idempotent).
  await Promise.all([
    db.collection("harness_versions").createIndex({ version: 1 }, { unique: true }),
    db.collection("attack_traces").createIndex({ createdAt: -1 }),
    db.collection("regression_cases").createIndex({ type: 1, heldOut: 1 }),
    db.collection("evaluation_runs").createIndex({ createdAt: -1 }),
    db.collection("agent_runs").createIndex({ createdAt: -1 }),
  ]);

  const result = await pingMongo();
  const counts = await Promise.all(
    COLLECTIONS.map(async (name) => `${name}: ${await db.collection(name).countDocuments()}`),
  );
  console.log(`Reset ${result.database} to pristine v1.`);
  console.log("  " + counts.join("\n  "));
}

reset()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
