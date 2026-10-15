-- Conteúdo do site editável pela dona (textos, contatos, nail art, fotos). Rodar uma vez.

create table if not exists site_content (
  id         int primary key default 1 check (id = 1),
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into site_content (id, data) values (1, '{}') on conflict (id) do nothing;

alter table site_content enable row level security;
drop policy if exists content_read  on site_content;
drop policy if exists content_write on site_content;
create policy content_read  on site_content for select using (true);
create policy content_write on site_content for all using (is_owner()) with check (is_owner());
grant select on site_content to anon, authenticated;
grant insert, update, delete on site_content to authenticated;

-- Pasta pública de fotos: qualquer pessoa vê, só a dona envia, troca e apaga
insert into storage.buckets (id, name, public) values ('fotos', 'fotos', true) on conflict (id) do nothing;

drop policy if exists fotos_read   on storage.objects;
drop policy if exists fotos_insert on storage.objects;
drop policy if exists fotos_update on storage.objects;
drop policy if exists fotos_delete on storage.objects;
create policy fotos_read   on storage.objects for select using (bucket_id = 'fotos');
create policy fotos_insert on storage.objects for insert with check (bucket_id = 'fotos' and is_owner());
create policy fotos_update on storage.objects for update using (bucket_id = 'fotos' and is_owner());
create policy fotos_delete on storage.objects for delete using (bucket_id = 'fotos' and is_owner());
