import { db } from '../db/connection.js';

const rows = db.prepare('SELECT * FROM products').all();
console.table(rows);