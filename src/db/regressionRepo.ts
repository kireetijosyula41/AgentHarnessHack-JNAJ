import { getDemoStore } from "@/src/db/demoStore";
import { getDatabase, isMongoConfigured } from "@/src/db/mongo";
import { deserialize, serialize, type MongoShape } from "@/src/db/serialization";
import type { RegressionCase } from "@/src/types";

export async function saveRegressionCase(testCase: RegressionCase): Promise<RegressionCase> {
  if (!isMongoConfigured()) {
    const existing = getDemoStore().regressions.find((item) => item.id === testCase.id);
    if (!existing) getDemoStore().regressions.push(testCase);
    return existing ?? testCase;
  }
  await (await getDatabase()).collection<MongoShape>("regression_cases").replaceOne(
    { _id: testCase.id }, serialize.regression(testCase), { upsert: true },
  );
  return testCase;
}

export async function listRegressionCases(filter?: { type?: RegressionCase["type"]; heldOut?: boolean }): Promise<RegressionCase[]> {
  if (!isMongoConfigured()) {
    return getDemoStore().regressions.filter((item) =>
      (filter?.type === undefined || item.type === filter.type) &&
      (filter?.heldOut === undefined || Boolean(item.heldOut) === filter.heldOut));
  }
  const query: Record<string, unknown> = {};
  if (filter?.type !== undefined) query.type = filter.type;
  if (filter?.heldOut !== undefined) query.heldOut = filter.heldOut;
  const rows = await (await getDatabase()).collection<MongoShape>("regression_cases").find(query).toArray();
  return rows.map((row) => deserialize.regression(row as never));
}
