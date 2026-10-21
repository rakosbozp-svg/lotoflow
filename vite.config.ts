import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Relativní cesty: aplikace funguje na GitHub Pages i v podsložce.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { target: 'es2020', sourcemap: false },
  test: { environment: 'node' },
})
