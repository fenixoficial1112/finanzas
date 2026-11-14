# FENIX APP

App web de finanzas personales para conductores de InDrive y Uber en República Dominicana:
ingresos y gastos diarios, jornadas, vehículo, presupuesto, deudas, metas, inversiones en
RD$ y US$, y un asesor con IA.

Tecnología: React + Vite + TypeScript, Tailwind CSS y Supabase (login y base de datos).

## Cómo ponerla a funcionar en tu computadora

1. Instala **Node.js 20 o superior** desde nodejs.org.
2. Crea un proyecto gratis en **supabase.com**.
3. En Supabase, abre **SQL Editor** y ejecuta, **en orden**, cada archivo de
   `supabase/migrations/` (`001_esquema_inicial.sql`, luego `002_saldos.sql`, `003_jornadas.sql`, `004_vehiculo.sql`, `005_meta_diaria.sql`, `006_deudas.sql`, …).
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
| 6 | Asesor IA (Claude) | ⏳ |
| 7 | Presupuesto y alertas | |
| 8 | Metas corto / mediano / largo plazo | |
| 9 | Inversiones en RD$ y US$ | |
| 10 | Reportes | |
