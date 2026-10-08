# Backend de rifas: bloques 1–4

## Administración corregida — estado actual

La administración usa únicamente **Resumen, Rifas, Compras e Ingresos**, con la estructura de `docs/design/Rifas-Nova-admin.html` y datos reales del servidor. Las secciones históricas de este documento describen implementaciones anteriores: Configuración y Notificaciones fueron retiradas, junto con sus funciones y productores de eventos. `/api/purchases/payment-settings` responde **410**; los jobs actuales solo realizan expiración y recuperación de archivos. Las tablas y migraciones históricas se conservan, sin DDL ni borrado de datos.

Compras abre un diálogo con vista privada de imágenes/PDF del comprobante, descarga alternativa y acciones reales de confirmar o cancelar compras en revisión. También permite cancelar reservas `awaiting_proof`, con autorización administrativa fresca, motivo, auditoría y liberación atómica de boletos. Confirmar pago continúa exigiendo evidencia verificada del servidor.

Las instrucciones de pago ya guardadas en cada compra permanecen inmutables. Para nuevas compras se usa la configuración existente del servidor o, en su ausencia, `PAYMENT_BANK`, `PAYMENT_BENEFICIARY`, `PAYMENT_ACCOUNT` y `PAYMENT_INSTRUCTIONS`, exclusivamente en servidor y solo si están completas. No se inventan cuentas; sin instrucciones completas el snapshot es nulo y no bloquea la reserva. Esta corrección no configura proveedores ni modifica datos reales.

## Activación segura

Bloque 4A conecta catálogo público, inventario/selección y Mis apartados a los serverFns existentes. Bloque 4B sustituye la UI administrativa local por contratos protegidos del servidor. Solo la intención de checkout se conserva en localStorage (sin identidad ni instrucciones bancarias): token 32hex, TTL 30 minutos y clave idempotente reutilizada al reintentar el mismo payload. Nada se reserva al regresar del login/registro por contraseña: hace falta confirmación explícita. DB de desarrollo preparada mediante autorización posterior: 0000–0004 aplicadas, cinco migraciones registradas y 17 tablas `public` confirmadas; admin privado creado con correo no verificado. Supabase Storage, Resend y jobs siguen pendientes.

Histórico de generación: migraciones **generadas offline** con `npx drizzle-kit generate --config drizzle/offline.config.ts`:

- `0000_bitter_cassandra_nova.sql`: baseline auth y **todos**, no aplicar ciegamente sobre DB existente.
- `0001_thankful_wong.sql`: tablas de dominio.
- `0002_big_the_fallen.sql`: assets, snapshots y auditoría; reemplaza únicamente CHECK purchase_money_valid para quitar el recargo. No borra tablas/columnas/auth/todos/datos.

En esa fase histórica no se aplicó DDL real; el cierre posterior de desarrollo sí aplicó 0000–0004 tras comprobar `public`/`drizzle` vacíos bajo advisory lock, con `search_path=public`, rechazo de producción y confirmación explícita. Sin tocar otros esquemas ni configuración. Si alguien aplicó 0001 con compras cobradas con fee, reconciliar explícitamente esos históricos antes del nuevo CHECK: 0002 no reescribe importes ni inventa instrucciones para compras anteriores (snapshot nullable legacy). No hay backfill bancario demo.

### Supabase Storage nativo (solo servidor)

Configurar `SUPABASE_URL`, `SUPABASE_SECRET_KEY` y `SUPABASE_STORAGE_BUCKET`. Solo si falta la clave secreta se admite explícitamente `SUPABASE_SERVICE_ROLE_KEY` legacy. Nunca anon/publishable ni `VITE_`; no fallback AWS. Configuración lazy: falta/configuración inválida devuelve STORAGE_NOT_CONFIGURED al usar storage, sin impedir import/build. URL sin credentials/query/hash, HTTPS remoto; HTTP solo loopback. Bucket identificador sin slash, puntos ni controles.

