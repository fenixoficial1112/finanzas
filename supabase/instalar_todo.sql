-- =====================================================================================
-- FENIX APP · INSTALACIÓN COMPLETA DE LA BASE DE DATOS
-- Pega TODO este archivo en Supabase → SQL Editor → New query → Run. Se ejecuta UNA sola vez
-- en un proyecto nuevo. Si algo falla, no se aplica nada (todo va en una sola transacción).
-- Es la unión de supabase/migrations/001 … 012.
-- =====================================================================================
begin;

-- ─────────────────────────────── 001_esquema_inicial.sql ───────────────────────────────
-- FENIX APP · Esquema inicial (fase 1-2)
-- Ejecutar una sola vez en Supabase > SQL Editor.
-- Los montos se guardan en CENTAVOS (bigint) para evitar errores de redondeo.

-- ========== Perfil del usuario ==========
create table public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text,
  moneda_principal text not null default 'DOP' check (moneda_principal in ('DOP', 'USD')),
  creado_en timestamptz not null default now()
);

-- ========== Tasas de cambio (pesos por 1 unidad de la moneda) ==========
create table public.tasas_cambio (
  usuario_id uuid not null references auth.users (id) on delete cascade,
  moneda text not null check (moneda in ('USD')),
  pesos_por_unidad numeric(12, 4) not null check (pesos_por_unidad > 0),
  actualizada_en timestamptz not null default now(),
  primary key (usuario_id, moneda)
);

-- ========== Cuentas (efectivo, banco, tarjeta, ahorro, inversión) ==========
create table public.cuentas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre text not null,
  tipo text not null check (tipo in ('efectivo', 'banco', 'tarjeta', 'ahorro', 'inversion')),
  moneda text not null default 'DOP' check (moneda in ('DOP', 'USD')),
  saldo_inicial_centavos bigint not null default 0,
  color text,
  archivada boolean not null default false,
  creado_en timestamptz not null default now()
);

-- ========== Categorías ==========
create table public.categorias (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre text not null,
  tipo text not null check (tipo in ('ingreso', 'gasto')),
  icono text,
  color text,
  padre_id uuid references public.categorias (id) on delete set null,
  unique (usuario_id, tipo, nombre)
);

-- ========== Movimientos ==========
create table public.movimientos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tipo text not null check (tipo in ('ingreso', 'gasto', 'transferencia')),
  monto_centavos bigint not null check (monto_centavos > 0),
  cuenta_id uuid not null references public.cuentas (id) on delete restrict,
  -- Solo transferencias:
  cuenta_destino_id uuid references public.cuentas (id) on delete restrict,
  monto_destino_centavos bigint check (monto_destino_centavos > 0),
  categoria_id uuid references public.categorias (id) on delete set null,
  fecha date not null default current_date,
  nota text,
  creado_en timestamptz not null default now(),
  constraint transferencia_valida check (
    (tipo = 'transferencia' and cuenta_destino_id is not null and cuenta_destino_id <> cuenta_id)
    or (tipo <> 'transferencia' and cuenta_destino_id is null and monto_destino_centavos is null)
  )
);
create index movimientos_usuario_fecha on public.movimientos (usuario_id, fecha desc);

-- ========== Seguridad: cada usuario solo ve lo suyo ==========
alter table public.perfiles enable row level security;
alter table public.tasas_cambio enable row level security;
alter table public.cuentas enable row level security;
alter table public.categorias enable row level security;
alter table public.movimientos enable row level security;

create policy "propio perfil" on public.perfiles
  for all using (id = auth.uid()) with check (id = auth.uid());
create policy "propias tasas" on public.tasas_cambio
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
create policy "propias cuentas" on public.cuentas
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
create policy "propias categorias" on public.categorias
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
create policy "propios movimientos" on public.movimientos
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- ========== Al registrarse: crear perfil y categorías iniciales ==========
create or replace function public.al_crear_usuario()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.perfiles (id) values (new.id);

  insert into public.categorias (usuario_id, nombre, tipo) values
    (new.id, 'InDrive', 'ingreso'),
    (new.id, 'Uber', 'ingreso'),
    (new.id, 'Propinas', 'ingreso'),
    (new.id, 'Otros ingresos', 'ingreso'),
    (new.id, 'Combustible', 'gasto'),
    (new.id, 'Mantenimiento vehículo', 'gasto'),
    (new.id, 'Lavado', 'gasto'),
    (new.id, 'Peajes y parqueo', 'gasto'),
    (new.id, 'Seguro y marbete', 'gasto'),
    (new.id, 'Comida', 'gasto'),
    (new.id, 'Casa y servicios', 'gasto'),
    (new.id, 'Teléfono e internet', 'gasto'),
    (new.id, 'Pago de deudas', 'gasto'),
    (new.id, 'Salud', 'gasto'),
    (new.id, 'Otros gastos', 'gasto');

  return new;
end;
$$;

