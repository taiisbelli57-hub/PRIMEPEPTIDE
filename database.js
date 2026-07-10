require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL não configurada. Crie o arquivo .env localmente ou configure no Render.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

function convertPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function run(sql, params = []) {
  const pgSql = convertPlaceholders(sql);

  const isInsert = /^\s*INSERT\s+/i.test(pgSql);
  const hasReturning = /\sRETURNING\s+/i.test(pgSql);

  const insertNeedsId =
    /^\s*INSERT\s+INTO\s+products/i.test(pgSql) ||
    /^\s*INSERT\s+INTO\s+orders/i.test(pgSql) ||
    /^\s*INSERT\s+INTO\s+order_items/i.test(pgSql) ||
    /^\s*INSERT\s+INTO\s+admin_users/i.test(pgSql);

  const finalSql = isInsert && insertNeedsId && !hasReturning
    ? `${pgSql} RETURNING id`
    : pgSql;

  const result = await pool.query(finalSql, params);

  return {
    lastID: result.rows && result.rows[0] ? result.rows[0].id : undefined,
    changes: result.rowCount
  };
}

async function get(sql, params = []) {
  const pgSql = convertPlaceholders(sql);
  const result = await pool.query(pgSql, params);
  return result.rows[0];
}

async function all(sql, params = []) {
  const pgSql = convertPlaceholders(sql);
  const result = await pool.query(pgSql, params);
  return result.rows;
}

async function initDb() {
  await run(`CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    image TEXT,
    description TEXT,
    objectives TEXT,
    category TEXT,
    price NUMERIC(10,2) DEFAULT 0,
    type TEXT DEFAULT 'normal',
    active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    customer_name TEXT,
    customer_phone TEXT,
    payment_method TEXT DEFAULT 'pix',
    total NUMERIC(10,2) DEFAULT 0,
    status TEXT DEFAULT 'Pedido recebido',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price NUMERIC(10,2) NOT NULL,
    subtotal NUMERIC(10,2) NOT NULL
  )`);

  await run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);

  await run(`CREATE TABLE IF NOT EXISTS admin_users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL
  )`);

  await seedSettings();
  await seedAdmin();
  await seedProducts();
}

async function seedSettings() {
  const defaults = {
    STORE_NAME: process.env.STORE_NAME || 'PrimePeptide',
    WHATSAPP_NUMBER: process.env.WHATSAPP_NUMBER || '5519999999999',
    LOGO_URL: process.env.LOGO_URL || ''
  };

  for (const [key, value] of Object.entries(defaults)) {
    const exists = await get('SELECT key FROM settings WHERE key = ?', [key]);

    if (!exists) {
      await run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, value]);
    }
  }
}

async function seedAdmin() {
  const username = process.env.ADMIN_USER || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'prime2026';

  const exists = await get('SELECT id FROM admin_users WHERE username = ?', [username]);

  if (!exists) {
    const hash = await bcrypt.hash(password, 10);
    await run('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)', [username, hash]);
  }
}

async function seedProducts() {
  const count = await get('SELECT COUNT(*) AS total FROM products');

  if (Number(count.total) > 0) return;

  const produtosPath = path.join(__dirname, 'public', 'produtos.json');

  if (!fs.existsSync(produtosPath)) return;

  const produtos = JSON.parse(fs.readFileSync(produtosPath, 'utf8'));

  for (const p of produtos) {
    await run(
      `INSERT INTO products (name, image, description, objectives, category, price, type, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        p.nome || p.name,
        p.imagem || p.image || '',
        p.descricao || p.description || '',
        p.objetivos || p.objectives || '',
        p.categoria || p.category || '',
        Number(p.preco || p.price || 0),
        p.tipo || p.type || 'normal'
      ]
    );
  }
}

module.exports = {
  pool,
  run,
  get,
  all,
  initDb
};