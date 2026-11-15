// Arma el resumen de datos que se envía al asesor IA. Todas las cuentas se hacen aquí
// (con la misma lógica que usan las pantallas) para que la IA solo tenga que explicarlas.
import {
  NOMBRES_SISTEMA,
  NOMBRES_DEUDA, NOMBRES_INVERSION, NOMBRES_DOCUMENTO, NOMBRES_OBLIGACION, listarCategorias, listarCuentas, listarDeudas, listarInversiones, listarJornadas,
  listarMetas, listarMovimientos, listarPlataformas, listarPresupuestos, obtenerDatosVehiculo, obtenerUmbralAlerta, obtenerPlanDeudas, obtenerTasaUSD, totalesPorPlataforma,
  type CuentaConSaldo, type Movimiento,
} from './datos'
import { aSimulacion, cuotaMensual, datosPrestamo, desglosePago, mesDeDeuda, mesFuturo, simular, textoFrecuencia, type ResultadoSim } from './deudas'
import { enPesos } from './dinero'
import { diasDelMes, haceDias, hoyISO, mesActual, nombreMes, rangoMes } from './fechas'
import { cargarMeta, DIAS_HISTORIAL } from './useMeta'
import { avance, gastoPorCategoria } from './presupuesto'
import { NOMBRES_PLAZO, estadoMeta } from './metas'
import { interesMensualEstimado } from './inversiones'
import { estadoDocumento, estadoRecordatorio, rendimiento } from './vehiculo'

/** Centavos → pesos redondeados (lo que lee la IA). */
const rd = (centavos: number) => Math.round(centavos / 100)
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