create trigger crear_usuario_fenix
  after insert on auth.users
  for each row execute function public.al_crear_usuario();

-- ─────────────────────────────── 002_saldos.sql ───────────────────────────────
-- FENIX APP · Fase 2: saldo calculado de cada cuenta.
-- El saldo no se guarda: es saldo inicial + ingresos − gastos ± transferencias.
-- security_invoker hace que la vista respete la seguridad por usuario (RLS).

create or replace view public.saldos_cuentas
with (security_invoker = true) as
select
  c.id as cuenta_id,
  c.saldo_inicial_centavos + coalesce(sum(
    case
      when m.tipo = 'ingreso' then m.monto_centavos
      when m.tipo = 'gasto' then -m.monto_centavos
      when m.tipo = 'transferencia' and m.cuenta_id = c.id then -m.monto_centavos
      when m.tipo = 'transferencia' and m.cuenta_destino_id = c.id
        then coalesce(m.monto_destino_centavos, m.monto_centavos)
      else 0
    end
  ), 0)::bigint as saldo_centavos
from public.cuentas c
left join public.movimientos m
  on m.cuenta_id = c.id or m.cuenta_destino_id = c.id
group by c.id;

-- Un movimiento solo puede usar cuentas y categorías del mismo usuario.
create or replace function public.validar_movimiento()
returns trigger
language plpgsql
as $$
begin
  if not exists (select 1 from public.cuentas where id = new.cuenta_id and usuario_id = new.usuario_id) then
    raise exception 'Cuenta no válida';
  end if;
  if new.cuenta_destino_id is not null and not exists (
    select 1 from public.cuentas where id = new.cuenta_destino_id and usuario_id = new.usuario_id
  ) then
    raise exception 'Cuenta destino no válida';
  end if;
  if new.categoria_id is not null and not exists (
    select 1 from public.categorias
    where id = new.categoria_id and usuario_id = new.usuario_id and tipo = new.tipo
  ) then
    raise exception 'Categoría no válida para este tipo de movimiento';
  end if;
  return new;
end;
$$;

create trigger validar_movimiento
  before insert or update on public.movimientos
  for each row execute function public.validar_movimiento();

-- ─────────────────────────────── 003_jornadas.sql ───────────────────────────────
-- FENIX APP · Fase 3: jornadas de InDrive / Uber.
-- Una jornada guarda km, horas y lo ganado por plataforma. Al guardarla se crean
-- automáticamente los movimientos (ingresos, comisiones y gastos del día).

-- ========== Plataformas (InDrive, Uber, …) ==========
create table public.plataformas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre text not null,
  comision_pct numeric(5, 2) not null default 0 check (comision_pct >= 0 and comision_pct < 100),
  categoria_id uuid references public.categorias (id) on delete set null,
  activa boolean not null default true,
  unique (usuario_id, nombre)
);

-- ========== Jornadas ==========
create table public.jornadas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  fecha date not null,
  minutos integer not null default 0 check (minutos >= 0 and minutos <= 1440),
  km_inicial integer check (km_inicial >= 0),
  km_final integer check (km_final >= 0),
  cuenta_efectivo_id uuid references public.cuentas (id) on delete restrict,
  cuenta_app_id uuid references public.cuentas (id) on delete restrict,
  nota text,
  creado_en timestamptz not null default now(),
  constraint km_validos check (km_final is null or km_inicial is null or km_final >= km_inicial)
);
create index jornadas_usuario_fecha on public.jornadas (usuario_id, fecha desc);

create table public.jornada_plataformas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  jornada_id uuid not null references public.jornadas (id) on delete cascade,
  plataforma_id uuid not null references public.plataformas (id) on delete restrict,
  viajes integer not null default 0 check (viajes >= 0),
  efectivo_centavos bigint not null default 0 check (efectivo_centavos >= 0),
  app_centavos bigint not null default 0 check (app_centavos >= 0),
  comision_centavos bigint not null default 0 check (comision_centavos >= 0)
);

-- Los movimientos creados por una jornada quedan enlazados a ella.
alter table public.movimientos
  add column jornada_id uuid references public.jornadas (id) on delete cascade,
  add column origen text check (origen in ('jornada_ingreso', 'jornada_comision', 'jornada_gasto'));

-- ========== Seguridad ==========
alter table public.plataformas enable row level security;
alter table public.jornadas enable row level security;
alter table public.jornada_plataformas enable row level security;

create policy "propias plataformas" on public.plataformas
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
create policy "propias jornadas" on public.jornadas
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
create policy "propias jornada_plataformas" on public.jornada_plataformas
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- ========== Resumen por jornada ==========
create or replace view public.jornadas_resumen
with (security_invoker = true) as
select
  j.id, j.fecha, j.minutos, j.km_inicial, j.km_final, j.nota,
  case when j.km_final is not null and j.km_inicial is not null then j.km_final - j.km_inicial end as km,
  coalesce(p.viajes, 0)::integer as viajes,
  coalesce(p.bruto, 0)::bigint as bruto_centavos,
  coalesce(p.comision, 0)::bigint as comision_centavos,
  coalesce(g.gastos, 0)::bigint as gastos_centavos,
  (coalesce(p.bruto, 0) - coalesce(p.comision, 0) - coalesce(g.gastos, 0))::bigint as neto_centavos
