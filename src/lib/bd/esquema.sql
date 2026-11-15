-- FENIX APP · Base de datos local (SQLite) — versión 1.
-- Un solo usuario: todo se guarda en un archivo en la PC. Los montos van en CENTAVOS (enteros).
-- Las reglas que antes hacía la nube (validaciones, saldos y gastos automáticos) son vistas y triggers.

PRAGMA foreign_keys = ON;

-- ========== Preferencias (una sola fila) ==========
CREATE TABLE preferencias (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  dias_trabajo_semana INTEGER NOT NULL DEFAULT 6 CHECK (dias_trabajo_semana BETWEEN 1 AND 7),
  margen_pct INTEGER NOT NULL DEFAULT 10 CHECK (margen_pct BETWEEN 0 AND 100),
  estrategia_deudas TEXT NOT NULL DEFAULT 'avalancha' CHECK (estrategia_deudas IN ('avalancha', 'bola_nieve')),
  pago_extra_deudas_centavos INTEGER NOT NULL DEFAULT 0 CHECK (pago_extra_deudas_centavos >= 0),
  umbral_alerta_pct INTEGER NOT NULL DEFAULT 80 CHECK (umbral_alerta_pct BETWEEN 10 AND 100)
);
INSERT INTO preferencias (id) VALUES (1);

CREATE TABLE tasas_cambio (
  moneda TEXT PRIMARY KEY CHECK (moneda IN ('USD')),
  pesos_por_unidad REAL NOT NULL CHECK (pesos_por_unidad > 0),
  actualizada_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ========== Cuentas, categorías y movimientos ==========
CREATE TABLE cuentas (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('efectivo', 'banco', 'tarjeta', 'ahorro', 'inversion')),
  moneda TEXT NOT NULL DEFAULT 'DOP' CHECK (moneda IN ('DOP', 'USD')),
  saldo_inicial_centavos INTEGER NOT NULL DEFAULT 0,
  archivada INTEGER NOT NULL DEFAULT 0,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE categorias (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('ingreso', 'gasto')),
  UNIQUE (tipo, nombre)
);

INSERT INTO categorias (nombre, tipo) VALUES
  ('InDrive', 'ingreso'), ('Uber', 'ingreso'), ('Propinas', 'ingreso'), ('Otros ingresos', 'ingreso'),
  ('Combustible', 'gasto'), ('Comisiones apps', 'gasto'), ('Mantenimiento vehículo', 'gasto'), ('Lavado', 'gasto'),
  ('Peajes y parqueo', 'gasto'), ('Seguro y marbete', 'gasto'), ('Comida', 'gasto'), ('Casa y servicios', 'gasto'),
  ('Teléfono e internet', 'gasto'), ('Pago de deudas', 'gasto'), ('Salud', 'gasto'), ('Otros gastos', 'gasto');

CREATE TABLE plataformas (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  nombre TEXT NOT NULL UNIQUE,
  comision_pct REAL NOT NULL DEFAULT 0 CHECK (comision_pct >= 0 AND comision_pct < 100),
  categoria_id TEXT REFERENCES categorias (id) ON DELETE SET NULL,
  activa INTEGER NOT NULL DEFAULT 1
);
INSERT INTO plataformas (nombre, categoria_id)
  SELECT nombre, id FROM categorias WHERE tipo = 'ingreso' AND nombre IN ('InDrive', 'Uber');

-- ========== Jornadas ==========
CREATE TABLE jornadas (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  fecha TEXT NOT NULL,
  minutos INTEGER NOT NULL DEFAULT 0 CHECK (minutos BETWEEN 0 AND 1440),
  km_inicial INTEGER CHECK (km_inicial >= 0),
  km_final INTEGER CHECK (km_final >= 0),
  cuenta_efectivo_id TEXT REFERENCES cuentas (id) ON DELETE RESTRICT,
  cuenta_app_id TEXT REFERENCES cuentas (id) ON DELETE RESTRICT,
  nota TEXT,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (km_final IS NULL OR km_inicial IS NULL OR km_final >= km_inicial)
);
CREATE INDEX jornadas_fecha ON jornadas (fecha);

