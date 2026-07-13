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
  const insertNeedsId = /^\s*INSERT\s+INTO\s+(products|orders|order_items|admin_users|audit_logs)/i.test(pgSql);
  const finalSql = isInsert && insertNeedsId && !hasReturning ? `${pgSql} RETURNING id` : pgSql;
  const result = await pool.query(finalSql, params);
  return { lastID: result.rows?.[0]?.id, changes: result.rowCount };
}

async function get(sql, params = []) {
  const result = await pool.query(convertPlaceholders(sql), params);
  return result.rows[0];
}

async function all(sql, params = []) {
  const result = await pool.query(convertPlaceholders(sql), params);
  return result.rows;
}

async function initDb() {
  await run(`CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    image TEXT,
    description TEXT,
    objectives TEXT,
    storage TEXT,
    category TEXT,
    product_group TEXT DEFAULT 'peptideos',
    modalities TEXT DEFAULT '',
    price NUMERIC(10,2) DEFAULT 0,
    type TEXT DEFAULT 'normal',
    discount_percent NUMERIC(5,2) DEFAULT 0,
    stock INTEGER DEFAULT 0,
    featured INTEGER DEFAULT 0,
    bestseller INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(`ALTER TABLE products ADD COLUMN IF NOT EXISTS product_group TEXT DEFAULT 'peptideos'`);
  await run(`ALTER TABLE products ADD COLUMN IF NOT EXISTS modalities TEXT DEFAULT ''`);
  await run(`ALTER TABLE products ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2) DEFAULT 0`);
  await run(`ALTER TABLE products ADD COLUMN IF NOT EXISTS storage TEXT DEFAULT ''`);
  await run(`ALTER TABLE products ADD COLUMN IF NOT EXISTS stock INTEGER DEFAULT 0`);
  await run(`ALTER TABLE products ADD COLUMN IF NOT EXISTS featured INTEGER DEFAULT 0`);
  await run(`ALTER TABLE products ADD COLUMN IF NOT EXISTS bestseller INTEGER DEFAULT 0`);
  await run(`ALTER TABLE products ADD COLUMN IF NOT EXISTS sku TEXT DEFAULT ''`);
  await run(`ALTER TABLE products ADD COLUMN IF NOT EXISTS minimum_stock INTEGER DEFAULT 0`);
  await run(`ALTER TABLE products ADD COLUMN IF NOT EXISTS track_stock INTEGER DEFAULT 0`);
  await run(`ALTER TABLE products ADD COLUMN IF NOT EXISTS launch INTEGER DEFAULT 0`);
  await run(`ALTER TABLE products ADD COLUMN IF NOT EXISTS weight_grams INTEGER DEFAULT 0`);
  await run(`ALTER TABLE products ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0`);

  await run(`CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    customer_name TEXT,
    customer_phone TEXT,
    customer_city TEXT,
    customer_notes TEXT,
    payment_method TEXT DEFAULT 'Pix',
    payment_status TEXT DEFAULT 'Aguardando pagamento',
    total NUMERIC(10,2) DEFAULT 0,
    status TEXT DEFAULT 'Pedido recebido',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'Aguardando pagamento'`);
  await run(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_city TEXT DEFAULT ''`);
  await run(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_notes TEXT DEFAULT ''`);

  await run(`CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price NUMERIC(10,2) NOT NULL,
    subtotal NUMERIC(10,2) NOT NULL
  )`);
  await run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
  await run(`CREATE TABLE IF NOT EXISTS admin_users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'admin',
    active INTEGER DEFAULT 1,
    must_change_password INTEGER DEFAULT 0,
    token_version INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP
  )`);
  await run(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'admin'`);
  await run(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS active INTEGER DEFAULT 1`);
  await run(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS must_change_password INTEGER DEFAULT 0`);
  await run(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS token_version INTEGER DEFAULT 0`);
  await run(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
  await run(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
  await run(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP`);

  await run(`CREATE TABLE IF NOT EXISTS order_status_history (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status TEXT,
    payment_status TEXT,
    notes TEXT,
    changed_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    changed_by_username TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS site_visits (
    id SERIAL PRIMARY KEY,
    visitor_id TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    page_path TEXT,
    referrer TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    visited_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(`ALTER TABLE site_visits ADD COLUMN IF NOT EXISTS visited_at TIMESTAMPTZ`);
  await run(`UPDATE site_visits SET visited_at = created_at AT TIME ZONE 'UTC' WHERE visited_at IS NULL`);
  await run(`ALTER TABLE site_visits ALTER COLUMN visited_at SET DEFAULT CURRENT_TIMESTAMP`);

  await run(`CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    username TEXT,
    role TEXT,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    description TEXT,
    old_data TEXT,
    new_data TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await run('CREATE INDEX IF NOT EXISTS idx_products_active_group ON products(active, product_group)');
  await run('CREATE INDEX IF NOT EXISTS idx_orders_code ON orders(code)');
  await run('CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC)');
  await run('CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id)');
  await run('CREATE INDEX IF NOT EXISTS idx_order_history_order_id ON order_status_history(order_id, created_at DESC)');
  await run('CREATE INDEX IF NOT EXISTS idx_visits_created_at ON site_visits(created_at DESC)');
  await run('CREATE INDEX IF NOT EXISTS idx_visits_visited_at ON site_visits(visited_at DESC)');
  await run('CREATE INDEX IF NOT EXISTS idx_visits_visitor ON site_visits(visitor_id)');
  await run('CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at DESC)');
  await run('CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id)');

  await seedSettings();
  await seedAdmin();
  await seedProducts();
}

