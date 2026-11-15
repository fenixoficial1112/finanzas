-- FENIX APP · Base de datos local — versión 2: movimientos recurrentes.
-- Alquiler, sueldo, suscripciones, cuotas…: se anotan solos en su fecha o quedan pendientes
-- de confirmar, según prefiera el usuario.

CREATE TABLE recurrentes (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('ingreso', 'gasto', 'transferencia')),
  monto_centavos INTEGER NOT NULL CHECK (monto_centavos > 0),
  cuenta_id TEXT NOT NULL REFERENCES cuentas (id) ON DELETE CASCADE,
  cuenta_destino_id TEXT REFERENCES cuentas (id) ON DELETE CASCADE,
  categoria_id TEXT REFERENCES categorias (id) ON DELETE SET NULL,
  frecuencia TEXT NOT NULL CHECK (frecuencia IN ('mensual', 'quincenal', 'semanal', 'diaria', 'anual')),
  -- mensual/anual: dia_mes · quincenal: dia_mes y dia_mes_2 · semanal: dia_semana (0 = domingo) · anual: mes
  dia_mes INTEGER CHECK (dia_mes BETWEEN 1 AND 31),
  dia_mes_2 INTEGER CHECK (dia_mes_2 BETWEEN 1 AND 31),
  dia_semana INTEGER CHECK (dia_semana BETWEEN 0 AND 6),
  mes INTEGER CHECK (mes BETWEEN 1 AND 12),
  -- Próxima fecha en que toca; avanza cada vez que se registra o se salta.
  proxima_fecha TEXT NOT NULL,
  hasta TEXT,
  -- 1 = se registra sola en su fecha · 0 = queda pendiente para confirmar.
  automatico INTEGER NOT NULL DEFAULT 0,
  activa INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (
    (tipo = 'transferencia' AND cuenta_destino_id IS NOT NULL AND cuenta_destino_id <> cuenta_id)
    OR (tipo <> 'transferencia' AND cuenta_destino_id IS NULL)
  )
);

CREATE TRIGGER validar_recurrente BEFORE INSERT ON recurrentes
WHEN NEW.categoria_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM categorias WHERE id = NEW.categoria_id AND tipo = NEW.tipo)
BEGIN SELECT RAISE(ABORT, 'Categoría no válida para este tipo de movimiento'); END;

ALTER TABLE movimientos ADD COLUMN recurrente_id TEXT REFERENCES recurrentes (id) ON DELETE SET NULL;
