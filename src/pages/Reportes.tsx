import { useState } from 'react'
import { GraficoBarras, GraficoColumnas, GraficoLinea, Leyenda, TarjetaGrafico } from '../components/Graficos'
import { COLORES } from '../lib/graficos'
import { Aviso, Encabezado, tarjeta } from '../components/ui'
import {
  listarCategorias, listarCuentas, listarDeudas, listarJornadas, listarMovimientos, listarPagosDeudaDesde,
  listarPlataformas, obtenerTasaUSD, totalesPorPlataforma,
} from '../lib/datos'
import { formatear } from '../lib/dinero'
import { hoyISO, mesActual, rangoMes } from '../lib/fechas'
import { gastoPorCategoria } from '../lib/presupuesto'
import { finDeMes, mesCorto, patrimonioPorMes, topConOtros, ultimosMeses } from '../lib/reportes'
import { resumir } from '../lib/resumen'
import { useDatos } from '../lib/useDatos'

type Periodo = '6' | '12' | 'anio'
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

function mesesDe(periodo: Periodo): string[] {
  const actual = mesActual()
  if (periodo === 'anio') return ultimosMeses(actual, Number(actual.slice(5, 7)))
  return ultimosMeses(actual, Number(periodo))
}

async function cargarReportes(periodo: Periodo) {
  const meses = mesesDe(periodo)
  const desde = `${meses[0]}-01`
  const hoy = hoyISO()
  const [movs, cuentas, tasa, categorias, deudas, pagos, jornadas, plataformas, porMesApp] = await Promise.all([
    listarMovimientos({ desde, hasta: hoy }), listarCuentas(true), obtenerTasaUSD(), listarCategorias(),
    listarDeudas(), listarPagosDeudaDesde(desde), listarJornadas(desde, hoy), listarPlataformas(),
    Promise.all(meses.map((m) => totalesPorPlataforma(rangoMes(m).desde, rangoMes(m).hasta))),
  ])
  return { meses, hoy, movs, cuentas, tasa, categorias, deudas, pagos, jornadas, plataformas, porMesApp }
}

export default function Reportes() {
  const [periodo, setPeriodo] = useState<Periodo>('6')
  const datos = useDatos(() => cargarReportes(periodo), [periodo])

  const periodos: { valor: Periodo; texto: string }[] = [
    { valor: '6', texto: 'Últimos 6 meses' },
    { valor: '12', texto: 'Últimos 12 meses' },
    { valor: 'anio', texto: 'Este año' },
  ]

  return (
    <div className="max-w-6xl space-y-6">
      <Encabezado titulo="Reportes" subtitulo="Cómo se mueve tu dinero con el tiempo." />
      <div role="radiogroup" aria-label="Periodo" className="inline-flex flex-wrap rounded-lg bg-gray-100 p-1">
        {periodos.map((p) => (
          <button key={p.valor} role="radio" aria-checked={periodo === p.valor} onClick={() => setPeriodo(p.valor)}
            className={`px-4 h-9 rounded-md text-sm font-semibold cursor-pointer ${periodo === p.valor ? 'bg-white shadow-sm' : 'text-suave'}`}>
            {p.texto}
          </button>
        ))}
      </div>

      {datos.error && <Aviso>{datos.error}</Aviso>}
      {datos.cargando || !datos.datos ? <p className="text-suave">Cargando…</p> : <Contenido d={datos.datos} />}
    </div>
  )
}