from public.jornadas j
left join (
  select jornada_id, sum(viajes) as viajes,
         sum(efectivo_centavos + app_centavos) as bruto, sum(comision_centavos) as comision
  from public.jornada_plataformas group by jornada_id
) p on p.jornada_id = j.id
left join (
  select jornada_id, sum(monto_centavos) as gastos
  from public.movimientos where origen = 'jornada_gasto' group by jornada_id
) g on g.jornada_id = j.id;

-- ========== Guardar una jornada completa (crear o editar) ==========
-- p = { id?, fecha, minutos, km_inicial, km_final, nota, cuenta_efectivo_id, cuenta_app_id,
--       plataformas: [{plataforma_id, viajes, efectivo_centavos, app_centavos, comision_centavos}],
--       gastos: [{categoria_id, monto_centavos, cuenta_id, nota}] }
create or replace function public.guardar_jornada(p jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_fecha date := (p ->> 'fecha')::date;
  v_efectivo uuid := nullif(p ->> 'cuenta_efectivo_id', '')::uuid;
  v_app uuid := nullif(p ->> 'cuenta_app_id', '')::uuid;
  v_cat_comision uuid;
  r jsonb;
  v_plat record;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if v_efectivo is null then raise exception 'Elige la cuenta donde guardas el efectivo'; end if;
  if not exists (select 1 from cuentas where id = v_efectivo)
     or (v_app is not null and not exists (select 1 from cuentas where id = v_app)) then
    raise exception 'Cuenta no válida';
  end if;
  if exists (select 1 from cuentas where id in (v_efectivo, v_app) and moneda <> 'DOP') then
    raise exception 'Las cuentas de la jornada deben ser en pesos (RD$)';
  end if;

  if v_id is null then
    insert into jornadas (fecha, minutos, km_inicial, km_final, cuenta_efectivo_id, cuenta_app_id, nota)
    values (v_fecha, coalesce((p ->> 'minutos')::int, 0), (p ->> 'km_inicial')::int, (p ->> 'km_final')::int,
            v_efectivo, v_app, nullif(trim(p ->> 'nota'), ''))
    returning id into v_id;
  else
    update jornadas set
      fecha = v_fecha, minutos = coalesce((p ->> 'minutos')::int, 0),
      km_inicial = (p ->> 'km_inicial')::int, km_final = (p ->> 'km_final')::int,
      cuenta_efectivo_id = v_efectivo, cuenta_app_id = v_app, nota = nullif(trim(p ->> 'nota'), '')
    where id = v_id;
    if not found then raise exception 'Jornada no encontrada'; end if;
    delete from jornada_plataformas where jornada_id = v_id;
    delete from movimientos where jornada_id = v_id;
  end if;

  select id into v_cat_comision from categorias where tipo = 'gasto' and nombre = 'Comisiones apps';
  if v_cat_comision is null then
    insert into categorias (nombre, tipo) values ('Comisiones apps', 'gasto') returning id into v_cat_comision;
  end if;

  for r in select * from jsonb_array_elements(coalesce(p -> 'plataformas', '[]'::jsonb)) loop
    select id, nombre, categoria_id into v_plat from plataformas where id = (r ->> 'plataforma_id')::uuid;
    if v_plat.id is null then raise exception 'Plataforma no válida'; end if;

    insert into jornada_plataformas (jornada_id, plataforma_id, viajes, efectivo_centavos, app_centavos, comision_centavos)
    values (v_id, v_plat.id, coalesce((r ->> 'viajes')::int, 0), coalesce((r ->> 'efectivo_centavos')::bigint, 0),
            coalesce((r ->> 'app_centavos')::bigint, 0), coalesce((r ->> 'comision_centavos')::bigint, 0));

    if coalesce((r ->> 'efectivo_centavos')::bigint, 0) > 0 then
      insert into movimientos (tipo, monto_centavos, cuenta_id, categoria_id, fecha, nota, jornada_id, origen)
      values ('ingreso', (r ->> 'efectivo_centavos')::bigint, v_efectivo, v_plat.categoria_id, v_fecha,
              v_plat.nombre || ' · efectivo', v_id, 'jornada_ingreso');
    end if;
    if coalesce((r ->> 'app_centavos')::bigint, 0) > 0 then
      if v_app is null then raise exception 'Elige la cuenta donde la app te deposita'; end if;
      insert into movimientos (tipo, monto_centavos, cuenta_id, categoria_id, fecha, nota, jornada_id, origen)
      values ('ingreso', (r ->> 'app_centavos')::bigint, v_app, v_plat.categoria_id, v_fecha,
              v_plat.nombre || ' · pagado por la app', v_id, 'jornada_ingreso');
    end if;
    if coalesce((r ->> 'comision_centavos')::bigint, 0) > 0 then
      insert into movimientos (tipo, monto_centavos, cuenta_id, categoria_id, fecha, nota, jornada_id, origen)
      values ('gasto', (r ->> 'comision_centavos')::bigint, v_efectivo, v_cat_comision, v_fecha,
              'Comisión ' || v_plat.nombre, v_id, 'jornada_comision');
    end if;
  end loop;

  for r in select * from jsonb_array_elements(coalesce(p -> 'gastos', '[]'::jsonb)) loop
    insert into movimientos (tipo, monto_centavos, cuenta_id, categoria_id, fecha, nota, jornada_id, origen)
    values ('gasto', (r ->> 'monto_centavos')::bigint, coalesce(nullif(r ->> 'cuenta_id', '')::uuid, v_efectivo),
            nullif(r ->> 'categoria_id', '')::uuid, v_fecha, nullif(trim(r ->> 'nota'), ''), v_id, 'jornada_gasto');
  end loop;

  return v_id;
end;
$$;

-- ========== Plataformas y categoría de comisiones para usuarios ya existentes ==========
insert into public.categorias (usuario_id, nombre, tipo)
select id, 'Comisiones apps', 'gasto' from auth.users
on conflict (usuario_id, tipo, nombre) do nothing;

insert into public.plataformas (usuario_id, nombre, comision_pct, categoria_id)
select c.usuario_id, c.nombre, 0, c.id
from public.categorias c
where c.tipo = 'ingreso' and c.nombre in ('InDrive', 'Uber')
on conflict (usuario_id, nombre) do nothing;

-- ========== Usuarios nuevos: también reciben plataformas ==========
create or replace function public.al_crear_usuario()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.perfiles (id) values (new.id);

  insert into public.categorias (usuario_id, nombre, tipo) values
    (new.id, 'InDrive', 'ingreso'),
    (new.id, 'Uber', 'ingreso'),
    (new.id, 'Propinas', 'ingreso'),
    (new.id, 'Otros ingresos', 'ingreso'),
    (new.id, 'Combustible', 'gasto'),
    (new.id, 'Comisiones apps', 'gasto'),
    (new.id, 'Mantenimiento vehículo', 'gasto'),
    (new.id, 'Lavado', 'gasto'),
    (new.id, 'Peajes y parqueo', 'gasto'),
    (new.id, 'Seguro y marbete', 'gasto'),
    (new.id, 'Comida', 'gasto'),
    (new.id, 'Casa y servicios', 'gasto'),
    (new.id, 'Teléfono e internet', 'gasto'),
    (new.id, 'Pago de deudas', 'gasto'),
    (new.id, 'Salud', 'gasto'),
    (new.id, 'Otros gastos', 'gasto');

  insert into public.plataformas (usuario_id, nombre, comision_pct, categoria_id)
  select new.id, nombre, 0, id from public.categorias
  where usuario_id = new.id and tipo = 'ingreso' and nombre in ('InDrive', 'Uber');

  return new;
end;
$$;

-- ─────────────────────────────── 004_vehiculo.sql ───────────────────────────────
-- FENIX APP · Fase 4: vehículo, combustible, mantenimientos, recordatorios y documentos.

create table public.vehiculos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  marca text not null,
  modelo text not null,
  anio integer check (anio between 1950 and 2100),
  placa text,
  km_registro integer not null default 0 check (km_registro >= 0),
  combustible text not null default 'gasolina_regular'
    check (combustible in ('gasolina_regular', 'gasolina_premium', 'gasoil', 'glp', 'electrico', 'hibrido')),
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

create table public.cargas_combustible (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  vehiculo_id uuid not null references public.vehiculos (id) on delete cascade,
  fecha date not null default current_date,
  galones numeric(8, 3) not null check (galones > 0),
  total_centavos bigint not null check (total_centavos > 0),
  km integer check (km >= 0),
  tanque_lleno boolean not null default false,
  cuenta_id uuid references public.cuentas (id) on delete set null,
  nota text,
  creado_en timestamptz not null default now()
);
create index cargas_vehiculo_fecha on public.cargas_combustible (vehiculo_id, fecha desc);

create table public.mantenimientos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  vehiculo_id uuid not null references public.vehiculos (id) on delete cascade,
  tipo text not null,
  fecha date not null default current_date,
  km integer check (km >= 0),
  costo_centavos bigint not null default 0 check (costo_centavos >= 0),
  cuenta_id uuid references public.cuentas (id) on delete set null,
  taller text,
  nota text,
  creado_en timestamptz not null default now()
);
create index mantenimientos_vehiculo_fecha on public.mantenimientos (vehiculo_id, fecha desc);

