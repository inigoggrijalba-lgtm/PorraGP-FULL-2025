import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Establece la ruta base al nombre de tu repositorio.
  // Esto asegura que los archivos se carguen correctamente en GitHub Pages.
  base: '/PorraGP-FULL-2025/',
  define: {
    // Esto hace que la variable de entorno del proceso de compilación
    // esté disponible en el código del navegador.
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY),
    // Añadimos la fecha y hora de la compilación para control de versiones
    'import.meta.env.BUILD_TIMESTAMP': JSON.stringify(new Date().toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'medium' }))
  }
})