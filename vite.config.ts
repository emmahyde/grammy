import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { surfacePlugin } from './surface/plugin.ts'

// https://vite.dev/config/
export default defineConfig({
  // vitest loads this file too; the surface touches the file system, so keep it out of test runs
  plugins: [react(), ...(process.env.VITEST ? [] : [surfacePlugin()])],
})
