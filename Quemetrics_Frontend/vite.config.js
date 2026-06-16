import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createRequire } from 'module';

const require = createRequire(import.meta.url);


export default defineConfig({
  plugins: [react(), tailwindcss()],
  
  server: {
    port: 5173,
    host: true,
  },
});