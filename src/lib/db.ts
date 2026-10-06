import postgres from "postgres";

export type DbClient = postgres.Sql;

// TransactionSql typing loses the tagged-template signature through utility typing.
// Keep this scoped here instead of spreading suppressions through queue code.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TxSql = any;

let db: DbClient | undefined;

export function getDb(): DbClient {
  if (db) return db;

  const url = process.env.DATABASE_URL?.trim();

  if (!url) {
    throw new Error("DATABASE_URL is not configured");
  }

  const ssl =
    process.env.DB_SSL_REQUIRE?.trim().toLowerCase() === "true"
      ? "require"
      : false;

  db = postgres(url, {
    ssl,
    max: process.env.NODE_ENV === "production" ? 1 : 5,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  return db;
}