create table public.recordatorios (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  vehiculo_id uuid not null references public.vehiculos (id) on delete cascade,
  tipo text not null,
  cada_km integer check (cada_km > 0),
  cada_meses integer check (cada_meses > 0),
  ultimo_km integer,
  ultima_fecha date,
  constraint recordatorio_con_intervalo check (cada_km is not null or cada_meses is not null),
  unique (vehiculo_id, tipo)
);

create table public.documentos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  vehiculo_id uuid references public.vehiculos (id) on delete cascade,
  tipo text not null check (tipo in ('seguro', 'marbete', 'licencia', 'matricula', 'otro')),
  nombre text,
  vence date not null,
  nota text
);

-- Gastos automáticos: cada carga o mantenimiento con cuenta crea su movimiento.
alter table public.movimientos
  add column carga_id uuid references public.cargas_combustible (id) on delete cascade,
  add column mantenimiento_id uuid references public.mantenimientos (id) on delete cascade;
alter table public.movimientos drop constraint if exists movimientos_origen_check;
alter table public.movimientos add constraint movimientos_origen_check
  check (origen in ('jornada_ingreso', 'jornada_comision', 'jornada_gasto', 'combustible', 'mantenimiento'));

-- ========== Seguridad ==========
alter table public.vehiculos enable row level security;
alter table public.cargas_combustible enable row level security;
alter table public.mantenimientos enable row level security;
alter table public.recordatorios enable row level security;
alter table public.documentos enable row level security;

