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
