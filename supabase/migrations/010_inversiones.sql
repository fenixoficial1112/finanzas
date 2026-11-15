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