**Bucket privado**, creado/configurado manualmente bajo autorización separada; bloquear acceso público a TODO el bucket. La clave privilegiada permanece exclusivamente en servidor y debe protegerse como secreto. `@supabase/supabase-js` usa únicamente Storage, sin Supabase Auth; persistencia, refresh y detección de sesión deshabilitados. La migración Storage no cambió BetterAuth; el modo Auth actual es correo + contraseña (ver [auth.md](auth.md)). Upload Buffer con MIME verificado, cacheControl '0', upsert false, sin ACL pública. Errores proveedor sanitizados STORAGE_UNAVAILABLE; transport SDK sin redirects, deadline 30s y respuesta hasta 10MiB acotada antes de blob/buffer.

Activación manual pendiente: si existen objetos del proveedor S3 anterior, copiarlos a Supabase conservando EXACTAMENTE las keys `proofs/<UUID>` e `images/<UUID>` antes de cambiar configuración. No hay migración, borrado ni copia automática; ese trabajo requiere autorización separada. Filas, namespaces y leases existentes se conservan.

Dependencias: Supabase SDK nativo 2.117.3 sustituye AWS cliente/presigner (dependencias AWS retiradas); sharp (decodificación, límite 40MP, normalización raster/strip metadata), PGlite DEV (pruebas PostgreSQL en memoria). No se inspeccionaron valores secretos ni se hizo I/O con Supabase real.

## Contrato API

ServerFns: `{data: input}`; IDs UUID servidor, timestamps ISO, integer centavos. Zod strict rechaza userId/rol/importes de compra/flags de upload. Errores controlados; SDK/SQL desconocidos sanitizados.

### Rifas — `src/modules/raffles/services/server.ts`

- `createRaffle`: admin POST; title/description/status/ticketCount/priceCents/feeBps/salesDeadline/features/images. Crear con images=[]; subir imágenes después de obtener UUID.
- `updateRaffle`: mismos campos + id; archivar, nunca hard-delete. Cada key image debe corresponder a asset **image**, verified, generado servidor, asociado a esa rifa y al admin actual; un proof no puede publicarse ni siquiera por admin. No URLs/buckets/keys arbitrarias.
- `publicRaffles`, `adminRaffles`: GET `{offset=0,limit=50}` máximo 100.
- `publicRaffle`, `adminRaffle`: GET `{id}`; públicos excluyen draft/archived y todo detalle de compras. Imágenes incluyen mediaUrl, nunca proof keys.
- `adminRaffles` acepta además search/status; `adminInventory` es GET admin-only, mismo input y DTO de availableInventory pero incluye borradores/archivadas (requireAdmin por request).
- `availableInventory`: GET `{id,from,limit=100}`, máximo 1000; salesOpen/ticketCount/estados sin orderId.
- `blockTickets`, `unblockTickets`: admin POST `{raffleId,tickets}`, bulk atómico solo libres/blocked.
- `exportInventory`: admin GET `{id}`, CSV número/estado, sin PII.

### Compras — `src/modules/purchases/server.ts`

