-- SÓ PARA TESTAR sem Pix de verdade. Qualquer pessoa com o link consegue "pagar".
-- NUNCA deixar isso no ar quando a Kailane começar a usar. Para remover:
--   drop function dev_confirm_payment(text);
create or replace function dev_confirm_payment(p_token text)
returns void language plpgsql security definer as $$
declare b bookings%rowtype;
begin
  select * into b from bookings where token = p_token and status = 'pending' for update;
  if not found then return; end if;
  update bookings set status = 'confirmed', deposit_paid = true, payment_ref = 'teste' where id = b.id;
  update slots set status = 'booked', held_until = null where id = b.slot_id;
end $$;
grant execute on function dev_confirm_payment(text) to anon;