async function seedSettings() {
  const defaults = {
    STORE_NAME: process.env.STORE_NAME || 'PrimePeptide',
    WHATSAPP_NUMBER: process.env.WHATSAPP_NUMBER || '5519999999999',
    INSTAGRAM_URL: process.env.INSTAGRAM_URL || '',
    LOGO_URL: process.env.LOGO_URL || '',
    PIX_KEY: process.env.PIX_KEY || '',
    PIX_HOLDER: process.env.PIX_HOLDER || '',
    PIX_BANK: process.env.PIX_BANK || '',
    PIX_INSTRUCTIONS: process.env.PIX_INSTRUCTIONS || 'Após o pagamento, envie o comprovante pelo WhatsApp.',
    SHIPPING_LOCAL: process.env.SHIPPING_LOCAL || 'Piracicaba sem frete.',
    SHIPPING_OTHER: process.env.SHIPPING_OTHER || 'Demais cidades: consulte o frete pelo WhatsApp.',
    HERO_TITLE: process.env.HERO_TITLE || 'Encontre o produto ideal para o seu objetivo.',
    HERO_SUBTITLE: process.env.HERO_SUBTITLE || 'Escolha por categoria, finalize por Pix e acompanhe seu pedido pelo código.',
    PRIMARY_COLOR: process.env.PRIMARY_COLOR || '#111827',
    SECONDARY_COLOR: process.env.SECONDARY_COLOR || '#f4f1ea',
    FOOTER_TEXT: process.env.FOOTER_TEXT || 'PrimePeptide — atendimento e qualidade em cada pedido.',
    META_DESCRIPTION: process.env.META_DESCRIPTION || 'PrimePeptide: catálogo premium com compra rápida, pagamento por Pix e acompanhamento do pedido.',
    META_KEYWORDS: process.env.META_KEYWORDS || 'PrimePeptide, peptídeos, acessórios, catálogo',
    BANNER_URL: process.env.BANNER_URL || '',
    IGNORED_VISITOR_IPS: process.env.IGNORED_VISITOR_IPS || ''
  };
  for (const [key, value] of Object.entries(defaults)) {
    const exists = await get('SELECT key FROM settings WHERE key = ?', [key]);
    if (!exists) await run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, value]);
  }
}

async function seedAdmin() {
  const adminPassword = process.env.ADMIN_PASSWORD || process.env.OWNER_PASSWORD || 'admin123';
  const existing = await all('SELECT * FROM admin_users ORDER BY id ASC');
  let admin = existing.find(u => String(u.username).toLowerCase() === 'administrador') || existing[0] || null;
  if (!admin) {
    const hash = await bcrypt.hash(adminPassword, 12);
    const result = await run("INSERT INTO admin_users (username,password_hash,role,active,must_change_password) VALUES ('Administrador',?,'admin',1,0)", [hash]);
    admin = await get('SELECT * FROM admin_users WHERE id=?', [result.lastID]);
  }
  await run('DELETE FROM admin_users WHERE id <> ?', [admin.id]);
  await run("UPDATE admin_users SET username='Administrador',role='admin',active=1,must_change_password=0,updated_at=CURRENT_TIMESTAMP WHERE id=?", [admin.id]);
}

async function seedProducts() {
  const count = await get('SELECT COUNT(*) AS total FROM products');
  if (Number(count.total) > 0) return;
  const produtosPath = path.join(__dirname, 'public', 'produtos.json');
  if (!fs.existsSync(produtosPath)) return;
  const produtos = JSON.parse(fs.readFileSync(produtosPath, 'utf8'));
  for (const p of produtos) {
    await run(`INSERT INTO products (name,image,description,objectives,storage,category,product_group,modalities,price,type,discount_percent,stock,featured,bestseller,active)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`, [
      p.nome || p.name, p.imagem || p.image || '', p.descricao || p.description || '', p.objetivos || p.objectives || '',
      p.armazenamento || p.storage || '', p.categoria || p.category || '', p.grupo || p.product_group || 'peptideos',
      Array.isArray(p.modalidades) ? p.modalidades.join(', ') : (p.modalidades || p.modalities || ''), Number(p.preco || p.price || 0),
      p.tipo || p.type || 'normal', Number(p.porcentagemPromocao || p.discount_percent || 0), Number(p.estoque || p.stock || 0),
      p.destaque ? 1 : 0, p.maisVendido ? 1 : 0
    ]);
  }
}

module.exports = { pool, run, get, all, initDb };
