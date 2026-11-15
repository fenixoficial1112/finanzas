# FENIX APP

Aplicación de escritorio (Windows) y web de finanzas personales para conductores de InDrive y Uber en República Dominicana:
ingresos y gastos diarios, jornadas, vehículo, presupuesto, deudas, metas, inversiones en
RD$ y US$, y un asesor con IA.

Tecnología: React + Vite + TypeScript, Tailwind CSS, Electron (programa de Windows) y Supabase (login con correo o Google y base de datos en la nube).

## 1. Instalar FENIX APP en Windows

1. En GitHub, entra a la pestaña **Actions** de este repositorio → la ejecución más reciente de
   **"App de escritorio (Windows)"** con ✅ → abajo, en **Artifacts**, descarga **FENIX-APP-Windows**.
   (Si hay una versión publicada en **Releases**, también puedes descargarla de ahí.)
2. Descomprime y abre **FENIX-APP-Setup-1.0.0.exe**.
3. Windows puede mostrar *"Windows protegió su PC"* porque el instalador no está firmado:
   haz clic en **Más información → Ejecutar de todas formas**.
4. Al terminar tendrás **FENIX APP** en el escritorio y en el menú Inicio.

La primera vez, la app te pide conectar tu nube (paso 2).

## 2. Preparar tu nube gratis (Supabase)

Tus datos se guardan en **tu propio proyecto de Supabase**, en el plan gratuito
(500 MB de base de datos, inicio de sesión incluido). Si el proyecto pasa una semana sin uso,
Supabase lo pausa: se reactiva con un clic en su panel.

1. Crea una cuenta y un proyecto en **supabase.com** (elige la región más cercana, por ejemplo *East US*).
2. Abre **SQL Editor → New query**, pega **todo** el archivo `supabase/instalar_todo.sql`
   y dale a **Run**. Crea todas las tablas de una vez (si ya te habías registrado en la app,
   también completa tu cuenta).
   - Actualizaciones futuras: ejecuta solo los archivos nuevos de `supabase/migrations/`.
3. En **Authentication → URL Configuration**, agrega en **Redirect URLs**:
   - `fenixapp://auth` (para la app de Windows)
   - `http://localhost:5173` (solo si vas a probarla en modo desarrollo)
4. En **Project Settings → API** copia la **Project URL** y la clave pública **anon**
   (o *publishable*) y pégalas en FENIX APP la primera vez que la abras.
   Nunca uses la clave secreta *service_role* en la app.

## 3. Entrar con Gmail (Google)

1. En **console.cloud.google.com**, crea un proyecto (gratis).
2. Ve a **APIs y servicios → Pantalla de consentimiento de OAuth**, elige **Externo** y
   completa el nombre (FENIX APP) y tu correo. Agrega tu Gmail como **usuario de prueba**.
3. Ve a **Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web**.
   En **URI de redireccionamiento autorizados** pon la que te muestra Supabase en
   **Authentication → Sign In / Providers → Google** (se ve así:
   `https://TU-PROYECTO.supabase.co/auth/v1/callback`).
4. Copia el **ID de cliente** y el **secreto de cliente** de Google y pégalos en ese mismo
   proveedor de Google en Supabase. Activa el proveedor y guarda.
5. En FENIX APP, toca **Continuar con Google**: se abre tu navegador, eliges tu Gmail y el
   navegador te devuelve a la app ya conectado.

## Modo desarrollo (opcional)

Para modificar la app necesitas **Node.js 20+**:

```bash
npm install
```

```bash
npm run dev
```

Abre http://localhost:5173. Para probar la versión de escritorio: `npm run escritorio`.
Para fabricar el instalador en una PC con Windows: `npm run dist:win` (queda en `release/`).

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

## Alternativa: instalarla desde el navegador

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
| 11 | Tarjetas de crédito, pagos quincenales/semanales/diarios y préstamos callejeros | ✅ |
| 12 | Programa de Windows (.exe) e inicio de sesión con Google | ✅ |
