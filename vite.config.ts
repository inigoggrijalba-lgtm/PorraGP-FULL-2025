import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Establece la ruta base a '' para usar rutas relativas.
  // Esto asegura que los archivos se carguen correctamente en GitHub Pages.
  base: '',
  define: {
    // Esto hace que la variable de entorno del proceso de compilación
    // esté disponible en el código del navegador.
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY)
  }
})