import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: 'attestto-login',
    },
    rollupOptions: {
      // Don't bundle the wallet adapter — let consumers resolve it
      external: [],
    },
    target: 'es2022',
    sourcemap: true,
  },
})
