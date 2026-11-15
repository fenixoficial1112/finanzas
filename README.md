# FENIX APP

App web de finanzas personales para conductores de InDrive y Uber en República Dominicana:
ingresos y gastos diarios, jornadas, vehículo, presupuesto, deudas, metas, inversiones en
RD$ y US$, y un asesor con IA.

Tecnología: React + Vite + TypeScript, Tailwind CSS y Supabase (login y base de datos).

## Cómo ponerla a funcionar en tu computadora

1. Instala **Node.js 20 o superior** desde nodejs.org.
2. Crea un proyecto gratis en **supabase.com**.
3. En Supabase, abre **SQL Editor** y ejecuta, **en orden**, cada archivo de
   `supabase/migrations/` (`001_esquema_inicial.sql`, luego `002_saldos.sql`, `003_jornadas.sql`, `004_vehiculo.sql`, `005_meta_diaria.sql`, `006_deudas.sql`, `007_asesor_ia.sql`, `008_presupuesto.sql`, `009_metas.sql`, `010_inversiones.sql`, …).
   Cuando lleguen fases nuevas, ejecuta solo los archivos nuevos.
4. En Supabase, ve a **Authentication → URL Configuration** y pon `http://localhost:5173`
   como *Site URL* (para que los enlaces del correo te devuelvan a la app).
5. Copia `.env.example` como `.env.local` y pega la URL y la clave *anon* de tu proyecto
   (**Project Settings → API**).
6. En una terminal, dentro de esta carpeta:

   ```bash
   npm install
   npm run dev
   ```

7. Abre http://localhost:5173 y crea tu cuenta.

## Activar el asesor IA

El asesor usa Claude (de Anthropic) a través de una función segura de Supabase: tu clave de
Anthropic se guarda **solo en Supabase**, nunca en la app ni en el navegador.

1. Crea una cuenta en **console.anthropic.com**, agrega saldo y crea una **API key**.
   Ponle un límite de gasto mensual en *Settings → Limits* para evitar sorpresas.
2. En una terminal, dentro de esta carpeta:

   ```bash
   npx supabase login
   ```

   ```bash
   npx supabase link --project-ref TU-PROYECTO
   ```

   (`TU-PROYECTO` es el código que aparece en la URL de tu proyecto: `https://TU-PROYECTO.supabase.co`.)
3. Guarda tu clave como secreto (la terminal te la pedirá; no la pegues en ningún chat):

   ```bash
   npx supabase secrets set ANTHROPIC_API_KEY
   ```

   Opcional: cambia el límite de preguntas por día (30 por defecto):

   ```bash
   npx supabase secrets set ASESOR_LIMITE_DIARIO=30
   ```

4. Publica la función:

   ```bash
   npx supabase functions deploy asesor
   ```

Cada pregunta envía a Claude un resumen de tus números (no tu historial completo) y cuesta
unos pocos centavos de dólar. El modelo usado es Claude Opus 5.5, con respaldo automático
del servidor si una consulta es rechazada por los filtros de seguridad.

## Instalarla como aplicación de PC

FENIX APP se puede instalar en Windows como una aplicación normal (con ícono en el
escritorio y en el menú Inicio, en su propia ventana):

1. Abre la app en **Google Chrome** o **Microsoft Edge**.
2. En la barra de direcciones, haz clic en el ícono **Instalar** (una pantalla con una
   flecha), o en el menú ⋮ → **Instalar FENIX APP**.
3. Listo: búscala en el menú Inicio como "FENIX APP".

> Mientras la uses desde `npm run dev`, la terminal debe estar abierta. Cuando la
> publiquemos en internet (por ejemplo en Vercel o Netlify, gratis), la app instalada
> funcionará sin terminal.

## Fases

| # | Fase | Estado |
|---|------|--------|
| 1 | Proyecto base, login con correo, menú | ✅ |
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
| 11 | Tarjetas de crédito, pagos quincenales/semanales/diarios y préstamos callejeros | ⏳ |
