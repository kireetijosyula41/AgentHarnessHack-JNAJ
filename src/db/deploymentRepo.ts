import { getDemoStore } from "@/src/db/demoStore";
import { getDatabase, isMongoConfigured } from "@/src/db/mongo";
import { deserialize, serialize, type MongoShape } from "@/src/db/serialization";
import { getHarness, setHarnessStatus } from "@/src/db/harnessRepo";
import type { DeploymentState, HarnessVersion } from "@/src/types";

export async function getDeploymentState(): Promise<DeploymentState> {
  if (!isMongoConfigured()) return getDemoStore().deployment;
  const row = await (await getDatabase()).collection<MongoShape>("deployment_state").findOne({ _id: "global" });
  if (!row) throw new Error("Deployment state is not seeded. Run npm run seed.");
  return deserialize.deployment(row as never);
}

export async function getActiveHarness(): Promise<HarnessVersion> {
  const state = await getDeploymentState();
  const harness = await getHarness(state.activeHarnessVersion);
  if (!harness) throw new Error(`Active harness v${state.activeHarnessVersion} does not exist.`);
  return harness;
}

export async function activateHarness(version: number): Promise<DeploymentState> {
  const harness = await getHarness(version);
  if (!harness) throw new Error(`Cannot activate missing harness v${version}.`);
  const current = await getDeploymentState();
  if (current.activeHarnessVersion === version) return current;
  const next: DeploymentState = {
    id: "global",
    activeHarnessVersion: version,
    previousHarnessVersion: current.activeHarnessVersion,
    updatedAt: new Date().toISOString(),
  };
  await setHarnessStatus(current.activeHarnessVersion, "superseded");
  await setHarnessStatus(version, "active");
  if (!isMongoConfigured()) {
    getDemoStore().deployment = next;
  } else {
    await (await getDatabase()).collection<MongoShape>("deployment_state").replaceOne(
      { _id: "global" },
      serialize.deployment(next),
      { upsert: true },
    );
  }
  return next;
}
