import { getDemoStore } from "@/src/db/demoStore";
import { getDatabase, isMongoConfigured } from "@/src/db/mongo";
import { deserialize, serialize, type MongoShape } from "@/src/db/serialization";
import type { AgentRunRecord } from "@/src/types";

export async function saveAgentRun(run: AgentRunRecord): Promise<AgentRunRecord> {
  if (!isMongoConfigured()) getDemoStore().runs.push(run);
  else await (await getDatabase()).collection<MongoShape>("agent_runs").insertOne(serialize.run(run));
  return run;
}

export async function listAgentRuns(): Promise<AgentRunRecord[]> {
  if (!isMongoConfigured()) return [...getDemoStore().runs];
  const rows = await (await getDatabase())
    .collection<MongoShape>("agent_runs")
    .find()
    .sort({ createdAt: 1 })
    .toArray();
  return rows.map((row) => deserialize.run(row as never));
}
