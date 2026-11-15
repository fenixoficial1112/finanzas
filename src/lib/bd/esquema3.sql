-- FENIX APP · Base de datos local — versión 3: cómo se calcula el interés de cada préstamo.
--   cuota_fija   → cuota igual siempre; el interés se cobra sobre lo que debes y baja con cada pago (bancos).
--   capital_fijo → abonas lo mismo a capital y el interés va aparte, así que la cuota baja.
--   interes_fijo → el interés se cobra siempre sobre lo prestado y no baja (muchos prestamistas).
--   solo_interes → solo pagas réditos; el capital se paga aparte cuando se pueda.
ALTER TABLE deudas ADD COLUMN sistema TEXT NOT NULL DEFAULT 'cuota_fija'
  CHECK (sistema IN ('cuota_fija', 'capital_fijo', 'interes_fijo', 'solo_interes'));
-- Lo que te prestaron al principio (para el interés fijo). Si no se sabe, se usa el saldo al registrarla.
ALTER TABLE deudas ADD COLUMN monto_prestado_centavos INTEGER CHECK (monto_prestado_centavos > 0);