function mesAnterior(mes: string): string {
  const [a, m] = mes.split('-').map(Number)
  const d = new Date(a, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function resumenMes(movs: Movimiento[], cuentas: CuentaConSaldo[], tasa: number | null, nombresCat: Map<string, string>) {
  const moneda = new Map(cuentas.map((c) => [c.id, c.moneda]))
  let ingresos = 0
  let gastos = 0
  const porCategoria = new Map<string, number>()
  for (const m of movs) {
    if (m.tipo === 'transferencia' || m.origen === 'inversion_ajuste') continue
    const mon = moneda.get(m.cuenta_id) ?? 'DOP'
    if (mon === 'USD' && !tasa) continue
    const pesos = enPesos(m.monto_centavos, mon, tasa ?? 0)
    if (m.tipo === 'ingreso') ingresos += pesos
    else {
      gastos += pesos
      const cat = (m.categoria_id && nombresCat.get(m.categoria_id)) || 'Sin categoría'
      porCategoria.set(cat, (porCategoria.get(cat) ?? 0) + pesos)
    }
  }
  return {
    ingresos: rd(ingresos),
    gastos: rd(gastos),
    balance: rd(ingresos - gastos),
    gastos_por_categoria: [...porCategoria.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 12)
      .map(([categoria, monto]) => ({ categoria, monto: rd(monto) })),
  }
}

const escenario = (r: ResultadoSim) => ({
  meses: r.meses,
  libre_en: r.meses == null ? 'nunca (las cuotas no cubren los intereses)' : mesFuturo(r.meses),
  intereses_totales: r.meses == null ? null : rd(r.totalIntereses),
})

export async function construirContexto() {
  const hoy = hoyISO()
  const mes = mesActual()
  const anterior = mesAnterior(mes)
  const desde30 = haceDias(DIAS_HISTORIAL - 1)

  const [cuentas, tasa, categorias, movsMes, movsAnterior, jornadas, porApp, plataformas, deudas, planDeudas, meta, vehiculo, presupuestos, umbral, metas, inversiones] =
    await Promise.all([
      listarCuentas(), obtenerTasaUSD(), listarCategorias(),
      listarMovimientos(rangoMes(mes)), listarMovimientos(rangoMes(anterior)),
      listarJornadas(desde30, hoy), totalesPorPlataforma(desde30, hoy), listarPlataformas(),
      listarDeudas(), obtenerPlanDeudas(), cargarMeta(), obtenerDatosVehiculo(), listarPresupuestos(mes), obtenerUmbralAlerta(), listarMetas(), listarInversiones(),
    ])
  const nombresCat = new Map(categorias.map((c) => [c.id, c.nombre]))

  // ----- Cuentas -----
  const totalPesos = cuentas.reduce(
    (s, c) => s + (c.moneda === 'USD' ? (tasa ? enPesos(c.saldo_centavos, 'USD', tasa) : 0) : c.saldo_centavos), 0)

  // ----- Trabajo como conductor -----
  const t = jornadas.reduce(
    (a, j) => ({
      bruto: a.bruto + j.bruto_centavos, comision: a.comision + j.comision_centavos, gastos: a.gastos + j.gastos_centavos,
      neto: a.neto + j.neto_centavos, minutos: a.minutos + j.minutos, km: a.km + (j.km ?? 0), viajes: a.viajes + j.viajes,
    }),
    { bruto: 0, comision: 0, gastos: 0, neto: 0, minutos: 0, km: 0, viajes: 0 },
  )
  const porDia = new Map<number, { jornadas: number; neto: number; minutos: number }>()
  for (const j of jornadas) {
    const [a, m, d] = j.fecha.split('-').map(Number)
    const dia = new Date(a, m - 1, d).getDay()
    const x = porDia.get(dia) ?? { jornadas: 0, neto: 0, minutos: 0 }
    porDia.set(dia, { jornadas: x.jornadas + 1, neto: x.neto + j.neto_centavos, minutos: x.minutos + j.minutos })
  }

  // ----- Deudas -----
  const activas = deudas.filter((d) => !d.pagada && d.saldo_centavos > 0)
  const sims = activas.map(aSimulacion)
  const extra = planDeudas.pago_extra_deudas_centavos
  const av = simular(sims, 'avalancha', extra)
  const bn = simular(sims, 'bola_nieve', extra)
  const mn = simular(sims, 'minimos', 0)
  const elegido = planDeudas.estrategia_deudas === 'avalancha' ? av : bn

  return {
    fecha_hoy: hoy,
    nota: 'Montos en pesos dominicanos (RD$) redondeados, salvo que se indique US$.',
    cuentas: {
      lista: cuentas.map((c) => ({ nombre: c.nombre, tipo: c.tipo, moneda: c.moneda === 'USD' ? 'US$' : 'RD$', saldo: rd(c.saldo_centavos) })),
      tasa_dolar: tasa,
      total_en_pesos: rd(totalPesos),
    },
    mes_actual: { mes: nombreMes(mes), ...resumenMes(movsMes, cuentas, tasa, nombresCat) },
    mes_anterior: { mes: nombreMes(anterior), ...resumenMes(movsAnterior, cuentas, tasa, nombresCat) },
    presupuesto_del_mes: presupuestos.length === 0 ? 'No ha creado presupuesto este mes' : (() => {
      const { porCategoria } = gastoPorCategoria(movsMes, cuentas, tasa)
      const dia = Number(hoy.slice(8, 10))
      return presupuestos.map((p) => {
        const a = avance(porCategoria.get(p.categoria_id) ?? 0, p.limite_centavos, umbral, dia, diasDelMes(mes))
        return {
          categoria: nombresCat.get(p.categoria_id) ?? 'Categoría', limite: rd(a.limite), gastado: rd(a.gastado),
          porcentaje: Math.round(a.fraccion * 100), estado: a.estado, gasto_proyectado_fin_de_mes: a.proyeccion != null ? rd(a.proyeccion) : null,
        }
      })
    })(),
    trabajo_conductor_ultimos_30_dias: {
      jornadas: jornadas.length,
      horas: Math.round(t.minutos / 6) / 10,
      km: t.km,
      viajes: t.viajes,
      bruto: rd(t.bruto),
      comisiones: rd(t.comision),
      gastos_de_jornada: rd(t.gastos),
      neto: rd(t.neto),
      neto_por_hora: t.minutos ? rd(t.neto / (t.minutos / 60)) : null,
      neto_por_km: t.km ? Math.round(t.neto / t.km) / 100 : null,
      por_app: plataformas.map((p) => {
        const x = porApp.get(p.id)
        return {
          app: p.nombre, dias: x?.dias ?? 0, viajes: x?.viajes ?? 0, bruto: rd(x?.bruto ?? 0), comision: rd(x?.comision ?? 0),
          comision_pct: x?.bruto ? Math.round((x.comision / x.bruto) * 1000) / 10 : p.comision_pct,
          promedio_neto_de_comision_por_viaje: x?.viajes ? rd((x.bruto - x.comision) / x.viajes) : null,
        }
      }),
      por_dia_de_la_semana: [...porDia.entries()].sort((a, b) => a[0] - b[0]).map(([d, x]) => ({
        dia: DIAS[d], jornadas: x.jornadas, neto_promedio: rd(x.neto / x.jornadas), neto_por_hora: x.minutos ? rd(x.neto / (x.minutos / 60)) : null,
      })),
    },
    meta_diaria: {
      obligaciones_mensuales: meta.obligaciones.filter((o) => o.activa).map((o) => ({ nombre: o.nombre, tipo: NOMBRES_OBLIGACION[o.tipo], monto: rd(o.monto_centavos) })),
      cuotas_de_deudas_incluidas: meta.cuotas.map((d) => ({ nombre: d.nombre, cuota_mensual: rd(cuotaMensual(d.cuota_centavos, d.frecuencia)) })),
      total_obligaciones_mes: rd(meta.totalMes),
      dias_trabajo_por_semana: meta.prefs.dias_trabajo_semana,
      margen_seguridad_pct: meta.prefs.margen_pct,
      total_con_margen: rd(meta.meta.conMargen),
      neto_necesario_por_dia: rd(meta.meta.netoDiario),
      horas_por_dia_estimadas: meta.meta.horasDiarias ? Math.round(meta.meta.horasDiarias * 10) / 10 : null,
      facturar_por_dia_si_trabaja_solo_con: meta.meta.plataformas.map((p) => ({ app: p.plataforma.nombre, bruto: rd(p.brutoDiario), viajes_aprox: p.viajesDiarios })),
      progreso_del_mes: {
        neto_ganado: rd(meta.netoMes),
        porcentaje_cubierto: Math.round(meta.progreso.avance * 100),
        falta: rd(meta.progreso.falta),
        neto_por_dia_para_ponerse_al_dia: rd(meta.progreso.netoDiarioRestante),
        dias_de_trabajo_restantes: meta.progreso.diasTrabajoRestantes,
      },
      neto_ganado_hoy: rd(meta.netoHoy),
    },
    metas: metas.length === 0 ? 'No ha creado metas' : metas.map((m) => {
      const e = estadoMeta(m.monto_objetivo_centavos, m.ahorrado_centavos, m.fecha_objetivo, m.creado_en)
      return {
        nombre: m.nombre, plazo: NOMBRES_PLAZO[e.plazo], moneda: m.moneda === 'USD' ? 'US$' : 'RD$', estado: m.estado,
        objetivo: rd(m.monto_objetivo_centavos), ahorrado: rd(m.ahorrado_centavos), porcentaje: Math.round(e.fraccion * 100),
        fecha_objetivo: m.fecha_objetivo, ritmo: e.ritmo, aporte_mensual_necesario: rd(e.aporteMensual), incluida_en_meta_diaria: m.incluir_en_meta,
      }
    }),
    inversiones: inversiones.length === 0 ? 'No ha registrado inversiones' : inversiones.filter((i) => i.estado === 'activa').map((i) => ({
      nombre: i.nombre, tipo: NOMBRES_INVERSION[i.tipo], entidad: i.entidad, moneda: i.moneda === 'USD' ? 'US$' : 'RD$',
      valor_actual: rd(i.valor_centavos), aportado: rd(i.aportado_centavos), ganancia: rd(i.ganancia_centavos),
      tasa_anual_pct: i.tasa_anual, rendimiento_mensual_estimado: (() => { const x = interesMensualEstimado(i); return x == null ? null : rd(x) })(),
      vence: i.fecha_vencimiento,
    })),
    deudas: activas.length === 0 ? { activas: 0 } : {
      total: rd(activas.reduce((s, d) => s + d.saldo_centavos, 0)),
      intereses_este_mes: rd(activas.reduce((s, d) => s + mesDeDeuda(d).interes, 0)),
      cuotas_al_mes: rd(activas.reduce((s, d) => s + mesDeDeuda(d).cuota, 0)),
      estrategia_elegida: planDeudas.estrategia_deudas === 'avalancha' ? 'avalancha' : 'bola de nieve',
      pago_extra_mensual: rd(extra),
      lista: elegido.orden.map((id, i) => {
        const d = activas.find((x) => x.id === id)!
        const im = mesDeDeuda(d).interes
        const prox = desglosePago(datosPrestamo(d))
        return {
          prioridad: i + 1, nombre: d.nombre, tipo: NOMBRES_DEUDA[d.tipo], saldo: rd(d.saldo_centavos), tasa_anual_pct: d.tasa_anual,
          cuota_por_pago: rd(d.cuota_centavos), frecuencia: d.frecuencia, cuando_paga: textoFrecuencia(d),
          cuota_mensual_equivalente: rd(cuotaMensual(d.cuota_centavos, d.frecuencia)), interes_mensual: rd(im),
          como_cobra_interes: d.tipo === 'tarjeta' ? 'tarjeta: interés sobre el balance' : NOMBRES_SISTEMA[d.sistema].detalle,
          proximo_pago: { cuota: rd(prox.cuota), interes: rd(prox.interes), capital: rd(prox.capital) },
          cuota_no_cubre_intereses: d.tasa_anual > 0 && prox.capital <= 0,
          ...(d.tipo === 'tarjeta' ? {
            limite_credito: d.limite_credito_centavos ? rd(d.limite_credito_centavos) : null,
            uso_del_limite_pct: d.limite_credito_centavos ? Math.round((d.saldo_centavos / d.limite_credito_centavos) * 100) : null,
            dia_de_corte: d.dia_corte,
          } : {}),
          pagar_este_mes_segun_plan: rd(elegido.planEsteMes[id] ?? 0),
          se_liquida_en: elegido.mesLiquidada[id] ? mesFuturo(elegido.mesLiquidada[id]!) : null,
        }
      }),
      escenarios: { solo_cuotas_minimas: escenario(mn), avalancha_con_extra: escenario(av), bola_de_nieve_con_extra: escenario(bn) },
    },
    vehiculo: vehiculo && (() => {
      const r = rendimiento(vehiculo.cargas)
      return {
        nombre: `${vehiculo.vehiculo.marca} ${vehiculo.vehiculo.modelo}${vehiculo.vehiculo.anio ? ` ${vehiculo.vehiculo.anio}` : ''}`,
        km_actual: vehiculo.kmActual,
        km_por_galon: r.kmPorGalon ? Math.round(r.kmPorGalon * 10) / 10 : null,
        combustible_por_km: r.costoPorKm ? Math.round(r.costoPorKm) / 100 : null,
        mantenimientos: vehiculo.recordatorios.map((x) => estadoRecordatorio(x, vehiculo.kmActual))
          .map((e) => ({ tipo: e.recordatorio.tipo, estado: e.estado, detalle: e.texto })),
        documentos: vehiculo.documentos.map((d) => ({ tipo: NOMBRES_DOCUMENTO[d.tipo], vence: d.vence, estado: estadoDocumento(d).texto })),
      }
    })(),
  }
}

export type ContextoIA = Awaited<ReturnType<typeof construirContexto>>
