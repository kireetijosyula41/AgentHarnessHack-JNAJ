import { getDatabase, pingMongo } from "../src/db/mongo";
import { resetDemoStore } from "../src/db/demoStore";
import { serialize, type MongoShape } from "../src/db/serialization";

async function seed() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required. Copy .env.example to .env.local and add your Atlas URI.");
  }
  const db = await getDatabase();
  const seedData = resetDemoStore();
  await Promise.all([
    db.collection<MongoShape>("harness_versions").replaceOne(
      { _id: seedData.harnesses[0].id }, serialize.harness(seedData.harnesses[0]), { upsert: true },
    ),
    db.collection<MongoShape>("deployment_state").replaceOne(
      { _id: "global" }, serialize.deployment(seedData.deployment), { upsert: true },
    ),
    ...seedData.regressions.map((item) => db.collection<MongoShape>("regression_cases").replaceOne(
      { _id: item.id }, serialize.regression(item), { upsert: true },
    )),
  ]);
  await Promise.all([
    db.collection("harness_versions").createIndex({ version: 1 }, { unique: true }),
    db.collection("attack_traces").createIndex({ createdAt: -1 }),
    db.collection("regression_cases").createIndex({ type: 1, heldOut: 1 }),
    db.collection("evaluation_runs").createIndex({ createdAt: -1 }),
    db.collection("agent_runs").createIndex({ createdAt: -1 }),
  ]);
  const result = await pingMongo();
  console.log(`Seeded ${result.database}: harness v1, deployment state, and ${seedData.regressions.length} regressions.`);
}

seed()
  .then(() => {
    // The cached Mongo client keeps its connection pool open, which would keep
    // this one-shot CLI process alive indefinitely. Exit explicitly once done.
    process.exit(0);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
