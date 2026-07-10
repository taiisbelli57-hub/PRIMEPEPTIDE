const API = window.PRIMEPEPTIDE_CONFIG?.API_BASE || '';
let settings = {};
let produtos = [];
let carrinho = JSON.parse(localStorage.getItem('primepeptide_carrinho') || '[]');
let grupoAtivo = 'todos';
let modalidadeAtiva = 'todas';
let termo = '';

const el = id => document.getElementById(id);
const grid = el('grid-produtos');
const badge = el('cart-badge');
const painel = el('painel-carrinho');
const overlay = el('overlay');
const lista = el('lista-carrinho');
const totalEl = el('total-carrinho');
const btnFinalizar = el('btn-finalizar');
const toast = el('toast');

async function init(){
  await Promise.all([carregarSettings(), carregarProdutos()]);
  bindEventos();
  renderModalidades();
  renderProdutos();
  renderCarrinho();
}

async function carregarSettings(){
  const r = await fetch(`${API}/api/settings`);
  settings = await r.json();
  document.title = settings.STORE_NAME || 'PrimePeptide';
  const logoImg = el('logo-img');
  const logoText = el('logo-text');
  if(settings.LOGO_URL){
    logoImg.src = settings.LOGO_URL;
    logoImg.style.display = 'block';
    logoText.style.display = 'none';
  } else {
    logoImg.style.display = 'none';
    logoText.style.display = 'inline-flex';
    logoText.textContent = settings.STORE_NAME || 'PrimePeptide';
  }
  renderPix();
}

async function carregarProdutos(){
  const r = await fetch(`${API}/api/products`);
  produtos = await r.json();
}

function bindEventos(){
  document.querySelectorAll('.main-tab').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.main-tab').forEach(b => b.classList.remove('ativa'));
    btn.classList.add('ativa');
    grupoAtivo = btn.dataset.group;
    modalidadeAtiva = 'todas';
    renderModalidades();
    renderProdutos();
  }));
  el('input-pesquisa').addEventListener('input', e => { termo = e.target.value.toLowerCase().trim(); renderProdutos(); });
  el('btn-abrir-carrinho').addEventListener('click', abrirCarrinho);
  el('btn-fechar-carrinho').addEventListener('click', fecharCarrinho);
  overlay.addEventListener('click', fecharCarrinho);
  btnFinalizar.addEventListener('click', finalizarPedido);
  el('btn-fechar-detalhes').addEventListener('click', () => fecharModal('modal-detalhes'));
  el('btn-track').addEventListener('click', () => abrirModal('modal-track'));
  el('btn-fechar-track').addEventListener('click', () => fecharModal('modal-track'));
  el('btn-consultar-pedido').addEventListener('click', consultarPedido);
  el('copy-pix').addEventListener('click', copiarPix);
}

function produtosDoGrupo(){
  return produtos.filter(p => {
    if(grupoAtivo === 'promocao' || grupoAtivo === 'combo') return p.tipo === grupoAtivo;
    if(grupoAtivo === 'todos') return true;
    return p.grupo === grupoAtivo;
  });
}