- `lookupOwnReservationByKey`: GET strict `{idempotencyKey}` solamente; requireUser fresco, SQL userId+key, DTO propio original o null. Readonly, sin expiración/mutación ni requisito de visibilidad pública de rifa; admite dueño client/admin, no otros actores. Root y hook lo consultan antes de inventario/reemplazar clave; auth pendiente/error conserva intención y bloquea checkout, recuperar solo navega a `/mis-compras?id`, nunca POST automático.
- `createReservation`: cliente POST `{raffleId,tickets,idempotencyKey}`, máximo 1000 distintos/rango. Idempotencia por usuario + clave exige mismo payload normalizado.
- `adminPurchases` acepta search (nombre/email/UUID), status y raffleId UUID, filtrados antes de paginar. Los DTOs admin-only incluyen customer name/email y proofVerified calculado desde el asset servidor, nunca ownerId/proofKey; own/public no reciben estos campos.
- `ownPurchases`, `adminPurchases`: GET paginado; `ownPurchase`, `adminPurchase`: GET `{id}`. Sin ownerId/proofKey; incluye snapshot paymentInstructions y reviewedAt.
- `cancelReservation`: cliente POST `{id}`; solo propia awaiting_proof. Si ya venció, **retorna expired tras commit** y libera, no lanza dentro de la transacción. Reviewing/paid no cancelables.
- `configurePayment`: admin POST `{bank,beneficiary,account,instructions}`; singleton y auditoría inmutable.
- `adminPaymentInstructions` y alias histórico `paymentInstructions`: **admin-only GET**. Cliente recibe instrucciones únicamente del snapshot de su compra.
- `approvePurchase`, `rejectPurchase`: admin POST `{id,reason}` (1–2000); destino no es input cliente.
- `purchaseAudit`: own/admin GET `{id}`; tipo/motivo/fecha, sin actorId público.

### HTTP real — rutas finas

Todos POST exigen Origin igual al request origin (Sec-Fetch-Site same-origin si presente) y cookie autenticada. Despliegue detrás de proxy debe preservar el origen público correcto.

| Ruta                              | Método/input                           | Autorización/respuesta                                                              |
| --------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------- |
| `/api/uploads/proofs/:purchaseId` | POST bytes crudos, Content-Type exacto | cliente owner; `{id,status:reviewing}` solo después de commit                       |
| `/api/uploads/images/:raffleId`   | POST bytes crudos                      | admin; `{id,key,mediaUrl}`, listo para attach por updateRaffle                      |
| `/api/media/proofs/:purchaseId`   | GET                                    | owner o admin; HTTP 200 bytes attachment privado, sin redirect                      |
| `/api/media/images/:assetId`      | GET                                    | público solo image verified adjunta a rifa visible; preview no publicada admin-only |
| `/api/purchases/:id/approve`      | POST JSON `{reason}` <=4096 bytes      | admin, pago verificado                                                              |
| `/api/purchases/:id/reject`       | POST JSON `{reason}` <=4096 bytes      | admin, motivo requerido                                                             |
| `/api/purchases/payment-settings` | GET / POST JSON <=8192 bytes           | admin, campos bancarios/configuración                                               |

No multipart/base64 JSON masivo: upload usa Request.body reader, rechaza Content-Length excesivo y cancela al exceder bytes **antes de concatenar**. PNG/JPEG/WebP imagen hasta 2MiB y 40MP; proof raster/PDF hasta 10MiB (raster también 40MP). MIME declarado debe coincidir con firmas; raster se decodifica/reencodea y elimina metadata/trailing payload. PDF exige header/EOF, permanece attachment privado, nunca HTML/SVG inline. **No antivirus ni validador semántico PDF completo**.

Proof GET conserva gates DB de owner/admin, asset verified, digest y recepción anterior al deadline; descarga con SDK y verifica tamaño/MIME contra DB. Los bytes se acumulan en memoria (Buffer/Blob), hasta 10MiB y con deadline de 30s antes de Blob; no es streaming end-to-end. Responde HTTP 200 con Content-Disposition attachment receipt.pdf/png/jpg/webp, private,no-store, no-referrer y nosniff. Nunca expone URLs bearer de proofs: la opción download de una URL firmada nativa no garantiza un attachment inmutable. Imágenes conservan redirect a URL firmada nativa por 60s; esos enlaces son bearer y no deben registrarse/publicarse fuera de su uso. Los headers privados del endpoint NO son overrides de headers remotos; no se afirma no-store remoto. Bucket sin acceso público global.

## Dinero, plazo e historia

Transferencia = precio snapshot × cantidad. FeeCents = techo(subtotal × bps /10000), **gasto admin histórico, NO recargo comprador**; totalCents=subtotalCents. Default fee cero; métricas posteriores deben descontarlo del resultado, no sumarlo a cobros. Precio/fee/instrucciones se copian al crear reserva; settings vacíos/no configurados producen PAYMENT_NOT_CONFIGURED antes de crear compra. Ediciones futuras no alteran pago en curso.

