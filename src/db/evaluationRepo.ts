import { getDemoStore } from "@/src/db/demoStore";
import { getDatabase, isMongoConfigured } from "@/src/db/mongo";
import { deserialize, serialize, type MongoShape } from "@/src/db/serialization";
import type { EvaluationResult } from "@/src/types";

export async function saveEvaluation(result: EvaluationResult): Promise<EvaluationResult> {
  if (!isMongoConfigured()) {
    const existing = getDemoStore().evaluations.find((item) => item.id === result.id);
    if (!existing) getDemoStore().evaluations.push(result);
    return existing ?? result;
  }
  await (await getDatabase()).collection<MongoShape>("evaluation_runs").replaceOne(
    { _id: result.id }, serialize.evaluation(result), { upsert: true },
  );
  return result;
}

export async function listEvaluations(): Promise<EvaluationResult[]> {
  if (!isMongoConfigured()) return [...getDemoStore().evaluations];
  const rows = await (await getDatabase()).collection<MongoShape>("evaluation_runs").find().sort({ createdAt: 1 }).toArray();
  return rows.map((row) => deserialize.evaluation(row as never));
}
