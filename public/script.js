const API = window.PRIMEPEPTIDE_CONFIG?.API_BASE || '';
let settings = { STORE_NAME: 'PrimePeptide', WHATSAPP_NUMBER: '', LOGO_URL: '' };
let produtos = [];
let carrinho = JSON.parse(localStorage.getItem('primepeptide_carrinho') || '[]');
let abaAtiva = 'todos';
let termo = '';

const el = (id) => document.getElementById(id);
const grid = el('grid-produtos');
const badge = el('cart-badge');
const painel = el('painel-carrinho');
const overlay = el('overlay');
const lista = el('lista-carrinho');
const totalEl = el('total-carrinho');
const btnFinalizar = el('btn-finalizar');
const toast = el('toast');

async function init() {
  await carregarSettings();
  await carregarProdutos();
  bindEventos();
  renderProdutos();
  renderCarrinho();
}

async function carregarSettings() {
  const r = await fetch(`${API}/api/settings`);
  settings = await r.json();
  document.title = settings.STORE_NAME || 'PrimePeptide';
  const logoImg = el('logo-img');
  const logoText = el('logo-text');
  if (settings.LOGO_URL) {
    logoImg.src = settings.LOGO_URL;
    logoImg.style.display = 'block';
    logoText.style.display = 'none';
  } else {
    logoImg.style.display = 'none';
    logoText.style.display = 'inline-flex';
    logoText.textContent = settings.STORE_NAME || 'PrimePeptide';
  }
}

async function carregarProdutos() {
  const r = await fetch(`${API}/api/products`);
  produtos = await r.json();
}

function bindEventos() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('ativa'));
      btn.classList.add('ativa');
      abaAtiva = btn.dataset.tab;
      renderProdutos();
    });
  });
  el('input-pesquisa').addEventListener('input', e => { termo = e.target.value.toLowerCase().trim(); renderProdutos(); });
  el('btn-abrir-carrinho').addEventListener('click', abrirCarrinho);
  el('btn-fechar-carrinho').addEventListener('click', fecharCarrinho);
  overlay.addEventListener('click', fecharCarrinho);
  btnFinalizar.addEventListener('click', finalizarPedido);
  el('btn-fechar-detalhes').addEventListener('click', () => fecharModal('modal-detalhes'));
  el('btn-track').addEventListener('click', () => abrirModal('modal-track'));
  el('btn-fechar-track').addEventListener('click', () => fecharModal('modal-track'));
  el('btn-consultar-pedido').addEventListener('click', consultarPedido);
}

function renderProdutos() {
  const filtrados = produtos.filter(p => {
    const okAba = abaAtiva === 'todos' || p.tipo === abaAtiva;
    const okTermo = p.nome.toLowerCase().includes(termo);
    return okAba && okTermo;
  });
  grid.innerHTML = '';
  if (!filtrados.length) {
    grid.innerHTML = '<div class="empty"><strong>Nenhum produto encontrado.</strong><br>Verifique a pesquisa ou outra aba.</div>';
    return;
  }
  filtrados.forEach(p => {
    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `
      <div class="card__img"><img src="${escapeHtml(p.imagem)}" alt="${escapeHtml(p.nome)}"></div>
      <div class="card__body">
        <span class="badge">${labelTipo(p.tipo)}</span>
        <h3>${escapeHtml(p.nome)}</h3>
        <div class="price">${formatBRL(p.preco)}</div>
        <div class="card__actions">
          <button class="btn-green add">Adicionar</button>
          <button class="btn-light details-btn">Ver detalhes</button>
        </div>
      </div>`;
    card.querySelector('.add').addEventListener('click', () => adicionarCarrinho(p));
    card.querySelector('.details-btn').addEventListener('click', () => abrirDetalhes(p));
    card.querySelector('.card__img').addEventListener('click', () => abrirDetalhes(p));
    grid.appendChild(card);
  });
}

function abrirDetalhes(p) {
  el('detalhes-conteudo').innerHTML = `
    <div class="details">
      <img src="${escapeHtml(p.imagem)}" alt="${escapeHtml(p.nome)}">
      <div>
        <span class="badge">${labelTipo(p.tipo)}</span>
        <h2>${escapeHtml(p.nome)}</h2>
        <p class="price">${formatBRL(p.preco)}</p>
        <p>${escapeHtml(p.descricao)}</p>
        <p><strong>Principais objetivos:</strong><br>${escapeHtml(p.objetivos)}</p>
        <p><strong>Categoria:</strong> ${escapeHtml(p.categoria)}</p>
        <button class="btn-green" id="det-add">Adicionar ao Carrinho</button>
      </div>
    </div>`;
  el('det-add').addEventListener('click', () => { adicionarCarrinho(p); fecharModal('modal-detalhes'); abrirCarrinho(); });
  abrirModal('modal-detalhes');
}