Awaiting_proof vence inclusivamente a createdAt+24h. Upload lee/valida bytes y hace upload Storage **fuera de locks**; luego bloquea raffle→order y revalida owner/plazo con reloj servidor obtenido después del lock. Solo upload Storage completado + asset generado/evidencia servidor permite verificar asset y reviewing. Expired finalize devuelve resultado controlado para conservar commit de expiración/liberación; error HTTP se emite después.

Reviewing nunca vence por tiempo. Aprobar requiere proof verified asociado/owner/digest/recepción anterior a deadline; cambia occupancy a sold. Rechazar cambia rejected y libera occupancy, conserva compra/tickets/proof/audit. Transición y evento outbox unique(event,key=orderId) son atómicos. Reintentos paid/rejected no duplican auditoría/notificaciones. La entrega outbox se ejecuta únicamente con jobs habilitados y confirmados; no se envió correo real en validación.

Pending asset se persiste antes de I/O. Si falla finalize/put: reclamar pending→orphan y eliminar objeto fuera de tx; si limpieza falla queda trabajo durable. Si commit fue incierto y asset ya verified, **no se elimina**. Crash puede dejar pending; el worker de recuperación reclama assets antiguos no referenciados, usa token/TTL, retry y deadletter sin borrar evidencia verificada de compras.

## Contrato implementado para bloque 4

**Bloque 3 ya incorpora**, antes de conectar UI: startNumber configurable (incluye demo 0; rango start..start+count−1, prohibir cambios con historia), prizeCostCents/expensesCents enteros no negativos y drawAt independiente de salesDeadline. Migrar CHECKs actuales ticket>0/rango y todos los validators/CSV/inventario sin renumerar historia. Estos campos ya forman parte del backend; no eliminarlos ni convertirlos silenciosamente al integrar UI.

Bloque 3 completo: sorteo interno paid auditable, worker outbox/email, recuperación storage huérfano y métricas/finanzas. Bloque 4A integra componentes públicos y compras propias; 4B integra administración. La revisión ordinaria independiente pasó, incluidas las correcciones 4A y los dos recorridos adicionales del harness indicados abajo; esto no activa infraestructura.

### Jobs y guard durable

Cron invoca `node --import tsx scripts/run-jobs.ts --all --batch 10 --confirm-jobs` con `JOBS_ENABLED=true`; modos alternativos `--expire`, `--outbox`, `--storage`, batch 1–25. `--execute` es alias de confirmación. Flags desconocidos, falta de confirmación o jobs deshabilitados fallan antes de importar DB/ejecutor. No ejecutar este comando durante validación offline.

Uploads reclaman primero el budget global del usuario y después el destino (kind/target), antes de leer/decodificar bytes. Máximo cinco admisiones por minuto y una activa por usuario, incluso entre destinos/kinds; otro actor en destino independiente puede avanzar. Conflictos devuelven 429. `active_token`/`active_until` en upload_budgets (0004) y lease de destino comparten token/expiry de cinco minutos; release condicionado no borra un token nuevo. Ningún I/O externo ocurre bajo estos locks.

Body reader y sharp tienen plazo de 30s; se comprueba lease después de decodificar, justo antes de PUT y antes de finalize. Finalize conserva validación durable del destino. Esta exclusión es best-effort frente a I/O colgado después del vencimiento: checks no cancelan un PUT ya iniciado ni garantizan ausencia de solapamiento físico tras reclaim. Pending/orphan durable permite recuperación; no se afirma una garantía de cancelación del proveedor.

0003 conserva las ampliaciones de bloque 3; 0004 añade únicamente los dos campos de lease global, generada con configuración offline sin cargar credenciales. El writer de recuperación no recreó sorteo/jobs/finanzas existentes.

