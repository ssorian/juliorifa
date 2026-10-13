import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

const config = defineConfig(({ command }) => ({
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    nitro({
      preset: command === 'build' ? 'vercel' : undefined,
      handlers: [
        {
          route: '/api/media/images/**',
          handler: './src/lib/storage/media-handler.ts',
        },
      ],
      rollupConfig: { external: [/^@sentry\//] },
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
}))

export default config
