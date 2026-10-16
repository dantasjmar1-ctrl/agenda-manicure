// Cria a cobrança Pix do sinal no Mercado Pago e devolve o QR Code e o "copia e cola".
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
    const { token } = await req.json();
    if (!token) return json({ error: "token" }, 400);
    const url = Deno.env.get("SUPABASE_URL")!;
    const sb = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: b, error: qe } = await sb.from("bookings")
      .select("id, deposit, status, slots(held_until)").eq("token", token).maybeSingle();
    if (qe) { console.error("ERRO consulta:", JSON.stringify(qe)); return json({ error: "consulta" }, 500); }
    if (!b) { console.error("ERRO: agendamento nao encontrado para o token"); return json({ error: "indisponivel" }, 404); }
    if (b.status !== "pending" || !(Number(b.deposit) > 0)) {
      console.error("ERRO: status=" + b.status + " sinal=" + b.deposit);
      return json({ error: "indisponivel" }, 404);
    }

    // vence junto com o prazo do horário (mínimo 1 minuto à frente), no fuso -03:00
    const sl: any = Array.isArray((b as any).slots) ? (b as any).slots[0] : (b as any).slots;
    const held = new Date(sl?.held_until ?? Date.now() + 15 * 60000).getTime();
    const exp = new Date(Math.max(held, Date.now() + 60000) - 3 * 3600000).toISOString().replace("Z", "-03:00");

    const r = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + Deno.env.get("MP_ACCESS_TOKEN"),
        "Content-Type": "application/json",
        "X-Idempotency-Key": b.id,
      },
      body: JSON.stringify({
        transaction_amount: Number(b.deposit),
        description: "Sinal de agendamento",
        payment_method_id: "pix",
        payer: { email: "cliente@email.com" },
        external_reference: b.id,
        notification_url: url + "/functions/v1/webhook-mp",
        date_of_expiration: exp,
      }),
    });
    const p = await r.json();
    const td = p?.point_of_interaction?.transaction_data;
    if (!r.ok || !td) { console.error("ERRO Mercado Pago:", JSON.stringify(p)); return json({ error: "mp" }, 502); }
    return json({ qr: td.qr_code, qr_base64: td.qr_code_base64 });
  } catch (e) {
    console.error("ERRO:", String(e));
    return json({ error: "erro" }, 500);
  }
});
