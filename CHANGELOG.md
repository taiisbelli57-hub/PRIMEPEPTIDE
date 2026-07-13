
## 2.0.2 - Visualizações públicas e senhas no painel
- Indicadores de entradas movidos do dashboard administrativo para a loja.
- Nova área pública com acessos de hoje, visitantes únicos, total e último acesso.
- Administrador e Proprietário podem redefinir a própria senha na aba Segurança.
- Proprietário pode redefinir senhas de usuários diretamente na lista, sem prompt do navegador.
# Changelog

## v2.0.1 — Contador de acessos
- Contador privado no dashboard: acessos hoje, visitantes únicos, total e último acesso.
- Deduplicação de acessos do mesmo visitante por 30 minutos.
- Visitas com sessão administrativa não são contabilizadas.
- Proprietário pode ignorar o IP do próprio computador e remover seus acessos anteriores.
- Lista configurável de IPs ignorados.


## [2.0.0] - 2026-07-12
- Foundation consolidada com usuários Proprietário e Administrador.
- Auditoria protegida e exportação de backup pelo proprietário.
- Histórico/timeline de status dos pedidos.
- Controle opcional de estoque com validação transacional.
- Campos SKU, estoque mínimo, lançamento, peso e ordem de exibição.
- Configurações white-label adicionais, SEO básico, robots, sitemap e páginas 404/500.
- Checklist oficial de publicação e validação obrigatória de JWT em produção.


## Final 1.3 — Segurança e acabamento
- Correção definitiva do alinhamento das imagens no mobile.
- Login administrativo separado do painel após autenticação.
- Cores dinâmicas para status do pedido e pagamento.
- Dois ou mais usuários administrativos com acessos individuais.
- Perfis Proprietário e Administrador.
- Troca da própria senha e senha temporária obrigatória para novos usuários.
- Bloqueio de usuários e encerramento das sessões após alteração de acesso.
- Registro de auditoria com usuário, ação, data, IP e dispositivo.
- Auditoria de produtos, pedidos, configurações, usuários, login e senhas.
- Logs de auditoria não podem ser apagados pelo painel.

## Final 1.0
- Redesign da loja e do painel.
- PostgreSQL/Neon, Render e gestão de produtos e pedidos.