function adicionarCarrinho(p) {
  const item = carrinho.find(i => i.id === p.id);
  if (item) item.quantidade++;
  else carrinho.push({ ...p, quantidade: 1 });
  salvarCarrinho();
  renderCarrinho();
  mostrarToast('Produto adicionado ao carrinho');
}
function aumentar(id){ const i=carrinho.find(x=>x.id===id); if(i)i.quantidade++; salvarCarrinho(); renderCarrinho(); }
function diminuir(id){ const i=carrinho.find(x=>x.id===id); if(!i)return; i.quantidade--; if(i.quantidade<=0)carrinho=carrinho.filter(x=>x.id!==id); salvarCarrinho(); renderCarrinho(); }
function remover(id){ carrinho=carrinho.filter(x=>x.id!==id); salvarCarrinho(); renderCarrinho(); }
function salvarCarrinho(){ localStorage.setItem('primepeptide_carrinho', JSON.stringify(carrinho)); }
function total(){ return carrinho.reduce((s,i)=>s+(Number(i.preco)||0)*i.quantidade,0); }

function renderCarrinho(){
  const qtd = carrinho.reduce((s,i)=>s+i.quantidade,0);
  badge.textContent=qtd; badge.style.display=qtd?'inline-flex':'none';
  lista.innerHTML='';
  if(!carrinho.length) lista.innerHTML='<div class="empty">Seu carrinho está vazio.</div>';
  carrinho.forEach(item=>{
    const div=document.createElement('div'); div.className='cart-item';
    div.innerHTML=`<img src="${escapeHtml(item.imagem)}" alt="${escapeHtml(item.nome)}"><div class="cart-item__main"><div class="cart-item__name">${escapeHtml(item.nome)}</div><div>${formatBRL(item.preco)} / un.</div><div class="qty"><button class="menos">−</button><span>${item.quantidade}</span><button class="mais">+</button><strong>${formatBRL(item.preco*item.quantidade)}</strong></div><button class="remove">Remover</button></div>`;
    div.querySelector('.mais').addEventListener('click',()=>aumentar(item.id));
    div.querySelector('.menos').addEventListener('click',()=>diminuir(item.id));
    div.querySelector('.remove').addEventListener('click',()=>remover(item.id));
    lista.appendChild(div);
  });
  totalEl.textContent=formatBRL(total());
  btnFinalizar.disabled=!carrinho.length;
}

async function finalizarPedido(){
  const customerName = el('cliente-nome').value.trim();
  const customerPhone = el('cliente-telefone').value.trim();
  if(!customerName){ alert('Informe seu nome para gerar o pedido.'); return; }
  const r = await fetch(`${API}/api/orders`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ customerName, customerPhone, items:carrinho }) });
  const data = await r.json();
  if(!r.ok){ alert(data.error || 'Erro ao gerar pedido.'); return; }
  carrinho=[]; salvarCarrinho(); renderCarrinho(); fecharCarrinho();
  mostrarToast(`Pedido ${data.code} gerado!`);
  window.open(data.whatsappUrl, '_blank');
}

async function consultarPedido(){
  const code = el('track-code').value.trim().toUpperCase();
  const result = el('track-result');
  if(!code){ result.innerHTML='<p class="muted">Digite o código do pedido.</p>'; return; }
  result.innerHTML='<p class="muted">Consultando...</p>';
  const r = await fetch(`${API}/api/orders/${encodeURIComponent(code)}`);
  const data = await r.json();
  if(!r.ok){ result.innerHTML='<div class="status-card">Pedido não encontrado.</div>'; return; }
  result.innerHTML=`<div class="status-card"><h3>${escapeHtml(data.codigo)}</h3><p><strong>Status:</strong> ${escapeHtml(data.status)}</p><p><strong>Pagamento:</strong> ${escapeHtml(data.pagamento)}</p><p><strong>Total:</strong> ${formatBRL(data.total)}</p>${data.observacoes?`<p><strong>Observações:</strong> ${escapeHtml(data.observacoes)}</p>`:''}</div>`;
}

function abrirCarrinho(){ painel.classList.add('aberto'); overlay.classList.add('aberto'); }
function fecharCarrinho(){ painel.classList.remove('aberto'); overlay.classList.remove('aberto'); }
function abrirModal(id){ el(id).classList.add('aberto'); el(id).setAttribute('aria-hidden','false'); }
function fecharModal(id){ el(id).classList.remove('aberto'); el(id).setAttribute('aria-hidden','true'); }
function labelTipo(t){ return t==='promocao'?'Promoção':t==='combo'?'Combo':'Produto normal'; }
function formatBRL(v){ return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
function escapeHtml(texto){ const d=document.createElement('div'); d.textContent=texto??''; return d.innerHTML; }
let toastTimer; function mostrarToast(t){ toast.textContent=t; toast.classList.add('mostrar'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>toast.classList.remove('mostrar'),2500); }

init();