create policy "propios vehiculos" on public.vehiculos
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
create policy "propias cargas" on public.cargas_combustible
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
create policy "propios mantenimientos" on public.mantenimientos
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
create policy "propios recordatorios" on public.recordatorios
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
create policy "propios documentos" on public.documentos
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- Las filas hijas solo pueden apuntar a vehículos del mismo usuario.
create or replace function public.validar_vehiculo_propio()
returns trigger
language plpgsql
as $$
begin
  if new.vehiculo_id is not null and not exists (
    select 1 from public.vehiculos where id = new.vehiculo_id and usuario_id = new.usuario_id
  ) then
    raise exception 'Vehículo no válido';
  end if;
  return new;
end;
$$;

create trigger validar_vehiculo before insert or update on public.cargas_combustible
  for each row execute function public.validar_vehiculo_propio();
create trigger validar_vehiculo before insert or update on public.mantenimientos
  for each row execute function public.validar_vehiculo_propio();
create trigger validar_vehiculo before insert or update on public.recordatorios
  for each row execute function public.validar_vehiculo_propio();
create trigger validar_vehiculo before insert or update on public.documentos
  for each row execute function public.validar_vehiculo_propio();

-- ========== Km actual del vehículo ==========
-- El mayor km conocido: el de registro, jornadas, cargas o mantenimientos.
create or replace view public.vehiculos_km
with (security_invoker = true) as
select v.id as vehiculo_id,
  greatest(
    v.km_registro,
    coalesce((select max(j.km_final) from public.jornadas j where j.usuario_id = v.usuario_id), 0),
    coalesce((select max(c.km) from public.cargas_combustible c where c.vehiculo_id = v.id), 0),
    coalesce((select max(m.km) from public.mantenimientos m where m.vehiculo_id = v.id), 0)
  ) as km_actual
from public.vehiculos v;

-- ========== Movimientos automáticos ==========
create or replace function public.sincronizar_gasto_vehiculo()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_cat uuid;
  v_origen text := case when tg_table_name = 'cargas_combustible' then 'combustible' else 'mantenimiento' end;
  v_nombre_cat text := case when tg_table_name = 'cargas_combustible' then 'Combustible' else 'Mantenimiento vehículo' end;
  v_monto bigint;
  v_nota text;
begin
  if tg_table_name = 'cargas_combustible' then
    delete from movimientos where carga_id = new.id;
    v_monto := new.total_centavos;
    v_nota := coalesce(nullif(new.nota, ''), trim(trailing '.' from trim(trailing '0' from new.galones::text)) || ' gal');
  else
    delete from movimientos where mantenimiento_id = new.id;
    v_monto := new.costo_centavos;
    v_nota := new.tipo || coalesce(' · ' || nullif(new.taller, ''), '');
  end if;

  if new.cuenta_id is null or v_monto <= 0 then
    return new;
  end if;
  if exists (select 1 from cuentas where id = new.cuenta_id and moneda <> 'DOP') then
    raise exception 'Elige una cuenta en pesos (RD$) para este gasto';
  end if;

  select id into v_cat from categorias where usuario_id = new.usuario_id and tipo = 'gasto' and nombre = v_nombre_cat;
  if v_cat is null then
    insert into categorias (usuario_id, nombre, tipo) values (new.usuario_id, v_nombre_cat, 'gasto') returning id into v_cat;
  end if;

  insert into movimientos (usuario_id, tipo, monto_centavos, cuenta_id, categoria_id, fecha, nota, origen, carga_id, mantenimiento_id)
  values (new.usuario_id, 'gasto', v_monto, new.cuenta_id, v_cat, new.fecha, v_nota, v_origen,
          case when v_origen = 'combustible' then new.id end,
          case when v_origen = 'mantenimiento' then new.id end);
  return new;
