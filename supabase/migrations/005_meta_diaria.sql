-- FENIX APP · Meta diaria: obligaciones del mes y cuánto hay que producir por día.

create table public.obligaciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre text not null,
  tipo text not null default 'otro'
    check (tipo in ('casa', 'servicios', 'comida', 'deuda', 'vehiculo', 'familia', 'ahorro', 'otro')),
  monto_centavos bigint not null check (monto_centavos > 0),
  activa boolean not null default true,
  creado_en timestamptz not null default now()
);

alter table public.obligaciones enable row level security;
create policy "propias obligaciones" on public.obligaciones
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- Cuántos días a la semana trabaja y qué margen de seguridad quiere.
alter table public.perfiles
  add column dias_trabajo_semana integer not null default 6 check (dias_trabajo_semana between 1 and 7),
  add column margen_pct integer not null default 10 check (margen_pct between 0 and 100);
