import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// __dirname doesn't exist in ES modules by default — this reconstructs it
const __dirname = path.dirname(fileURLToPath(import.meta.url));
console.log(`__dirname ${__dirname}`);

// Always resolves to <project-root>/data/app.db, no matter where `node` was run from
const dbPath = path.join(__dirname, '..', '..', 'data', 'app.db');

console.log(`dbPath ${dbPath}`);

export const db = new Database(dbPath);

console.log('Connected to SQLite database.');

db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    price REAL NOT NULL
  )
`);