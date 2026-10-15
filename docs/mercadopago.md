# Pix automático com Mercado Pago

Cada manicure usa a própria conta do Mercado Pago. O dinheiro cai direto nela.

## Peças
- `Banco-de-dados/007_mercadopago.sql`: ajusta o banco (rodar no SQL Editor).
- `Back-end/supabase/functions/criar-pix`: gera o QR Code do sinal.
- `Back-end/supabase/functions/webhook-mp`: o Mercado Pago avisa aqui que o Pix caiu e o horário confirma sozinho. Se alguém pagar depois do prazo, o valor é devolvido automaticamente.
- `Back-end/supabase/functions/devolver-sinal`: devolve o sinal quando o cancelamento é dentro do prazo.

## Segredos (Supabase > Edge Functions > Secrets)
- `MP_ACCESS_TOKEN`: Access Token de produção da conta da manicure (Mercado Pago > Seu negócio > Configurações > Credenciais).
- `MP_WEBHOOK_SECRET`: chave secreta do webhook (opcional, mas recomendada).
O Supabase já fornece `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` sozinho. Nunca colocar nada disso no GitHub.

## Webhook no Mercado Pago
Suas integrações > Webhooks > URL de produção: `https://<projeto>.supabase.co/functions/v1/webhook-mp`, evento "Pagamentos".

## Publicar
Em `Front_end/js/site.config.js`, trocar `provedor: 'teste'` por `provedor: 'mercadopago'`, e rodar `drop function dev_confirm_payment(text);`.
`webhook-mp` precisa ser publicada com "Verify JWT" desligado.
