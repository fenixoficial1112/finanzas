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
