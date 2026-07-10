require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { initDb, run, get, all } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'primepeptide_dev_secret_change_me';

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
app.use(cors());
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true, limit: '8mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' }
});

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Token ausente.' });
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
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
    grupo: row.product_group || 'peptideos',
    modalidades: String(row.modalities || '').split(',').map(v => v.trim()).filter(Boolean),
    preco: Number(row.price || 0),
    tipo: row.type || 'normal',
    porcentagemPromocao: Number(row.discount_percent || 0),
    ativo: Number(row.active) === 1
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

app.get('/api/settings', async (_req, res) => res.json(await getSettingsObject()));

app.put('/api/settings', auth, async (req, res) => {
  const allowed = ['STORE_NAME', 'WHATSAPP_NUMBER', 'LOGO_URL', 'PIX_KEY', 'PIX_HOLDER', 'PIX_BANK', 'PIX_INSTRUCTIONS'];
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(req.body, key)) {
      await run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, String(req.body[key] || '')]);
    }
  }
  res.json(await getSettingsObject());
});

app.get('/api/products', async (req, res) => {
  const params = [];
  const where = ['active = 1'];
  if (req.query.group && req.query.group !== 'todos') {
    where.push(`product_group = ?`);
    params.push(req.query.group);
  }
  const rows = await all(`SELECT * FROM products WHERE ${where.join(' AND ')} ORDER BY id DESC`, params);
  res.json(rows.map(normalizeProduct));
});

app.post('/api/admin/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  const user = await get('SELECT * FROM admin_users WHERE username = ?', [username]);
  if (!user || !(await bcrypt.compare(password || '', user.password_hash))) {
    return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
  }
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, username: user.username });
});

app.get('/api/admin/dashboard', auth, async (_req, res) => {
  const [products, activeProducts, orders, paid, revenue, recent] = await Promise.all([
    get('SELECT COUNT(*) AS total FROM products'),
    get('SELECT COUNT(*) AS total FROM products WHERE active = 1'),
    get('SELECT COUNT(*) AS total FROM orders'),
    get("SELECT COUNT(*) AS total FROM orders WHERE payment_status = 'Pagamento confirmado'"),
    get("SELECT COALESCE(SUM(total),0) AS total FROM orders WHERE payment_status = 'Pagamento confirmado'"),
    all('SELECT id, code, customer_name, total, status, payment_status, created_at FROM orders ORDER BY id DESC LIMIT 5')
  ]);
  res.json({
    produtos: Number(products.total),
    produtosAtivos: Number(activeProducts.total),
    pedidos: Number(orders.total),
    pedidosPagos: Number(paid.total),
    faturamentoConfirmado: Number(revenue.total),
    recentes: recent
  });
});

app.get('/api/admin/products', auth, async (_req, res) => {
  const rows = await all('SELECT * FROM products ORDER BY id DESC');
  res.json(rows.map(normalizeProduct));
});

app.post('/api/admin/products', auth, async (req, res) => {
  const p = req.body;
  const modalities = Array.isArray(p.modalidades) ? p.modalidades.join(', ') : String(p.modalidades || '');
  const result = await run(
    `INSERT INTO products (name, image, description, objectives, category, product_group, modalities, price, type, discount_percent, active, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [p.nome, p.imagem || '', p.descricao || '', p.objetivos || '', p.categoria || '', p.grupo || 'peptideos', modalities, Number(p.preco || 0), p.tipo || 'normal', Math.max(0, Math.min(100, Number(p.porcentagemPromocao || 0))), p.ativo === false ? 0 : 1]
  );
  res.status(201).json(normalizeProduct(await get('SELECT * FROM products WHERE id = ?', [result.lastID])));
});

app.put('/api/admin/products/:id', auth, async (req, res) => {
  const p = req.body;
  const modalities = Array.isArray(p.modalidades) ? p.modalidades.join(', ') : String(p.modalidades || '');
  await run(
    `UPDATE products SET name=?, image=?, description=?, objectives=?, category=?, product_group=?, modalities=?, price=?, type=?, discount_percent=?, active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [p.nome, p.imagem || '', p.descricao || '', p.objetivos || '', p.categoria || '', p.grupo || 'peptideos', modalities, Number(p.preco || 0), p.tipo || 'normal', Math.max(0, Math.min(100, Number(p.porcentagemPromocao || 0))), p.ativo === false ? 0 : 1, req.params.id]
  );
  const row = await get('SELECT * FROM products WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Produto não encontrado.' });
  res.json(normalizeProduct(row));
});