end;
$$;

create trigger gasto_combustible after insert or update on public.cargas_combustible
  for each row execute function public.sincronizar_gasto_vehiculo();
create trigger gasto_mantenimiento after insert or update on public.mantenimientos
  for each row execute function public.sincronizar_gasto_vehiculo();

-- Al registrar un mantenimiento, su recordatorio vuelve a empezar desde ese km/fecha.
create or replace function public.reiniciar_recordatorio()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update recordatorios r set
    ultimo_km = coalesce(new.km, r.ultimo_km),
    ultima_fecha = new.fecha
  where r.vehiculo_id = new.vehiculo_id
    and lower(r.tipo) = lower(new.tipo)
    and (
      (new.km is not null and (r.ultimo_km is null or new.km >= r.ultimo_km))
      or (new.km is null and (r.ultima_fecha is null or new.fecha >= r.ultima_fecha))
    );
  return new;
end;
$$;

create trigger reiniciar_recordatorio after insert or update on public.mantenimientos
  for each row execute function public.reiniciar_recordatorio();

-- Recordatorios iniciales al registrar un vehículo (intervalos generales; cada quien los ajusta).
create or replace function public.recordatorios_iniciales()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  insert into recordatorios (usuario_id, vehiculo_id, tipo, cada_km, cada_meses, ultimo_km, ultima_fecha) values
    (new.usuario_id, new.id, 'Cambio de aceite', 5000, 6, new.km_registro, current_date),
    (new.usuario_id, new.id, 'Rotación de gomas', 10000, null, new.km_registro, current_date),
    (new.usuario_id, new.id, 'Filtro de aire', 15000, null, new.km_registro, current_date),
    (new.usuario_id, new.id, 'Pastillas de freno', 20000, null, new.km_registro, current_date);
  return new;
end;
$$;

create trigger recordatorios_iniciales after insert on public.vehiculos
  for each row execute function public.recordatorios_iniciales();

-- ─────────────────────────────── 005_meta_diaria.sql ───────────────────────────────
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

-- ─────────────────────────────── 006_deudas.sql ───────────────────────────────
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

-- ─────────────────────────────── 007_asesor_ia.sql ───────────────────────────────
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

-- ─────────────────────────────── 008_presupuesto.sql ───────────────────────────────
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

-- ─────────────────────────────── 009_metas.sql ───────────────────────────────
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

-- ─────────────────────────────── 010_inversiones.sql ───────────────────────────────
-- FENIX APP · Fase 9: inversiones en RD$ y US$.
-- Cada inversión tiene su propia cuenta (tipo 'inversion'). Depósitos y retiros son
-- transferencias entre cuentas; los rendimientos son ingresos; los cambios de valor de
-- mercado son "ajustes" (no cuentan en los ingresos/gastos del mes).

create table public.inversiones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre text not null,
  tipo text not null check (tipo in ('certificado', 'ahorro', 'fondo', 'bonos', 'cooperativa', 'acciones', 'otra')),
  entidad text,
  moneda text not null check (moneda in ('DOP', 'USD')),
  cuenta_id uuid not null unique references public.cuentas (id) on delete restrict,
  tasa_anual numeric(6, 2) check (tasa_anual >= 0 and tasa_anual <= 100),
  fecha_inicio date not null default current_date,
  fecha_vencimiento date,
  estado text not null default 'activa' check (estado in ('activa', 'cerrada')),
  nota text,
  creado_en timestamptz not null default now(),
  constraint vencimiento_valido check (fecha_vencimiento is null or fecha_vencimiento >= fecha_inicio)
);

alter table public.inversiones enable row level security;
create policy "propias inversiones" on public.inversiones
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

create or replace function public.validar_inversion()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.cuentas
    where id = new.cuenta_id and usuario_id = new.usuario_id and tipo = 'inversion' and moneda = new.moneda
  ) then
    raise exception 'La cuenta de la inversión no es válida';
  end if;
  return new;
end;
$$;
create trigger validar_inversion before insert or update on public.inversiones
  for each row execute function public.validar_inversion();

-- Enlace de movimientos (rendimientos y ajustes) con su inversión.
alter table public.movimientos
  add column inversion_id uuid references public.inversiones (id) on delete set null;
alter table public.movimientos drop constraint if exists movimientos_origen_check;
alter table public.movimientos add constraint movimientos_origen_check
  check (origen in ('jornada_ingreso', 'jornada_comision', 'jornada_gasto', 'combustible', 'mantenimiento',
                    'pago_deuda', 'aporte_meta', 'inversion_rendimiento', 'inversion_ajuste'));

