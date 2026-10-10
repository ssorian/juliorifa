# Adaptación HTML Nova

## Detalle de apartado y diálogo — rediseño cliente

- Jerarquía Nova oscura/roja: título real si el DTO lo trae, fallback «Tu apartado», referencia completa discreta, importe/cantidad/fecha y badge. Sin enriquecimiento backend ni cambio de snapshots.
- Primeros 12 boletos en chips; disclosure nativo con todos los números y scroll acotado, incluso 1000. Snapshot bancario en grid, seguimiento rojo, historial con eventos conocidos en español y desconocidos sin reinterpretar. Upload privado conserva selección/envío explícito, MIME y callbacks originales.
- CSS importado directamente por TicketSelection: diálogo angular acotado al viewport, cierre, ramas de login/confirmación y estimado con jerarquía. PurchaseDetail conserva montaje, ref y guards originales; no cambia autoridad, cancelación, idempotencia ni retención reviewing.
- RED SSR observado: título seguía exponiendo UUID y no había disclosure. GREEN focalizado 10/10 (presentación, upload, contrato diálogo); TypeScript PASS. Test de audit nuevo falló primero por export ausente, no se atribuye RED conductual a ese bootstrap.
- E2E completo intentado: pasó detalle de producto responsive y comprobantes privados previos; se detuvo en «new anonymous context same-cart native password UI», assertion 2 !== 1, antes del nuevo chequeo de geometría del diálogo. No certifica este rediseño visual 1440/390/320. No se corrigió ni se afirma corregido el bug pendiente de sugerencias; cambios heredados preservados y diagnósticos no ocultos.
- Verificación independiente aislada con Auth real/PGlite: confirmación explícita, copia de referencia completa, disclosure de 107/1000 boletos, upload HTTP200→reviewing y cancelación PASS. Sin overflow horizontal a 1440/390/320; pageErrors=0/hydrationErrors=0. No acredita suite E2E completa ni PostgreSQL multiconexión.
- Pendientes visuales conocidos: CSS heredado mantiene diálogo morado y máximo 600px; importe largo puede cortar decimales a 320px; motivo `proof_received` aún aparece literal. El arreglo posterior se interrumpió antes de cerrarse. El bug de sugerencias sigue sin cierre verificado.
- Sin DB real, secretos, DDL, dependencias ni procesos ajenos. Commit/push autorizados posteriormente por el usuario; TypeScript y `git diff --check` revalidados sobre el candidato final.

## Ampliación autorizada — retiro anticipado totalmente vacío

- Retiro manual también antes de cierre/drawAt para active/closed/paused/scheduled/draft únicamente sin compras de ningún estado y sin ninguna occupancy, incluidos blocked. Compras cancelled/rejected/expired impiden esta excepción anticipada; las ramas vigentes de resultado y fechas vencidas sin pagos/pendientes permanecen.
- Dos EXISTS calificados adicionales comparten la consulta por página/detalle y la relectura bajo lock; update archived sigue delegando al mismo guard administrativo fresco. Sin hard-delete ni archivo automático: permanece visible hasta el retiro manual. UI usa canArchive servidor y confirma retiro sin sorteo sin exigir Terminada.
- RED PGlite observado: rifa futura vacía devolvía canArchive=false. GREEN focalizado: 5/5 pruebas externas, con dos nuevos casos hijos para estados vacíos futuros/reintento y rechazo por historia cancelled/rejected/expired o occupancy blocked/sold/reserved/reviewing. Conserva regresiones SQL de aliases y expiración tras rechazo. Sin DB real, secretos, DDL, build, suites globales ni commit.

## Corrección P1 — correlación SQL de elegibilidad de retiro

