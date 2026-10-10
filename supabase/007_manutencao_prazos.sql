-- Manutenção "até 15 dias" x "mais de 15 dias" e tipo certo (alongamento x gel),
-- conferidos pelo banco a partir da última visita da cliente (pelo WhatsApp). Não dá para burlar pela tela.

alter table services add column if not exists family text;        -- 'alongamento' ou 'gel' (vazio = serve para qualquer)
alter table services add column if not exists min_days int not null default 0;   -- manutenção: só vale se passaram MAIS que X dias (0 = sem mínimo)
alter table services add column if not exists max_days int;                      -- manutenção: só vale até X dias (vazio = usa settings.maintenance_days)

update services set family = 'alongamento' where id in ('f1','fibra','man15','man15m');
update services set family = 'gel'         where id in ('gel','gman15','gman15m');
update services set min_days = 0,  max_days = 15   where id in ('man15','gman15');
update services set min_days = 15, max_days = null where id in ('man15m','gman15m');

-- Última visita da cliente antes do novo horário (serviço principal, confirmado, já realizado)
create or replace function client_last_visit(p_phone text, p_at timestamptz)
returns table(visit_at timestamptz, family text)
language sql stable security definer as $$
  select sl.starts_at, (select sv.family from services sv where sv.id = any(b.service_ids) and sv.kind = 'principal' limit 1)
    from bookings b join slots sl on sl.id = b.slot_id
   where norm_phone(b.client_phone) = norm_phone(p_phone)
     and b.status in ('confirmed', 'done')
     and sl.starts_at < now() and sl.starts_at < p_at
     and exists (select 1 from services sv where sv.id = any(b.service_ids) and sv.kind = 'principal')
   order by sl.starts_at desc limit 1;
$$;
revoke execute on function client_last_visit(text, timestamptz) from anon, authenticated;

create or replace function create_booking(p_slot uuid, p_name text, p_phone text, p_services text[], p_note text default null)
returns table(booking_id uuid, token text, total numeric, deposit numeric, hold_until timestamptz)
language plpgsql security definer as $$
declare
  s settings%rowtype; v_total numeric := 0; v_dep numeric := 0; sv services%rowtype;
  v_id uuid; v_tok text; v_hold timestamptz; v_at timestamptz;
  lv record; v_diff interval; v_max interval; v_known boolean;
begin
  perform release_expired_holds();
  select * into s from settings;
  if length(trim(coalesce(p_name,''))) < 2 or length(regexp_replace(coalesce(p_phone,''), '\D', '', 'g')) < 10 then
    raise exception 'invalid_data';
  end if;

  select starts_at into v_at from slots where id = p_slot;

  for sv in select * from services where id = any(p_services) and active and needs_history loop
    if not client_has_history(p_phone, v_at) then raise exception 'maintenance_not_allowed'; end if;
    select exists (select 1 from known_clients k where norm_phone(k.phone) = norm_phone(p_phone)) into v_known;
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
