const API = window.PRIMEPEPTIDE_CONFIG?.API_BASE || '';
const tokenKey = 'primepeptide_admin_token';
const operatorKey = 'primepeptide_operator_name';
const $ = id => document.getElementById(id);
const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem(tokenKey) || ''}`, 'X-Operator-Name': sessionStorage.getItem(operatorKey) || '' });
let produtos = [], pedidos = [], editandoId = null, currentUser = null;

function init(){
  bindLogin(); bindOperator(); bindNav(); bindProducts(); bindOrders(); bindSettings(); bindSecurity(); bindAudit();
  if(localStorage.getItem(tokenKey)) showAdmin();
}

function bindLogin(){
  $('login-form').onsubmit = async e => {
    e.preventDefault(); $('login-error').textContent = '';
    try{
      const d = await req(`${API}/api/admin/login`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username:$('login-user').value.trim(), password:$('login-pass').value}) }, false);
      localStorage.setItem(tokenKey, d.token); sessionStorage.removeItem(operatorKey); await showAdmin();
    }catch(err){ $('login-error').textContent = err.message; }
  };
  $('logout').onclick = async () => {
    try{ await fetch(`${API}/api/admin/logout`, {method:'POST', headers:authHeader()}); }catch{}
    localStorage.removeItem(tokenKey); sessionStorage.removeItem(operatorKey); location.reload();
  };
}

async function showAdmin(){
  try{
    currentUser = await req(`${API}/api/admin/me`, {headers:authHeader()});
    $('login-box').hidden = true;
    const operator = sessionStorage.getItem(operatorKey);
    if(!operator){ $('admin-box').hidden = true; $('operator-gate').hidden = false; return; }
    $('operator-gate').hidden = true; $('admin-box').hidden = false;
    $('current-user-label').innerHTML = `Responsável nesta sessão: <strong>${esc(operator)}</strong> · <button type="button" class="link-button" id="change-operator">Trocar nome</button>`;
    $('change-operator').onclick = () => { sessionStorage.removeItem(operatorKey); $('admin-box').hidden=true; $('operator-gate').hidden=false; $('operator-name').focus(); };
    $('password-warning').hidden = !currentUser.mustChangePassword;
    await Promise.all([loadDashboard(), loadProducts(), loadSettings(), loadOrders()]);
    if(currentUser.mustChangePassword) goView('seguranca');
  }catch{ localStorage.removeItem(tokenKey); $('login-box').hidden = false; $('admin-box').hidden = true; }
}


function bindOperator(){
  $('operator-form').onsubmit = async e => {
    e.preventDefault();
    const name = $('operator-name').value.trim();
    $('operator-error').textContent = '';
    if(name.length < 2){ $('operator-error').textContent = 'Digite um nome válido.'; return; }
    sessionStorage.setItem(operatorKey, name);
    try{ await req(`${API}/api/admin/operator`, {method:'POST',headers:{'Content-Type':'application/json',...authHeader()},body:JSON.stringify({name})}); await showAdmin(); }
    catch(err){ sessionStorage.removeItem(operatorKey); $('operator-error').textContent = err.message; }
  };
  $('operator-logout').onclick = () => { localStorage.removeItem(tokenKey); sessionStorage.removeItem(operatorKey); location.reload(); };
}

function bindNav(){
  document.querySelectorAll('.tab').forEach(b => b.onclick = () => goView(b.dataset.view));
  document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => goView(b.dataset.go));
}
function goView(v){
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('ativa', b.dataset.view === v));
  document.querySelectorAll('.view').forEach(x => x.hidden = x.id !== `view-${v}`);
  if(v === 'auditoria') loadAudit();
}

async function req(url,opt={},redirect=true){
  const r = await fetch(url,opt);
  if(r.status===401 && redirect){ localStorage.removeItem(tokenKey); sessionStorage.removeItem(operatorKey); location.reload(); throw new Error('Sessão expirada'); }
  const d = await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(d.error || 'Erro na operação');
  return d;
}

async function loadDashboard(){
  const d = await req(`${API}/api/admin/dashboard`,{headers:authHeader()});
  $('dashboard-stats').innerHTML = [['Pedidos hoje',d.pedidosHoje],['Aguardando pagamento',d.pagamentosPendentes],['Pagamentos confirmados',d.pedidosPagos],['Cancelados',d.cancelados],['Faturamento confirmado',brl(d.faturamentoConfirmado)],['Produtos ativos',d.produtosAtivos],['Total de pedidos',d.pedidos],['Produtos cadastrados',d.produtos]].map(([l,v])=>`<div class="stat"><span>${esc(l)}</span><strong>${esc(v)}</strong></div>`).join('');
  $('recent-orders').innerHTML = d.recentes.length ? d.recentes.map(o=>`<div class="recent"><div><strong>${esc(o.code)}</strong><small>${esc(o.customer_name||'Sem nome')}</small></div><div><span class="pill ${statusClass(o.status)}">${esc(o.status)}</span> <strong>${brl(o.total)}</strong></div></div>`).join('') : '<p>Nenhum pedido.</p>';
}

function bindProducts(){
  $('new-product').onclick=()=>openProduct(); $('close-product-modal').onclick=closeProduct; $('product-form').onsubmit=saveProduct; $('product-search').oninput=renderProducts; $('export-json').onclick=exportProducts;
  $('product-image').oninput=()=>preview('product-image','product-preview');
  $('product-image-file').onchange=async()=>{const f=$('product-image-file').files[0];if(f){$('product-image').value=await compressImage(f,900,.78);preview('product-image','product-preview')}};
}
async function loadProducts(){ produtos = await req(`${API}/api/admin/products`,{headers:authHeader()}); renderProducts(); }
function renderProducts(){
  const t=($('product-search').value||'').toLowerCase();
  $('products-table').innerHTML=produtos.filter(p=>[p.nome,p.grupo,p.categoria,...p.modalidades].join(' ').toLowerCase().includes(t)).map(p=>`<tr><td><img src="${esc(p.imagem)}"><strong>${esc(p.nome)}</strong></td><td>${labelGrupo(p.grupo)}</td><td>${brl(p.preco)}</td><td>${p.estoque}</td><td><span class="status ${p.ativo?'on':'off'}">${p.ativo?'Ativo':'Inativo'}</span></td><td><div class="row-actions"><button data-edit="${p.id}">✏️</button><button data-delete="${p.id}">🗑️</button></div></td></tr>`).join('');
  document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openProduct(produtos.find(p=>p.id===b.dataset.edit)));
  document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>deleteProduct(produtos.find(p=>p.id===b.dataset.delete)));
}
function openProduct(p=null){
  editandoId=p?.id||null; $('modal-title').textContent=p?'Editar produto':'Novo produto';
  $('product-name').value=p?.nome||''; $('product-sku').value=p?.sku||''; $('product-min-stock').value=p?.estoqueMinimo??0; $('product-track-stock').checked=!!p?.controlarEstoque; $('product-launch').checked=!!p?.lancamento; $('product-weight').value=p?.pesoGramas??0; $('product-order').value=p?.ordemExibicao??0; $('product-price').value=p?.preco??0; $('product-stock').value=p?.estoque??0; $('product-group').value=p?.grupo||'peptideos'; $('product-type').value=p?.tipo||'normal'; $('product-discount').value=p?.porcentagemPromocao??0; $('product-modalities').value=(p?.modalidades||[]).join(', '); $('product-category').value=p?.categoria||''; $('product-description').value=p?.descricao||''; $('product-objectives').value=p?.objetivos||''; $('product-storage').value=p?.armazenamento||''; $('product-active').checked=p?.ativo!==false; $('product-featured').checked=!!p?.destaque; $('product-bestseller').checked=!!p?.maisVendido; $('product-image').value=p?.imagem||'';
  preview('product-image','product-preview'); $('product-modal').classList.add('open');
}
function closeProduct(){ $('product-modal').classList.remove('open'); $('product-form').reset(); editandoId=null; }
async function saveProduct(e){
  e.preventDefault(); const body={nome:$('product-name').value.trim(),sku:$('product-sku').value.trim(),estoqueMinimo:+$('product-min-stock').value||0,controlarEstoque:$('product-track-stock').checked,lancamento:$('product-launch').checked,pesoGramas:+$('product-weight').value||0,ordemExibicao:+$('product-order').value||0,preco:+$('product-price').value||0,estoque:+$('product-stock').value||0,grupo:$('product-group').value,tipo:$('product-type').value,porcentagemPromocao:+$('product-discount').value||0,modalidades:$('product-modalities').value.split(',').map(v=>v.trim()).filter(Boolean),categoria:$('product-category').value.trim(),descricao:$('product-description').value.trim(),objetivos:$('product-objectives').value.trim(),armazenamento:$('product-storage').value.trim(),ativo:$('product-active').checked,destaque:$('product-featured').checked,maisVendido:$('product-bestseller').checked,imagem:$('product-image').value.trim()};
  await req(editandoId?`${API}/api/admin/products/${editandoId}`:`${API}/api/admin/products`,{method:editandoId?'PUT':'POST',headers:{'Content-Type':'application/json',...authHeader()},body:JSON.stringify(body)}); closeProduct(); toast('Produto salvo'); await Promise.all([loadProducts(),loadDashboard()]);
}
async function deleteProduct(p){if(!confirm(`Excluir ${p.nome}?`))return;await req(`${API}/api/admin/products/${p.id}`,{method:'DELETE',headers:authHeader()});toast('Produto excluído');await Promise.all([loadProducts(),loadDashboard()]);}
async function exportProducts(){const d=await req(`${API}/api/admin/products-export`,{headers:authHeader()}),a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(d,null,2)],{type:'application/json'}));a.download='produtos.json';a.click();}

function bindOrders(){ $('refresh-orders').onclick=()=>Promise.all([loadOrders(),loadDashboard()]); $('order-search').oninput=renderOrders; $('order-status-filter').onchange=renderOrders; $('payment-filter').onchange=renderOrders; }
async function loadOrders(){ pedidos=await req(`${API}/api/admin/orders`,{headers:authHeader()}); renderOrders(); }
function renderOrders(){
  const t=$('order-search').value.toLowerCase(),sf=$('order-status-filter').value,pf=$('payment-filter').value;
  const list=pedidos.filter(o=>[o.code,o.customer_name,o.customer_phone].join(' ').toLowerCase().includes(t)&&(!sf||o.status===sf)&&(!pf||o.payment_status===pf));
  $('orders-list').innerHTML=list.length?'':'<div class="panel">Nenhum pedido encontrado.</div>';
  list.forEach(o=>{
    const d=document.createElement('article'); d.className='order-card';
    d.innerHTML=`<div class="order-top"><div><div class="order-code">${esc(o.code)}</div><div>${esc(o.customer_name||'Sem nome')} · ${esc(o.customer_phone||'Sem telefone')} ${o.customer_city?'· '+esc(o.customer_city):''}</div></div><div class="order-pills"><span class="pill payment-pill ${paymentClass(o.payment_status)}">${esc(o.payment_status)}</span><span class="pill status-pill ${statusClass(o.status)}">${esc(o.status)}</span></div></div><div class="items">${o.items.map(i=>`${i.quantity}x ${esc(i.product_name)} — ${brl(i.subtotal)}`).join('<br>')}</div><p><strong>Total:</strong> ${brl(o.total)} · <strong>Criado:</strong> ${new Date(o.created_at).toLocaleString('pt-BR')}</p>${o.customer_notes?`<p><strong>Observação do cliente:</strong> ${esc(o.customer_notes)}</p>`:''}<div class="order-controls"><label>Status<select class="status-select">${['Pedido recebido','Pedido em separação','Pedido enviado','Pedido finalizado','Pedido cancelado'].map(x=>`<option>${x}</option>`).join('')}</select></label><label>Pagamento<select class="payment-select">${['Aguardando pagamento','Pagamento em análise','Pagamento confirmado','Pagamento recusado','Pagamento estornado','Pagamento cancelado'].map(x=>`<option>${x}</option>`).join('')}</select></label><label>Observação visível ao cliente<input class="notes" value="${esc(o.notes||'')}"></label><button class="btn light copy">Copiar código</button><button class="btn primary save">Salvar</button><button class="btn danger delete">Excluir</button></div>`;
    const statusSelect=d.querySelector('.status-select'), paymentSelect=d.querySelector('.payment-select'), statusPill=d.querySelector('.status-pill'), paymentPill=d.querySelector('.payment-pill');
    statusSelect.value=o.status; paymentSelect.value=o.payment_status||'Aguardando pagamento';
    statusSelect.onchange=()=>updatePill(statusPill,statusSelect.value,statusClass); paymentSelect.onchange=()=>updatePill(paymentPill,paymentSelect.value,paymentClass);
    d.querySelector('.copy').onclick=async()=>{await navigator.clipboard.writeText(o.code);toast('Código copiado')};
    d.querySelector('.save').onclick=async()=>{await req(`${API}/api/admin/orders/${o.id}/status`,{method:'PUT',headers:{'Content-Type':'application/json',...authHeader()},body:JSON.stringify({status:statusSelect.value,paymentStatus:paymentSelect.value,notes:d.querySelector('.notes').value})});toast('Status atualizado');await Promise.all([loadOrders(),loadDashboard()])};
    d.querySelector('.delete').onclick=async()=>{if(!confirm(`Excluir o pedido ${o.code}? Esta ação não pode ser desfeita.`))return;await req(`${API}/api/admin/orders/${o.id}`,{method:'DELETE',headers:authHeader()});toast('Pedido excluído');await Promise.all([loadOrders(),loadDashboard()])};
    $('orders-list').appendChild(d);
  });
}
function updatePill(el,value,classFn){el.textContent=value;el.className=`pill ${el.classList.contains('payment-pill')?'payment-pill':'status-pill'} ${classFn(value)}`;}
function statusClass(v){ if(v==='Pedido em separação')return'pill-yellow'; if(v==='Pedido enviado')return'pill-blue'; if(v==='Pedido finalizado')return'pill-green'; if(v==='Pedido cancelado')return'pill-red'; return'pill-gray'; }
function paymentClass(v){ if(v==='Pagamento confirmado')return'pill-green'; if(v==='Pagamento em análise')return'pill-blue'; if(['Pagamento recusado','Pagamento estornado','Pagamento cancelado'].includes(v))return'pill-red'; return'pill-yellow'; }

function bindSettings(){ $('save-settings').onclick=saveSettings; $('ignore-current-ip').onclick=ignoreCurrentIp; $('set-logo').oninput=()=>preview('set-logo','logo-preview'); $('logo-file').onchange=async()=>{const f=$('logo-file').files[0];if(f){$('set-logo').value=await compressImage(f,1000,.82);preview('set-logo','logo-preview')}}; }
async function ignoreCurrentIp(){if(!confirm('Ignorar este computador no contador e remover os acessos já registrados por este IP?'))return;const d=await req(`${API}/api/admin/visits/ignore-current-ip`,{method:'POST',headers:authHeader()});$('set-ignored-ips').value=(d.ignoredIps||[]).join(',');toast(`Este IP não será contado: ${d.ip}`);await loadDashboard()}
async function loadSettings(){const s=await req(`${API}/api/settings`);const m={'set-store-name':'STORE_NAME','set-whatsapp':'WHATSAPP_NUMBER','set-instagram':'INSTAGRAM_URL','set-logo':'LOGO_URL','set-pix-key':'PIX_KEY','set-pix-holder':'PIX_HOLDER','set-pix-bank':'PIX_BANK','set-pix-instructions':'PIX_INSTRUCTIONS','set-shipping-local':'SHIPPING_LOCAL','set-shipping-other':'SHIPPING_OTHER','set-hero-title':'HERO_TITLE','set-hero-subtitle':'HERO_SUBTITLE','set-banner':'BANNER_URL','set-footer':'FOOTER_TEXT','set-primary-color':'PRIMARY_COLOR','set-secondary-color':'SECONDARY_COLOR','set-meta-description':'META_DESCRIPTION','set-meta-keywords':'META_KEYWORDS','set-ignored-ips':'IGNORED_VISITOR_IPS'};Object.entries(m).forEach(([id,k])=>$(id).value=s[k]||'');preview('set-logo','logo-preview');}
async function saveSettings(){const body={STORE_NAME:$('set-store-name').value.trim(),WHATSAPP_NUMBER:$('set-whatsapp').value.replace(/\D/g,''),INSTAGRAM_URL:$('set-instagram').value.trim(),LOGO_URL:$('set-logo').value.trim(),PIX_KEY:$('set-pix-key').value.trim(),PIX_HOLDER:$('set-pix-holder').value.trim(),PIX_BANK:$('set-pix-bank').value.trim(),PIX_INSTRUCTIONS:$('set-pix-instructions').value.trim(),SHIPPING_LOCAL:$('set-shipping-local').value.trim(),SHIPPING_OTHER:$('set-shipping-other').value.trim(),HERO_TITLE:$('set-hero-title').value.trim(),HERO_SUBTITLE:$('set-hero-subtitle').value.trim(),BANNER_URL:$('set-banner').value.trim(),FOOTER_TEXT:$('set-footer').value.trim(),PRIMARY_COLOR:$('set-primary-color').value,SECONDARY_COLOR:$('set-secondary-color').value,META_DESCRIPTION:$('set-meta-description').value.trim(),META_KEYWORDS:$('set-meta-keywords').value.trim(),IGNORED_VISITOR_IPS:$('set-ignored-ips').value.trim()};await req(`${API}/api/settings`,{method:'PUT',headers:{'Content-Type':'application/json',...authHeader()},body:JSON.stringify(body)});toast('Configurações salvas');}

function bindSecurity(){
  $('change-password-form').onsubmit=changePassword; $('download-backup').onclick=downloadBackup;
}
async function downloadBackup(){try{const response=await fetch(`${API}/api/admin/backup`,{headers:authHeader()});if(!response.ok)throw new Error((await response.json()).error||'Falha no backup');const blob=await response.blob();const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`primepeptide-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href);toast('Backup exportado');}catch(err){toast(err.message);}}
async function changePassword(e){
  e.preventDefault(); const next=$('new-password').value;
  if(next!==$('confirm-password').value){toast('As novas senhas não coincidem');return;}
  try{const d=await req(`${API}/api/admin/me/password`,{method:'PUT',headers:{'Content-Type':'application/json',...authHeader()},body:JSON.stringify({currentPassword:$('current-password').value,newPassword:next})});localStorage.setItem(tokenKey,d.token);$('change-password-form').reset();currentUser.mustChangePassword=false;$('password-warning').hidden=true;toast('Senha alterada com segurança');}
  catch(err){toast(err.message);}
}

