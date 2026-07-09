require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { initDb, run, get, all } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'primepeptide_dev_secret';

app.use(cors());
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true, limit: '8mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Token ausente.' });
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Sessão inválida.' });
  }
}

function normalizeProduct(row) {
  return {
    id: String(row.id),
    nome: row.name,
    imagem: row.image || '',
    descricao: row.description || '',
    objetivos: row.objectives || '',
    categoria: row.category || '',
    preco: Number(row.price || 0),
    tipo: row.type || 'normal',
    ativo: row.active === 1
  };
}

function generateOrderCode() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `PP-${y}${m}${day}-${rand}`;
}

async function getSettingsObject() {
  const rows = await all('SELECT key, value FROM settings');
  return rows.reduce((acc, r) => ({ ...acc, [r.key]: r.value || '' }), {});
}

// Site settings
app.get('/api/settings', async (req, res) => {
  res.json(await getSettingsObject());
});

app.put('/api/settings', auth, async (req, res) => {
  const allowed = ['STORE_NAME', 'WHATSAPP_NUMBER', 'LOGO_URL'];
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(req.body, key)) {
      await run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, String(req.body[key] || '')]);
    }
  }
  res.json(await getSettingsObject());
});

// Public products
app.get('/api/products', async (req, res) => {
  const rows = await all('SELECT * FROM products WHERE active = 1 ORDER BY id DESC');
  res.json(rows.map(normalizeProduct));
});

// Admin login
app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await get('SELECT * FROM admin_users WHERE username = ?', [username]);
  if (!user) return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
  const ok = await bcrypt.compare(password || '', user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, username: user.username });
});

// Admin products
app.get('/api/admin/products', auth, async (req, res) => {
  const rows = await all('SELECT * FROM products ORDER BY id DESC');
  res.json(rows.map(normalizeProduct));
});

app.post('/api/admin/products', auth, async (req, res) => {
  const p = req.body;
  const result = await run(
    `INSERT INTO products (name, image, description, objectives, category, price, type, active, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [p.nome, p.imagem || '', p.descricao || '', p.objetivos || '', p.categoria || '', Number(p.preco || 0), p.tipo || 'normal', p.ativo === false ? 0 : 1]
  );
  const row = await get('SELECT * FROM products WHERE id = ?', [result.lastID]);
  res.status(201).json(normalizeProduct(row));
});

app.put('/api/admin/products/:id', auth, async (req, res) => {
  const p = req.body;
  await run(
    `UPDATE products SET name=?, image=?, description=?, objectives=?, category=?, price=?, type=?, active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [p.nome, p.imagem || '', p.descricao || '', p.objetivos || '', p.categoria || '', Number(p.preco || 0), p.tipo || 'normal', p.ativo === false ? 0 : 1, req.params.id]
  );
  const row = await get('SELECT * FROM products WHERE id = ?', [req.params.id]);
  res.json(normalizeProduct(row));
});

app.delete('/api/admin/products/:id', auth, async (req, res) => {
  await run('DELETE FROM products WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

app.get('/api/admin/products-export', auth, async (req, res) => {
  const rows = await all('SELECT * FROM products ORDER BY id ASC');
  res.json(rows.map(normalizeProduct));
});

// Orders
app.post('/api/orders', async (req, res) => {
  const { customerName, customerPhone, items } = req.body;
  if (!items || !Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Carrinho vazio.' });

  const code = generateOrderCode();
  let total = 0;
  const safeItems = [];

  for (const item of items) {
    const product = await get('SELECT * FROM products WHERE id = ? AND active = 1', [item.id]);
    if (!product) continue;
    const quantity = Math.max(1, parseInt(item.quantidade || item.quantity || 1, 10));
    const unit = Number(product.price || 0);
    const subtotal = unit * quantity;
    total += subtotal;
    safeItems.push({ product, quantity, unit, subtotal });
  }

  if (safeItems.length === 0) return res.status(400).json({ error: 'Nenhum produto válido no carrinho.' });

  const result = await run(
    `INSERT INTO orders (code, customer_name, customer_phone, payment_method, total, status)
     VALUES (?, ?, ?, 'Pix', ?, 'Pedido recebido')`,
    [code, customerName || '', customerPhone || '', total]
  );

  for (const item of safeItems) {
    await run(
      `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, subtotal)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [result.lastID, item.product.id, item.product.name, item.quantity, item.unit, item.subtotal]
    );
  }

  const settings = await getSettingsObject();
  let message = `Olá! Gostaria de fazer o seguinte pedido:\n\nCódigo do pedido: ${code}\n\n`;
  if (customerName) message += `Nome: ${customerName}\n`;
  if (customerPhone) message += `Telefone: ${customerPhone}\n`;
  message += `\n`;
  for (const item of safeItems) {
    message += `• ${item.product.name}\nQuantidade: ${item.quantity}\nValor unitário: ${formatBRL(item.unit)}\nSubtotal: ${formatBRL(item.subtotal)}\n\n`;
  }
  message += `Total: ${formatBRL(total)}\nForma de pagamento: Pix\n\nAguardo a chave Pix para pagamento.`;

  const number = String(settings.WHATSAPP_NUMBER || '').replace(/\D/g, '');
  res.status(201).json({ code, total, status: 'Pedido recebido', whatsappUrl: `https://wa.me/${number}?text=${encodeURIComponent(message)}` });
});

app.get('/api/orders/:code', async (req, res) => {
  const order = await get('SELECT * FROM orders WHERE code = ?', [req.params.code]);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });
  const items = await all('SELECT product_name, quantity, unit_price, subtotal FROM order_items WHERE order_id = ?', [order.id]);
  res.json({
    codigo: order.code,
    nome: order.customer_name,
    telefone: order.customer_phone,
    pagamento: order.payment_method,
    total: Number(order.total || 0),
    status: order.status,
    observacoes: order.notes || '',
    criadoEm: order.created_at,
    itens: items
  });
});

app.get('/api/admin/orders', auth, async (req, res) => {
  const orders = await all('SELECT * FROM orders ORDER BY id DESC');
  for (const order of orders) {
    order.items = await all('SELECT product_name, quantity, unit_price, subtotal FROM order_items WHERE order_id = ?', [order.id]);
  }
  res.json(orders);
});

app.put('/api/admin/orders/:id/status', auth, async (req, res) => {
  const { status, notes } = req.body;
  await run('UPDATE orders SET status=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', [status, notes || '', req.params.id]);
  res.json({ ok: true });
});

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/admin/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

function formatBRL(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

initDb().then(() => {
  app.listen(PORT, () => console.log(`PrimePeptide online em http://localhost:${PORT}`));
}).catch((err) => {
  console.error('Erro ao iniciar banco:', err);
  process.exit(1);
});
