-- FENIX APP · Fase 7: presupuesto mensual por categoría y alertas.

create table public.presupuestos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  mes text not null check (mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  categoria_id uuid not null references public.categorias (id) on delete cascade,
  limite_centavos bigint not null check (limite_centavos > 0),
  unique (usuario_id, mes, categoria_id)
);
create index presupuestos_usuario_mes on public.presupuestos (usuario_id, mes);

alter table public.presupuestos enable row level security;
create policy "propios presupuestos" on public.presupuestos
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- Solo categorías de gasto del mismo usuario.
create or replace function public.validar_presupuesto()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.categorias where id = new.categoria_id and usuario_id = new.usuario_id and tipo = 'gasto'
  ) then
    raise exception 'Categoría no válida para el presupuesto';
  end if;
  return new;
end;
$$;
create trigger validar_presupuesto before insert or update on public.presupuestos
  for each row execute function public.validar_presupuesto();

-- % del presupuesto en que se avisa (80% por defecto).
alter table public.perfiles
  add column umbral_alerta_pct integer not null default 80 check (umbral_alerta_pct between 10 and 100);
