import { getDemoStore } from "@/src/db/demoStore";
import { getDatabase, isMongoConfigured } from "@/src/db/mongo";
import { serialize, type MongoShape } from "@/src/db/serialization";
import type { AgentRunRecord } from "@/src/types";

export async function saveAgentRun(run: AgentRunRecord): Promise<AgentRunRecord> {
  if (!isMongoConfigured()) getDemoStore().runs.push(run);
  else await (await getDatabase()).collection<MongoShape>("agent_runs").insertOne(serialize.run(run));
  return run;
}
