-- Pix automático (Mercado Pago). Pode rodar mais de uma vez.
alter table bookings add column if not exists refunded_at timestamptz;

-- Agora devolve true quando confirmou e false quando não deu (reserva já cancelada/vencida).
-- O webhook usa isso para devolver o dinheiro de quem pagou depois do prazo.
drop function if exists confirm_payment(uuid, text);
create function confirm_payment(p_booking uuid, p_ref text)
returns boolean language plpgsql security definer as $$
declare b bookings%rowtype;
begin
  select * into b from bookings where id = p_booking and status = 'pending' for update;
  if not found then return false; end if;
  if not exists (select 1 from slots where id = b.slot_id and status = 'held') then return false; end if;
  update bookings set status = 'confirmed', deposit_paid = true, payment_ref = p_ref where id = b.id;
  update slots set status = 'booked', held_until = null where id = b.slot_id;
  return true;
end $$;
revoke execute on function confirm_payment(uuid, text) from public, anon, authenticated;