## Evidencia y límites

Tests de reglas, bounded streams, MIME/dimensiones/tamaño, SDK stubs, URLs TTL/attachment, image/proof separación, limpieza y snapshots. PGlite PostgreSQL **solo en memoria**, con SQL generado y repositorio workflow real inyectado, prueba rollback/constraints/expiry/review/history/outbox. No lee DATABASE_URL ni conecta DB real. **No demuestra carrera entre dos conexiones node-postgres**. La evidencia HTTP autenticada aislada posterior se detalla abajo. Producción requiere reconciliar el baseline 0000 (CREATE de auth y todos) antes de aplicar 0000–0004 bajo autorización separada; desarrollo ya completó ese DDL. Bucket privado/settings reales y despliegue siguen pendientes. Para correo configurar `RESEND_API_KEY` y `EMAIL_FROM`; verificar bancos; admin de desarrollo ya creado por operación privada autorizada, no por CLI de promoción. La UI administrativa usa el backend; SMTP/infraestructura no se activaron.

## UI 4A — público y compras propias

- `Public.tsx` y hooks `usePublicRaffles` usan publicRaffles/publicRaffle/publicDraw; catálogo paginado de 24. No seed ni fallback ficticio. Imágenes solo mediaUrl del DTO.
- `TicketSelection` usa availableInventory en páginas de 100; búsqueda raw/padded incluyendo 0 y sugerencias aleatorias acotadas a una página de hasta 1000. Si esa página no alcanza la cantidad, se explica y no se agrega parcialmente. Máximo 1000 seleccionados; selección no es autoridad de inventario ni precio.
- `useCheckoutIntent` restaura desde URL o referencia local por rifa y revalida las páginas que contienen los números. Confirmación POST createReservation usa solo raffleId/tickets/idempotencyKey, nunca importes/roles/userId. Conflicto conserva la intención y actualiza inventario; no hay reserva parcial. Tras éxito navega a `/mis-compras?id=<UUID>`.
- `/mis-compras` exige currentUser en beforeLoad. ownPurchases/ownPurchase conservan owner gate incluso para un admin que consulta sus propios apartados; no se usa adminPurchases para esta pantalla. ReactQuery identifica caché privada con userId y la elimina al cambiar sesión/salir; no hay persistencia privada local.
- PurchaseSummary muestra totalCents e instrucciones snapshot, referencia copiable, plazo e historial con motivos vía purchaseAudit. Reviewing no muestra vencimiento ni pago aprobado. El reloj/countdown comienza en efecto cliente, sin markup temporal SSR divergente.
- Proof POST usa File como bytes raw, Content-Type declarado y credentials same-origin. MIME/tamaño cliente son ayuda; validación y recepción las decide servidor. Errores y 429 no simulan éxito; se refresca el apartado. Descarga privada usa GET owner/admin HTTP 200 attachment privado del backend, nunca URL firmada guardada localmente.
- Solo awaiting_proof vigente muestra subida/cancelación. Cancelación vencida refresca el DTO expired; paid/reviewing no se convierten localmente por acciones UI. Ganador propio se indica únicamente si paid y publicDraw coincide con uno de sus tickets.

Validación UI: tests puros/SSR con DTO fixtures, tests PostgreSQL en memoria existentes, tsc/lint/build. No se hicieron requests de inventario ni compras a la DB real, uploads S3 reales ni browser E2E contra infraestructura real. Harness HTTP/browser aislado y revisión independiente: 20 casos PASS, sin mocks de auth/negocio, sin pageerror/hydration y con revisión responsive en desktop 1440/mobile 390. Producción, configuración bancaria/Supabase Storage/Resend/jobs requieren activación separada; DDL/admin de desarrollo ya completados.

## UI 4B — administración

`/dashboard/` sigue siendo la única ruta administrativa; beforeLoad conserva currentUser/dashboardAccess en servidor. Secciones por hash: Resumen, Rifas, Compras, Ingresos, Configuración y Notificaciones. Diseño Nova conservado, con dialogs nativos y formularios feature-owned; no useStore, seed, simulaciones ni business localStorage en las vistas.

