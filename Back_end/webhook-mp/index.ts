// O Mercado Pago avisa aqui quando um Pix é pago. Confirma o horário (ou devolve o dinheiro, se já era tarde).
// Publicar com "Verify JWT" DESLIGADO (o aviso vem do Mercado Pago, sem login).
import { createClient } from "npm:@supabase/supabase-js@2";

const MP = "https://api.mercadopago.com";
const auth = () => ({ Authorization: "Bearer " + Deno.env.get("MP_ACCESS_TOKEN") });

async function hmacHex(secret: string, text: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  try {
    const u = new URL(req.url);
    let body: any = {};
    try { body = await req.json(); } catch (_) { /* sem corpo */ }
    const type = body?.type ?? u.searchParams.get("type") ?? u.searchParams.get("topic");
    let id = String(body?.data?.id ?? u.searchParams.get("data.id") ?? u.searchParams.get("id") ?? "");
    if (type !== "payment" || !id) return new Response("ignorado", { status: 200 });

    // confere que o aviso veio mesmo do Mercado Pago (se a chave secreta estiver cadastrada)
    const secret = Deno.env.get("MP_WEBHOOK_SECRET");
    if (secret) {
      const sig = req.headers.get("x-signature") ?? "";
      const ts = /ts=([^,]+)/.exec(sig)?.[1];
      const v1 = /v1=([^,]+)/.exec(sig)?.[1];
      const reqId = req.headers.get("x-request-id") ?? "";
      const did = /^[a-zA-Z0-9]+$/.test(id) ? id.toLowerCase() : id;
      if (!ts || !v1 || (await hmacHex(secret, `id:${did};request-id:${reqId};ts:${ts};`)) !== v1) {
        return new Response("assinatura invalida", { status: 401 });
      }
    }

    // nunca confia no aviso: pergunta ao Mercado Pago o que de fato aconteceu
    const pr = await fetch(`${MP}/v1/payments/${id}`, { headers: auth() });
    if (!pr.ok) return new Response("mp indisponivel", { status: 500 });
    const p = await pr.json();
    if (p.status !== "approved" || !p.external_reference) return new Response("ok", { status: 200 });

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: b } = await sb.from("bookings").select("id, deposit, payment_ref, status").eq("id", p.external_reference).maybeSingle();
    if (!b) return new Response("ok", { status: 200 });
    if (b.payment_ref === id && b.status !== "pending") return new Response("ok", { status: 200 }); // aviso repetido

    let confirmado = false;
    if (Number(p.transaction_amount) >= Number(b.deposit)) {
      const { data, error } = await sb.rpc("confirm_payment", { p_booking: b.id, p_ref: id });
      if (error) { console.error(error); return new Response("erro", { status: 500 }); }
      confirmado = data === true;
    }
    if (!confirmado) {
      // pagou depois do prazo (horário já liberado) ou valor errado: devolve tudo
      const rr = await fetch(`${MP}/v1/payments/${id}/refunds`, {
        method: "POST",
        headers: { ...auth(), "Content-Type": "application/json", "X-Idempotency-Key": "refund-" + id },
        body: "{}",
      });
      if (!rr.ok) console.error("devolucao falhou", await rr.text());
    }
    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response("erro", { status: 500 });
  }
});