function renderModalidades(){
  const box = el('modality-filter');
  const modalidades = [...new Set(produtosDoGrupo().flatMap(p => p.modalidades || []).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  box.innerHTML = '';
  if(!modalidades.length) return;
  ['todas', ...modalidades].forEach(m => {
    const btn = document.createElement('button');
    btn.className = `modality-chip ${modalidadeAtiva === m ? 'ativa' : ''}`;
    btn.textContent = m === 'todas' ? 'Todas as modalidades' : m;
    btn.addEventListener('click', () => { modalidadeAtiva = m; renderModalidades(); renderProdutos(); });
    box.appendChild(btn);
  });
}

function renderProdutos(){
  const filtrados = produtosDoGrupo().filter(p => {
    const text = [p.nome,p.descricao,p.objetivos,p.categoria,...(p.modalidades||[])].join(' ').toLowerCase();
    const okTermo = !termo || text.includes(termo);
    const okModalidade = modalidadeAtiva === 'todas' || (p.modalidades || []).includes(modalidadeAtiva);
    return okTermo && okModalidade;
  });
  grid.innerHTML = '';
  if(!filtrados.length){
    grid.innerHTML = '<div class="empty"><strong>Nenhum produto encontrado.</strong><br>Tente outra categoria, modalidade ou pesquisa.</div>';
    return;
  }
  filtrados.forEach(p => {
    const card = document.createElement('article');
    card.className = 'card';
    const modalities = (p.modalidades || []).slice(0,2).map(m=>`<span class="mini-chip">${escapeHtml(m)}</span>`).join('');
    card.innerHTML = `
      <div class="card__img"><img src="${escapeHtml(p.imagem)}" alt="${escapeHtml(p.nome)}"></div>
      <div class="card__body">
        <div class="card__labels"><span class="badge">${labelGrupo(p.grupo)}</span>${p.tipo!=='normal'?`<span class="badge badge--accent">${labelTipo(p.tipo)}</span>`:''}</div>
        <h3>${escapeHtml(p.nome)}</h3>
        <div class="mini-chips">${modalities}</div>
        ${p.tipo==='promocao' && Number(p.porcentagemPromocao)>0 ? `<div class="price-old">De ${formatBRL(p.preco)}</div><span class="promo-percent">-${Number(p.porcentagemPromocao)}%</span><div class="price">Por ${formatBRL(precoFinal(p))}</div>` : `<div class="price">${formatBRL(p.preco)}</div>`}
        <div class="card__actions"><button class="btn-green add">Adicionar</button><button class="btn-light details-btn">Detalhes</button></div>
      </div>`;
    card.querySelector('.add').addEventListener('click', () => adicionarCarrinho(p));
    card.querySelector('.details-btn').addEventListener('click', () => abrirDetalhes(p));
    card.querySelector('.card__img').addEventListener('click', () => abrirDetalhes(p));
    grid.appendChild(card);
  });
}

function abrirDetalhes(p){
  const modalities=(p.modalidades||[]).map(m=>`<span class="mini-chip">${escapeHtml(m)}</span>`).join('');
  el('detalhes-conteudo').innerHTML = `<div class="details"><img src="${escapeHtml(p.imagem)}" alt="${escapeHtml(p.nome)}"><div><div class="card__labels"><span class="badge">${labelGrupo(p.grupo)}</span></div><h2>${escapeHtml(p.nome)}</h2>${p.tipo==='promocao' && Number(p.porcentagemPromocao)>0 ? `<p class="price-old">De ${formatBRL(p.preco)}</p><span class="promo-percent">-${Number(p.porcentagemPromocao)}%</span><p class="price">Por ${formatBRL(precoFinal(p))}</p>` : `<p class="price">${formatBRL(p.preco)}</p>`}<div class="mini-chips">${modalities}</div><p>${escapeHtml(p.descricao)}</p><p><strong>Principais objetivos:</strong><br>${escapeHtml(p.objetivos)}</p>${p.categoria?`<p><strong>Categoria:</strong> ${escapeHtml(p.categoria)}</p>`:''}<button class="btn-green" id="det-add">Adicionar ao carrinho</button></div></div>`;
  el('det-add').addEventListener('click', () => { adicionarCarrinho(p); fecharModal('modal-detalhes'); abrirCarrinho(); });
  abrirModal('modal-detalhes');
}

function renderPix(){
  const details = el('pix-details');
  const copy = el('copy-pix');
  if(settings.PIX_KEY){
    details.innerHTML = `<div><strong>Chave:</strong> ${escapeHtml(settings.PIX_KEY)}</div>${settings.PIX_HOLDER?`<div><strong>Favorecido:</strong> ${escapeHtml(settings.PIX_HOLDER)}</div>`:''}${settings.PIX_BANK?`<div><strong>Banco:</strong> ${escapeHtml(settings.PIX_BANK)}</div>`:''}<small>${escapeHtml(settings.PIX_INSTRUCTIONS || '')}</small>`;
    copy.style.display='inline-flex';
  } else {
    details.innerHTML = '<small>A chave Pix será informada no WhatsApp.</small>';
    copy.style.display='none';
  }
}

async function copiarPix(){
  if(!settings.PIX_KEY) return;
  await navigator.clipboard.writeText(settings.PIX_KEY);
  mostrarToast('Chave Pix copiada');
}

function adicionarCarrinho(p){
  const item = carrinho.find(i => i.id === p.id);
  if(item) item.quantidade++; else carrinho.push({...p, precoOriginal:p.preco, preco:precoFinal(p), quantidade:1});
  salvarCarrinho(); renderCarrinho(); mostrarToast('Produto adicionado ao carrinho');
}
function aumentar(id){const i=carrinho.find(x=>x.id===id);if(i)i.quantidade++;salvarCarrinho();renderCarrinho();}
function diminuir(id){const i=carrinho.find(x=>x.id===id);if(!i)return;i.quantidade--;if(i.quantidade<=0)carrinho=carrinho.filter(x=>x.id!==id);salvarCarrinho();renderCarrinho();}
function remover(id){carrinho=carrinho.filter(x=>x.id!==id);salvarCarrinho();renderCarrinho();}
function salvarCarrinho(){localStorage.setItem('primepeptide_carrinho',JSON.stringify(carrinho));}
function total(){return carrinho.reduce((s,i)=>s+(Number(i.preco)||0)*i.quantidade,0);}

function renderCarrinho(){
  const qtd=carrinho.reduce((s,i)=>s+i.quantidade,0);
  badge.textContent=qtd;badge.style.display=qtd?'inline-flex':'none';lista.innerHTML='';
  if(!carrinho.length)lista.innerHTML='<div class="empty">Seu carrinho está vazio.</div>';
  carrinho.forEach(item=>{
    const div=document.createElement('div');div.className='cart-item';
    div.innerHTML=`<img src="${escapeHtml(item.imagem)}" alt="${escapeHtml(item.nome)}"><div class="cart-item__main"><div class="cart-item__name">${escapeHtml(item.nome)}</div><div>${formatBRL(item.preco)} / un.</div><div class="qty"><button class="menos">−</button><span>${item.quantidade}</span><button class="mais">+</button><strong>${formatBRL(item.preco*item.quantidade)}</strong></div><button class="remove">Remover</button></div>`;
    div.querySelector('.mais').addEventListener('click',()=>aumentar(item.id));
    div.querySelector('.menos').addEventListener('click',()=>diminuir(item.id));
    div.querySelector('.remove').addEventListener('click',()=>remover(item.id));
    lista.appendChild(div);
  });
  totalEl.textContent=formatBRL(total());btnFinalizar.disabled=!carrinho.length;
}

async function finalizarPedido(){
  const customerName=el('cliente-nome').value.trim();
  const customerPhone=el('cliente-telefone').value.trim();
  if(!customerName){alert('Informe seu nome para gerar o pedido.');return;}
  const r=await fetch(`${API}/api/orders`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({customerName,customerPhone,items:carrinho})});
  const data=await r.json();
  if(!r.ok){alert(data.error||'Erro ao gerar pedido.');return;}
  carrinho=[];salvarCarrinho();renderCarrinho();fecharCarrinho();mostrarToast(`Pedido ${data.code} gerado!`);window.open(data.whatsappUrl,'_blank');
}

async function consultarPedido(){
  const code=el('track-code').value.trim().toUpperCase();
  const result=el('track-result');
  if(!code){result.innerHTML='<p class="muted">Digite o código do pedido.</p>';return;}
  result.innerHTML='<p class="muted">Consultando...</p>';
  const r=await fetch(`${API}/api/orders/${encodeURIComponent(code)}`);const data=await r.json();
  if(!r.ok){result.innerHTML='<div class="status-card">Pedido não encontrado.</div>';return;}
  const timeline=['Pedido recebido','Pedido em separação','Pedido enviado','Pedido finalizado'];
  const idx=timeline.indexOf(data.status);
  const steps=timeline.map((s,i)=>`<div class="step ${i<=idx?'done':''}"><span>${i+1}</span>${escapeHtml(s)}</div>`).join('');
  result.innerHTML=`<div class="status-card"><h3>${escapeHtml(data.codigo)}</h3><div class="payment-status"><strong>Status do pagamento:</strong> ${escapeHtml(data.statusPagamento)}</div><p class="muted">Este status é atualizado pela loja após a confirmação do Pix.</p><div class="timeline">${steps}</div><p><strong>Total:</strong> ${formatBRL(data.total)}</p>${data.observacoes?`<p><strong>Observações:</strong> ${escapeHtml(data.observacoes)}</p>`:''}</div>`;
}

function abrirCarrinho(){painel.classList.add('aberto');overlay.classList.add('aberto');}
function fecharCarrinho(){painel.classList.remove('aberto');overlay.classList.remove('aberto');}
function abrirModal(id){el(id).classList.add('aberto');el(id).setAttribute('aria-hidden','false');}
function fecharModal(id){el(id).classList.remove('aberto');el(id).setAttribute('aria-hidden','true');}
function labelTipo(t){return t==='promocao'?'Promoção':t==='combo'?'Combo':'Produto normal';}
function labelGrupo(g){return g==='hormonios'?'Hormônio':'Peptídeo';}
function precoFinal(p){const desconto=p.tipo==='promocao'?Math.max(0,Math.min(100,Number(p.porcentagemPromocao||0))):0;return Number(p.preco||0)*(1-desconto/100);}
function formatBRL(v){return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}
function escapeHtml(texto){const d=document.createElement('div');d.textContent=texto??'';return d.innerHTML;}
let toastTimer;function mostrarToast(t){toast.textContent=t;toast.classList.add('mostrar');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('mostrar'),2500);}
init();