function bindAudit(){ $('refresh-audit').onclick=loadAudit; ['audit-user','audit-action','audit-from','audit-to'].forEach(id=>$(id).onchange=loadAudit); $('audit-user').oninput=debounce(loadAudit,400); }
async function loadAudit(){
  if(!localStorage.getItem(tokenKey))return;
  const q=new URLSearchParams(); if($('audit-user').value)q.set('user',$('audit-user').value); if($('audit-action').value)q.set('action',$('audit-action').value); if($('audit-from').value)q.set('from',$('audit-from').value); if($('audit-to').value)q.set('to',$('audit-to').value);
  try{const rows=await req(`${API}/api/admin/audit?${q}`,{headers:authHeader()});const actions=[...new Set(rows.map(r=>r.action))].sort();const selected=$('audit-action').value;$('audit-action').innerHTML='<option value="">Todas as ações</option>'+actions.map(a=>`<option>${esc(a)}</option>`).join('');$('audit-action').value=selected;$('audit-table').innerHTML=rows.length?rows.map(r=>`<tr><td>${new Date(r.created_at).toLocaleString('pt-BR')}</td><td><strong>${esc(r.username||'-')}</strong></td><td><span class="audit-action">${esc(r.action)}</span></td><td>${esc(r.description||'-')}</td><td><small>${esc(r.ip_address||'-')}<br>${esc(deviceLabel(r.user_agent))}</small></td></tr>`).join(''):'<tr><td colspan="5">Nenhum registro encontrado.</td></tr>';}
  catch(err){toast(err.message);}
}
function deviceLabel(ua=''){if(/iphone/i.test(ua))return'iPhone';if(/android/i.test(ua))return'Android';if(/windows/i.test(ua))return'Windows';if(/macintosh/i.test(ua))return'Mac';return ua.slice(0,60)||'Dispositivo não identificado';}

function preview(i,p){const v=$(i).value.trim();if(v){$(p).src=v;$(p).hidden=false}else $(p).hidden=true;}
function compressImage(file,maxWidth,q){return new Promise((res,rej)=>{const r=new FileReader;r.onload=e=>{const img=new Image;img.onload=()=>{let w=img.width,h=img.height;if(w>maxWidth){h=Math.round(h*maxWidth/w);w=maxWidth}const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);res(c.toDataURL('image/jpeg',q))};img.onerror=rej;img.src=e.target.result};r.onerror=rej;r.readAsDataURL(file)});}
function labelGrupo(g){return g==='hormonios'?'Hormônios':g==='acessorios'?'Acessórios':'Peptídeos';}
function brl(v){return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}
function esc(v){const d=document.createElement('div');d.textContent=v??'';return d.innerHTML;}
function debounce(fn,ms){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms)}}
let timer;function toast(t){const x=$('admin-toast');x.textContent=t;x.classList.add('show');clearTimeout(timer);timer=setTimeout(()=>x.classList.remove('show'),2800);}
init();
