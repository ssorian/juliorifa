import { fetchViteEnv } from 'nitro/vite/runtime'

// Explicit image API matching precedes Nitro's development asset classification.
// Forward unchanged to the existing SSR route: authorization and redirects stay there.
export default function mediaHandler({ req }: { req: Request }) {
  return fetchViteEnv('ssr', req)
}
