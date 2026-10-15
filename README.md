# agenda-manicure

Site de agendamento para manicures: catálogo, agendamento com sinal por Pix e painel da dona.
Um modelo único, usado por várias manicures. Cada uma tem a própria cópia, banco e conta de pagamento.

## Estrutura
```
Front_end/                     é a única pasta que vai para o Cloudflare Pages
  index.html, meu.html, painel.html   páginas: cliente, link pessoal, painel da dona
  css/, js/                    visual e lógica
  js/site.config.js            configuração de cada manicure (é o que muda entre clientes)
  Imagens/                     fotos e logo de cada manicure
Banco-de-dados/                SQL para rodar no SQL Editor do Supabase
Back-end/supabase/functions/   funções do servidor (Pix do Mercado Pago), coladas no Supabase
docs/                          documentação do projeto
```

## Ordem para montar um site novo
1. Criar projeto no Supabase e rodar, em Banco-de-dados, nesta ordem: `schema.sql`, `seed.sql`, `002`, `003`, `004`, `005`, `006` e `007_mercadopago.sql`. Depois, seguir `docs/mercadopago.md`.
2. Criar o login da dona em Authentication > Users (Auto Confirm User) e rodar `insert into owner values ('email-em-minusculas');`.
3. Preencher `Front_end/js/site.config.js` (nome, cores, serviços, URL e chave pública do Supabase) e trocar as fotos em `Front_end/Imagens/`.
4. Publicar no Cloudflare Pages arrastando só a pasta `Front_end`.
5. Antes de usar de verdade: `pagamento.provedor` em `mercadopago` e apagar `dev_confirm_payment` (ver `dev_pagamento_teste.sql`).

## Regras do projeto
- Nada de nome de cliente no código. Tudo que é de uma manicure fica em `site.config.js` e `Imagens/`.
- Senhas e chaves secretas nunca entram no GitHub. Só a URL e a chave pública do Supabase podem ficar em `site.config.js`.
- Commits pequenos, com mensagem clara.
