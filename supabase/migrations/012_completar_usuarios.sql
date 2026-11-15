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
