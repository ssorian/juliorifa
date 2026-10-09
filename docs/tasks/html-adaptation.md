# Adaptación HTML Nova

## Primer bloque UX de apartados — evidencia previa

- Listado: folio corto, título solo cuando viene en el DTO; fallback a identificador de rifa. CTA por estado únicamente navega al detalle; awaiting_proof usa texto neutral, sin prometer upload después del plazo.
- Fechas visibles de catálogo/detalle, compras y auditoría: es-MX, America/Mexico_City explícita. ISO, countdown y guards no cambian.
- Copia cuenta/referencia completa e importe decimal desde totalCents snapshot. API nativa con fallback temporal de selección; éxito solo confirmado, cleanup/foco y feedback role=status. No backend, timeline, galería ni infraestructura activada.
- TDD observado: tres fallos conductuales (fecha ISO, copia false, tarjeta sin folio/CTA), además del fallo inicial por módulos ausentes. GREEN focalizado: 7/7. Suite general: 114/114; tipos, build, ESLint de archivos tocados, Prettier y `git diff --check`: PASS. Tests cubren seis estados, título/fallback, borde UTC/México, rechazo/ausencia de API y fallo del fallback.
- Verificación independiente: cero hallazgos P1/P2 nuevos. Harness aislado ampliado temporalmente en `/tmp`: 29 checkpoints PASS, pageErrors=0, hydrationErrors=0, responsive y logout correctos. Cuenta snapshot, importe decimal y UUID completo copiados; fechas, folio y CTA comprobados. API ausente ejercita fallback real con cleanup/foco; `execCommand=false` muestra fallo accesible sin falso éxito. Rechazo de API nativa y fallback que lanza error cubiertos por unit, no forzados en browser.
- Transparencia: runner temporal adaptado a `.mts` y export instalado de Sharp; una corrida falló por timeout de screenshot y su repetición idéntica completó todos los checks. En esa verificación persistían 18 image404 conocidos, sin ocultarlos; fueron corregidos en la unidad1 posterior. Sin DB real, cambios de backend, commit ni despliegue.

## Segundo bloque UX — unidad1: imágenes y comprobante explícito

- Nitro registra únicamente `/api/media/images/**` y reenvía el Request intacto al renderer SSR existente mediante `fetchViteEnv`. Fuente contrastada: `node_modules/nitro/dist/runtime/internal/vite/ssr-renderer.mjs`; evita clasificación asset dev sin alterar headers, autorización, validación, Storage ni redirect302.
- Selección local sin POST, nombre/tamaño, preview raster por URL blob asociada al File actual; revoke al reemplazar/quitar/desmontar. PDF admitido con fallback explícito **sin preview inline**. Envío requiere botón; guard síncrono bloquea doble envío. Error HTTP/incierto conserva selección mientras siga habilitada, no reintenta automáticamente ni declara éxito. Refresh fallido no deja busy trabado.
- RED imagen: parent observó headers imagen404 y naturalWidth0 antes del cambio. Helper test-first: `node --import tsx --test src/modules/purchases/lib/proof-selection.test.ts` falló inicialmente por módulo ausente (no RED conductual); luego1/1 PASS. UI añadida con pruebas posteriores, sin RED inventado.
- GREEN: `node --import tsx --test src/modules/purchases/lib/proof-selection.test.ts src/modules/purchases/components/ProofUpload.test.tsx` 3/3; `node node_modules/typescript/bin/tsc --noEmit` PASS; `bun run build` PASS (warnings dependencias). Build final también PASS, log `/tmp/juliorifa-unit1-build.log`.
- `node --import tsx tests/e2e/run.ts` final PASS: imagen Accept/dest200 MIME imagen y img naturalWidth>0, imageFailures0, pageErrors0/hydration0. Counter prueba selección/reemplazo inválido sin POST, URL anterior revocada y doble confirmación exactamente1 POST con commit real+respuesta abortada; lectura propia recupera reviewing sin replay. Primera versión ampliada tuvo error técnico `Route is already handled` por unroute prematuro; dejó proceso propio3212, siguiente intento falló puerto ocupado. Se cerró exclusivamente ese proceso y corrida corregida completa PASS. No cuentan como RED funcional.
- Verificación independiente de unidad1: 117/117 pruebas, tipos/build PASS, 25 checkpoints E2E PASS, imageFailures=0, pageErrors=0, hydrationErrors=0 y logout correcto; cero hallazgos P1/P2. ESLint: cero errores; warning nuevo de shadow corregido, permanece uno histórico. Aproximadamente 285 líneas nuevas, separadas del primer bloque preservado.
- Sin DB real, secretos, puerto3000, Supabase ACL real, cron activado, timeline nuevo ni cambios de sorteo. Unidad1 verificada antes de iniciar unidad2.

