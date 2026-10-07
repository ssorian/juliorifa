# Adaptación HTML Nova

## Alcance

- Público `/`: catálogo, detalle `#rifa/<id>` (incluidos los slugs originales), características, sugerencias aleatorias, búsqueda con resultado, cantidades y presets, selección/remoción/limpieza (máximo 1,000), total, revisión y compra simulada, resumen móvil, cómo funciona y FAQ.
- Admin: **una sola ruta** con hashes `#resumen`, `#rifas`, `#compras`, `#ingresos`. Resumen, creación/edición de rifas, vista previa, biblioteca y carga/arrastre de imágenes, características estructuradas, numeración/precio/fecha/costos, inventario individual/masivo, CSV, filtros, paginación y detalle de compras. Solo reservas pendientes se confirman o cancelan, como en el HTML.
- Finanzas: fechas en America/Mexico_City, gráfico de 14 días de pagos confirmados, precio histórico, comisiones, premio/gastos, pendientes, resultado por rifa y métricas filtradas coherentes.
- Imágenes propias: PNG/JPEG/WebP, hasta 2 MB, firma raster y decodificación comprobadas, máximo 40 megapíxeles; rechazo de SVG/HTML y protección frente a cargas asíncronas obsoletas.
- Persistencia: migración de datos previos, validación de IDs/rangos/duplicados/ocupación/URLs, seed con aviso si inválidos; evento storage con cleanup para otras pestañas. Guardado rechaza snapshots obsoletos y conserva datos anteriores si falla la cuota. Editor rechaza sobrescribir una rifa cambiada en otra pestaña.
- Disponibilidad e inventario CSV indexan ocupación con Set/Map. La edición no deja fuera compras históricas ni bloqueados.

## Organización

Skill `code-organization` leída íntegramente y releída en esta continuación. Rutas finas; entradas feature orquestan estado y navegación. Componentes por responsabilidad: catálogo, detalle y selección pública; resumen, tabla de rifas, compras, editor, inventario, ingresos y gráfico admin. Dominio de rifas y persistencia pertenecen a `src/modules/raffles`; admin consume sus exports. No es una excepción: es ownership del dominio. Finanzas y carga de imágenes pertenecen a dashboard. Sin carpetas vacías ni movimiento de código ajeno.

## Evidencia test-first

- Nuevas pruebas de paridad/migración escritas antes de sus implementaciones: primer fallo por módulos todavía inexistentes.
- RED conductual observado: protección de escritura obsoleta falló con `Missing expected exception`; se añadió comparación de snapshot y pasó.
- RED conductual observado: bloquear ya bloqueados/liberar consulta sin bloqueados falló con `Missing expected exception`; se añadieron errores explícitos y pasó.
- Triangulación: rangos inválidos, operación masiva atómica con vendidos/reservados, CSV, características incompletas, decimales, numeración bloqueada, compras canceladas históricas, imágenes/tamaño, fees, timezone, filtros por rifa, hashes, migración legacy, IDs/números duplicados y compras solapadas.

## Checks

- `npm run generate-routes`: árbol generado por script, nunca escrito manualmente.
- `npm run build`: pasa; advertencias de dependencias sobre `use client`.
- `npx tsc --noEmit`: único error ajeno en `drizzle.config.ts:6`, URL `string | undefined`.
- `npm run lint`: fallo ajeno `src/integrations/better-auth/header-user.tsx:20` y assets `.output` generados no ignorados por la configuración existente.
- ESLint y Prettier limitados a rutas/componentes/documento tocados; sin modificar configuración ajena para ocultar errores.
- Pruebas Node/tsx: `src/modules/raffles/model.test.ts`, `src/modules/raffles/lib/parity.test.ts`, `src/modules/raffles/lib/storage.test.ts`.

## Límites honestos

Sin backend, cobros, reservas reales, autenticación ficticia ni dependencias nuevas. HTML fuente intacto; React sin iframe/srcdoc, scripts HTML o HTML inyectado. La exportación CSV es el complemento solicitado en esta continuación (no existía en el HTML).

La definición `/dashboard/` existe y no tiene subrutas. Se acepta la normalización existente `/dashboard/` → `/dashboard`: ambas URL resuelven a la misma única vista administrativa. El verificador independiente observó 307 hacia `/dashboard`, luego 200. No requiere cambios en `src/router.tsx` ni una decisión técnica adicional del usuario. Todos los pendientes funcionales enumerados están implementados; la verificación final independiente de navegador ha pasado.

El verificador independiente comprobó escritorio (1440 px) y móvil (390 px): navegación/hash/recarga, selección y compra simulada, teclado/Escape, editor/características/PNG/arrastre, inventario masivo/CSV, filtros financieros/comisiones y sincronización entre pestañas. Sin overflow observado. No se garantiza pixel-perfect, auditoría exhaustiva de accesibilidad ni benchmark de inventario máximo. No se implementa locking multiusuario; la protección de snapshot es local y best-effort.

## Corrección focalizada de hidratación SVG

`RevenueChart` entrega una única string a cada `<circle><title>`. Reproducción aislada con `renderToString`: tres hijos (`fecha`, `: `, `importe`) producen advertencia React y `<svg><title></title></svg>`; una template string produce `<svg><title>18 jun 2026: $0.00</title></svg>`. Coincide con el título SSR vacío observado por el verificador y el texto presente en cliente. No hay evidencia de divergencia Intl: se conserva el helper con America/Mexico_City, sin client-only ni suppressHydrationWarning.

Regresión de paridad: 15 títulos SSR (general + 14 puntos), texto inicial no vacío y sin comentarios separadores; fechas y borde de medianoche mexicana comprobados. Los tres tests tsx y ESLint focalizado pasan. El parent ejecutó el build final satisfactoriamente; TypeScript sigue reportando únicamente el error ajeno de drizzle.config.ts. La revisión independiente final confirmó carga inicial y recarga en escritorio/móvil con cero pageerrors y cero errores de hidratación; SSR y DOM contienen 14 títulos de puntos no vacíos. Único error de consola observado: favicon.ico ausente (404), no bloqueante.

Sin staging ni commits.
