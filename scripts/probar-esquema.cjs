// Pruebas de la base de datos local: reglas, saldos y movimientos automáticos.
// Uso: npm run probar:bd
const initSqlJs = require('sql.js');
const fs = require('fs');
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + m); if (!c) process.exitCode = 1 };
(async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.exec(fs.readFileSync(require('node:path').join(__dirname, '..', 'src', 'lib', 'bd', 'esquema.sql'), 'utf8'));
  db.exec('PRAGMA foreign_keys = ON');
  const q = (s, p = []) => { const st = db.prepare(s); st.bind(p); const r = []; while (st.step()) r.push(st.getAsObject()); st.free(); return r };
  const uno = (s, p) => q(s, p)[0];
  const falla = (s, p, esperado) => { try { db.run(s, p); return 'no falló' } catch (e) { return e.message.includes(esperado) ? 'ok' : e.message } };
  const cat = (n, t) => uno('select id from categorias where nombre=? and tipo=?', [n, t]).id;

  ok(uno('select count(*) n from categorias').n === 16, 'categorías iniciales');
  ok(q('select nombre from plataformas order by nombre').map(r => r.nombre).join() === 'InDrive,Uber', 'plataformas iniciales');
  ok(uno('select count(*) n from preferencias').n === 1, 'preferencias');

  db.run("insert into cuentas (id,nombre,tipo,moneda,saldo_inicial_centavos) values ('e','Efectivo','efectivo','DOP',100000),('b','Banco','banco','DOP',10000000),('u','USD','ahorro','USD',0)");
  // saldos con transferencia en otra moneda
  db.run("insert into movimientos (tipo,monto_centavos,cuenta_id,categoria_id) values ('ingreso',500000,'e',?)", [cat('InDrive','ingreso')]);
  db.run("insert into movimientos (tipo,monto_centavos,cuenta_id,categoria_id) values ('gasto',120000,'e',?)", [cat('Combustible','gasto')]);
  db.run("insert into movimientos (tipo,monto_centavos,cuenta_id,cuenta_destino_id,monto_destino_centavos) values ('transferencia',635000,'e','u',10000)");
  ok(uno("select saldo_centavos s from saldos_cuentas where cuenta_id='e'").s === -155000 && uno("select saldo_centavos s from saldos_cuentas where cuenta_id='u'").s === 10000, 'saldos (−1,550 y US$100)');
  ok(falla("insert into movimientos (tipo,monto_centavos,cuenta_id,categoria_id) values ('gasto',1,'e',?)", [cat('Uber','ingreso')], 'Categoría no válida') === 'ok', 'gasto con categoría de ingreso rechazado');
  ok(falla("insert into movimientos (tipo,monto_centavos,cuenta_id,cuenta_destino_id) values ('transferencia',1,'e','e')", [], 'CHECK') === 'ok', 'transferencia a la misma cuenta rechazada');
  ok(falla("delete from cuentas where id='e'", [], 'FOREIGN KEY') === 'ok', 'no se borra una cuenta con movimientos');

  // vehículo
  db.run("insert into vehiculos (id,marca,modelo,km_registro) values ('v','Toyota','Corolla',84000)");
  ok(uno("select count(*) n from recordatorios where vehiculo_id='v'").n === 4, 'recordatorios iniciales');
  db.run("insert into cargas_combustible (id,vehiculo_id,fecha,galones,total_centavos,km,tanque_lleno,cuenta_id) values ('c1','v','2026-11-01',10,290000,84100,1,'e')");
  ok(uno("select nota, monto_centavos m from movimientos where carga_id='c1'").nota === '10 gal', 'gasto de combustible automático (10 gal)');
  db.run("update cargas_combustible set total_centavos=300000 where id='c1'");
  ok(uno("select count(*) n, sum(monto_centavos) s from movimientos where carga_id='c1'").s === 300000, 'al editar la carga se actualiza su gasto');
  db.run("update cargas_combustible set cuenta_id=null where id='c1'");
  ok(uno("select count(*) n from movimientos where carga_id='c1'").n === 0, 'sin cuenta, sin gasto');
  ok(falla("insert into cargas_combustible (vehiculo_id,galones,total_centavos,cuenta_id) values ('v',1,100,'u')", [], 'en pesos') === 'ok', 'combustible con cuenta en dólares rechazado');
  db.run("insert into mantenimientos (vehiculo_id,tipo,fecha,km,costo_centavos,cuenta_id,taller) values ('v','Cambio de aceite','2026-11-10',84500,250000,'e','Taller Juan')");
  ok(uno("select ultimo_km k from recordatorios where tipo='Cambio de aceite'").k === 84500, 'recordatorio reiniciado por km');
  ok(uno("select nota from movimientos where origen='mantenimiento'").nota === 'Cambio de aceite · Taller Juan', 'gasto de mantenimiento');
  ok(uno("select km_actual k from vehiculos_km").k === 84500, 'km actual');
  db.run("delete from cargas_combustible where id='c1'");

  // jornada (lo que antes hacía guardar_jornada se hace en la app; aquí probamos la vista)
  db.run("insert into jornadas (id,fecha,minutos,km_inicial,km_final,cuenta_efectivo_id) values ('j','2026-11-14',510,84210,84386,'e')");
  const ind = uno("select id from plataformas where nombre='InDrive'").id;
  db.run("insert into jornada_plataformas (jornada_id,plataforma_id,viajes,efectivo_centavos,app_centavos,comision_centavos) values ('j',?,11,290000,65000,33700)", [ind]);
  db.run("insert into movimientos (tipo,monto_centavos,cuenta_id,categoria_id,origen,jornada_id) values ('gasto',94000,'e',?,'jornada_gasto','j')", [cat('Combustible','gasto')]);
  const jr = uno("select * from jornadas_resumen where id='j'");
  ok(jr.km === 176 && jr.bruto_centavos === 355000 && jr.neto_centavos === 355000 - 33700 - 94000, `resumen de jornada (neto ${jr.neto_centavos})`);
  db.run("delete from jornadas where id='j'");
  ok(uno("select count(*) n from movimientos where jornada_id='j'").n === 0, 'borrar jornada borra sus movimientos');
  ok(falla("insert into jornadas (fecha,km_inicial,km_final) values ('2026-11-14',100,50)", [], 'CHECK') === 'ok', 'km final menor rechazado');

  // deudas
  db.run("insert into deudas (id,nombre,tipo,saldo_inicial_centavos,tasa_anual,cuota_centavos) values ('d','Préstamo','prestamo_personal',4230000,60,280000)");
  db.run("insert into pagos_deuda (deuda_id,tipo,fecha,monto_centavos,interes_centavos,cuenta_id) values ('d','pago','2026-11-10',500000,211500,'e')");
  db.run("insert into pagos_deuda (deuda_id,tipo,fecha,monto_centavos) values ('d','cargo','2026-11-12',150000)");
  const de = uno("select * from deudas_estado where deuda_id='d'");
  ok(de.saldo_centavos === 4091500 && de.intereses_pagados_centavos === 211500 && de.ultimo_pago === '2026-11-10', `deuda normal (saldo ${de.saldo_centavos})`);
  ok(uno("select nota from movimientos where origen='pago_deuda' and tipo='gasto'").nota === 'Pago Préstamo', 'pago crea gasto');
  ok(falla("insert into pagos_deuda (deuda_id,monto_centavos,interes_centavos) values ('d',100,200)", [], 'CHECK') === 'ok', 'interés mayor que el pago rechazado');
  ok(falla("insert into pagos_deuda (deuda_id,monto_centavos,cuenta_id) values ('d',100,'u')", [], 'en pesos') === 'ok', 'pago desde cuenta en dólares rechazado');
  // tarjeta vinculada
  db.run("insert into cuentas (id,nombre,tipo,saldo_inicial_centavos) values ('t','Tarjeta','tarjeta',-4230000)");
  db.run("insert into deudas (id,nombre,tipo,saldo_inicial_centavos,tasa_anual,cuota_centavos,limite_credito_centavos,cuenta_tarjeta_id) values ('dt','Tarjeta','tarjeta',0,60,280000,10000000,'t')");
  db.run("insert into movimientos (tipo,monto_centavos,cuenta_id) values ('gasto',150000,'t')");
  db.run("insert into pagos_deuda (deuda_id,tipo,monto_centavos,cuenta_id) values ('dt','pago',500000,'b')");
  db.run("insert into pagos_deuda (deuda_id,tipo,monto_centavos) values ('dt','cargo',211500)");
  const dt = uno("select * from deudas_estado where deuda_id='dt'");
  ok(dt.saldo_centavos === 4091500 && dt.intereses_pagados_centavos === 211500, `tarjeta vinculada (saldo ${dt.saldo_centavos})`);
  ok(uno("select saldo_centavos s from saldos_cuentas where cuenta_id='b'").s === 9500000, 'el pago de la tarjeta sale del banco como transferencia');
  ok(uno("select count(*) n from movimientos where cuenta_id='b' and tipo='gasto'").n === 0, 'pagar la tarjeta no es un gasto');
  ok(falla("insert into pagos_deuda (deuda_id,monto_centavos,cuenta_id) values ('dt',100,'t')", [], 'desde donde pagas') === 'ok', 'no se paga la tarjeta con ella misma');
  ok(falla("insert into deudas (nombre,saldo_inicial_centavos,cuenta_tarjeta_id) values ('x',0,'b')", [], 'tarjeta en pesos') === 'ok', 'vincular una cuenta que no es tarjeta rechazado');

  // metas
  db.run("insert into cuentas (id,nombre,tipo,saldo_inicial_centavos) values ('ag','Ahorro gomas','ahorro',0)");
  db.run("insert into metas (id,nombre,monto_objetivo_centavos,fecha_objetivo,cuenta_id) values ('m','Gomas',2200000,'2027-03-01','ag')");
  db.run("insert into aportes_meta (meta_id,monto_centavos,cuenta_id) values ('m',1000000,'b')");
  db.run("insert into aportes_meta (meta_id,tipo,monto_centavos,cuenta_id) values ('m','retiro',200000,'b')");
  db.run("insert into aportes_meta (meta_id,monto_centavos) values ('m',400000)");
  ok(uno("select ahorrado_centavos a from metas_estado").a === 1200000, 'ahorrado en la meta (12,000)');
  ok(uno("select saldo_centavos s from saldos_cuentas where cuenta_id='ag'").s === 800000, 'aportes mueven el dinero a la cuenta de la meta');
  ok(falla("insert into metas (nombre,monto_objetivo_centavos,fecha_objetivo,moneda,cuenta_id) values ('x',1,'2027-01-01','USD','ag')", [], 'misma moneda') === 'ok', 'meta en US$ con cuenta en RD$ rechazada');
  ok(falla("insert into aportes_meta (meta_id,monto_centavos,cuenta_id) values ('m',1,'u')", [], 'misma moneda') === 'ok', 'aporte desde otra moneda rechazado');
  db.run("delete from metas where id='m'");
  ok(uno("select count(*) n from movimientos where origen='aporte_meta'").n === 0, 'borrar la meta borra sus movimientos');

  // presupuesto e inversiones
  ok(falla("insert into presupuestos (mes,categoria_id,limite_centavos) values ('2026-11',?,1)", [cat('Uber','ingreso')], 'presupuesto') === 'ok', 'presupuesto con categoría de ingreso rechazado');
  ok(falla("insert into presupuestos (mes,categoria_id,limite_centavos) values ('2026-13',?,1)", [cat('Comida','gasto')], 'CHECK') === 'ok', 'mes inválido rechazado');
  db.run("insert into presupuestos (mes,categoria_id,limite_centavos) values ('2026-11',?,1200000) on conflict (mes,categoria_id) do update set limite_centavos=excluded.limite_centavos", [cat('Comida','gasto')]);
  db.run("insert into presupuestos (mes,categoria_id,limite_centavos) values ('2026-11',?,1500000) on conflict (mes,categoria_id) do update set limite_centavos=excluded.limite_centavos", [cat('Comida','gasto')]);
  ok(uno("select count(*) n, max(limite_centavos) l from presupuestos").l === 1500000, 'actualizar un límite no lo duplica');
  ok(falla("insert into inversiones (nombre,tipo,moneda,cuenta_id) values ('x','otra','DOP','b')", [], 'inversión') === 'ok', 'inversión con cuenta que no es de inversión rechazada');
  ok(uno('pragma foreign_key_check') === undefined, 'integridad de claves foráneas');
})();
