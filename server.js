require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { pool, initDb, run, get, all } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'primepeptide_dev_secret_change_me';
if (process.env.NODE_ENV === 'production' && JWT_SECRET === 'primepeptide_dev_secret_change_me') { throw new Error('Configure JWT_SECRET no ambiente de produção.'); }

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
app.use(cors());
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true, limit: '8mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Muitas tentativas. Aguarde alguns minutos.' } });
const orderLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Muitas solicitações. Tente novamente em alguns minutos.' } });

function cleanText(v, max = 1000) { return String(v || '').trim().slice(0, max); }
function jsonText(value) { try { return value == null ? '' : JSON.stringify(value); } catch { return ''; } }
function clientIp(req) { return cleanText(req.ip || req.headers['x-forwarded-for'] || '', 120); }
function userAgent(req) { return cleanText(req.headers['user-agent'] || '', 500); }
function normalizeIp(value){ return cleanText(value,120).replace(/^::ffff:/,''); }
function parseIgnoredIps(value){ return String(value||'').split(/[\s,;]+/).map(normalizeIp).filter(Boolean); }
async function optionalAdmin(req){ const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,''); if(!token)return null; try{const payload=jwt.verify(token,JWT_SECRET);const user=await get('SELECT id,username,role,active,token_version FROM admin_users WHERE id=?',[payload.id]);if(user&&Number(user.active)===1&&Number(user.token_version||0)===Number(payload.tokenVersion||0))return user;}catch{} return null; }
function strongPassword(value) { return typeof value === 'string' && value.length >= 4 && value.length <= 100; }
function passwordMessage() { return 'A senha deve ter pelo menos 4 caracteres e pode conter letras, números ou símbolos.'; }
function issueToken(user) { return jwt.sign({ id: user.id, username: user.username, role: user.role, tokenVersion: Number(user.token_version || 0) }, JWT_SECRET, { expiresIn: '4h' }); }