- Drizzle descalificaba columnas interpoladas dentro del SELECT sin joins: EXISTS no correlacionaba correctamente con la rifa externa. Corregido con fragmentos constantes calificados y aliases ad/ap/ao explícitos; fechas e IDs continúan parametrizados, sin concatenar valores.
- RED observado ejecutando la consulta original en PGlite en memoria: resultado real de otra rifa no se detectaba correctamente (`canArchive=false` para la rifa con resultado). GREEN de regresión SQL: PASS. La consulta real de listado/detalle y acción archive cubre resultado propio/ajeno, pagos sin occupancy, reviewing sin occupancy, awaiting vigente, sold sin paid y reserved asociado a compra de otra rifa. Datos ajenos no bloquean una rifa vacía.
- Expiración real conserva commit/liberación aunque reviewing impida archivo; reviewing permanece intacta. Fixture reutiliza testDatabase y migraciones exclusivamente en PGlite en memoria: no DB real, secretos, DDL operativo ni evidencia PostgreSQL multiconexión.
- Validación final: `node --import tsx --test src/modules/raffles/services/archive-sql.test.ts src/modules/raffles/services/archive.test.ts` PASS (2 wrappers, contratos hijos); `node node_modules/typescript/bin/tsc --noEmit` PASS. Sin build/full/harness.

## Catálogo — excepción autorizada de retiro sin sorteo

- Retiro manual sin resultado: únicamente active/closed/paused/scheduled con salesDeadline y drawAt cumplidas, ninguna compra paid (incluso sin occupancy), ninguna reviewing/awaiting vigente ni ocupación sold/reviewing/reserved inconsistente. Con ventas se mantiene retiro tras resultado real. Draft y fechas futuras no habilitan la excepción.
- archive exige admin fresco y lock de rifa antes de expireReservations. La expiración/liberación existente se confirma incluso si después se rechaza el retiro; reviewing nunca se cancela. Reintento archived no escribe. update con status archived delega a la misma acción estrecha e ignora cambios de campos: no permite adelantar fechas ni alterar historia para eludir el guard.
- Metadata administrativa consulta evidencia en una consulta adicional por página/detalle con EXISTS correlacionados, sin peticiones N+1. canArchive y archiveWithoutDraw derivan de fechas/evidencia servidor; la mutación relee bajo lock. UI confirma «Retirar del catálogo sin sorteo», sin ganador ficticio; diálogo explica ausencia de participantes y muestra fecha legible.
- RED lifecycle observado: la excepción vacía fallaba DRAW_REQUIRED_BEFORE_ARCHIVE. GREEN focalizado 4/4 pruebas externas (incluye dos contratos hijos): fechas, pagos, pendientes/ocupación, autorización/lock, rechazo tras commit y reintento. Tests de transporte simulan evidencia/expiración; no acreditan SQL real ni carreras PostgreSQL multiconexión. Sin full/build/harness, DB real, secretos, migraciones, cambios cron o commit.

## Catálogo — Terminada y retiro manual tras sorteo (política anterior ampliada arriba)

- DTO servidor deriva salesOpen/completed usando un único reloj por rifa. Active/closed/drawn con salesDeadline cumplido muestran Terminada; paused/scheduled y agotamiento no se convierten en terminadas. No modifica estados persistidos ni filtra el catálogo por fecha.
- Catálogo conserva concluidas con Ver rifa. Tabla administrativa muestra Terminada y Retirar del catálogo con confirmación; antes del sorteo la acción queda deshabilitada con explicación. Sorteo y su diálogo conservan evidencia y contacto privado existentes.
- Política elegida explícitamente: retirar **después del sorteo**. POST archiveRaffle valida requireAdmin fresco, lock de rifa, cierre y resultado realmente existente. Solo actualiza status/updatedAt; reintento archived no escribe. El update anterior también exige resultado antes de archivar, evitando saltarse esta política. Sin compras canceladas, hard-delete, migraciones ni cambios al cron.
- Pruebas focalizadas: lifecycle, catálogo SSR, detalle previo y contrato server con transporte aislado PASS (5 pruebas externas, con subprocesos que verifican autorización antes de transacción, lock, resultado ausente e idempotencia). RED previo: derivación incorrecta y guard de archivo ausente, dos fallos conductuales. Test de archivo añadido después de implementación, sin atribuir RED retroactivo.
- Invalida cachés mediante useAdminAction vigente. Sin filtro nuevo Terminada, build, suite global, browser, DB real, secretos, commit ni despliegue. El permiso de hooks/useAdmin.ts no corresponde al archivo .tsx existente; no fue necesario editarlo.

