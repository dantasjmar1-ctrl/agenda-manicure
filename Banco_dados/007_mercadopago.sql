-- Pix automático (Mercado Pago). Pode rodar mais de uma vez.
alter table bookings add column if not exists refunded_at timestamptz;

-- Devolve true quando confirmou e false quando não deu. O webhook usa isso para devolver o dinheiro.
-- Confirma se o horário ainda está segurado para esta reserva OU se o prazo venceu mas ninguém pegou o horário
-- (assim quem paga um pouco atrasado não perde o horário).
drop function if exists confirm_payment(uuid, text);
create function confirm_payment(p_booking uuid, p_ref text)
returns boolean language plpgsql security definer as $$
declare b bookings%rowtype; sl slots%rowtype;
begin
  select * into b from bookings where id = p_booking and status in ('pending','cancelled') and not deposit_paid for update;
  if not found then return false; end if;
  select * into sl from slots where id = b.slot_id for update;
  if not ((b.status = 'pending' and sl.status = 'held') or (sl.status = 'free' and sl.starts_at > now())) then
    return false;
  end if;
  update bookings set status = 'confirmed', deposit_paid = true, payment_ref = p_ref where id = b.id;
  update slots set status = 'booked', held_until = null where id = b.slot_id;
  return true;
end $$;
revoke execute on function confirm_payment(uuid, text) from public, anon, authenticated;
