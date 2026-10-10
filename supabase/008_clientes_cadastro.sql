-- Cadastro de clientes pela dona (para clientes de antes do site ou que trocaram de número).
-- Clientes de antes do site e cadastro feito pela dona no painel (aba Clientes).
-- Sem data de última visita: cliente fixa, liberada sempre. Com data: conta como uma visita, com os mesmos prazos.
alter table known_clients add column if not exists last_visit date;
alter table known_clients add column if not exists family text;      -- 'alongamento' ou 'gel' (vazio = não sei)
grant select, insert, update, delete on known_clients to authenticated;

create or replace function client_last_visit(p_phone text, p_at timestamptz)
returns table(visit_at timestamptz, family text)
language sql stable security definer as $$
  select v.visit_at, v.family from (
    select sl.starts_at as visit_at,
           (select sv.family from services sv where sv.id = any(b.service_ids) and sv.kind = 'principal' limit 1) as family
      from bookings b join slots sl on sl.id = b.slot_id
     where norm_phone(b.client_phone) = norm_phone(p_phone)
       and b.status in ('confirmed', 'done')
       and sl.starts_at < now() and sl.starts_at < p_at
       and exists (select 1 from services sv where sv.id = any(b.service_ids) and sv.kind = 'principal')
    union all
    select (k.last_visit + time '12:00') at time zone 'America/Sao_Paulo', k.family
      from known_clients k
     where norm_phone(k.phone) = norm_phone(p_phone) and k.last_visit is not null
       and (k.last_visit + time '12:00') at time zone 'America/Sao_Paulo' < p_at
  ) v order by v.visit_at desc limit 1;
$$;
revoke execute on function client_last_visit(text, timestamptz) from anon, authenticated;

create or replace function client_has_history(p_phone text, p_at timestamptz) returns boolean
language sql stable security definer as $$
  select exists (select 1 from known_clients k where norm_phone(k.phone) = norm_phone(p_phone) and k.last_visit is null)
      or exists (select 1 from client_last_visit(p_phone, p_at) lv
                  where p_at - lv.visit_at <= make_interval(days => (select maintenance_days from settings)));
$$;
revoke execute on function client_has_history(text, timestamptz) from anon, authenticated;

create or replace function create_booking(p_slot uuid, p_name text, p_phone text, p_services text[], p_note text default null)
returns table(booking_id uuid, token text, total numeric, deposit numeric, hold_until timestamptz)
language plpgsql security definer as $$
declare
  s settings%rowtype; v_total numeric := 0; v_dep numeric := 0; sv services%rowtype;
  v_id uuid; v_tok text; v_hold timestamptz; v_at timestamptz;
  lv record; v_diff interval; v_max interval; v_trusted boolean;
begin
  perform release_expired_holds();
  select * into s from settings;
  if length(trim(coalesce(p_name,''))) < 2 or length(regexp_replace(coalesce(p_phone,''), '\D', '', 'g')) < 10 then
    raise exception 'invalid_data';
  end if;

  select starts_at into v_at from slots where id = p_slot;

  -- cliente cadastrada pela dona sem data de última visita: liberada sempre, sem conferir prazos
  select exists (select 1 from known_clients k where norm_phone(k.phone) = norm_phone(p_phone) and k.last_visit is null) into v_trusted;

  for sv in select * from services where id = any(p_services) and active and needs_history loop
    if v_trusted then continue; end if;
    if not client_has_history(p_phone, v_at) then raise exception 'maintenance_not_allowed'; end if;
    select * into lv from client_last_visit(p_phone, v_at);
    if lv.visit_at is not null then
      v_diff := v_at - lv.visit_at;
      v_max  := make_interval(days => coalesce(sv.max_days, s.maintenance_days));
      if v_diff > make_interval(days => s.maintenance_days) then raise exception 'maintenance_not_allowed'; end if;
      if sv.family is not null and lv.family is not null and sv.family <> lv.family then
        raise exception 'maintenance_wrong_type_%', lv.family;
      end if;
      if v_diff > v_max then raise exception 'maintenance_use_over15'; end if;
      if sv.min_days > 0 and v_diff <= make_interval(days => sv.min_days) then raise exception 'maintenance_use_under15'; end if;
    end if;
  end loop;

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

grant execute on function create_booking(uuid, text, text, text[], text) to anon;