CREATE TABLE jornada_plataformas (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  jornada_id TEXT NOT NULL REFERENCES jornadas (id) ON DELETE CASCADE,
  plataforma_id TEXT NOT NULL REFERENCES plataformas (id) ON DELETE RESTRICT,
  viajes INTEGER NOT NULL DEFAULT 0 CHECK (viajes >= 0),
  efectivo_centavos INTEGER NOT NULL DEFAULT 0 CHECK (efectivo_centavos >= 0),
  app_centavos INTEGER NOT NULL DEFAULT 0 CHECK (app_centavos >= 0),
  comision_centavos INTEGER NOT NULL DEFAULT 0 CHECK (comision_centavos >= 0)
);

-- ========== Vehículo ==========
CREATE TABLE vehiculos (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  marca TEXT NOT NULL,
  modelo TEXT NOT NULL,
  anio INTEGER CHECK (anio BETWEEN 1950 AND 2100),
  placa TEXT,
  km_registro INTEGER NOT NULL DEFAULT 0 CHECK (km_registro >= 0),
  combustible TEXT NOT NULL DEFAULT 'gasolina_regular'
    CHECK (combustible IN ('gasolina_regular', 'gasolina_premium', 'gasoil', 'glp', 'electrico', 'hibrido')),
  activo INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE cargas_combustible (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  vehiculo_id TEXT NOT NULL REFERENCES vehiculos (id) ON DELETE CASCADE,
  fecha TEXT NOT NULL DEFAULT (date('now', 'localtime')),
  galones REAL NOT NULL CHECK (galones > 0),
  total_centavos INTEGER NOT NULL CHECK (total_centavos > 0),
  km INTEGER CHECK (km >= 0),
  tanque_lleno INTEGER NOT NULL DEFAULT 0,
  cuenta_id TEXT REFERENCES cuentas (id) ON DELETE SET NULL,
  nota TEXT,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE mantenimientos (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  vehiculo_id TEXT NOT NULL REFERENCES vehiculos (id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  fecha TEXT NOT NULL DEFAULT (date('now', 'localtime')),
  km INTEGER CHECK (km >= 0),
  costo_centavos INTEGER NOT NULL DEFAULT 0 CHECK (costo_centavos >= 0),
  cuenta_id TEXT REFERENCES cuentas (id) ON DELETE SET NULL,
  taller TEXT,
  nota TEXT,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE recordatorios (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  vehiculo_id TEXT NOT NULL REFERENCES vehiculos (id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  cada_km INTEGER CHECK (cada_km > 0),
  cada_meses INTEGER CHECK (cada_meses > 0),
  ultimo_km INTEGER,
  ultima_fecha TEXT,
  CHECK (cada_km IS NOT NULL OR cada_meses IS NOT NULL),
  UNIQUE (vehiculo_id, tipo)
);

CREATE TABLE documentos (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  vehiculo_id TEXT REFERENCES vehiculos (id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('seguro', 'marbete', 'licencia', 'matricula', 'otro')),
  nombre TEXT,
  vence TEXT NOT NULL,
  nota TEXT
);

-- ========== Meta diaria ==========
CREATE TABLE obligaciones (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'otro'
    CHECK (tipo IN ('casa', 'servicios', 'comida', 'deuda', 'vehiculo', 'familia', 'ahorro', 'otro')),
  monto_centavos INTEGER NOT NULL CHECK (monto_centavos > 0),
  activa INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ========== Deudas ==========
CREATE TABLE deudas (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'otro' CHECK (tipo IN
    ('tarjeta', 'prestamo_personal', 'prestamo_vehiculo', 'prestamista', 'familiar', 'tienda', 'otro')),
  acreedor TEXT,
  saldo_inicial_centavos INTEGER NOT NULL CHECK (saldo_inicial_centavos >= 0),
  tasa_anual REAL NOT NULL DEFAULT 0 CHECK (tasa_anual >= 0 AND tasa_anual <= 1000),
  cuota_centavos INTEGER NOT NULL DEFAULT 0 CHECK (cuota_centavos >= 0),
  dia_pago INTEGER CHECK (dia_pago BETWEEN 1 AND 31),
  incluir_en_meta INTEGER NOT NULL DEFAULT 1,
  pagada INTEGER NOT NULL DEFAULT 0,
  frecuencia TEXT NOT NULL DEFAULT 'mensual' CHECK (frecuencia IN ('mensual', 'quincenal', 'semanal', 'diaria')),
  dia_pago_2 INTEGER CHECK (dia_pago_2 BETWEEN 1 AND 31),
  dia_semana INTEGER CHECK (dia_semana BETWEEN 0 AND 6),
  limite_credito_centavos INTEGER CHECK (limite_credito_centavos > 0),
  dia_corte INTEGER CHECK (dia_corte BETWEEN 1 AND 31),
  cuenta_tarjeta_id TEXT UNIQUE REFERENCES cuentas (id) ON DELETE SET NULL,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE pagos_deuda (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  deuda_id TEXT NOT NULL REFERENCES deudas (id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'pago' CHECK (tipo IN ('pago', 'cargo')),
  fecha TEXT NOT NULL DEFAULT (date('now', 'localtime')),
  monto_centavos INTEGER NOT NULL CHECK (monto_centavos > 0),
  interes_centavos INTEGER NOT NULL DEFAULT 0 CHECK (interes_centavos >= 0),
  cuenta_id TEXT REFERENCES cuentas (id) ON DELETE SET NULL,
  nota TEXT,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (interes_centavos <= monto_centavos)
);

-- ========== Asesor IA ==========
CREATE TABLE conversaciones_ia (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  titulo TEXT NOT NULL DEFAULT 'Nueva conversación',
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE mensajes_ia (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  conversacion_id TEXT NOT NULL REFERENCES conversaciones_ia (id) ON DELETE CASCADE,
  rol TEXT NOT NULL CHECK (rol IN ('user', 'assistant')),
  contenido TEXT NOT NULL CHECK (length(contenido) BETWEEN 1 AND 20000),
  tokens_entrada INTEGER,
  tokens_salida INTEGER,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX mensajes_ia_conversacion ON mensajes_ia (conversacion_id, creado_en);

-- ========== Presupuesto ==========
CREATE TABLE presupuestos (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  mes TEXT NOT NULL CHECK (mes GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' AND substr(mes, 6, 2) BETWEEN '01' AND '12'),
  categoria_id TEXT NOT NULL REFERENCES categorias (id) ON DELETE CASCADE,
  limite_centavos INTEGER NOT NULL CHECK (limite_centavos > 0),
  UNIQUE (mes, categoria_id)
);

-- ========== Metas ==========
CREATE TABLE metas (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  nombre TEXT NOT NULL,
  monto_objetivo_centavos INTEGER NOT NULL CHECK (monto_objetivo_centavos > 0),
  moneda TEXT NOT NULL DEFAULT 'DOP' CHECK (moneda IN ('DOP', 'USD')),
  fecha_objetivo TEXT NOT NULL,
  cuenta_id TEXT REFERENCES cuentas (id) ON DELETE SET NULL,
  incluir_en_meta INTEGER NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'pausada', 'lograda')),
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE aportes_meta (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  meta_id TEXT NOT NULL REFERENCES metas (id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'aporte' CHECK (tipo IN ('aporte', 'retiro')),
  fecha TEXT NOT NULL DEFAULT (date('now', 'localtime')),
  monto_centavos INTEGER NOT NULL CHECK (monto_centavos > 0),
  cuenta_id TEXT REFERENCES cuentas (id) ON DELETE SET NULL,
  nota TEXT,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ========== Inversiones ==========
CREATE TABLE inversiones (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('certificado', 'ahorro', 'fondo', 'bonos', 'cooperativa', 'acciones', 'otra')),
  entidad TEXT,
  moneda TEXT NOT NULL CHECK (moneda IN ('DOP', 'USD')),
  cuenta_id TEXT NOT NULL UNIQUE REFERENCES cuentas (id) ON DELETE RESTRICT,
  tasa_anual REAL CHECK (tasa_anual >= 0 AND tasa_anual <= 100),
  fecha_inicio TEXT NOT NULL DEFAULT (date('now', 'localtime')),
  fecha_vencimiento TEXT,
  estado TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'cerrada')),
  nota TEXT,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (fecha_vencimiento IS NULL OR fecha_vencimiento >= fecha_inicio)
);

-- ========== Movimientos (al final: se enlaza con casi todo) ==========
CREATE TABLE movimientos (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  tipo TEXT NOT NULL CHECK (tipo IN ('ingreso', 'gasto', 'transferencia')),
  monto_centavos INTEGER NOT NULL CHECK (monto_centavos > 0),
  cuenta_id TEXT NOT NULL REFERENCES cuentas (id) ON DELETE RESTRICT,
  cuenta_destino_id TEXT REFERENCES cuentas (id) ON DELETE RESTRICT,
  monto_destino_centavos INTEGER CHECK (monto_destino_centavos > 0),
  categoria_id TEXT REFERENCES categorias (id) ON DELETE SET NULL,
  fecha TEXT NOT NULL DEFAULT (date('now', 'localtime')),
  nota TEXT,
  origen TEXT CHECK (origen IN ('jornada_ingreso', 'jornada_comision', 'jornada_gasto', 'combustible', 'mantenimiento',
                                'pago_deuda', 'aporte_meta', 'inversion_rendimiento', 'inversion_ajuste')),
  jornada_id TEXT REFERENCES jornadas (id) ON DELETE CASCADE,
  carga_id TEXT REFERENCES cargas_combustible (id) ON DELETE CASCADE,
  mantenimiento_id TEXT REFERENCES mantenimientos (id) ON DELETE CASCADE,
  pago_deuda_id TEXT REFERENCES pagos_deuda (id) ON DELETE CASCADE,
  aporte_meta_id TEXT REFERENCES aportes_meta (id) ON DELETE CASCADE,
  inversion_id TEXT REFERENCES inversiones (id) ON DELETE SET NULL,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (
    (tipo = 'transferencia' AND cuenta_destino_id IS NOT NULL AND cuenta_destino_id <> cuenta_id)
    OR (tipo <> 'transferencia' AND cuenta_destino_id IS NULL AND monto_destino_centavos IS NULL)
  )
);
CREATE INDEX movimientos_fecha ON movimientos (fecha);
CREATE INDEX movimientos_jornada ON movimientos (jornada_id);

-- ===================================================================================
-- VISTAS
-- ===================================================================================

CREATE VIEW saldos_cuentas AS
SELECT c.id AS cuenta_id,
  c.saldo_inicial_centavos + COALESCE((
    SELECT SUM(CASE
      WHEN m.tipo = 'ingreso' THEN m.monto_centavos
      WHEN m.tipo = 'gasto' THEN -m.monto_centavos
      WHEN m.tipo = 'transferencia' AND m.cuenta_id = c.id THEN -m.monto_centavos
      WHEN m.tipo = 'transferencia' AND m.cuenta_destino_id = c.id THEN COALESCE(m.monto_destino_centavos, m.monto_centavos)
      ELSE 0 END)
    FROM movimientos m WHERE m.cuenta_id = c.id OR m.cuenta_destino_id = c.id
  ), 0) AS saldo_centavos
FROM cuentas c;

CREATE VIEW jornadas_resumen AS
SELECT j.id, j.fecha, j.minutos, j.km_inicial, j.km_final, j.nota,
  CASE WHEN j.km_final IS NOT NULL AND j.km_inicial IS NOT NULL THEN j.km_final - j.km_inicial END AS km,
  COALESCE(p.viajes, 0) AS viajes,
  COALESCE(p.bruto, 0) AS bruto_centavos,
  COALESCE(p.comision, 0) AS comision_centavos,
  COALESCE(g.gastos, 0) AS gastos_centavos,
  COALESCE(p.bruto, 0) - COALESCE(p.comision, 0) - COALESCE(g.gastos, 0) AS neto_centavos
FROM jornadas j
LEFT JOIN (
  SELECT jornada_id, SUM(viajes) AS viajes, SUM(efectivo_centavos + app_centavos) AS bruto, SUM(comision_centavos) AS comision
  FROM jornada_plataformas GROUP BY jornada_id
) p ON p.jornada_id = j.id
LEFT JOIN (
  SELECT jornada_id, SUM(monto_centavos) AS gastos FROM movimientos WHERE origen = 'jornada_gasto' GROUP BY jornada_id
) g ON g.jornada_id = j.id;

CREATE VIEW vehiculos_km AS
SELECT v.id AS vehiculo_id,
  MAX(
    v.km_registro,
    COALESCE((SELECT MAX(km_final) FROM jornadas), 0),
    COALESCE((SELECT MAX(km) FROM cargas_combustible c WHERE c.vehiculo_id = v.id), 0),
    COALESCE((SELECT MAX(km) FROM mantenimientos m WHERE m.vehiculo_id = v.id), 0)
  ) AS km_actual
FROM vehiculos v;

CREATE VIEW deudas_estado AS
SELECT d.id AS deuda_id,
  CASE
    WHEN d.cuenta_tarjeta_id IS NOT NULL THEN MAX(0, -COALESCE((SELECT saldo_centavos FROM saldos_cuentas WHERE cuenta_id = d.cuenta_tarjeta_id), 0))
    ELSE d.saldo_inicial_centavos
      + COALESCE(SUM(CASE WHEN p.tipo = 'cargo' THEN p.monto_centavos END), 0)
      - COALESCE(SUM(CASE WHEN p.tipo = 'pago' THEN p.monto_centavos - p.interes_centavos END), 0)
  END AS saldo_centavos,
  COALESCE(SUM(CASE WHEN p.tipo = 'pago' THEN p.monto_centavos END), 0) AS pagado_centavos,
  CASE
    WHEN d.cuenta_tarjeta_id IS NOT NULL THEN COALESCE(SUM(CASE WHEN p.tipo = 'cargo' THEN p.monto_centavos END), 0)
    ELSE COALESCE(SUM(CASE WHEN p.tipo = 'pago' THEN p.interes_centavos END), 0)
  END AS intereses_pagados_centavos,
  COALESCE(SUM(CASE WHEN p.tipo = 'cargo' THEN p.monto_centavos END), 0) AS cargos_centavos,
  MAX(CASE WHEN p.tipo = 'pago' THEN p.fecha END) AS ultimo_pago
FROM deudas d
LEFT JOIN pagos_deuda p ON p.deuda_id = d.id
GROUP BY d.id;

CREATE VIEW metas_estado AS
SELECT m.id AS meta_id,
  COALESCE(SUM(CASE WHEN a.tipo = 'aporte' THEN a.monto_centavos ELSE -a.monto_centavos END), 0) AS ahorrado_centavos,
  MAX(CASE WHEN a.tipo = 'aporte' THEN a.fecha END) AS ultimo_aporte
FROM metas m
LEFT JOIN aportes_meta a ON a.meta_id = m.id
GROUP BY m.id;

-- ===================================================================================
-- VALIDACIONES
-- ===================================================================================

-- La categoría de un movimiento debe ser del mismo tipo (no se puede poner "Uber" a un gasto).
CREATE TRIGGER validar_movimiento_insert BEFORE INSERT ON movimientos
WHEN NEW.categoria_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM categorias WHERE id = NEW.categoria_id AND tipo = NEW.tipo)
BEGIN SELECT RAISE(ABORT, 'Categoría no válida para este tipo de movimiento'); END;
CREATE TRIGGER validar_movimiento_update BEFORE UPDATE ON movimientos
WHEN NEW.categoria_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM categorias WHERE id = NEW.categoria_id AND tipo = NEW.tipo)
BEGIN SELECT RAISE(ABORT, 'Categoría no válida para este tipo de movimiento'); END;

CREATE TRIGGER validar_presupuesto BEFORE INSERT ON presupuestos
WHEN NOT EXISTS (SELECT 1 FROM categorias WHERE id = NEW.categoria_id AND tipo = 'gasto')
BEGIN SELECT RAISE(ABORT, 'Categoría no válida para el presupuesto'); END;

CREATE TRIGGER validar_tarjeta_deuda_insert BEFORE INSERT ON deudas
WHEN NEW.cuenta_tarjeta_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM cuentas WHERE id = NEW.cuenta_tarjeta_id AND tipo = 'tarjeta' AND moneda = 'DOP')
BEGIN SELECT RAISE(ABORT, 'La cuenta vinculada debe ser una tarjeta en pesos'); END;
CREATE TRIGGER validar_tarjeta_deuda_update BEFORE UPDATE OF cuenta_tarjeta_id ON deudas
WHEN NEW.cuenta_tarjeta_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM cuentas WHERE id = NEW.cuenta_tarjeta_id AND tipo = 'tarjeta' AND moneda = 'DOP')
BEGIN SELECT RAISE(ABORT, 'La cuenta vinculada debe ser una tarjeta en pesos'); END;

CREATE TRIGGER validar_cuenta_meta_insert BEFORE INSERT ON metas
WHEN NEW.cuenta_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM cuentas WHERE id = NEW.cuenta_id AND moneda = NEW.moneda)
BEGIN SELECT RAISE(ABORT, 'La cuenta de la meta debe estar en la misma moneda que la meta'); END;
CREATE TRIGGER validar_cuenta_meta_update BEFORE UPDATE OF cuenta_id ON metas
WHEN NEW.cuenta_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM cuentas WHERE id = NEW.cuenta_id AND moneda = NEW.moneda)
BEGIN SELECT RAISE(ABORT, 'La cuenta de la meta debe estar en la misma moneda que la meta'); END;

CREATE TRIGGER validar_inversion BEFORE INSERT ON inversiones
WHEN NOT EXISTS (SELECT 1 FROM cuentas WHERE id = NEW.cuenta_id AND tipo = 'inversion' AND moneda = NEW.moneda)
BEGIN SELECT RAISE(ABORT, 'La cuenta de la inversión no es válida'); END;

-- ===================================================================================
-- GASTOS Y MOVIMIENTOS AUTOMÁTICOS
-- ===================================================================================

-- --- Combustible: cada carga con cuenta crea su gasto ---
CREATE TRIGGER combustible_moneda_insert BEFORE INSERT ON cargas_combustible
WHEN NEW.cuenta_id IS NOT NULL AND EXISTS (SELECT 1 FROM cuentas WHERE id = NEW.cuenta_id AND moneda <> 'DOP')
BEGIN SELECT RAISE(ABORT, 'Elige una cuenta en pesos (RD$) para este gasto'); END;
CREATE TRIGGER combustible_moneda_update BEFORE UPDATE ON cargas_combustible
WHEN NEW.cuenta_id IS NOT NULL AND EXISTS (SELECT 1 FROM cuentas WHERE id = NEW.cuenta_id AND moneda <> 'DOP')
BEGIN SELECT RAISE(ABORT, 'Elige una cuenta en pesos (RD$) para este gasto'); END;

CREATE TRIGGER gasto_combustible_insert AFTER INSERT ON cargas_combustible
WHEN NEW.cuenta_id IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO categorias (nombre, tipo) VALUES ('Combustible', 'gasto');
  INSERT INTO movimientos (tipo, monto_centavos, cuenta_id, categoria_id, fecha, nota, origen, carga_id)
  VALUES ('gasto', NEW.total_centavos, NEW.cuenta_id,
          (SELECT id FROM categorias WHERE tipo = 'gasto' AND nombre = 'Combustible'), NEW.fecha,
          COALESCE(NULLIF(NEW.nota, ''), (CASE WHEN NEW.galones = CAST(NEW.galones AS INTEGER) THEN CAST(CAST(NEW.galones AS INTEGER) AS TEXT) ELSE CAST(NEW.galones AS TEXT) END) || ' gal'),
          'combustible', NEW.id);
END;
CREATE TRIGGER gasto_combustible_update AFTER UPDATE ON cargas_combustible
BEGIN
  DELETE FROM movimientos WHERE carga_id = NEW.id;
  INSERT OR IGNORE INTO categorias (nombre, tipo) VALUES ('Combustible', 'gasto');
  INSERT INTO movimientos (tipo, monto_centavos, cuenta_id, categoria_id, fecha, nota, origen, carga_id)
  SELECT 'gasto', NEW.total_centavos, NEW.cuenta_id,
         (SELECT id FROM categorias WHERE tipo = 'gasto' AND nombre = 'Combustible'), NEW.fecha,
         COALESCE(NULLIF(NEW.nota, ''), (CASE WHEN NEW.galones = CAST(NEW.galones AS INTEGER) THEN CAST(CAST(NEW.galones AS INTEGER) AS TEXT) ELSE CAST(NEW.galones AS TEXT) END) || ' gal'),
         'combustible', NEW.id
  WHERE NEW.cuenta_id IS NOT NULL;
END;

-- --- Mantenimiento: gasto automático y reinicio del recordatorio ---
CREATE TRIGGER mantenimiento_moneda_insert BEFORE INSERT ON mantenimientos
WHEN NEW.cuenta_id IS NOT NULL AND NEW.costo_centavos > 0 AND EXISTS (SELECT 1 FROM cuentas WHERE id = NEW.cuenta_id AND moneda <> 'DOP')
BEGIN SELECT RAISE(ABORT, 'Elige una cuenta en pesos (RD$) para este gasto'); END;
CREATE TRIGGER mantenimiento_moneda_update BEFORE UPDATE ON mantenimientos
WHEN NEW.cuenta_id IS NOT NULL AND NEW.costo_centavos > 0 AND EXISTS (SELECT 1 FROM cuentas WHERE id = NEW.cuenta_id AND moneda <> 'DOP')
BEGIN SELECT RAISE(ABORT, 'Elige una cuenta en pesos (RD$) para este gasto'); END;

CREATE TRIGGER gasto_mantenimiento_insert AFTER INSERT ON mantenimientos
BEGIN
  INSERT OR IGNORE INTO categorias (nombre, tipo) VALUES ('Mantenimiento vehículo', 'gasto');
  INSERT INTO movimientos (tipo, monto_centavos, cuenta_id, categoria_id, fecha, nota, origen, mantenimiento_id)
  SELECT 'gasto', NEW.costo_centavos, NEW.cuenta_id,
         (SELECT id FROM categorias WHERE tipo = 'gasto' AND nombre = 'Mantenimiento vehículo'), NEW.fecha,
         NEW.tipo || COALESCE(' · ' || NULLIF(NEW.taller, ''), ''), 'mantenimiento', NEW.id
  WHERE NEW.cuenta_id IS NOT NULL AND NEW.costo_centavos > 0;
  UPDATE recordatorios SET ultimo_km = COALESCE(NEW.km, ultimo_km), ultima_fecha = NEW.fecha
  WHERE vehiculo_id = NEW.vehiculo_id AND lower(tipo) = lower(NEW.tipo)
    AND ((NEW.km IS NOT NULL AND (ultimo_km IS NULL OR NEW.km >= ultimo_km))
      OR (NEW.km IS NULL AND (ultima_fecha IS NULL OR NEW.fecha >= ultima_fecha)));
END;
CREATE TRIGGER gasto_mantenimiento_update AFTER UPDATE ON mantenimientos
BEGIN
  DELETE FROM movimientos WHERE mantenimiento_id = NEW.id;
  INSERT OR IGNORE INTO categorias (nombre, tipo) VALUES ('Mantenimiento vehículo', 'gasto');
  INSERT INTO movimientos (tipo, monto_centavos, cuenta_id, categoria_id, fecha, nota, origen, mantenimiento_id)
  SELECT 'gasto', NEW.costo_centavos, NEW.cuenta_id,
         (SELECT id FROM categorias WHERE tipo = 'gasto' AND nombre = 'Mantenimiento vehículo'), NEW.fecha,
         NEW.tipo || COALESCE(' · ' || NULLIF(NEW.taller, ''), ''), 'mantenimiento', NEW.id
  WHERE NEW.cuenta_id IS NOT NULL AND NEW.costo_centavos > 0;
  UPDATE recordatorios SET ultimo_km = COALESCE(NEW.km, ultimo_km), ultima_fecha = NEW.fecha
  WHERE vehiculo_id = NEW.vehiculo_id AND lower(tipo) = lower(NEW.tipo)
    AND ((NEW.km IS NOT NULL AND (ultimo_km IS NULL OR NEW.km >= ultimo_km))
      OR (NEW.km IS NULL AND (ultima_fecha IS NULL OR NEW.fecha >= ultima_fecha)));
END;

-- Recordatorios iniciales al registrar un vehículo (intervalos generales; cada quien los ajusta).
CREATE TRIGGER recordatorios_iniciales AFTER INSERT ON vehiculos
BEGIN
  INSERT INTO recordatorios (vehiculo_id, tipo, cada_km, cada_meses, ultimo_km, ultima_fecha) VALUES
    (NEW.id, 'Cambio de aceite', 5000, 6, NEW.km_registro, date('now', 'localtime')),
    (NEW.id, 'Rotación de gomas', 10000, NULL, NEW.km_registro, date('now', 'localtime')),
    (NEW.id, 'Filtro de aire', 15000, NULL, NEW.km_registro, date('now', 'localtime')),
    (NEW.id, 'Pastillas de freno', 20000, NULL, NEW.km_registro, date('now', 'localtime'));
END;

-- --- Pagos de deudas ---
-- Deuda normal: el pago crea un gasto "Pago de deudas"; el cargo solo sube el saldo.
-- Tarjeta vinculada: el pago es una transferencia hacia la cuenta de la tarjeta (las compras ya son
-- gastos); el cargo (intereses, mora) es un gasto en la tarjeta.
CREATE TRIGGER pago_deuda_validar BEFORE INSERT ON pagos_deuda
BEGIN
  SELECT RAISE(ABORT, 'Elige una cuenta en pesos (RD$) para el pago')
  WHERE NEW.tipo = 'pago' AND NEW.cuenta_id IS NOT NULL AND EXISTS (SELECT 1 FROM cuentas WHERE id = NEW.cuenta_id AND moneda <> 'DOP');
  SELECT RAISE(ABORT, 'Elige la cuenta desde donde pagas la tarjeta')
  WHERE NEW.tipo = 'pago' AND NEW.cuenta_id IS NOT NULL
    AND NEW.cuenta_id = (SELECT cuenta_tarjeta_id FROM deudas WHERE id = NEW.deuda_id);
END;

CREATE TRIGGER pago_deuda_movimiento AFTER INSERT ON pagos_deuda
BEGIN
  INSERT OR IGNORE INTO categorias (nombre, tipo) VALUES ('Pago de deudas', 'gasto'), ('Intereses y cargos bancarios', 'gasto');
  -- Deuda normal: pago → gasto
  INSERT INTO movimientos (tipo, monto_centavos, cuenta_id, categoria_id, fecha, nota, origen, pago_deuda_id)
  SELECT 'gasto', NEW.monto_centavos, NEW.cuenta_id,
         (SELECT id FROM categorias WHERE tipo = 'gasto' AND nombre = 'Pago de deudas'), NEW.fecha,
         'Pago ' || d.nombre || COALESCE(' · ' || NULLIF(NEW.nota, ''), ''), 'pago_deuda', NEW.id
  FROM deudas d WHERE d.id = NEW.deuda_id AND d.cuenta_tarjeta_id IS NULL AND NEW.tipo = 'pago' AND NEW.cuenta_id IS NOT NULL;
  -- Tarjeta vinculada: pago → transferencia a la tarjeta
  INSERT INTO movimientos (tipo, monto_centavos, cuenta_id, cuenta_destino_id, fecha, nota, origen, pago_deuda_id)
  SELECT 'transferencia', NEW.monto_centavos, NEW.cuenta_id, d.cuenta_tarjeta_id, NEW.fecha, 'Pago ' || d.nombre, 'pago_deuda', NEW.id
  FROM deudas d WHERE d.id = NEW.deuda_id AND d.cuenta_tarjeta_id IS NOT NULL AND NEW.tipo = 'pago' AND NEW.cuenta_id IS NOT NULL;
  -- Tarjeta vinculada: cargo → gasto en la tarjeta
  INSERT INTO movimientos (tipo, monto_centavos, cuenta_id, categoria_id, fecha, nota, origen, pago_deuda_id)
  SELECT 'gasto', NEW.monto_centavos, d.cuenta_tarjeta_id,
         (SELECT id FROM categorias WHERE tipo = 'gasto' AND nombre = 'Intereses y cargos bancarios'), NEW.fecha,
         COALESCE(NULLIF(NEW.nota, ''), 'Intereses / cargos ' || d.nombre), 'pago_deuda', NEW.id
  FROM deudas d WHERE d.id = NEW.deuda_id AND d.cuenta_tarjeta_id IS NOT NULL AND NEW.tipo = 'cargo';
END;

-- --- Aportes a metas: transferencia entre la cuenta de origen y la cuenta de la meta ---
CREATE TRIGGER aporte_meta_validar BEFORE INSERT ON aportes_meta
WHEN NEW.cuenta_id IS NOT NULL
  AND (SELECT cuenta_id FROM metas WHERE id = NEW.meta_id) IS NOT NULL
  AND (SELECT moneda FROM cuentas WHERE id = NEW.cuenta_id) IS NOT (SELECT moneda FROM metas WHERE id = NEW.meta_id)
BEGIN SELECT RAISE(ABORT, 'La cuenta debe estar en la misma moneda que la meta'); END;

CREATE TRIGGER aporte_meta_movimiento AFTER INSERT ON aportes_meta
BEGIN
  INSERT INTO movimientos (tipo, monto_centavos, cuenta_id, cuenta_destino_id, fecha, nota, origen, aporte_meta_id)
  SELECT 'transferencia', NEW.monto_centavos,
         CASE WHEN NEW.tipo = 'aporte' THEN NEW.cuenta_id ELSE m.cuenta_id END,
         CASE WHEN NEW.tipo = 'aporte' THEN m.cuenta_id ELSE NEW.cuenta_id END,
         NEW.fecha,
         (CASE WHEN NEW.tipo = 'aporte' THEN 'Aporte a meta: ' ELSE 'Retiro de meta: ' END) || m.nombre,
         'aporte_meta', NEW.id
  FROM metas m
  WHERE m.id = NEW.meta_id AND NEW.cuenta_id IS NOT NULL AND m.cuenta_id IS NOT NULL AND m.cuenta_id <> NEW.cuenta_id;
END;
