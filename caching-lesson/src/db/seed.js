import { db } from './connection.js';

const insert = db.prepare(
  'INSERT OR IGNORE INTO products (id, name, price) VALUES (?, ?, ?)'
);

insert.run('p1', 'Widget A', 19.99);
insert.run('p2', 'Widget B', 29.99);
insert.run('p3', 'Gadget C', 49.99);

console.log('Seeded products table.');