app.delete('/api/admin/products/:id', auth, async (req, res) => {
  await run('DELETE FROM products WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

app.get('/api/admin/products-export', auth, async (_req, res) => {
  const rows = await all('SELECT * FROM products ORDER BY id ASC');
  res.json(rows.map(normalizeProduct));
});

app.post('/api/orders', async (req, res) => {
  const { customerName, customerPhone, items } = req.body;
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Carrinho vazio.' });

  const code = generateOrderCode();
  let total = 0;
  const safeItems = [];
  for (const item of items) {
    const product = await get('SELECT * FROM products WHERE id = ? AND active = 1', [item.id]);
    if (!product) continue;
    const quantity = Math.max(1, parseInt(item.quantidade || item.quantity || 1, 10));
    const discount = product.type === 'promocao' ? Math.max(0, Math.min(100, Number(product.discount_percent || 0))) : 0;
    const unit = Number(product.price || 0) * (1 - discount / 100);
    const subtotal = unit * quantity;
    total += subtotal;
    safeItems.push({ product, quantity, unit, subtotal });
  }
  if (!safeItems.length) return res.status(400).json({ error: 'Nenhum produto válido no carrinho.' });

  const result = await run(
    `INSERT INTO orders (code, customer_name, customer_phone, payment_method, payment_status, total, status)
     VALUES (?, ?, ?, 'Pix', 'Aguardando pagamento', ?, 'Pedido recebido')`,
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
  let message = `Olá! Gostaria de confirmar o pedido abaixo:\n\nCódigo: ${code}\n`;
  if (customerName) message += `Nome: ${customerName}\n`;
  if (customerPhone) message += `Telefone: ${customerPhone}\n`;
  message += '\n';
  for (const item of safeItems) message += `• ${item.product.name}\nQuantidade: ${item.quantity}\nSubtotal: ${formatBRL(item.subtotal)}\n\n`;
  message += `Total: ${formatBRL(total)}\nPagamento: Pix\nStatus do pagamento: Aguardando pagamento\n`;
  if (settings.PIX_KEY) message += `\nChave Pix: ${settings.PIX_KEY}\nFavorecido: ${settings.PIX_HOLDER || '-'}\nBanco: ${settings.PIX_BANK || '-'}\n`;
  message += `\n${settings.PIX_INSTRUCTIONS || 'Após o pagamento, envie o comprovante pelo WhatsApp.'}`;

  const number = String(settings.WHATSAPP_NUMBER || '').replace(/\D/g, '');
  res.status(201).json({
    code,
    total,
    status: 'Pedido recebido',
    paymentStatus: 'Aguardando pagamento',
    pix: { key: settings.PIX_KEY || '', holder: settings.PIX_HOLDER || '', bank: settings.PIX_BANK || '' },
    whatsappUrl: `https://wa.me/${number}?text=${encodeURIComponent(message)}`
  });
});

app.get('/api/orders/:code', async (req, res) => {
  const order = await get('SELECT * FROM orders WHERE UPPER(code) = UPPER(?)', [req.params.code]);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });
  const items = await all('SELECT product_name, quantity, unit_price, subtotal FROM order_items WHERE order_id = ?', [order.id]);
  res.json({
    codigo: order.code,
    nome: order.customer_name,
    telefone: order.customer_phone,
    pagamento: order.payment_method,
    statusPagamento: order.payment_status || 'Aguardando pagamento',
    total: Number(order.total || 0),
    status: order.status,
    observacoes: order.notes || '',
    criadoEm: order.created_at,
    itens: items
  });
});

app.get('/api/admin/orders', auth, async (_req, res) => {
  const orders = await all('SELECT * FROM orders ORDER BY id DESC');
  for (const order of orders) {
    order.items = await all('SELECT product_name, quantity, unit_price, subtotal FROM order_items WHERE order_id = ?', [order.id]);
  }
  res.json(orders);
});

app.put('/api/admin/orders/:id/status', auth, async (req, res) => {
  const { status, paymentStatus, notes } = req.body;
  await run(
    'UPDATE orders SET status=?, payment_status=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
    [status || 'Pedido recebido', paymentStatus || 'Aguardando pagamento', notes || '', req.params.id]
  );
  res.json({ ok: true });
});

app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/admin/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

function formatBRL(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

initDb().then(() => {
  app.listen(PORT, () => console.log(`PrimePeptide online em http://localhost:${PORT}`));
}).catch((err) => {
  console.error('Erro ao iniciar banco:', err);
  process.exit(1);
});