ReactQuery privado: `['private-admin', actorId, kind, params]`, habilitado solo tras identidad/rol currentUser verificados. Cambio de sesión/rol, signout y denegación API cancelan/eliminan caché privada; no se renderiza data previa cuando una consulta falla. Header limpia también own-purchases. Mutaciones invalidan private-admin, own-purchases, public-raffles/public-raffle/public-draw/public-inventory. Refocus y polling administrativo/own detail refrescan otros navegadores, sin claims de push en tiempo real.

- Rifas: listado/filtros/páginas servidor, editor completo en centavos/fee bps/costos/gastos/numeración, características y fechas civiles de Ciudad de México UTC−06 normalizadas explícitamente a ISO UTC. Estados sin sorteo manual; archivo conserva historial, nunca hard-delete. Sorteo usa executeDraw y resultado original adminDraw; confirma irreversibilidad, servidor elige el ganador y exige pagos/plazos/ausencia de pendientes.
- Imágenes: crear primero draft con images=[], raw upload POST /api/uploads/images/:UUID, Content-Type file.type, máximo 2 MiB PNG/JPEG/WebP; attach updateRaffle solo assets verificados por servidor. UUID y adjuntos exitosos se conservan tras fallo parcial; borrador visible/reintentable. Biblioteca solo adjuntos reales de esa rifa, thumbnails con carga/error, sin base64 ni keys arbitrarias. Publicación opcional ocurre después de uploads/attach.
- Inventario admin: páginas/búsqueda desde startNumber (0 válido), rangos estrictos distintos dentro de límites y máximo 1000; atomic backend rechaza ocupados. CSV guardado como Blob con nombre UUID y conteo real de filas, número/estado sin PII. Refresh limpia selección/recibo.
- Compras: todas las fases backend, filtros UUID/status/search en servidor, cliente admin-only, importes/instrucciones bancarias snapshot, recepción/revisión y auditoría. Comprobante solo descarga privada GET, no iframe/URL bucket. Aprueba/rechaza únicamente reviewing + prueba verificada en DTO (backend sigue siendo autoridad), con motivo y confirmación importe/banco/UUID. POST API same-origin; paid idempotente no duplica correos. Mensajes dicen notificación encolada, no enviada.
- Finanzas: adminFinancialMetrics consulta snapshots y costos en servidor, fee como gasto; reviewing distinto de cobrado, neto y stock actual por UUID. Gráfica 14 días de aprobación America/Mexico_City con títulos SVG de un solo string. No finanzas calculadas desde store.
- Configuración: GET/POST /api/purchases/payment-settings protegido; alerta si falta. Modificaciones futuras no alteran órdenes previas; auditoría backend intacta.
- Notificaciones: lista paginada, cuentas globales pending/sent/retry/deadletter (y leased), retry del mismo evento admin-only. No endpoint de correo arbitrario ni botón de jobs reales. Filtro visual explícitamente limitado a página actual.

### Revisión independiente completada

Tests UI usan DTO fixtures/SSR y políticas puras; pruebas SQL siguen siendo PGlite en memoria. Ningún request de negocio de las validaciones apunta a DB real, S3 o correo. No se aplicaron/generaron nuevas migraciones en 4B. Compilación no certifica HTTP autenticado ni carreras multiconexión ni entrega real.

La unidad posterior corrigió ambos hallazgos 4A: `/mis-compras` con guard fresco, búsqueda UUID segura y PurchasesPage con user/id; recuperación del apartado propio antes de filtrar números reservados tras respuesta POST perdida. Tests prueban el coordinator empleado en root/hook y el repositorio SQL readonly en PGlite. HTTP BetterAuth/browser E2E aislado se añadió posteriormente (ver abajo). En esa fase histórica la operación real no estaba autorizada; posteriormente se autorizó y completó únicamente DDL/admin de desarrollo.

