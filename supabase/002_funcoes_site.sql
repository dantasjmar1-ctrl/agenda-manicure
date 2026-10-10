-- Complemento do schema.sql. Rodar uma vez no Editor SQL, depois do schema e do seed.

alter table bookings add column if not exists note text;

-- Horários livres para a cliente (libera antes os que ficaram segurados e venceram)
create or replace function public_slots()
returns table(id uuid, starts_at timestamptz)
language plpgsql security definer as $$
begin
  perform release_expired_holds();
  return query select s.id, s.starts_at from slots s
   where s.status = 'free' and s.starts_at > now() order by s.starts_at;
end $$;

-- Nova versão de create_booking: aceita observação e devolve até quando o horário fica segurado
drop function if exists create_booking(uuid,text,text,text[]);
create or replace function create_booking(p_slot uuid, p_name text, p_phone text, p_services text[], p_note text default null)
returns table(booking_id uuid, token text, total numeric, deposit numeric, hold_until timestamptz)
language plpgsql security definer as $$
declare
  s settings%rowtype; v_total numeric := 0; v_dep numeric := 0; sv services%rowtype;
  v_id uuid; v_tok text; v_hold timestamptz;
begin
  perform release_expired_holds();
  select * into s from settings;
  if length(trim(coalesce(p_name,''))) < 2 or length(regexp_replace(coalesce(p_phone,''), '\D', '', 'g')) < 10 then
    raise exception 'invalid_data';
  end if;
  v_hold := now() + make_interval(mins => s.hold_minutes);
  update slots set status = 'held', held_until = v_hold
   where id = p_slot and starts_at > now() and status = 'free';
  if not found then raise exception 'slot_unavailable'; end if;

  for sv in select * from services where id = any(p_services) and active loop
    v_total := v_total + sv.price;
    v_dep   := v_dep + round(sv.price * coalesce(sv.deposit_pct, s.default_deposit_pct) / 100);
  end loop;
  if v_total = 0 then raise exception 'no_services'; end if;

  insert into bookings(slot_id, client_name, client_phone, service_ids, total, deposit, status, note)
  values (p_slot, trim(p_name), p_phone, p_services, v_total, v_dep,
          case when v_dep = 0 then 'confirmed' else 'pending' end, nullif(trim(coalesce(p_note,'')), ''))
  returning bookings.id, bookings.token into v_id, v_tok;

  if v_dep = 0 then
    update slots set status = 'booked', held_until = null where id = p_slot;
    v_hold := null;
  end if;
  return query select v_id, v_tok, v_total, v_dep, v_hold;
end $$;
grant execute on function create_booking(uuid,text,text,text[],text) to anon;
grant execute on function public_slots() to anon;

-- Consulta pelo link pessoal, agora com observação e horário final de pagamento
drop function if exists get_booking(text);
create or replace function get_booking(p_token text)
returns table(id uuid, slot_id uuid, starts_at timestamptz, client_name text, service_ids text[], total numeric,
              deposit numeric, status text, can_free_change boolean, hold_until timestamptz)
language sql security definer as $$
  select b.id, b.slot_id, sl.starts_at, b.client_name, b.service_ids, b.total, b.deposit, b.status,
         sl.starts_at - now() >= make_interval(hours => (select cancel_hours from settings)),
         case when b.status = 'pending' then sl.held_until end
  from bookings b join slots sl on sl.id = b.slot_id where b.token = p_token;
$$;
grant execute on function get_booking(text) to anon;

-- Ações da dona
create or replace function owner_confirm_booking(p_booking uuid)
returns void language plpgsql security definer as $$
declare b bookings%rowtype;
begin
  if not is_owner() then raise exception 'forbidden'; end if;
  select * into b from bookings where id = p_booking and status = 'pending' for update;
  if not found then raise exception 'not_found'; end if;
  update bookings set status = 'confirmed', deposit_paid = true where id = b.id;
  update slots set status = 'booked', held_until = null where id = b.slot_id;
end $$;

-- p_refund true = sinal devolvido (refunded); false = dona fica com o sinal (forfeited)
create or replace function owner_cancel_booking(p_booking uuid, p_refund boolean)
returns void language plpgsql security definer as $$
declare b bookings%rowtype;
begin
  if not is_owner() then raise exception 'forbidden'; end if;
  select * into b from bookings where id = p_booking and status in ('pending','confirmed') for update;
  if not found then raise exception 'not_found'; end if;
  update bookings set status = case when b.status = 'pending' then 'cancelled'
                                    when p_refund then 'refunded' else 'forfeited' end where id = b.id;
  update slots set status = 'free', held_until = null where id = b.slot_id;
end $$;

revoke execute on function owner_confirm_booking(uuid) from anon;
revoke execute on function owner_cancel_booking(uuid, boolean) from anon;
grant execute on function owner_confirm_booking(uuid) to authenticated;
grant execute on function owner_cancel_booking(uuid, boolean) to authenticated;
