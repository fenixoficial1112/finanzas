# FENIX APP

App web de finanzas personales para conductores de InDrive y Uber en República Dominicana:
ingresos y gastos diarios, jornadas, vehículo, presupuesto, deudas, metas, inversiones en
RD$ y US$, y un asesor con IA.

Tecnología: React + Vite + TypeScript, Tailwind CSS y Supabase (login y base de datos).

## Cómo ponerla a funcionar en tu computadora

1. Instala **Node.js 20 o superior** desde nodejs.org.
2. Crea un proyecto gratis en **supabase.com**.
3. En Supabase, abre **SQL Editor**, pega el contenido de
   `supabase/migrations/001_esquema_inicial.sql` y ejecútalo.
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

## Fases

| # | Fase | Estado |
|---|------|--------|
| 1 | Proyecto base, login con correo, menú | ✅ |
| 2 | Cuentas (RD$ / US$), categorías y movimientos | ⏳ |
| 3 | Jornadas InDrive / Uber | |
| 4 | Vehículo: combustible, mantenimiento, documentos | |
| 5 | Deudas y simulador avalancha / bola de nieve | |
| 6 | Asesor IA (Claude) | |
| 7 | Presupuesto y alertas | |
| 8 | Metas corto / mediano / largo plazo | |
| 9 | Inversiones en RD$ y US$ | |
| 10 | Reportes | |
