import { getDemoStore } from "@/src/db/demoStore";
import { getDatabase, isMongoConfigured } from "@/src/db/mongo";
import { deserialize, serialize, type MongoShape } from "@/src/db/serialization";
import type { HarnessVersion } from "@/src/types";

export async function getHarness(version: number): Promise<HarnessVersion | null> {
  if (!isMongoConfigured()) {
    return getDemoStore().harnesses.find((item) => item.version === version) ?? null;
  }
  const row = await (await getDatabase()).collection<MongoShape>("harness_versions").findOne({ version });
  return row ? deserialize.harness(row as never) : null;
}

export async function listHarnessVersions(): Promise<HarnessVersion[]> {
  if (!isMongoConfigured()) return [...getDemoStore().harnesses].sort((a, b) => a.version - b.version);
  const rows = await (await getDatabase()).collection<MongoShape>("harness_versions").find().sort({ version: 1 }).toArray();
  return rows.map((row) => deserialize.harness(row as never));
}

export async function createHarnessVersion(harness: HarnessVersion): Promise<HarnessVersion> {
  const existing = await getHarness(harness.version);
  if (existing) return existing;
  if (!isMongoConfigured()) {
    getDemoStore().harnesses.push(harness);
    return harness;
  }
  await (await getDatabase()).collection<MongoShape>("harness_versions").insertOne(serialize.harness(harness));
  return harness;
}

export async function setHarnessStatus(version: number, status: HarnessVersion["status"]): Promise<void> {
  if (!isMongoConfigured()) {
    const harness = getDemoStore().harnesses.find((item) => item.version === version);
    if (harness) harness.status = status;
    return;
  }
  await (await getDatabase()).collection<MongoShape>("harness_versions").updateOne({ version }, { $set: { status } });
}
