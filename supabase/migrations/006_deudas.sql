-- FENIX APP · Fase 5: deudas, pagos y cargos.

create table public.deudas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre text not null,
  tipo text not null default 'otro' check (tipo in
    ('tarjeta', 'prestamo_personal', 'prestamo_vehiculo', 'prestamista', 'familiar', 'tienda', 'otro')),
  acreedor text,
  saldo_inicial_centavos bigint not null check (saldo_inicial_centavos >= 0),
  tasa_anual numeric(6, 2) not null default 0 check (tasa_anual >= 0 and tasa_anual <= 1000),
  cuota_centavos bigint not null default 0 check (cuota_centavos >= 0),
  dia_pago integer check (dia_pago between 1 and 31),
  incluir_en_meta boolean not null default true,
  pagada boolean not null default false,
  creado_en timestamptz not null default now()
);

-- tipo 'pago' baja el saldo (y crea un gasto); tipo 'cargo' lo sube (compras con la tarjeta, intereses, mora).
create table public.pagos_deuda (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  deuda_id uuid not null references public.deudas (id) on delete cascade,
  tipo text not null default 'pago' check (tipo in ('pago', 'cargo')),
  fecha date not null default current_date,
  monto_centavos bigint not null check (monto_centavos > 0),
  interes_centavos bigint not null default 0 check (interes_centavos >= 0),
  cuenta_id uuid references public.cuentas (id) on delete set null,
  nota text,
  creado_en timestamptz not null default now(),
  constraint interes_no_mayor check (interes_centavos <= monto_centavos)
);
create index pagos_deuda_deuda_fecha on public.pagos_deuda (deuda_id, fecha desc);

alter table public.movimientos
  add column pago_deuda_id uuid references public.pagos_deuda (id) on delete cascade;
alter table public.movimientos drop constraint if exists movimientos_origen_check;
alter table public.movimientos add constraint movimientos_origen_check
  check (origen in ('jornada_ingreso', 'jornada_comision', 'jornada_gasto', 'combustible', 'mantenimiento', 'pago_deuda'));

-- Preferencias del plan de deudas.
alter table public.perfiles
  add column estrategia_deudas text not null default 'avalancha' check (estrategia_deudas in ('avalancha', 'bola_nieve')),
  add column pago_extra_deudas_centavos bigint not null default 0 check (pago_extra_deudas_centavos >= 0);

-- ========== Seguridad ==========
alter table public.deudas enable row level security;
alter table public.pagos_deuda enable row level security;
create policy "propias deudas" on public.deudas
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
create policy "propios pagos_deuda" on public.pagos_deuda
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

create or replace function public.validar_deuda_propia()
returns trigger
language plpgsql
as $$
begin
  if not exists (select 1 from public.deudas where id = new.deuda_id and usuario_id = new.usuario_id) then
    raise exception 'Deuda no válida';
  end if;
  return new;
end;
$$;
create trigger validar_deuda before insert or update on public.pagos_deuda
  for each row execute function public.validar_deuda_propia();

-- ========== Estado de cada deuda ==========
create or replace view public.deudas_estado
with (security_invoker = true) as
select
  d.id as deuda_id,
  (d.saldo_inicial_centavos
    + coalesce(sum(p.monto_centavos) filter (where p.tipo = 'cargo'), 0)
    - coalesce(sum(p.monto_centavos - p.interes_centavos) filter (where p.tipo = 'pago'), 0))::bigint as saldo_centavos,
  coalesce(sum(p.monto_centavos) filter (where p.tipo = 'pago'), 0)::bigint as pagado_centavos,
  coalesce(sum(p.interes_centavos) filter (where p.tipo = 'pago'), 0)::bigint as intereses_pagados_centavos,
  coalesce(sum(p.monto_centavos) filter (where p.tipo = 'cargo'), 0)::bigint as cargos_centavos,
  max(p.fecha) filter (where p.tipo = 'pago') as ultimo_pago
from public.deudas d
left join public.pagos_deuda p on p.deuda_id = d.id
group by d.id;

-- ========== Cada pago crea su gasto ==========
create or replace function public.sincronizar_pago_deuda()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_cat uuid;
  v_nombre text;
begin
  delete from movimientos where pago_deuda_id = new.id;
  if new.tipo <> 'pago' or new.cuenta_id is null then
    return new;
  end if;
  if exists (select 1 from cuentas where id = new.cuenta_id and moneda <> 'DOP') then
    raise exception 'Elige una cuenta en pesos (RD$) para el pago';
  end if;

  select id into v_cat from categorias where usuario_id = new.usuario_id and tipo = 'gasto' and nombre = 'Pago de deudas';
  if v_cat is null then
    insert into categorias (usuario_id, nombre, tipo) values (new.usuario_id, 'Pago de deudas', 'gasto') returning id into v_cat;
  end if;
  select nombre into v_nombre from deudas where id = new.deuda_id;

  insert into movimientos (usuario_id, tipo, monto_centavos, cuenta_id, categoria_id, fecha, nota, origen, pago_deuda_id)
  values (new.usuario_id, 'gasto', new.monto_centavos, new.cuenta_id, v_cat, new.fecha,
          'Pago ' || v_nombre || coalesce(' · ' || nullif(new.nota, ''), ''), 'pago_deuda', new.id);
  return new;
end;
$$;

create trigger gasto_pago_deuda after insert or update on public.pagos_deuda
  for each row execute function public.sincronizar_pago_deuda();