## Detalle público — retiro del recuadro de sorteo

- ProductDetail deja de montar DrawStatus y de consultar usePublicDraw. Conserva fechas del detalle, premio/features, disponibilidad, franja concluida/agotados y TicketSelection. DrawStatus, resultados en otras vistas y backend intactos.
- RED SSR observado: dos casos seguían mostrando Estado del sorteo/Actualizar resultado, incluido resultado con boleto cero. GREEN focalizado: 4/4 pruebas externas (7 casos SSR hijos); TypeScript PASS. Sin verificación browser nueva, DB real, secretos ni commit; cambios previos preservados.

## Detalle público — aviso terminal de venta

- TicketSelection reemplaza todos los controles del panel cuando una lectura exitosa del servidor indica salesOpen=false o el resumen global available=0. Cierre tiene prioridad: «Esta rifa ha finalizado» frente a «Boletos agotados». Aviso grande, explicación de compra imposible y enlace al catálogo `/`.
- No infiere agotamiento desde sugerencias vacías/exclusiones, inventario paginado, carga ni error (incluido dato cacheado de una query fallida). Guards de compra conservados y confirmación ahora exige open; no usa reloj cliente ni sold para decidir agotamiento.
- El diálogo permanece montado fuera de la rama del panel y PurchaseDetail confirmado tiene prioridad sobre el aviso terminal. No se limpia reservedId por invalidación; recuperación idempotente y backend no cambian.
- RED conductual observado en SSR: faltaba «Esta rifa ha finalizado» y seguían forms/selección/CONTINUAR/confirmación renderizados con venta cerrada. GREEN focalizado: 10/10 pruebas (incluye wrappers SSR y refresh), cierre/agotamiento/error/exclusiones, markup sin controles y recuperación sin replay. `node node_modules/typescript/bin/tsc --noEmit`: PASS.
- Sin verificación browser en esta unidad: el harness genera artefactos fuera de las superficies autorizadas y no se amplió ese permiso. La preservación de PurchaseDetail se verificó por estructura y tests existentes del contrato de diálogo, no por upload interactivo tras la última reserva. Sin DB real, secretos, reinicio de servidores, commit ni despliegue.

## Detalle público — franja terminal sobre el premio

- ProductDetail reutiliza salesState del resumen global exitoso: cierre precede a agotamiento. Franja oscura únicamente al pie de la imagen con «RIFA CONCLUIDA» o «BOLETOS AGOTADOS» y «Ya no es posible comprar boletos»; badge coherente, eyebrow y nota de apartado ocultos en terminal. Avisos del panel derecho sin cambios.
- Imagen, nombre, descripción, precio, fechas, disponibilidad, features y DrawStatus conservados. salesOpen=false con status active no afirma sorteo realizado; carga/error, incluso con cache terminal, no inventan cierre ni agotamiento.
- RED SSR observado: faltaba detail-sales-strip y seguían RIFA ACTIVA, eyebrow y nota con venta cerrada. GREEN: comando focalizado ProductDetail/TicketSalesNotice/sales-state PASS (4 pruebas externas, incluye 5 casos SSR hijos); tipos PASS. Triangulación: activo, cierre y agotamiento simultáneos, agotado abierto, carga/error y resultado con boleto cero.
- Corrección independiente sin imagen: clase detail-image-fallback, altura mínima y espacio superior para badge; franja en flujo normal, sin alterar el overlay de imágenes existentes. RED SSR observado por ausencia de clase fallback; GREEN focalizado PASS (4 pruebas externas, 6 SSR hijos), tipos PASS. SSR comprueba placeholder, franja terminal y ausencia de img; no acredita geometría browser.
- CSS responsive con texto contrastado y posicionamiento inferior; sin verificación visual browser en esta ampliación. Sin secretos, DB real, cambios de panel derecho, reinicio de servidores ni commit.

