import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";

export const collections = [
  "applications",
  "stages",
  "artifacts",
  "reviews",
  "assets",
  "actions",
  "tasks",
  "conversations",
  "imports",
];
export const id = () => randomUUID();
export const now = () => new Date().toISOString();
export class Store {
  constructor(directory) {
    this.directory = resolve(directory);
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    chmodSync(this.directory, 0o700);
    this.db = new DatabaseSync(join(this.directory, "workbench.sqlite"));
    this.db.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS objects (collection TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(collection,id)); CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);",
    );
    this.db
      .prepare("INSERT OR IGNORE INTO settings VALUES (?,?)")
      .run("revision", "0");
    chmodSync(join(this.directory, "workbench.sqlite"), 0o600);
  }
  list(collection) {
    return this.db
      .prepare("SELECT body FROM objects WHERE collection=? ORDER BY rowid")
      .all(collection)
      .map((r) => JSON.parse(r.body));
  }
  get(collection, objectId) {
    const r = this.db
      .prepare("SELECT body FROM objects WHERE collection=? AND id=?")
      .get(collection, objectId);
    return r ? JSON.parse(r.body) : null;
  }
  put(collection, object) {
    if (!collections.includes(collection) || !object.id)
      throw new Error("无效对象");
    this.db
      .prepare(
        "INSERT INTO objects VALUES (?,?,?) ON CONFLICT(collection,id) DO UPDATE SET body=excluded.body",
      )
      .run(collection, object.id, JSON.stringify(object));
    return object;
  }
  setting(key, value) {
    if (value !== undefined)
      this.db
        .prepare(
          "INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        )
        .run(key, JSON.stringify(value));
    return JSON.parse(
      this.db.prepare("SELECT value FROM settings WHERE key=?").get(key)
        ?.value ?? "null",
    );
  }
  transaction(fn, revision) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.setting("revision");
      if (revision !== undefined && revision !== current) {
        const e = new Error("内容刚刚发生变化，请刷新后再保存");
        e.status = 409;
        throw e;
      }
      const result = fn(this);
      this.setting("revision", current + 1);
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  snapshot() {
    return {
      revision: this.setting("revision"),
      ...Object.fromEntries(collections.map((c) => [c, this.list(c)])),
    };
  }
  close() {
    this.db.close();
  }
}
