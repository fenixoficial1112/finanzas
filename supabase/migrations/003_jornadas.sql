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