### Ajuste de texto y fecha de cierre

- Franja y badge cerrado: «RIFA CONCLUIDA». La franja incluye «Fecha de cierre de venta:» con salesDeadline y formatDate de Ciudad de México, nunca drawAt. Etiqueta neutral también para cierre manual con plazo futuro, sin reloj nuevo ni afirmar que esa fecha ya ocurrió. Conserva «Ya no es posible comprar boletos»; agotamiento no añade fecha.
- RED SSR observado: tres casos fallaron por texto anterior/fecha ausente. GREEN focalizado: 4/4 pruebas externas (7 casos SSR hijos), tipos PASS. Cobertura de fechas distintas, borde UTC/México, cierre manual futuro, agotamiento sin fecha y fallback sin imagen. CSS, panel derecho y dominio intactos; sin verificación browser nueva.

## Mis apartados — lista producto

- Tarjetas con imagen/fallback, nombre actual del producto (sin ID visible de rifa), seis badges con texto/color, cantidad/total MXN, fecha/folio discretos y Ver apartado. Grid responsive; carga, vacío y error legibles. Errores de query o sesión no muestran datos privados cacheados. Detalle/pagos intactos.
- Lista propia obtiene órdenes/productos y boletos en consultas por página, sin catálogo por tarjeta ni lectura por boleto/orden. DTO allowlist sin contactos, usuario ni proof keys. Título disponible incluso archived; imagen únicamente del primer adjunto verificado, endpoint media existente y fallback para draft/archived o error. Gates Storage no cambian.
- Conserva expiración previa: transacción bloquea rifas distintas ordenadas antes de órdenes; reutiliza expireReservations con filtro de lote y relee cuando vence alguna. Retención reviewing, liberación/auditoría e historia siguen vigentes. Las escrituras por expiración conservan el mecanismo existente; no se afirma coste constante ni concurrencia PostgreSQL multiconexión.
- RED observado: título archived ausente, fallback ausente y caché privada renderizada durante error. GREEN final focalizado: 16/16; cubre seis estados, imagen/fallback, ownership, pending/no adjunto, archived/closed, expiración/liberación/historia y recovery original. Fallos iniciales por módulos ausentes y fixture status faltante no cuentan como RED conductual.
- Tipos/build y harness final PASS: lista real imagen/título/status/CTA y overflow 1440/390/320; imageFailures=0, pageErrors=0, hydrationErrors=0 y logout correcto. Primera corrida falló por assertions antiguas de DrawStatus retirado; bajo autorización se reemplazaron por ausencia en detalle activo/cerrado/sorteado, manteniendo validaciones de sorteo servidor y diagnósticos.
- Sin DB real, secretos, DDL, dependencias, reinicio del servidor del usuario, commit ni despliegue. CodeGraph no expuesto al writer; fuentes contrastadas directamente. Cambios previos preservados; ampliación de presupuesto hasta 400 líneas autorizada.

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

## Vista producto — corrección P2 de refresh

