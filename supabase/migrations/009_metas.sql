-- FENIX APP · Fase 8: metas de ahorro a corto, mediano y largo plazo.
-- El plazo (corto < 1 año, mediano 1–5 años, largo > 5 años) se calcula con la fecha objetivo.

create table public.metas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre text not null,
  monto_objetivo_centavos bigint not null check (monto_objetivo_centavos > 0),
  moneda text not null default 'DOP' check (moneda in ('DOP', 'USD')),
  fecha_objetivo date not null,
  cuenta_id uuid references public.cuentas (id) on delete set null,
  incluir_en_meta boolean not null default false,
  estado text not null default 'activa' check (estado in ('activa', 'pausada', 'lograda')),
  creado_en timestamptz not null default now()
);

-- tipo 'aporte' suma a la meta; 'retiro' resta. Si se indica una cuenta de origen y la meta
-- tiene su propia cuenta, se crea una transferencia entre ambas.
create table public.aportes_meta (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  meta_id uuid not null references public.metas (id) on delete cascade,
  tipo text not null default 'aporte' check (tipo in ('aporte', 'retiro')),
  fecha date not null default current_date,
  monto_centavos bigint not null check (monto_centavos > 0),
  cuenta_id uuid references public.cuentas (id) on delete set null,
  nota text,
  creado_en timestamptz not null default now()
);
create index aportes_meta_meta_fecha on public.aportes_meta (meta_id, fecha desc);

alter table public.movimientos
  add column aporte_meta_id uuid references public.aportes_meta (id) on delete cascade;
alter table public.movimientos drop constraint if exists movimientos_origen_check;
alter table public.movimientos add constraint movimientos_origen_check
  check (origen in ('jornada_ingreso', 'jornada_comision', 'jornada_gasto', 'combustible', 'mantenimiento', 'pago_deuda', 'aporte_meta'));

alter table public.metas enable row level security;
alter table public.aportes_meta enable row level security;
create policy "propias metas" on public.metas
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
create policy "propios aportes_meta" on public.aportes_meta
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

create or replace function public.validar_meta_propia()
returns trigger
language plpgsql
as $$
begin
  if not exists (select 1 from public.metas where id = new.meta_id and usuario_id = new.usuario_id) then
    raise exception 'Meta no válida';
  end if;
  return new;
end;
$$;
create trigger validar_meta before insert or update on public.aportes_meta
  for each row execute function public.validar_meta_propia();

-- La cuenta de la meta, si tiene, debe ser del usuario y de la misma moneda.
create or replace function public.validar_cuenta_meta()
returns trigger
language plpgsql
as $$
begin
  if new.cuenta_id is not null and not exists (
    select 1 from public.cuentas where id = new.cuenta_id and usuario_id = new.usuario_id and moneda = new.moneda
  ) then
    raise exception 'La cuenta de la meta debe ser tuya y en la misma moneda que la meta';
  end if;
  return new;
end;
$$;
create trigger validar_cuenta_meta before insert or update on public.metas
  for each row execute function public.validar_cuenta_meta();

create or replace view public.metas_estado
with (security_invoker = true) as
select
  m.id as meta_id,
  coalesce(sum(case when a.tipo = 'aporte' then a.monto_centavos else -a.monto_centavos end), 0)::bigint as ahorrado_centavos,
  max(a.fecha) filter (where a.tipo = 'aporte') as ultimo_aporte
from public.metas m
left join public.aportes_meta a on a.meta_id = m.id
group by m.id;

-- Transferencia automática entre la cuenta de origen y la cuenta de la meta.
create or replace function public.sincronizar_aporte_meta()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_meta record;
  v_origen_moneda text;
begin
  delete from movimientos where aporte_meta_id = new.id;
  select nombre, cuenta_id, moneda into v_meta from metas where id = new.meta_id;
  if new.cuenta_id is null or v_meta.cuenta_id is null or new.cuenta_id = v_meta.cuenta_id then
    return new;
  end if;
  select moneda into v_origen_moneda from cuentas where id = new.cuenta_id;
  if v_origen_moneda is distinct from v_meta.moneda then
    raise exception 'La cuenta debe estar en la misma moneda que la meta';
  end if;

  insert into movimientos (usuario_id, tipo, monto_centavos, cuenta_id, cuenta_destino_id, fecha, nota, origen, aporte_meta_id)
  values (
    new.usuario_id, 'transferencia', new.monto_centavos,
    case when new.tipo = 'aporte' then new.cuenta_id else v_meta.cuenta_id end,
    case when new.tipo = 'aporte' then v_meta.cuenta_id else new.cuenta_id end,
    new.fecha,
    (case when new.tipo = 'aporte' then 'Aporte a meta: ' else 'Retiro de meta: ' end) || v_meta.nombre,
    'aporte_meta', new.id
  );
  return new;
end;
$$;
create trigger transferencia_aporte_meta after insert or update on public.aportes_meta
  for each row execute function public.sincronizar_aporte_meta();
