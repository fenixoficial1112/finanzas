-- FENIX APP · Fase 6: conversaciones con el asesor IA.

create table public.conversaciones_ia (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  titulo text not null default 'Nueva conversación',
  creado_en timestamptz not null default now()
);

create table public.mensajes_ia (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  conversacion_id uuid not null references public.conversaciones_ia (id) on delete cascade,
  rol text not null check (rol in ('user', 'assistant')),
  contenido text not null check (length(contenido) between 1 and 20000),
  tokens_entrada integer,
  tokens_salida integer,
  creado_en timestamptz not null default now()
);
create index mensajes_ia_conversacion on public.mensajes_ia (conversacion_id, creado_en);
create index mensajes_ia_usuario_fecha on public.mensajes_ia (usuario_id, creado_en desc);

alter table public.conversaciones_ia enable row level security;
alter table public.mensajes_ia enable row level security;
create policy "propias conversaciones" on public.conversaciones_ia
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
create policy "propios mensajes" on public.mensajes_ia
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

create or replace function public.validar_conversacion_propia()
returns trigger
language plpgsql
as $$
begin
  if not exists (select 1 from public.conversaciones_ia where id = new.conversacion_id and usuario_id = new.usuario_id) then
    raise exception 'Conversación no válida';
  end if;
  return new;
end;
$$;
create trigger validar_conversacion before insert or update on public.mensajes_ia
  for each row execute function public.validar_conversacion_propia();