## Harness HTTP/browser aislado

Ejecutar `node --import tsx tests/e2e/run.ts`. El runner levanta y cierra **su propio** Vite en `127.0.0.1:3212`, con `vite.e2e.config.ts` separado del build principal y Chromium global preinstalado. No instala dependencias ni reinicia otros servidores. El config solo admite `serve`.

Frontera de fixtures (`tests/e2e/`): PGlite en memoria aplica SQL 0000–0004; aliases reemplazan exclusivamente DB, configuración auth, transporte email y almacenamiento. BetterAuth, adapter Drizzle, cookies, currentUser, guards, serverFns, servicios, validación sharp y workers siguen siendo los originales. Nitro usa runner `self`: el estado compartido por Symbol evita dos bases/mailboxes entre config y SSR. Readiness espera migraciones; cierre del servidor cierra PGlite. Helpers privados requieren clave aleatoria del runner, no aceptan rol/SQL arbitrarios; promoción fija del admin ocurre solo en memoria. Imágenes fixture se sirven por firma/TTL; esa firma HMAC es exclusiva del fake, no una garantía de Supabase. Proofs se descargan desde memoria mediante el servicio y ruta owner/admin originales, HTTP 200 attachment privado.

El browser aborta destinos no loopback; fetch servidor está limitado a loopback. Variables dummy DB/Supabase apuntan a puerto 9, correo usa dominio `.invalid` y jobs están deshabilitados **antes** de cargar el config base. Mailbox y stdout no imprimen links, tokens, cookies ni emails. No hay TEST_MODE ni endpoints de fixture en `src/`.

Casos observados en HTTP/browser real:

- Visitante privado redirigido; signup/password nativo crea usuario/sesión client no verificado e ignora rol admin. Wrong password 401 sin sesión, password débil/excesivo y duplicado rechazados; el duplicado no reemplaza credencial. Promoción privada de cuenta credential + nuevo login permite dashboard sin marcar correo verificado. Limiter 5/60 por endpoint activo, espera 61s ante 429 para login legítimo; cero mails Auth.
- Settings admin same-origin; el bootstrap API existente se conserva. Nuevo recorrido por editor UI real: draft con UUID servidor → PNG por file input/raw sharp → almacenamiento memoria → attach/publicación → listado/edición de título, características, costos, fechas ISO, centavos, startNumber 0 y media HTTP con pixels verificados; esa rifa no se crea por API. Nuevo contexto sin cookies: selección anónima 0 → login UI real → sign-in/email password 200 → cookie/guards nativos → callback con el mismo token 32hex/intención/selección 0. Cero POST/compras antes de confirmar; tras confirmación explícita, exactamente un POST/fila con UUID original, total 7525 y snapshot bancario. Sin trasplante de cookies en este caso; recorridos previos sí usan cookies nativas antes emitidas.
- Pérdida de respuesta: solo POST createReservation es interceptado; `route.fetch` confirma commit real antes de abortar. Reload raíz recupera UUID original mediante GET readonly y no repite POST; conteo e instrucciones/importes permanecen estables.
- Proof PNG/PDF real; descarga HTTP 200 attachment privado y bytes verificados, sin URL externa; firma/expiry falsos tampoco evitan autorización; otro owner no obtiene proof/orden/clave. Inputs de importe/actor y review client rechazados. Approve/reject reales, liberación, snapshot inmutable y outbox sin duplicados.
- Sorteo crypto con solo un ticket paid; resultado/digest estable, índice/owner admin verificados y un evento ganador. Worker/repositorio/guard reales rechazan destinatarios no verificados: 0 sent, 3 retry, 0 mails capturados, sin proveedor.
- Seis secciones admin, 14 títulos SVG con un solo nodo texto; sin pageerror/hydration. Document overflow en 1440/390 para público/account/admin; logout real elimina acceso privado.

