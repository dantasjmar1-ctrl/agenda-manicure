// Devolve o sinal por Pix quando o agendamento é cancelado dentro do prazo.
// A cliente chama com o token do próprio link; a dona chama com o login dela (booking_id).
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { token, booking_id } = await req.json();
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let q = sb.from("bookings").select("id, status, deposit_paid, payment_ref, refunded_at");
    if (token) {
      q = q.eq("token", token);
    } else if (booking_id) {
      const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
      const { data: u } = await sb.auth.getUser(jwt);
      const { data: o } = await sb.from("owner").select("owner_email");
      const email = u?.user?.email?.toLowerCase();
      if (!email || !(o ?? []).some((x: any) => String(x.owner_email).toLowerCase() === email)) return json({ error: "forbidden" }, 403);
      q = q.eq("id", booking_id);
    } else return json({ error: "dados" }, 400);

    const { data: b } = await q.maybeSingle();
    if (!b || b.status !== "refunded" || !b.deposit_paid) return json({ error: "sem_devolucao" }, 404);
    if (b.refunded_at) return json({ ok: true, ja: true });
    if (!b.payment_ref || !/^\d+$/.test(b.payment_ref)) return json({ error: "sem_pagamento_mp" }, 422);

    // "reserva" a devolução para não devolver duas vezes
    const { data: claim } = await sb.from("bookings").update({ refunded_at: new Date().toISOString() })
      .eq("id", b.id).is("refunded_at", null).select("id");
    if (!claim?.length) return json({ ok: true, ja: true });

    const r = await fetch(`https://api.mercadopago.com/v1/payments/${b.payment_ref}/refunds`, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + Deno.env.get("MP_ACCESS_TOKEN"),
        "Content-Type": "application/json",
        "X-Idempotency-Key": "refund-" + b.payment_ref,
      },
      body: "{}",
    });
    if (!r.ok) {
      console.error("devolucao falhou", await r.text());
      await sb.from("bookings").update({ refunded_at: null }).eq("id", b.id);
      return json({ error: "mp" }, 502);
    }
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: "erro" }, 500);
  }
});
