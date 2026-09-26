import { Db, MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DB || "antibody";

declare global {
  var __antibodyMongoClient: Promise<MongoClient> | undefined;
}

export function isMongoConfigured(): boolean {
  return Boolean(uri);
}

export async function getMongoClient(): Promise<MongoClient> {
  if (!uri) {
    throw new Error("MONGODB_URI is not configured. Add it to .env.local to use Atlas.");
  }

  if (!global.__antibodyMongoClient) {
    const client = new MongoClient(uri, { appName: "antibody-control-plane" });
    global.__antibodyMongoClient = client.connect();
  }

  return global.__antibodyMongoClient;
}

export async function getDatabase(): Promise<Db> {
  return (await getMongoClient()).db(databaseName);
}

export async function pingMongo(): Promise<{ ok: boolean; database: string }> {
  const db = await getDatabase();
  await db.command({ ping: 1 });
  return { ok: true, database: databaseName };
}
