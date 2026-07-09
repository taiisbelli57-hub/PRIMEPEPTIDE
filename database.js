const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.DB_PATH || path.join(dataDir, 'primepeptide.sqlite');
const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function initDb() {
  await run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    image TEXT,
    description TEXT,
    objectives TEXT,
    category TEXT,
    price REAL DEFAULT 0,
    type TEXT DEFAULT 'normal',
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    customer_name TEXT,
    customer_phone TEXT,
    payment_method TEXT DEFAULT 'pix',
    total REAL DEFAULT 0,
    status TEXT DEFAULT 'Pedido recebido',
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    subtotal REAL NOT NULL,
    FOREIGN KEY(order_id) REFERENCES orders(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);

  await run(`CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    if (!exists) await run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, value]);
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
  if (count.total > 0) return;

  const produtosPath = path.join(__dirname, 'public', 'produtos.json');
  if (!fs.existsSync(produtosPath)) return;

  const produtos = JSON.parse(fs.readFileSync(produtosPath, 'utf8'));
  for (const p of produtos) {
    await run(
      `INSERT INTO products (name, image, description, objectives, category, price, type, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [p.nome || p.name, p.imagem || p.image || '', p.descricao || p.description || '', p.objetivos || p.objectives || '', p.categoria || p.category || '', Number(p.preco || p.price || 0), p.tipo || p.type || 'normal']
    );
  }
}

module.exports = { db, run, get, all, initDb };
