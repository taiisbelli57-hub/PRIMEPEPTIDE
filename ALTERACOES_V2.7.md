# Prime Peptide v2.7 — contador real de acessos

- Registra uma visita real no PostgreSQL/Neon ao abrir a página principal.
- Evita duplicidade do mesmo navegador durante 30 minutos.
- Atualiza os números “Hoje” e “Total” imediatamente após a entrada.
- Atualiza os contadores novamente a cada 60 segundos enquanto a página estiver aberta.
- Desativa cache na API de movimentações para impedir números antigos.
- Considera o dia no fuso horário de São Paulo.
- Mantém a opção administrativa para ignorar o IP do próprio responsável.
- Preserva produtos, pedidos, configurações e auditoria existentes no Neon.
