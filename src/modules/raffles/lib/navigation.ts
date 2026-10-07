const slugs: Record<string, string> = {
  'iphone-16-pro-max': 'iphone',
  'galaxy-s25-ultra': 'galaxy',
  'rog-phone-9': 'rog',
}
export const productHash = (id: string) =>
  '#rifa/' +
  (Object.keys(slugs).find((key) => slugs[key] === id) ||
    encodeURIComponent(id))
export function publicRoute(hash: string) {
  let route = ''
  try {
    route = decodeURIComponent(hash.replace(/^#/, ''))
  } catch {
    return { id: null, section: 'productos' }
  }
  return route.startsWith('rifa/')
    ? { id: slugs[route.slice(5)] || route.slice(5), section: null }
    : {
        id: null,
        section: ['productos', 'como-funciona', 'faq'].includes(route)
          ? route
          : 'productos',
      }
}
export function adminTab(hash: string) {
  return (
    (
      {
        resumen: 'Resumen',
        rifas: 'Rifas',
        compras: 'Compras',
        ingresos: 'Ingresos',
      } as Record<string, string>
    )[hash.replace(/^#/, '')] || 'Resumen'
  )
}
