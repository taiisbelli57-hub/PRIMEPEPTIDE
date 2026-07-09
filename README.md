# PrimePeptide com Backend e Banco de Dados

Projeto PrimePeptide evoluído para usar:

- Frontend em HTML, CSS e JavaScript puro
- Backend em Node.js + Express
- Banco de dados SQLite
- Painel administrativo
- Cadastro/edição/exclusão de produtos no banco
- Pedidos salvos no banco
- Acompanhamento de pedido por código
- Finalização via WhatsApp com Pix

## Como rodar localmente

1. Instale o Node.js.
2. Abra o terminal na pasta do projeto.
3. Rode:

```bash
npm install
npm start
```

4. Acesse:

```text
http://localhost:3000
```

Admin:

```text
http://localhost:3000/admin
```

Usuário padrão:

```text
admin
```

Senha padrão:

```text
prime2026
```

## Onde fica o banco de dados

O banco SQLite será criado automaticamente em:

```text
data/primepeptide.sqlite
```

Os produtos iniciais são importados de:

```text
public/produtos.json
```

A importação inicial acontece apenas quando o banco ainda está vazio.

## Configurações

Copie `.env.example` para `.env` se quiser alterar usuário, senha, WhatsApp ou chave secreta.

Exemplo:

```text
PORT=3000
JWT_SECRET=troque_essa_chave_secreta
ADMIN_USER=admin
ADMIN_PASSWORD=prime2026
WHATSAPP_NUMBER=5519999999999
STORE_NAME=PrimePeptide
LOGO_URL=
```

Também é possível alterar WhatsApp e logo pelo painel admin.

## Publicação online

Para ficar online com backend, não use Netlify Drop para esta versão, porque Netlify Drop é ideal para site estático.

Use uma hospedagem que rode Node.js, como Render, Railway, VPS, Hostinger com Node.js, DigitalOcean ou similar.

## Observação importante

Agora o admin salva de verdade no banco SQLite. O pedido também fica salvo no banco. O cliente consegue acompanhar usando o código gerado, por exemplo `PP-20260709-1234`.
