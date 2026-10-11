import { DatabaseSync } from 'node:sqlite';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { memoryContext } from '../server/memory.mjs';
const directory = resolve(process.env.PM_DATA_DIR || join(dirname(fileURLToPath(import.meta.url)), '../.local-data'));
const db = new DatabaseSync(join(directory, 'workbench.sqlite'), {readOnly:true});
const store = { directory,
 setting: key => JSON.parse(db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value || 'null'),
 get: (collection,id) => JSON.parse(db.prepare('SELECT body FROM objects WHERE collection=? AND id=?').get(collection,id)?.body || 'null') };
try { console.log(JSON.stringify(memoryContext(store, JSON.parse(process.argv[2] || '{}')), null, 2)); }
finally { db.close(); }
