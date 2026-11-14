import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Hace que FENIX APP se pueda instalar en la PC (Chrome/Edge → "Instalar FENIX APP").
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'FENIX APP',
        short_name: 'FENIX',
        description: 'Finanzas personales para conductores de InDrive y Uber',
        lang: 'es-DO',
        start_url: '/',
        display: 'standalone',
        background_color: '#f4f5f7',
        theme_color: '#14181f',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Solo se guardan los archivos de la app; los datos siempre vienen de Supabase.
        navigateFallbackDenylist: [/^\/auth\//],
      },
    }),
  ],
})
