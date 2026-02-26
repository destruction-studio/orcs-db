import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/cli/index.ts'],
  format: ['cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
})
