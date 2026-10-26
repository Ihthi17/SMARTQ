import "dotenv/config";
import fs from "node:fs";
import mongoose from "mongoose";

const backupPath =
  "E:\\ESOFT Project\\smartqueue-20261014T175217272Z (1).json";

function decode(value) {
  if (Array.isArray(value)) {
    return value.map(decode);
  }

  if (value && typeof value === "object") {
    if (value.$$smartqueueType === "ObjectId") {
      return new mongoose.Types.ObjectId(value.value);
    }

    if (value.$$smartqueueType === "Date") {
      return new Date(value.value);
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, val]) => [key, decode(val)])
    );
  }

  return value;
}

async function main() {
  const backup = JSON.parse(fs.readFileSync(backupPath, "utf8"));

  if (
    backup.format !== "smartqueue-database-backup" ||
    backup.databaseName !== "smart_queue" ||
    !backup.collections
  ) {
    throw new Error("Invalid SmartQ backup format.");
  }

  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing from backend .env");
  }

  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: "smart_queue_restore_20261015",
  });

  const db = mongoose.connection.db;
  const existing = new Set(
    (await db.listCollections().toArray()).map((c) => c.name)
  );

  if (existing.size > 0) {
    throw new Error(
      "Restore test database already contains collections. " +
      "Nothing was imported. Choose a new test database name."
    );
  }

  console.log("Connected to isolated restore database.");

  for (const [name, records] of Object.entries(backup.collections)) {
    if (!Array.isArray(records)) {
      throw new Error(`Invalid collection data: ${name}`);
    }

    if (!records.length) {
      console.log(`${name}: 0 records`);
      continue;
    }

    const documents = records.map(decode);
    await db.collection(name).insertMany(documents, { ordered: true });

    console.log(`${name}: restored ${documents.length} records`);
  }

  console.log("\nRestore completed.");
  console.log("Database: smart_queue_restore_20261015");
}

main()
  .catch((error) => {
    console.error("Restore failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
