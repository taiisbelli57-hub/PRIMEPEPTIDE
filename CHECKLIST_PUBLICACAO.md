# Checklist de publicação PrimePeptide

## Antes do deploy
- [ ] Trabalhar na branch `develop`
- [ ] Confirmar que `.env` não será enviado ao GitHub
- [ ] Configurar `DATABASE_URL`, `JWT_SECRET`, `ADMIN_USER` e `ADMIN_PASSWORD` no Render
- [ ] Executar `npm install`
- [ ] Executar `npm run check`
- [ ] Testar login, troca de senha e perfis
- [ ] Criar, editar e excluir um produto de teste
- [ ] Testar produto com controle de estoque
- [ ] Criar pedido e validar histórico/timeline
- [ ] Atualizar pagamento e status do pedido
- [ ] Exportar backup pelo perfil Proprietário
- [ ] Testar loja no mobile e desktop
- [ ] Validar Pix, WhatsApp, logo e banner

## Publicação
- [ ] Registrar versão no `CHANGELOG.md`
- [ ] Fazer merge aprovado de `develop` para `main`
- [ ] Acompanhar logs do Render após o deploy
- [ ] Testar `/api/health` em produção
- [ ] Realizar pedido de teste em produção