-- ========== Crear una inversión (y su cuenta) en un solo paso ==========
-- p = { nombre, tipo, entidad, moneda, tasa_anual, fecha_inicio, fecha_vencimiento, nota,
--       monto_centavos, cuenta_origen_id }   (sin cuenta_origen_id = dinero que ya tenía invertido)
create or replace function public.crear_inversion(p jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_moneda text := p ->> 'moneda';
  v_monto bigint := coalesce((p ->> 'monto_centavos')::bigint, 0);
  v_origen uuid := nullif(p ->> 'cuenta_origen_id', '')::uuid;
  v_fecha date := coalesce((p ->> 'fecha_inicio')::date, current_date);
  v_cuenta uuid;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if v_monto < 0 then raise exception 'Monto no válido'; end if;
  if v_origen is not null and not exists (select 1 from cuentas where id = v_origen and moneda = v_moneda) then
    raise exception 'La cuenta de origen debe estar en la misma moneda que la inversión';
  end if;

  insert into cuentas (nombre, tipo, moneda, saldo_inicial_centavos)
  values (p ->> 'nombre', 'inversion', v_moneda, case when v_origen is null then v_monto else 0 end)
  returning id into v_cuenta;

  insert into inversiones (nombre, tipo, entidad, moneda, cuenta_id, tasa_anual, fecha_inicio, fecha_vencimiento, nota)
  values (p ->> 'nombre', p ->> 'tipo', nullif(trim(p ->> 'entidad'), ''), v_moneda, v_cuenta,
          nullif(p ->> 'tasa_anual', '')::numeric, v_fecha, nullif(p ->> 'fecha_vencimiento', '')::date,
          nullif(trim(p ->> 'nota'), ''))
  returning id into v_id;

  if v_origen is not null and v_monto > 0 then
    insert into movimientos (tipo, monto_centavos, cuenta_id, cuenta_destino_id, fecha, nota)
    values ('transferencia', v_monto, v_origen, v_cuenta, v_fecha, 'Inversión: ' || (p ->> 'nombre'));
  end if;
  return v_id;
end;
$$;

-- ─────────────────────────────── 011_tarjetas_y_frecuencias.sql ───────────────────────────────
-- FENIX APP · Tarjetas de crédito, pagos quincenales/semanales/diarios y préstamos callejeros.

alter table public.deudas
  add column frecuencia text not null default 'mensual' check (frecuencia in ('mensual', 'quincenal', 'semanal', 'diaria')),
  -- Quincenal: los dos días del mes (ej. 15 y 30). Semanal: día de la semana (0 = domingo … 6 = sábado).
  add column dia_pago_2 integer check (dia_pago_2 between 1 and 31),
  add column dia_semana integer check (dia_semana between 0 and 6),
  -- Tarjetas de crédito
  add column limite_credito_centavos bigint check (limite_credito_centavos > 0),
  add column dia_corte integer check (dia_corte between 1 and 31),
  -- Si la tarjeta está vinculada a una cuenta de tipo 'tarjeta', las compras se registran como gastos en
  -- esa cuenta y el saldo de la deuda es lo que debe esa cuenta.
  add column cuenta_tarjeta_id uuid unique references public.cuentas (id) on delete set null;

create or replace function public.validar_tarjeta_deuda()
returns trigger
language plpgsql
as $$
begin
  if new.cuenta_tarjeta_id is not null and not exists (
    select 1 from public.cuentas
    where id = new.cuenta_tarjeta_id and usuario_id = new.usuario_id and tipo = 'tarjeta' and moneda = 'DOP'
  ) then
    raise exception 'La cuenta vinculada debe ser una tarjeta tuya en pesos';
  end if;
  return new;
end;
$$;
create trigger validar_tarjeta_deuda before insert or update on public.deudas
  for each row execute function public.validar_tarjeta_deuda();

-- El saldo de una tarjeta vinculada es lo que debe su cuenta (saldo negativo de la cuenta).
create or replace view public.deudas_estado
with (security_invoker = true) as
select
  d.id as deuda_id,
  (case
    when d.cuenta_tarjeta_id is not null then greatest(0, -coalesce(sc.saldo_centavos, 0))
    else d.saldo_inicial_centavos
      + coalesce(sum(p.monto_centavos) filter (where p.tipo = 'cargo'), 0)
      - coalesce(sum(p.monto_centavos - p.interes_centavos) filter (where p.tipo = 'pago'), 0)
  end)::bigint as saldo_centavos,
  coalesce(sum(p.monto_centavos) filter (where p.tipo = 'pago'), 0)::bigint as pagado_centavos,
  (case
    when d.cuenta_tarjeta_id is not null then coalesce(sum(p.monto_centavos) filter (where p.tipo = 'cargo'), 0)
    else coalesce(sum(p.interes_centavos) filter (where p.tipo = 'pago'), 0)
  end)::bigint as intereses_pagados_centavos,
  coalesce(sum(p.monto_centavos) filter (where p.tipo = 'cargo'), 0)::bigint as cargos_centavos,
  max(p.fecha) filter (where p.tipo = 'pago') as ultimo_pago
from public.deudas d
left join public.pagos_deuda p on p.deuda_id = d.id
left join public.saldos_cuentas sc on sc.cuenta_id = d.cuenta_tarjeta_id
group by d.id, sc.saldo_centavos;

-- Pagos y cargos:
--  · deuda normal: el pago crea un gasto "Pago de deudas" (como antes); el cargo solo sube el saldo.
--  · tarjeta vinculada: el pago es una transferencia hacia la cuenta de la tarjeta (no es gasto: las
--    compras ya se registraron como gastos); el cargo (intereses, mora) es un gasto en la tarjeta.
create or replace function public.sincronizar_pago_deuda()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_cat uuid;
  v_deuda record;
begin
  delete from movimientos where pago_deuda_id = new.id;
  select nombre, cuenta_tarjeta_id into v_deuda from deudas where id = new.deuda_id;

  if v_deuda.cuenta_tarjeta_id is not null then
    if new.tipo = 'pago' then
      if new.cuenta_id is null then return new; end if;
      if new.cuenta_id = v_deuda.cuenta_tarjeta_id then raise exception 'Elige la cuenta desde donde pagas la tarjeta'; end if;
      if exists (select 1 from cuentas where id = new.cuenta_id and moneda <> 'DOP') then
        raise exception 'Elige una cuenta en pesos (RD$) para el pago';
      end if;
      insert into movimientos (usuario_id, tipo, monto_centavos, cuenta_id, cuenta_destino_id, fecha, nota, origen, pago_deuda_id)
      values (new.usuario_id, 'transferencia', new.monto_centavos, new.cuenta_id, v_deuda.cuenta_tarjeta_id, new.fecha,
              'Pago ' || v_deuda.nombre, 'pago_deuda', new.id);
    else
      select id into v_cat from categorias where usuario_id = new.usuario_id and tipo = 'gasto' and nombre = 'Intereses y cargos bancarios';
      if v_cat is null then
        insert into categorias (usuario_id, nombre, tipo) values (new.usuario_id, 'Intereses y cargos bancarios', 'gasto') returning id into v_cat;
      end if;
      insert into movimientos (usuario_id, tipo, monto_centavos, cuenta_id, categoria_id, fecha, nota, origen, pago_deuda_id)
      values (new.usuario_id, 'gasto', new.monto_centavos, v_deuda.cuenta_tarjeta_id, v_cat, new.fecha,
              coalesce(nullif(new.nota, ''), 'Intereses / cargos ' || v_deuda.nombre), 'pago_deuda', new.id);
    end if;
    return new;
  end if;

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
  insert into movimientos (usuario_id, tipo, monto_centavos, cuenta_id, categoria_id, fecha, nota, origen, pago_deuda_id)
  values (new.usuario_id, 'gasto', new.monto_centavos, new.cuenta_id, v_cat, new.fecha,
          'Pago ' || v_deuda.nombre || coalesce(' · ' || nullif(new.nota, ''), ''), 'pago_deuda', new.id);
  return new;
end;
$$;

-- ─────────────────────────────── 012_completar_usuarios.sql ───────────────────────────────
-- FENIX APP · Completa los datos iniciales de usuarios que se registraron antes de crear las tablas
-- (perfil, categorías y apps InDrive/Uber). Se puede ejecutar varias veces sin duplicar nada.

insert into public.perfiles (id)
select u.id from auth.users u
where not exists (select 1 from public.perfiles p where p.id = u.id);

insert into public.categorias (usuario_id, nombre, tipo)
select u.id, c.nombre, c.tipo
from auth.users u
cross join (values
  ('InDrive', 'ingreso'), ('Uber', 'ingreso'), ('Propinas', 'ingreso'), ('Otros ingresos', 'ingreso'),
  ('Combustible', 'gasto'), ('Comisiones apps', 'gasto'), ('Mantenimiento vehículo', 'gasto'), ('Lavado', 'gasto'),
  ('Peajes y parqueo', 'gasto'), ('Seguro y marbete', 'gasto'), ('Comida', 'gasto'), ('Casa y servicios', 'gasto'),
  ('Teléfono e internet', 'gasto'), ('Pago de deudas', 'gasto'), ('Salud', 'gasto'), ('Otros gastos', 'gasto')
) as c(nombre, tipo)
on conflict (usuario_id, tipo, nombre) do nothing;

insert into public.plataformas (usuario_id, nombre, comision_pct, categoria_id)
select c.usuario_id, c.nombre, 0, c.id
from public.categorias c
where c.tipo = 'ingreso' and c.nombre in ('InDrive', 'Uber')
on conflict (usuario_id, nombre) do nothing;

-- Que la API de Supabase vea las tablas nuevas de inmediato.
notify pgrst, 'reload schema';

commit;
