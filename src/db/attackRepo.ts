import { getDemoStore } from "@/src/db/demoStore";
import { getDatabase, isMongoConfigured } from "@/src/db/mongo";
import { deserialize, serialize, type MongoShape } from "@/src/db/serialization";
import type { AttackTrace } from "@/src/types";

export async function saveAttackTrace(attack: AttackTrace): Promise<AttackTrace> {
  if (!isMongoConfigured()) {
    const existing = getDemoStore().attacks.find((item) => item.id === attack.id);
    if (!existing) getDemoStore().attacks.push(attack);
    return existing ?? attack;
  }
  await (await getDatabase()).collection<MongoShape>("attack_traces").replaceOne(
    { _id: attack.id }, serialize.attack(attack), { upsert: true },
  );
  return attack;
}

export async function getAttackTrace(id: string): Promise<AttackTrace | null> {
  if (!isMongoConfigured()) return getDemoStore().attacks.find((item) => item.id === id) ?? null;
  const row = await (await getDatabase()).collection<MongoShape>("attack_traces").findOne({ _id: id });
  return row ? deserialize.attack(row as never) : null;
}

export async function listAttackTraces(): Promise<AttackTrace[]> {
  if (!isMongoConfigured()) return [...getDemoStore().attacks];
  const rows = await (await getDatabase()).collection<MongoShape>("attack_traces").find().sort({ createdAt: -1 }).toArray();
  return rows.map((row) => deserialize.attack(row as never));
}
