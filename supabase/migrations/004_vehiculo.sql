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
