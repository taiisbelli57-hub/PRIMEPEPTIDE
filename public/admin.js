const API = window.PRIMEPEPTIDE_CONFIG?.API_BASE || '';
const tokenKey = 'primepeptide_admin_token';
let produtos = [];
let editandoId = null;
const $ = (id) => document.getElementById(id);
const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem(tokenKey) || ''}` });

function init(){
  bindLogin(); bindNav(); bindProducts(); bindSettings(); bindOrders();
  if(localStorage.getItem(tokenKey)) showAdmin();
}
function bindLogin(){
  $('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    $('login-error').textContent='';
    const r = await fetch(`${API}/api/admin/login`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ username:$('login-user').value.trim(), password:$('login-pass').value }) });
    const data = await r.json();
    if(!r.ok){ $('login-error').textContent=data.error||'Erro no login'; return; }
    localStorage.setItem(tokenKey, data.token); showAdmin();
  });
  $('logout').addEventListener('click',()=>{localStorage.removeItem(tokenKey);location.reload();});
}
async function showAdmin(){
  $('login-box').style.display='none'; $('admin-box').style.display='block';
  await Promise.all([loadProducts(), loadSettings(), loadOrders()]);
}
function bindNav(){
  document.querySelectorAll('.admin-tab').forEach(btn=>btn.addEventListener('click',()=>{
    document.querySelectorAll('.admin-tab').forEach(b=>b.classList.remove('ativa')); btn.classList.add('ativa');
    document.querySelectorAll('.view').forEach(v=>v.style.display='none'); $('view-'+btn.dataset.view).style.display='block';
  }));
}
function bindProducts(){
  $('new-product').addEventListener('click',()=>openProductModal());
  $('close-product-modal').addEventListener('click',closeProductModal);
  $('product-image').addEventListener('input',()=>preview('product-image','product-preview'));
  $('product-image-file').addEventListener('change', async()=>{
    const f=$('product-image-file').files[0]; if(!f)return;
    const b64=await compressImage(f,900,.75); $('product-image').value=b64; $('product-preview').src=b64; $('product-preview').style.display='block';
  });
  $('product-form').addEventListener('submit', saveProduct);
  $('export-json').addEventListener('click',exportProducts);
}
async function loadProducts(){
  const r=await fetch(`${API}/api/admin/products`,{headers:authHeader()});
  if(r.status===401){localStorage.removeItem(tokenKey);location.reload();return;}
  produtos=await r.json(); renderProducts();
}
function renderProducts(){
  const tbody=$('products-table'); tbody.innerHTML='';
  produtos.forEach(p=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td><img src="${esc(p.imagem)}" alt=""></td><td>${esc(p.nome)}</td><td>${labelTipo(p.tipo)}</td><td>${brl(p.preco)}</td><td><div class="row-actions"><button class="icon edit">✏️</button><button class="icon delete">🗑️</button></div></td>`;
    tr.querySelector('.edit').addEventListener('click',()=>openProductModal(p));
    tr.querySelector('.delete').addEventListener('click',()=>deleteProduct(p));
    tbody.appendChild(tr);
  });
}
function openProductModal(p=null){
  editandoId=p?.id||null; $('modal-title').textContent=p?'Editar produto':'Novo produto';
  $('product-id').value=p?.id||''; $('product-name').value=p?.nome||''; $('product-description').value=p?.descricao||''; $('product-objectives').value=p?.objetivos||''; $('product-category').value=p?.categoria||''; $('product-price').value=p?.preco??0; $('product-type').value=p?.tipo||'normal'; $('product-image').value=p?.imagem||'';
  preview('product-image','product-preview'); $('product-modal').classList.add('open');
}
function closeProductModal(){ $('product-modal').classList.remove('open'); $('product-form').reset(); editandoId=null; }
async function saveProduct(e){
  e.preventDefault();
  const body={ nome:$('product-name').value.trim(), descricao:$('product-description').value.trim(), objetivos:$('product-objectives').value.trim(), categoria:$('product-category').value.trim(), preco:Number($('product-price').value||0), tipo:$('product-type').value, imagem:$('product-image').value.trim(), ativo:true };
  const url= editandoId ? `${API}/api/admin/products/${editandoId}` : `${API}/api/admin/products`;
  const method= editandoId ? 'PUT' : 'POST';
  const r=await fetch(url,{method,headers:{'Content-Type':'application/json',...authHeader()},body:JSON.stringify(body)});
  if(!r.ok){alert('Erro ao salvar produto.');return;}
  closeProductModal(); await loadProducts();
}
async function deleteProduct(p){
  if(!confirm(`Excluir ${p.nome}?`))return;
  await fetch(`${API}/api/admin/products/${p.id}`,{method:'DELETE',headers:authHeader()}); await loadProducts();
}
async function exportProducts(){
  const r=await fetch(`${API}/api/admin/products-export`,{headers:authHeader()}); const data=await r.json();
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='produtos.json'; a.click(); URL.revokeObjectURL(url);
}
function bindSettings(){
  $('set-logo').addEventListener('input',()=>preview('set-logo','logo-preview'));
  $('logo-file').addEventListener('change',async()=>{const f=$('logo-file').files[0]; if(!f)return; const b64=await compressImage(f,700,.8); $('set-logo').value=b64; $('logo-preview').src=b64; $('logo-preview').style.display='block';});
  $('save-settings').addEventListener('click',saveSettings);
}
async function loadSettings(){
  const r=await fetch(`${API}/api/settings`); const s=await r.json();
  $('set-store-name').value=s.STORE_NAME||'PrimePeptide'; $('set-whatsapp').value=s.WHATSAPP_NUMBER||''; $('set-logo').value=s.LOGO_URL||''; preview('set-logo','logo-preview');
}
async function saveSettings(){
  const body={STORE_NAME:$('set-store-name').value.trim(),WHATSAPP_NUMBER:$('set-whatsapp').value.replace(/\D/g,''),LOGO_URL:$('set-logo').value.trim()};
  const r=await fetch(`${API}/api/settings`,{method:'PUT',headers:{'Content-Type':'application/json',...authHeader()},body:JSON.stringify(body)});
  alert(r.ok?'Configurações salvas.':'Erro ao salvar configurações.');
}
function bindOrders(){ $('refresh-orders').addEventListener('click',loadOrders); }
async function loadOrders(){
  const r=await fetch(`${API}/api/admin/orders`,{headers:authHeader()}); if(!r.ok)return;
  const orders=await r.json(); const box=$('orders-list'); box.innerHTML='';
  if(!orders.length){box.innerHTML='<div class="admin-card">Nenhum pedido recebido ainda.</div>'; return;}
  orders.forEach(o=>{
    const div=document.createElement('div'); div.className='order-card';
    div.innerHTML=`<div class="order-card__top"><div><div class="order-code">${esc(o.code)}</div><div>${esc(o.customer_name||'Sem nome')} · ${esc(o.customer_phone||'Sem telefone')}</div></div><span class="pill">${esc(o.status)}</span></div><div class="items">${o.items.map(i=>`${i.quantity}x ${esc(i.product_name)} — ${brl(i.subtotal)}`).join('<br>')}</div><p><strong>Total:</strong> ${brl(o.total)} · <strong>Pagamento:</strong> Pix</p><div class="order-controls"><label>Status<select class="status"><option>Pedido recebido</option><option>Aguardando pagamento Pix</option><option>Pagamento confirmado</option><option>Pedido em separação</option><option>Pedido enviado</option><option>Pedido finalizado</option><option>Pedido cancelado</option></select></label><label>Observações<input class="notes" value="${esc(o.notes||'')}"></label><button class="btn-primary save-status">Salvar</button></div>`;
    div.querySelector('.status').value=o.status;
    div.querySelector('.save-status').addEventListener('click',async()=>{await fetch(`${API}/api/admin/orders/${o.id}/status`,{method:'PUT',headers:{'Content-Type':'application/json',...authHeader()},body:JSON.stringify({status:div.querySelector('.status').value,notes:div.querySelector('.notes').value})}); await loadOrders();});
    box.appendChild(div);
  });
}
function preview(inputId,imgId){const v=$(inputId).value.trim(); if(v){$(imgId).src=v; $(imgId).style.display='block';}else{$(imgId).style.display='none';}}
function compressImage(file,maxWidth,quality){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=e=>{const img=new Image();img.onload=()=>{let w=img.width,h=img.height;if(w>maxWidth){h=Math.round(h*maxWidth/w);w=maxWidth;}const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);resolve(c.toDataURL('image/jpeg',quality));};img.onerror=reject;img.src=e.target.result;};reader.onerror=reject;reader.readAsDataURL(file);});}
function labelTipo(t){return t==='promocao'?'Promoção':t==='combo'?'Combo':'Normal';} function brl(v){return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});} function esc(x){const d=document.createElement('div');d.textContent=x??'';return d.innerHTML;}
init();
