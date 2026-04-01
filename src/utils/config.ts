import { homedir } from "node:os"
import { mkdirSync } from "node:fs"
import { join } from "node:path"

const DATA_DIR = join(homedir(), ".collmarked")
const DB_PATH = join(DATA_DIR, "db.sqlite")
const MIGRATIONS_DIR = new URL("../../dist/db/migrations", import.meta.url).pathname

export function getDbPath(): string {
  mkdirSync(DATA_DIR, { recursive: true })
  return DB_PATH
}

export function getMigrationsDir(): string {
  return MIGRATIONS_DIR
}