- Refresh explícito de sugerencias/inventario y búsqueda/cantidad ahora revalidan la query de resumen exacta de la misma rifa, incluso tras error. Coordinador fuera del render; sin setQueryData optimista ni bucles. Los guards de selección consumen también el resumen compartido: error o venta cerrada bloquean continuar. Las métricas siguen ocultando valores cacheados cuando el resumen falla.
- RED conductual observado: cuatro pruebas con QueryClient/QueryObserver reales mantuvieron sold1/disponibles9/venta abierta tras respuesta nueva sold2/disponibles8/cerrada; tampoco propagaban error del resumen. GREEN tras invalidación exacta y esperada; casos de rechazo de refresh y retry conservados. SSR amplía guards de resumen y error sin cargar dotenv/DB real.
- E2E ampliado: bloquear/desbloquear un número mediante servicios reales, exigir nueva respuesta de resumen tras ambos botones y métricas exactas, búsqueda/cantidad/presets sin reserva, apilado móvil. Divider reutiliza `.ticket-divider`; DrawStatus y avisos intactos.
- Cierre del parent sobre el candidato corregido: **126/126 pruebas, tipos/build y diff-check PASS**. E2E completo secuencial PASS: métricas exactas tras refresh, ocho sugerencias disponibles, búsqueda/cantidad/presets sin reserva, checkout explícito, recuperación sin repetir POST, comprobantes, sorteo y logout; imageFailures=0, pageErrors=0, hydrationErrors=0. Logs `/tmp/juliorifa-product-e2e-sequential.log`, `/tmp/juliorifa-product-tests-final.log` y `/tmp/juliorifa-product-build-final.log`. El intento anterior falló por import dinámico después del checkpoint producto mientras build corría en paralelo; interferencia de outputs es una hipótesis, no causa demostrada. Configuración y diagnósticos no se alteraron.
- Limpieza final de lint: el guard usa `isSuccess && data.salesOpen`; los mocks SSR respetan estados excluyentes de Query. Verificación independiente final 7/7, wrappers 2/2, tipos, ESLint de fuentes y diff-check PASS. La repetición del E2E tras esta simplificación fue interrumpida después de pasar producto, checkout, comprobantes y sorteo, sin registrar error; no se cuenta como corrida completa. Log `/tmp/juliorifa-product-e2e-final.log`; puerto 3212 libre tras cleanup.

## Vista producto — disponibilidad global

- Detalle en dos columnas: imagen contain en todos los breakpoints, título uppercase, descripción/features reales, precio/fecha y barra paid-only. Carga/error nunca inventan stock; retry explícito.
- Panel con hasta ocho sugerencias globales y Otros números, búsqueda directa conservada, cantidades/presets10/50/100, selección/limpieza/estimado/CONTINUAR. Sin demo ni ventaja de suerte. Inventario anterior colapsado; guards de lectura, venta y restauración preservados. POST de sugerencias es lectura, no apartado; checkout y PurchaseDetail originales intactos.
- Pruebas primero en servicio: fallo inicial por módulo ausente (bootstrap, **no RED conductual**). SQL PGlite real cubre sold/reserved/reviewing/blocked, vencimiento awaiting, cierre, cero/nonzero start, vacío/menos de8, libres fuera de primera página, máximo1m, límites/exclusiones y DTO sin PII. Primer intento posterior falló por fixture drawAt anterior a salesDeadline; corregida fixture sin relajar CHECK. SSR se añadió después de implementación: no se atribuye RED retroactivo.
- SSR aislado intercepta exclusivamente hooks/transporte antes de cargar módulos, sin dotenv/DB real; cubre métricas, features, sugerencias y guards/error/retry. El wrapper elimina NODE_TEST_CONTEXT heredado y exige nombres de pruebas en stdout: se detectó y corrigió una ejecución hija inicialmente vacía, no contada como evidencia final.
- Harness actualizado para abrir inventario opcional al elegir boleto0, contar solo POST idempotente de reserva y comprobar métricas contra estados del inventario servidor. Nuevo checkpoint antes del sorteo: ocho números únicos disponibles, refresh sin exigir set distinto por azar, geometría desktop, imagen loaded y overflow1440/390/320. Capturas generadas y revisadas en `/tmp/juliorifa-product-{1440,390,320}.png`. Browser completo, suite y build verificados por el parent después de la corrección P2 descrita arriba; diagnósticos pageErrors/hydration/images conservados.
- Sin secretos, DB real, migraciones, dependencias, procesos ajenos ni commits. Catálogo y baseline CSS ajenos preservados. No benchmark ni carrera PostgreSQL multiconexión acreditados.

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