## Segundo bloque UX — unidad2: seguimiento y sorteo verificados

- PurchaseSummary reutiliza seguimiento semántico Apartado → Comprobante → Pago, exclusivamente por estado persistido. Cancelado/Rechazado/Vencido son ramas terminales sin progreso lineal ni participación. Fechas siguen siendo las del DTO; legacy NULL no inventa eventos. Snapshot, retención reviewing y plazo awaiting permanecen.
- DrawStatus consume el GET público existente: carga/error no significan pendiente; solo éxito con resultado NULL y reloj cliente posterior a drawAt lo permite. SSR inicia reloj NULL; intervalo con cleanup. Ganador real conserva boleto0/fecha efectiva incluso con error de refresh; fecha programada y realización se distinguen. Revisión diaria expresamente condicional, sin afirmar activación.
- RED conductual: Summary existente carecía de aria-label/seguimiento; luego DrawStatus con dato undefined marcaba pendiente indebidamente. Fallo inicial de DrawStatus por módulo ausente no cuenta como RED conductual. GREEN focalizado7/7, triangulación seis estados/NULL/fechas inválidas/carga/error/futuro/pasado/boleto0.
- Gates del writer:120/120 tests, tipos/build PASS, ESLint0 errores/1 warning histórico no-shadow (ahora línea622), formato/diff-check PASS. E2E aislado3212:25 checkpoints PASS, imageFailures0/pageErrors0/hydration0/logout correcto; checks durables reviewing≠paid, paid confirmado, futuro, vencido antes del cron y resultado real después. Primer intento E2E falló por selector exacto de texto unido al número de paso; corregido el markup, sin eliminar assertions. Logs `/tmp/juliorifa-unit2-{tests,build,e2e-final}.log`.
- Verificación independiente final: 120/120 pruebas, tipos/build/diff-check PASS; 25 checkpoints E2E PASS, imageFailures=0, pageErrors=0, hydrationErrors=0, logout correcto y puerto3212 libre tras cleanup. Cero hallazgos P1/P2; ESLint cero errores y un warning histórico. Prettier de todos los TS/TSX/CSS tocados comprobado por parent: PASS.
- Transparencia: primer E2E independiente se abortó en recuperación del POST perdido (`waitForURL: net::ERR_ABORTED`); una repetición idéntica completó todos los checks, sin editar runner/assertions ni loops sucesivos. Ambos logs en `/tmp/juliorifa-u2-verifier-{e2e,e2e-retry}.log`.
- Unidad2:258 líneas añadidas/21 retiradas de fuentes/tests, más sus notas; separadas de ~271 del primer bloque y ~285 de unidad1. Hashes de los cinco archivos nuevos de unidad1 intactos; patches de configuración, upload y catálogo preservados. `AGENTS.md` cierra el diagnóstico de imágenes sin atribuir infraestructura real. Sin secretos/DB real/puerto3000/migraciones/cron real/commit/despliegue ni evidencia de carreras PostgreSQL multiconexión.

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
