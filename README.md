# agenda-manicure

Site de agendamento para manicures: catálogo, agendamento com sinal por Pix e painel da dona.
Um modelo único, usado por várias manicures. Cada uma tem a própria cópia, banco e conta de pagamento.

## Estrutura
```
index.html, meu.html, painel.html   páginas: cliente, link pessoal, painel da dona
css/, js/                           visual e lógica
config/                             configuração e imagens de cada manicure (é o que muda entre clientes)
supabase/                           banco: schema.sql, seed.sql, 002_funcoes_site.sql, 003_conteudo_site.sql, 004_clientes_manutencao.sql, 005_dias_fechados.sql, 006_horarios_automaticos.sql
docs/                               documentação do projeto
```

## Ordem para montar um site novo
1. Criar projeto no Supabase e rodar `schema.sql`, `seed.sql`, `002_funcoes_site.sql`, `003_conteudo_site.sql` e `004_clientes_manutencao.sql, 005_dias_fechados.sql, 006_horarios_automaticos.sql` (nessa ordem).
2. `insert into owner values ('email-da-dona')` e criar o mesmo e-mail em Authentication > Users.
3. Preencher `config/site.config.js` (nome, cores, serviços, URL e chave pública do Supabase).
4. Publicar na Vercel.
5. Antes de usar de verdade: trocar `pagamento.provedor` e apagar `dev_confirm_payment` (ver `dev_pagamento_teste.sql`).

## Regras do projeto
- Nada de nome de cliente no código. Tudo que é de uma manicure fica em `config/`.
- Senhas e chaves secretas nunca entram no GitHub (usar variáveis de ambiente). Só a URL e a chave pública do Supabase podem ficar em `config/`.
- Commits pequenos, com mensagem clara (ex.: `Adiciona tela de agendamento`).

## Status
Telas e banco prontos (testados com banco simulado). Falta: teste no Supabase real, Pix de verdade e publicação.
