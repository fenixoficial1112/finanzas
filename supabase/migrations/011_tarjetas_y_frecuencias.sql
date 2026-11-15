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