function Contenido({ d }: { d: Awaited<ReturnType<typeof cargarReportes>> }) {
  const { meses, hoy, movs, cuentas, tasa, categorias, deudas, pagos, jornadas, plataformas, porMesApp } = d
  const etiquetas = meses.map(mesCorto)

  // ----- Ingresos y gastos por mes -----
  const porMes = meses.map((m) => resumir(movs.filter((x) => x.fecha >= `${m}-01` && x.fecha <= finDeMes(m)), cuentas, tasa))
  const ingresos = porMes.reduce((s, r) => s + r.ingresos, 0)
  const gastos = porMes.reduce((s, r) => s + r.gastos, 0)
  const tasaAhorro = ingresos > 0 ? (ingresos - gastos) / ingresos : null

  // ----- Patrimonio -----
  const patrimonio = patrimonioPorMes(meses, hoy, cuentas, movs, tasa, deudas, pagos)
  const patInicio = patrimonio[0]?.patrimonio ?? 0
  const patFin = patrimonio[patrimonio.length - 1]?.patrimonio ?? 0

  // ----- Gastos por categoría -----
  const nombres = new Map(categorias.map((c) => [c.id, c.nombre]))
  const { porCategoria, sinCategoria } = gastoPorCategoria(movs, cuentas, tasa)
  const cats = topConOtros(
    [...[...porCategoria.entries()].map(([id, valor]) => ({ etiqueta: nombres.get(id) ?? 'Categoría', valor })),
      ...(sinCategoria ? [{ etiqueta: 'Sin categoría', valor: sinCategoria }] : [])],
    8, (resto) => ({ etiqueta: 'Otras', valor: resto }),
  ).map((c) => ({ ...c, detalle: gastos ? `${Math.round((c.valor / gastos) * 100)}% del gasto` : undefined }))

  // ----- Conductor -----
  const apps = plataformas.filter((p) => porMesApp.some((m) => m.get(p.id)))
  const coloresApp = [COLORES.serie1, COLORES.serie2, COLORES.serie3]
  const seriesApps = apps.slice(0, 3).map((p, i) => ({ nombre: p.nombre, color: coloresApp[i], valores: porMesApp.map((m) => m.get(p.id)?.bruto ?? 0) }))
  const porDia = new Map<number, { neto: number; minutos: number; jornadas: number }>()
  for (const j of jornadas) {
    const [a, m, dd] = j.fecha.split('-').map(Number)
    const dia = new Date(a, m - 1, dd).getDay()
    const x = porDia.get(dia) ?? { neto: 0, minutos: 0, jornadas: 0 }
    porDia.set(dia, { neto: x.neto + j.neto_centavos, minutos: x.minutos + j.minutos, jornadas: x.jornadas + 1 })
  }
  const dias = [...porDia.entries()].filter(([, x]) => x.minutos > 0)
    .map(([dia, x]) => ({ etiqueta: DIAS[dia], valor: Math.round(x.neto / (x.minutos / 60)), detalle: `por hora · ${x.jornadas} jornada(s)` }))
    .sort((a, b) => b.valor - a.valor)

  const f = (v: number) => formatear(v)
  const hayMovs = movs.length > 0

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Dato t="Ingresos del periodo" v={f(ingresos)} />
        <Dato t="Gastos del periodo" v={f(gastos)} />
        <Dato t="Tasa de ahorro" v={tasaAhorro == null ? '—' : `${Math.round(tasaAhorro * 100)}%`} nota="Lo que te quedó de cada peso que entró" />
        <Dato t="Patrimonio hoy" v={f(patFin)}
          nota={patrimonio.length > 1 ? `${patFin - patInicio >= 0 ? '▲' : '▼'} ${f(Math.abs(patFin - patInicio))} desde ${etiquetas[0]}` : undefined} />
      </div>
      {!tasa && cuentas.some((c) => c.moneda === 'USD') && <Aviso>Los montos en dólares no se incluyen porque falta la tasa del dólar (Ajustes).</Aviso>}

      {!hayMovs ? (
        <section className={`${tarjeta} p-8 text-center text-suave`}>Todavía no hay movimientos en este periodo para graficar.</section>
      ) : (
        <>
          <TarjetaGrafico
            titulo="Ingresos y gastos por mes"
            leyenda={<Leyenda series={[{ nombre: 'Ingresos', color: COLORES.serie1 }, { nombre: 'Gastos', color: COLORES.serie2 }]} />}
            tabla={{ columnas: ['Mes', 'Ingresos', 'Gastos', 'Balance'], filas: meses.map((m, i) => [mesCorto(m), f(porMes[i].ingresos), f(porMes[i].gastos), f(porMes[i].neto)]) }}
          >
            <GraficoColumnas
              titulo="Ingresos y gastos por mes" categorias={etiquetas} formato={f}
              series={[
                { nombre: 'Ingresos', color: COLORES.serie1, valores: porMes.map((r) => r.ingresos) },
                { nombre: 'Gastos', color: COLORES.serie2, valores: porMes.map((r) => r.gastos) },
              ]}
            />
          </TarjetaGrafico>

          <div className="grid gap-6 lg:grid-cols-2">
            <TarjetaGrafico
              titulo="Tu patrimonio"
              subtitulo="Lo que tienes en tus cuentas menos lo que debes, al cierre de cada mes"
              tabla={{ columnas: ['Mes', 'Tienes', 'Debes', 'Patrimonio'], filas: patrimonio.map((p) => [mesCorto(p.mes), f(p.activos), f(p.deudas), f(p.patrimonio)]) }}
            >
              <GraficoLinea titulo="Patrimonio" categorias={etiquetas} valores={patrimonio.map((p) => p.patrimonio)} color={COLORES.serie1} formato={f} />
            </TarjetaGrafico>

            <TarjetaGrafico
              titulo="¿En qué se va tu dinero?"
              subtitulo="Gastos por categoría en el periodo"
              tabla={{ columnas: ['Categoría', 'Gastado', '% del total'], filas: cats.map((c) => [c.etiqueta, f(c.valor), gastos ? `${Math.round((c.valor / gastos) * 100)}%` : '—']) }}
            >
              {cats.length ? <GraficoBarras titulo="Gastos por categoría" items={cats} color={COLORES.serie2} formato={f} /> : <p className="text-sm text-suave">Sin gastos en el periodo.</p>}
            </TarjetaGrafico>
          </div>
        </>
      )}

      {jornadas.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          {seriesApps.length > 0 && (
            <TarjetaGrafico
              titulo="Lo que facturas por app"
              subtitulo="Bruto por mes (antes de comisión y gastos)"
              leyenda={seriesApps.length > 1 ? <Leyenda series={seriesApps} /> : undefined}
              tabla={{ columnas: ['Mes', ...seriesApps.map((s) => s.nombre)], filas: meses.map((m, i) => [mesCorto(m), ...seriesApps.map((s) => f(s.valores[i]))]) }}
            >
              <GraficoColumnas titulo="Bruto por app" categorias={etiquetas} series={seriesApps} formato={f} />
            </TarjetaGrafico>
          )}
          {dias.length > 0 && (
            <TarjetaGrafico
              titulo="¿Qué días te rinden más?"
              subtitulo="Ganancia neta por hora según el día de la semana"
              tabla={{ columnas: ['Día', 'Neto por hora', 'Jornadas'], filas: dias.map((x) => [x.etiqueta, f(x.valor), x.detalle.split('· ')[1]]) }}
            >
              <GraficoBarras titulo="Neto por hora por día" items={dias} color={COLORES.serie1} formato={f} />
            </TarjetaGrafico>
          )}
        </div>
      )}
      <p className="text-xs text-suave">
        El patrimonio de meses anteriores se reconstruye a partir de tus movimientos; si registraste saldos iniciales tarde, los primeros meses pueden ser aproximados.
      </p>
    </>
  )
}

function Dato({ t, v, nota }: { t: string; v: string; nota?: string }) {
  return (
    <div className={`${tarjeta} p-5`}>
      <p className="text-sm text-suave">{t}</p>
      <p className="text-2xl font-bold">{v}</p>
      {nota && <p className="text-xs text-suave mt-1">{nota}</p>}
    </div>
  )
}
