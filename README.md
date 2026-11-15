# FENIX APP

Programa de Windows de finanzas personales para conductores de InDrive y Uber en República
Dominicana: ingresos y gastos diarios, jornadas, vehículo, presupuesto, deudas (tarjetas,
préstamos quincenales y callejeros), metas, inversiones en RD$ y US$, reportes y un asesor con IA.

**Tus datos se guardan en tu disco duro**, no en internet. No hace falta crear cuenta.

Tecnología: React + Vite + TypeScript, Tailwind CSS, Electron (programa de Windows) y SQLite
(base de datos local, con sql.js).

## Instalar en Windows

1. En GitHub, entra a **Releases** de este repositorio y descarga el **FENIX-APP-Setup-X.Y.Z.exe**
   más reciente. (También está en **Actions** → la ejecución más reciente con ✅ → **Artifacts**.)
2. Ábrelo.
3. Windows puede mostrar *"Windows protegió su PC"* porque el instalador no está firmado:
   haz clic en **Más información → Ejecutar de todas formas**.
4. Al terminar tendrás **FENIX APP** en el escritorio y en el menú Inicio. Ábrelo y empieza.

Desde la versión 1.1.0 el programa **se actualiza solo**: cuando hay una versión nueva en Releases
la descarga y te ofrece reiniciar (también en **Ajustes → Programa**).

## Dónde quedan tus datos

- Archivo: `C:\Users\TU-USUARIO\AppData\Roaming\FENIX APP\fenix.db`
  (en la app: **Ajustes → Tus datos → Abrir la carpeta de datos**).
- Se guarda solo cada vez que haces un cambio, de forma segura (primero en un archivo temporal).
- **Copia automática diaria** en la subcarpeta `respaldos` (se guardan las últimas 30).
- **Ajustes → Tus datos → Guardar una copia de seguridad…** para guardar una copia donde quieras
  (un USB, Google Drive…). Si cambias de PC, instala FENIX APP y usa **Restaurar desde una copia…**.
- **Copia automática en la nube**: en **Ajustes → Copia automática en Google Drive u OneDrive** elige
  la carpeta de Google Drive u OneDrive y FENIX APP deja ahí `FENIX-APP-copia.db` al día.
- Desinstalar el programa **no** borra tus datos.

## Asesor IA (opcional)

El asesor usa Claude (de Anthropic) y necesita internet. Es lo único que se paga (centavos por
pregunta, con un límite de 30 preguntas al día):

1. Crea una cuenta en **console.anthropic.com**, agrega saldo y crea una **API key**.
   Ponle un límite de gasto mensual en *Settings → Limits*.
2. En FENIX APP: **Ajustes → Asesor IA**, pega la clave y guárdala. Se guarda cifrada en tu PC
   con la protección de Windows y nunca sale de tu PC salvo hacia Anthropic.

Cada pregunta envía a Claude un resumen de tus números (no tu historial completo). El modelo es
Claude Opus 5.5, con respaldo automático del servidor si una consulta es rechazada por los
filtros de seguridad.

## Modo desarrollo (opcional)

Para modificar la app necesitas **Node.js 20+**:

```bash
npm install
```

```bash
npm run escritorio
```

Eso compila la app y abre el programa. `npm run dev` la abre en el navegador (los datos quedan
en el navegador y el asesor no funciona ahí). Para fabricar el instalador en una PC con Windows:
`npm run dist:win` (queda en `release/`). La estructura de la base de datos está en
`src/lib/bd/esquema.sql` y sus cambios posteriores en `esquema2.sql`, `esquema3.sql`…

## Fases

| # | Fase | Estado |
|---|------|--------|
| 1 | Proyecto base y menú | ✅ |
| 2 | Cuentas (RD$ / US$), categorías y movimientos | ✅ |
| 3 | Jornadas InDrive / Uber · instalable en PC | ✅ |
| 4 | Vehículo: combustible, mantenimiento, documentos | ✅ |
| 4b | Mi meta diaria: cuánto producir al día para cubrir obligaciones | ✅ |
| 5 | Deudas y simulador avalancha / bola de nieve | ✅ |
| 6 | Asesor IA (Claude) | ✅ |
| 7 | Presupuesto y alertas | ✅ |
| 8 | Metas corto / mediano / largo plazo | ✅ |
| 9 | Inversiones en RD$ y US$ | ✅ |
| 10 | Reportes con gráficos | ✅ |
| 11 | Tarjetas de crédito, pagos quincenales/semanales/diarios y préstamos callejeros | ✅ |
| 12 | Programa de Windows (.exe) | ✅ |
| 13 | Datos guardados en el disco duro (SQLite), sin nube ni cuentas | ✅ |
| 14 | Actualizaciones automáticas | ✅ |
| 15 | Pagos recurrentes, calendario y avisos de Windows | ✅ |
| 16 | Préstamos: interés y capital de cada pago, tabla de pagos | ✅ |
| 17 | Copia automática en Google Drive / OneDrive | ✅ |