async function audit(req, action, entityType = '', entityId = '', description = '', oldData = null, newData = null, actor = null) {
  try {
    const u = actor || req.admin || {};
    const responsible = actor ? (u.username || 'desconhecido') : (req.operatorName || u.username || cleanText(req.body?.username, 100) || 'desconhecido');
    const auditRole = actor ? (u.role || '') : (req.operatorName ? 'responsavel' : (u.role || ''));
    await run(`INSERT INTO audit_logs (user_id,username,role,action,entity_type,entity_id,description,old_data,new_data,ip_address,user_agent)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [u.id || null, responsible, auditRole, action, entityType, cleanText(entityId, 150), cleanText(description, 1000), jsonText(oldData), jsonText(newData), clientIp(req), userAgent(req)]);
  } catch (err) { console.error('Falha ao registrar auditoria:', err.message); }
}

async function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Token ausente.' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await get('SELECT id,username,role,active,must_change_password,token_version FROM admin_users WHERE id=?', [payload.id]);
    if (!user || Number(user.active) !== 1 || Number(user.token_version || 0) !== Number(payload.tokenVersion || 0)) return res.status(401).json({ error: 'Sessão inválida ou encerrada.' });
    req.admin = user;
    req.operatorName = cleanText(req.headers['x-operator-name'] || '', 80);
    next();
  } catch { return res.status(401).json({ error: 'Sessão inválida.' }); }
}

function normalizeProduct(row) {
  return { id:String(row.id), nome:row.name, sku:row.sku||'', imagem:row.image||'', descricao:row.description||'', objetivos:row.objectives||'', armazenamento:row.storage||'', categoria:row.category||'', grupo:row.product_group||'peptideos', modalidades:String(row.modalities||'').split(',').map(v=>v.trim()).filter(Boolean), preco:Number(row.price||0), tipo:row.type||'normal', porcentagemPromocao:Number(row.discount_percent||0), estoque:Number(row.stock||0), estoqueMinimo:Number(row.minimum_stock||0), controlarEstoque:Number(row.track_stock)===1, destaque:Number(row.featured)===1, maisVendido:Number(row.bestseller)===1, lancamento:Number(row.launch)===1, pesoGramas:Number(row.weight_grams||0), ordemExibicao:Number(row.display_order||0), ativo:Number(row.active)===1 };
}
function generateOrderCode() { const d=new Date(); return `PP-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${Math.floor(1000+Math.random()*9000)}`; }
async function getSettingsObject(){const rows=await all('SELECT key,value FROM settings');return rows.reduce((a,r)=>({...a,[r.key]:r.value||''}),{});}
function formatBRL(v){return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}

app.get('/api/health', (_req,res)=>res.json({ok:true}));
app.get('/api/settings', async (_req,res)=>res.json(await getSettingsObject()));
app.put('/api/settings', auth, async (req,res)=>{
  const allowed=['IGNORED_VISITOR_IPS','STORE_NAME','WHATSAPP_NUMBER','INSTAGRAM_URL','LOGO_URL','PIX_KEY','PIX_HOLDER','PIX_BANK','PIX_INSTRUCTIONS','SHIPPING_LOCAL','SHIPPING_OTHER','HERO_TITLE','HERO_SUBTITLE','PRIMARY_COLOR','SECONDARY_COLOR','FOOTER_TEXT','META_DESCRIPTION','META_KEYWORDS','BANNER_URL'];
  const before = await getSettingsObject();
  for(const key of allowed) if(Object.prototype.hasOwnProperty.call(req.body,key)) await run('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',[key,cleanText(req.body[key],5000)]);
  const after = await getSettingsObject();
  await audit(req, 'CONFIGURACOES_ALTERADAS', 'settings', 'store', 'Configurações da loja atualizadas.', before, after);
  res.json(after);
});

const VISIT_TODAY_WHERE = `visited_at >= (date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo')
  AND visited_at < ((date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo') + INTERVAL '1 day') AT TIME ZONE 'America/Sao_Paulo')`;

async function getVisitStats() {
  const [total, today, uniqueToday, last] = await Promise.all([
    get('SELECT COUNT(*) total FROM site_visits'),
    get(`SELECT COUNT(*) total FROM site_visits WHERE ${VISIT_TODAY_WHERE}`),
    get(`SELECT COUNT(DISTINCT visitor_id) total FROM site_visits WHERE ${VISIT_TODAY_WHERE}`),
    get('SELECT visited_at FROM site_visits ORDER BY visited_at DESC NULLS LAST, id DESC LIMIT 1')
  ]);
  return {
    total: Number(total?.total || 0),
    hoje: Number(today?.total || 0),
    unicosHoje: Number(uniqueToday?.total || 0),
    ultimoAcesso: last?.visited_at || null
  };
}

app.post('/api/visits', async (req,res)=>{
  const admin=await optionalAdmin(req);
  const ip=normalizeIp(clientIp(req));
  const settings=await getSettingsObject();
  const ignored=parseIgnoredIps(settings.IGNORED_VISITOR_IPS);
  let counted=false;
  let reason='';

  if(admin || ignored.includes(ip)) {
    reason=admin?'admin':'ignored_ip';
  } else {
    const visitorId=cleanText(req.body.visitorId,120);
    if(!/^[a-zA-Z0-9._:-]{8,120}$/.test(visitorId)) return res.status(400).json({error:'Identificador de visita inválido.'});
    const recent=await get("SELECT id FROM site_visits WHERE visitor_id=? AND visited_at >= CURRENT_TIMESTAMP - INTERVAL '30 minutes' ORDER BY visited_at DESC LIMIT 1",[visitorId]);
    if(recent) {
      reason='recent';
    } else {
      await run('INSERT INTO site_visits (visitor_id,ip_address,user_agent,page_path,referrer,visited_at) VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)',[visitorId,ip,userAgent(req),cleanText(req.body.pagePath,500),cleanText(req.body.referrer,1000)]);
      counted=true;
    }
  }

  const stats=await getVisitStats();
  res.status(counted?201:200).set('Cache-Control','no-store, no-cache, must-revalidate').json({counted,reason,...stats});
});

app.get('/api/visits/public',async(_req,res)=>{
  res.set('Cache-Control','no-store, no-cache, must-revalidate');
  res.json(await getVisitStats());
});

app.get('/api/admin/visits',auth,async(_req,res)=>{
  const [stats,recent]=await Promise.all([
    getVisitStats(),
    all('SELECT ip_address,user_agent,page_path,referrer,visited_at AS created_at FROM site_visits ORDER BY visited_at DESC NULLS LAST,id DESC LIMIT 10')
  ]);
  res.set('Cache-Control','no-store, no-cache, must-revalidate');
  res.json({...stats,recentes:recent});
});

app.post('/api/admin/visits/ignore-current-ip',auth,async(req,res)=>{
  const ip=normalizeIp(clientIp(req)); const before=await getSettingsObject(); const ips=parseIgnoredIps(before.IGNORED_VISITOR_IPS);
  if(ip&&!ips.includes(ip))ips.push(ip);
  await run('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',['IGNORED_VISITOR_IPS',ips.join(',')]);
  await run('DELETE FROM site_visits WHERE ip_address=?',[ip]);
  await audit(req,'IP_CONTADOR_IGNORADO','settings','IGNORED_VISITOR_IPS',`IP ${ip} adicionado à lista ignorada e visitas anteriores desse IP removidas.`,before.IGNORED_VISITOR_IPS,ips.join(','));
  res.json({ok:true,ip,ignoredIps:ips,...await getVisitStats()});
});

app.get('/api/products', async (req,res)=>{
  const params=[];const where=['active=1'];
  if(req.query.group&&req.query.group!=='todos'){where.push('product_group=?');params.push(req.query.group);}
  const rows=await all(`SELECT * FROM products WHERE ${where.join(' AND ')} ORDER BY featured DESC,bestseller DESC,launch DESC,display_order ASC,id DESC`,params);
  res.json(rows.map(normalizeProduct));
});

app.post('/api/admin/login',loginLimiter,async(req,res)=>{
  const username='Administrador';
  const user=await get('SELECT * FROM admin_users WHERE LOWER(username)=LOWER(?)',[username]);
  if(!user || Number(user.active)!==1 || !(await bcrypt.compare(String(req.body.password||''),user.password_hash))){
    await audit(req,'LOGIN_FALHOU','auth',username,'Tentativa de login inválida.',null,null,{id:user?.id||null,username,role:user?.role||''});
    return res.status(401).json({error:'Usuário ou senha incorretos.'});
  }
  await run('UPDATE admin_users SET last_login_at=CURRENT_TIMESTAMP WHERE id=?',[user.id]);
  await audit(req,'LOGIN_SUCESSO','auth',String(user.id),'Login realizado.',null,null,user);
  res.json({token:issueToken(user),username:user.username,role:user.role,mustChangePassword:Number(user.must_change_password)===1});
});
app.post('/api/admin/logout',auth,async(req,res)=>{await audit(req,'LOGOUT','auth',String(req.admin.id),'Logout realizado.');res.json({ok:true});});
app.get('/api/admin/me',auth,async(req,res)=>res.json({id:req.admin.id,username:req.admin.username,role:req.admin.role,mustChangePassword:Number(req.admin.must_change_password)===1}));
app.post('/api/admin/operator',auth,async(req,res)=>{const name=cleanText(req.body.name,80);if(name.length<2)return res.status(400).json({error:'Digite um nome válido.'});req.operatorName=name;await audit(req,'RESPONSAVEL_IDENTIFICADO','session','admin',`Sessão iniciada por ${name}.`);res.json({ok:true,name});});
app.put('/api/admin/me/password',auth,async(req,res)=>{
  const user=await get('SELECT * FROM admin_users WHERE id=?',[req.admin.id]);
  if(!(await bcrypt.compare(String(req.body.currentPassword||''),user.password_hash))) return res.status(400).json({error:'Senha atual incorreta.'});
  const next=String(req.body.newPassword||'');
  if(!strongPassword(next)) return res.status(400).json({error:passwordMessage()});
  if(await bcrypt.compare(next,user.password_hash)) return res.status(400).json({error:'A nova senha deve ser diferente da senha atual.'});
  const hash=await bcrypt.hash(next,12);
  await run('UPDATE admin_users SET password_hash=?,must_change_password=0,token_version=token_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?',[hash,user.id]);
  const updated=await get('SELECT * FROM admin_users WHERE id=?',[user.id]);
  await audit(req,'SENHA_ALTERADA','user',String(user.id),'O usuário alterou a própria senha.');
  res.json({ok:true,token:issueToken(updated)});
});

app.get('/api/admin/audit',auth,async(req,res)=>{
  const where=[];const params=[];
  if(req.query.user){where.push('username ILIKE ?');params.push(`%${cleanText(req.query.user,80)}%`);} if(req.query.action){where.push('action=?');params.push(cleanText(req.query.action,100));}
  if(req.query.from){where.push('created_at>=?');params.push(req.query.from);} if(req.query.to){where.push("created_at<?::date + INTERVAL '1 day'");params.push(req.query.to);}
  const rows=await all(`SELECT id,username,role,action,entity_type,entity_id,description,old_data,new_data,ip_address,user_agent,created_at FROM audit_logs ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY id DESC LIMIT 500`,params);
  res.json(rows);
});

app.get('/api/admin/dashboard',auth,async(_req,res)=>{
  const [products,active,orders,paid,revenue,today,pending,cancelled,recent]=await Promise.all([
    get('SELECT COUNT(*) total FROM products'),get('SELECT COUNT(*) total FROM products WHERE active=1'),get('SELECT COUNT(*) total FROM orders'),
    get("SELECT COUNT(*) total FROM orders WHERE payment_status='Pagamento confirmado'"),get("SELECT COALESCE(SUM(total),0) total FROM orders WHERE payment_status='Pagamento confirmado'"),
    get("SELECT COUNT(*) total FROM orders WHERE created_at::date=CURRENT_DATE"),get("SELECT COUNT(*) total FROM orders WHERE payment_status='Aguardando pagamento'"),
    get("SELECT COUNT(*) total FROM orders WHERE status='Pedido cancelado'"),all('SELECT id,code,customer_name,total,status,payment_status,created_at FROM orders ORDER BY id DESC LIMIT 6')]);
  const [lowStock,visitsToday,uniqueToday,visitsTotal,lastVisit]=await Promise.all([
    get('SELECT COUNT(*) total FROM products WHERE active=1 AND track_stock=1 AND stock<=minimum_stock'),
    get(`SELECT COUNT(*) total FROM site_visits WHERE ${VISIT_TODAY_WHERE}`),
    get(`SELECT COUNT(DISTINCT visitor_id) total FROM site_visits WHERE ${VISIT_TODAY_WHERE}`),
    get('SELECT COUNT(*) total FROM site_visits'),
    get('SELECT visited_at AS created_at FROM site_visits ORDER BY visited_at DESC NULLS LAST,id DESC LIMIT 1')
  ]);
  res.json({produtos:+products.total,produtosAtivos:+active.total,pedidos:+orders.total,pedidosPagos:+paid.total,faturamentoConfirmado:+revenue.total,pedidosHoje:+today.total,pagamentosPendentes:+pending.total,cancelados:+cancelled.total,estoqueBaixo:+lowStock.total,acessosHoje:+visitsToday.total,visitantesUnicosHoje:+uniqueToday.total,totalAcessos:+visitsTotal.total,ultimoAcesso:lastVisit?.created_at||null,recentes:recent});
});

app.get('/api/admin/products',auth,async(_req,res)=>res.json((await all('SELECT * FROM products ORDER BY id DESC')).map(normalizeProduct)));
app.post('/api/admin/products',auth,async(req,res)=>saveProduct(req,res,false));
app.put('/api/admin/products/:id',auth,async(req,res)=>saveProduct(req,res,true));
async function saveProduct(req,res,isEdit){
  const p=req.body; const modalities=Array.isArray(p.modalidades)?p.modalidades.join(', '):cleanText(p.modalidades,1000);
  const vals=[cleanText(p.nome,200),cleanText(p.sku,100),cleanText(p.imagem,8000000),cleanText(p.descricao,5000),cleanText(p.objetivos,5000),cleanText(p.armazenamento,3000),cleanText(p.categoria,200),cleanText(p.grupo||'peptideos',50),modalities,Math.max(0,Number(p.preco||0)),cleanText(p.tipo||'normal',30),Math.max(0,Math.min(100,Number(p.porcentagemPromocao||0))),Math.max(0,parseInt(p.estoque||0,10)),Math.max(0,parseInt(p.estoqueMinimo||0,10)),p.controlarEstoque?1:0,p.destaque?1:0,p.maisVendido?1:0,p.lancamento?1:0,Math.max(0,parseInt(p.pesoGramas||0,10)),Math.max(0,parseInt(p.ordemExibicao||0,10)),p.ativo===false?0:1];
  if(!vals[0]) return res.status(400).json({error:'Informe o nome do produto.'});
  if(isEdit){const before=await get('SELECT * FROM products WHERE id=?',[req.params.id]);if(!before)return res.status(404).json({error:'Produto não encontrado.'});await run(`UPDATE products SET name=?,sku=?,image=?,description=?,objectives=?,storage=?,category=?,product_group=?,modalities=?,price=?,type=?,discount_percent=?,stock=?,minimum_stock=?,track_stock=?,featured=?,bestseller=?,launch=?,weight_grams=?,display_order=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,[...vals,req.params.id]);const row=await get('SELECT * FROM products WHERE id=?',[req.params.id]);await audit(req,'PRODUTO_ALTERADO','product',String(row.id),`Produto ${row.name} alterado.`,normalizeProduct(before),normalizeProduct(row));return res.json(normalizeProduct(row));}
  const result=await run(`INSERT INTO products (name,sku,image,description,objectives,storage,category,product_group,modalities,price,type,discount_percent,stock,minimum_stock,track_stock,featured,bestseller,launch,weight_grams,display_order,active,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`,vals);
  const row=await get('SELECT * FROM products WHERE id=?',[result.lastID]);await audit(req,'PRODUTO_CRIADO','product',String(row.id),`Produto ${row.name} criado.`,null,normalizeProduct(row));res.status(201).json(normalizeProduct(row));
}
app.delete('/api/admin/products/:id',auth,async(req,res)=>{const before=await get('SELECT * FROM products WHERE id=?',[req.params.id]);if(!before)return res.status(404).json({error:'Produto não encontrado.'});await run('DELETE FROM products WHERE id=?',[req.params.id]);await audit(req,'PRODUTO_EXCLUIDO','product',String(before.id),`Produto ${before.name} excluído.`,normalizeProduct(before),null);res.json({ok:true});});
app.get('/api/admin/products-export',auth,async(_req,res)=>res.json((await all('SELECT * FROM products ORDER BY id')).map(normalizeProduct)));

app.post('/api/orders',orderLimiter,async(req,res)=>{
  const {customerName,customerPhone,customerCity,customerNotes,items}=req.body;
  if(!cleanText(customerName,150)) return res.status(400).json({error:'Informe seu nome.'});
  if(!Array.isArray(items)||!items.length)return res.status(400).json({error:'Carrinho vazio.'});
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    let total=0;const safe=[];
    for(const item of items){
      const result=await client.query('SELECT * FROM products WHERE id=$1 AND active=1 FOR UPDATE',[item.id]);
      const product=result.rows[0]; if(!product)continue;
      const q=Math.max(1,Math.min(99,parseInt(item.quantidade||item.quantity||1,10)));
      if(Number(product.track_stock)===1 && Number(product.stock)<q) throw Object.assign(new Error(`Estoque insuficiente para ${product.name}. Disponível: ${product.stock}.`),{status:409});
      const discount=product.type==='promocao'?Math.max(0,Math.min(100,Number(product.discount_percent||0))):0;
      const unit=Number(product.price||0)*(1-discount/100);safe.push({product,quantity:q,unit,subtotal:unit*q});total+=unit*q;
    }
    if(!safe.length) throw Object.assign(new Error('Nenhum produto válido.'),{status:400});
    let code; do{code=generateOrderCode();}while((await client.query('SELECT id FROM orders WHERE code=$1',[code])).rows[0]);
    const result=await client.query(`INSERT INTO orders (code,customer_name,customer_phone,customer_city,customer_notes,payment_method,payment_status,total,status) VALUES ($1,$2,$3,$4,$5,'Pix','Aguardando pagamento',$6,'Pedido recebido') RETURNING id`,[code,cleanText(customerName,150),cleanText(customerPhone,40),cleanText(customerCity,150),cleanText(customerNotes,1000),total]);
    for(const i of safe){
      await client.query('INSERT INTO order_items (order_id,product_id,product_name,quantity,unit_price,subtotal) VALUES ($1,$2,$3,$4,$5,$6)',[result.rows[0].id,i.product.id,i.product.name,i.quantity,i.unit,i.subtotal]);
      if(Number(i.product.track_stock)===1) await client.query('UPDATE products SET stock=stock-$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2',[i.quantity,i.product.id]);
    }
    await client.query(`INSERT INTO order_status_history (order_id,status,payment_status,notes,changed_by_username) VALUES ($1,'Pedido recebido','Aguardando pagamento','Pedido criado pelo cliente.','cliente')`,[result.rows[0].id]);
    await client.query('COMMIT');
    const s=await getSettingsObject();let msg=`Olá! Gostaria de confirmar meu pedido.\n\nCódigo: ${code}\nNome: ${cleanText(customerName,150)}\n`;if(customerPhone)msg+=`Telefone: ${cleanText(customerPhone,40)}\n`;if(customerCity)msg+=`Cidade: ${cleanText(customerCity,150)}\n`;msg+='\n';safe.forEach(i=>msg+=`• ${i.product.name} — ${i.quantity}x — ${formatBRL(i.subtotal)}\n`);msg+=`\nTotal: ${formatBRL(total)}\nPagamento: Pix\nStatus: Aguardando pagamento\n`;if(s.PIX_KEY)msg+=`\nChave Pix: ${s.PIX_KEY}\nFavorecido: ${s.PIX_HOLDER||'-'}\nBanco: ${s.PIX_BANK||'-'}\n`;if(customerNotes)msg+=`\nObservações: ${cleanText(customerNotes,1000)}\n`;msg+=`\n${s.PIX_INSTRUCTIONS||''}`;
    const number=String(s.WHATSAPP_NUMBER||'').replace(/\D/g,'');res.status(201).json({code,total,status:'Pedido recebido',paymentStatus:'Aguardando pagamento',pix:{key:s.PIX_KEY||'',holder:s.PIX_HOLDER||'',bank:s.PIX_BANK||''},whatsappUrl:number?`https://wa.me/${number}?text=${encodeURIComponent(msg)}`:''});
  }catch(err){await client.query('ROLLBACK');res.status(err.status||500).json({error:err.status?err.message:'Não foi possível finalizar o pedido.'});}
  finally{client.release();}
});

app.get('/api/orders/:code',async(req,res)=>{const order=await get('SELECT * FROM orders WHERE UPPER(code)=UPPER(?)',[req.params.code]);if(!order)return res.status(404).json({error:'Pedido não encontrado.'});const items=await all('SELECT product_name,quantity,unit_price,subtotal FROM order_items WHERE order_id=?',[order.id]);const history=await all('SELECT status,payment_status,notes,created_at FROM order_status_history WHERE order_id=? ORDER BY created_at ASC',[order.id]);res.json({codigo:order.code,nome:order.customer_name,cidade:order.customer_city,pagamento:order.payment_method,statusPagamento:order.payment_status||'Aguardando pagamento',total:Number(order.total||0),status:order.status,observacoes:order.notes||'',criadoEm:order.created_at,atualizadoEm:order.updated_at,itens:items,historico:history});});
app.get('/api/admin/orders',auth,async(_req,res)=>{const orders=await all('SELECT * FROM orders ORDER BY id DESC');for(const o of orders){o.items=await all('SELECT product_name,quantity,unit_price,subtotal FROM order_items WHERE order_id=?',[o.id]);o.history=await all('SELECT status,payment_status,notes,changed_by_username,created_at FROM order_status_history WHERE order_id=? ORDER BY created_at ASC',[o.id]);}res.json(orders);});
app.put('/api/admin/orders/:id/status',auth,async(req,res)=>{const allowedStatus=['Pedido recebido','Pedido em separação','Pedido enviado','Pedido finalizado','Pedido cancelado'];const allowedPayment=['Aguardando pagamento','Pagamento em análise','Pagamento confirmado','Pagamento recusado','Pagamento estornado','Pagamento cancelado'];const status=allowedStatus.includes(req.body.status)?req.body.status:'Pedido recebido';const payment=allowedPayment.includes(req.body.paymentStatus)?req.body.paymentStatus:'Aguardando pagamento';const before=await get('SELECT * FROM orders WHERE id=?',[req.params.id]);if(!before)return res.status(404).json({error:'Pedido não encontrado.'});await run('UPDATE orders SET status=?,payment_status=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[status,payment,cleanText(req.body.notes,3000),req.params.id]);const updated=await get('SELECT * FROM orders WHERE id=?',[req.params.id]);await run('INSERT INTO order_status_history (order_id,status,payment_status,notes,changed_by,changed_by_username) VALUES (?,?,?,?,?,?)',[updated.id,updated.status,updated.payment_status,updated.notes,req.admin.id,req.operatorName||req.admin.username]);await audit(req,'PEDIDO_ALTERADO','order',String(updated.id),`Pedido ${updated.code} atualizado.`,{status:before.status,payment_status:before.payment_status,notes:before.notes},{status:updated.status,payment_status:updated.payment_status,notes:updated.notes});res.json({ok:true,order:updated});});
app.delete('/api/admin/orders/:id',auth,async(req,res)=>{const found=await get('SELECT * FROM orders WHERE id=?',[req.params.id]);if(!found)return res.status(404).json({error:'Pedido não encontrado.'});await run('DELETE FROM orders WHERE id=?',[req.params.id]);await audit(req,'PEDIDO_EXCLUIDO','order',String(found.id),`Pedido ${found.code} excluído.`,found,null);res.json({ok:true,code:found.code});});

app.get('/api/admin/backup',auth,async(req,res)=>{
  const backup={version:'2.0.0',exportedAt:new Date().toISOString(),products:await all('SELECT * FROM products ORDER BY id'),orders:await all('SELECT * FROM orders ORDER BY id'),orderItems:await all('SELECT * FROM order_items ORDER BY id'),orderHistory:await all('SELECT * FROM order_status_history ORDER BY id'),settings:await all('SELECT * FROM settings ORDER BY key'),users:await all('SELECT id,username,role,active,must_change_password,created_at,updated_at,last_login_at FROM admin_users ORDER BY id'),auditLogs:await all('SELECT * FROM audit_logs ORDER BY id'),siteVisits:await all('SELECT * FROM site_visits ORDER BY id')};
  await audit(req,'BACKUP_EXPORTADO','backup','database','Backup completo exportado pelo painel administrativo.');
  res.setHeader('Content-Disposition',`attachment; filename=primepeptide-backup-${new Date().toISOString().slice(0,10)}.json`);res.json(backup);
});

app.get('/admin',(_req,res)=>res.sendFile(path.join(__dirname,'public','admin.html')));
app.get('/admin/',(_req,res)=>res.sendFile(path.join(__dirname,'public','admin.html')));
app.use((req,res,next)=>{if(req.path.startsWith('/api/'))return res.status(404).json({error:'Rota não encontrada.'});res.status(404).sendFile(path.join(__dirname,'public','404.html'));});
app.use((err,_req,res,_next)=>{console.error(err);res.status(500).json({error:'Erro interno. Tente novamente.'});});

initDb().then(()=>app.listen(PORT,()=>console.log(`PrimePeptide online em http://localhost:${PORT}`))).catch(err=>{console.error('Erro ao iniciar banco:',err);process.exit(1);});