Evidencia inicial antes de Supabase, proporcionada por el parent: 96/96 unit PASS, `tsc --noEmit`, ESLint de `vite.e2e.config.ts` y `tests/e2e`, Prettier harness/docs y build Vite PASS (warnings de librería use-client). `.output` sin `__fixture`, `JULIORIFA_FIXTURE_KEY` ni credenciales fixture. Harness: 17 anteriores + 2 nuevos = 19 PASS tanto en parent como en revisión independiente `gentle-ai-verify` (`muyfqera-1-qt7i`), 0 P1/P2. El reviewer repitió solo el harness, no unit/build. Fuente de producción congelada durante esa fase previa, sin fix final; puerto 3212 vacío tras cleanup según parent. Esperas UI explícitas por URL/heading con noWaitAfter y foco/admin about:blank en segundo contexto, sin force-click/DOM dispatch ni mocks auth/negocio. Revisión ordinaria independiente PASS; RDD off, ASSESS unassessable por árbol totalmente untracked, sin afirmar cierre nativo ni receipt.

### Migración a Supabase — evidencia histórica previa al cambio Auth

Evidencia proporcionada por el parent: writer 99/99 unit y 19/19 HTTP/browser PASS; el primer intento browser tuvo un pageerror intermitente, el segundo pasó. Lector/verifier independiente Delta: 99/99 unit, 19/19 harness, tipos, lint y formato PASS; 0 P1/P2. El independiente no repitió build. Build Vite de producción del parent PASS; `.output` sin `__fixture`, `JULIORIFA_FIXTURE_KEY` ni credenciales fixture. Reviewer confirmó puerto 3212 libre. Durante esa migración los guards API nativos, BetterAuth, DB, plazo de 24h y workflow reviewing permanecieron sin cambios. Posteriormente la tarea 21 cambió únicamente el modo Auth y sus tests/docs autorizados.

### Auth password — evidencia actual, tareas 21–22

102/102 unit y 20/20 HTTP/browser PASS, revisión independiente sin P1/P2, tipos/lint/formato PASS y build del escritor PASS. Better Auth 1.7.7 nativo con login 1–128 y registro 12–128 y scrypt en account existente; sin cambios de dependencia/DDL. Registro inicia sesión pero no prueba propiedad del correo (`emailVerified=false`). Sin Resend para Auth ni emails de verificación/reset disponibles. Cuentas antiguas magic-only requieren futura recuperación privada legítima, no signup duplicado/takeover. Promoción CLI requiere usuario credential existente y confirmación, sin verificación ficticia; no se ejecutó realmente. Admin de desarrollo creado en transacción `user`/`account` con hash nativo verificado contra DB antes del COMMIT; sin sesiones manuales ni login HTTP/cookies real comprobado. La UI aislada incluye credencial corta dummy; no acredita despliegue.

Outbox/auditoría permanecen atómicos. El guard de destinatario verificado no cambió: incluso con Resend configurado, claims no verificados causan retry y eventualmente deadletter si se agotan intentos; no entrega ni promesa de cola eterna. Habilitar verificación legítima requiere trabajo/autorización separados. Delta Supabase preservado; cifras 99/19 anteriores son históricas, no tests del Auth actual. RED/incidente y corrección de aislamiento documentados en [tasks/auth.md](tasks/auth.md).

Límites: no prueba PG multiconexión, workers distribuidos, Supabase Storage/Resend reales, privacidad efectiva del bucket, abort temporal contra proveedor real, antivirus, despliegue ni cron. Firma/TTL del fixture no verifica JWT nativo ni attachment inmutable de URLs del proveedor. Archivo/TTL vencido y todas las combinaciones de filtros continúan cubiertos por tests de reglas/repositorio, no por nuevos recorridos browser. Migraciones 0000–0004 generadas offline históricamente y ya aplicadas en desarrollo; DDL de producción, configuración bancaria, bucket/objetos históricos y ejecución de jobs requieren autorización separada.
