# Backend por bloques

## Alcance y estado

Histórico de implementación (antes del cierre autorizado de desarrollo): escritor único. Árbol inicial untracked preservado; ningún git terminal action, secreto inspeccionado/editado, S3 real/correo real ni DDL en DB real. Instalación inicial autorizada AWS SDK/sharp y PGlite DEV; AWS sustituido posteriormente por Supabase SDK 2.117.3. Outputs tooling esperados.

## Bloque 1 — completo

- [x] Dominio modular, sparse occupancy, compra/tickets/auditoría/settings/draw/outbox.
- [x] Rifas/inventario público sin PII, administración/CSV/bulk y reservas own/admin con autorización DB, snapshots cents/fee e idempotencia.
- [x] 0001 generado offline; baseline auth/todos no aplicado en esa fase histórica.
- [x] Tests reglas/static SQL; no carrera PG real afirmada.

## Bloque 2 — completo, sin activación de infraestructura

- [x] Supabase Storage nativo lazy server-only, configuración privada y error claro cuando falta (sustituye el adaptador AWS histórico).
- [x] Bytes raw acotados antes buffer, MIME/signaturas, sharp decode/reencode/40MP/metadata, proof PDF privado attachment.
- [x] Assets pending/verified/orphan/deleted y asociación owner/purchase/raffle; proof no attachable como image por admin.
- [x] I/O Storage fuera de transacciones; finalize revalida reloj posterior al lock; reviewing sin expiry.
- [x] Approve/reject admin auditados, sold/liberación atómica, eventos outbox únicos sin envío.
- [x] Settings admin-only auditados y snapshot obligatorio al crear apartado, sin datos demo.
- [x] Corrección criterio monetario: transferencia subtotal, fee gasto admin, sin recargo.
- [x] Corrección hallazgo P2 cancelación vencida: resultado expired retorna desde tx, conserva commit/liberación. Mismo patrón finalize/review vencidos.
- [x] Tests-first: módulos workflow/storage ausentes dieron RED bootstrap; cambio dinero dio RED de comportamiento (311 vs303 esperado). PGlite también detectó RED real: pending proof con key traversal era aceptado por repositorio; ahora exige proofs/<asset UUID>. Fixtures async de roles y regex sensible al formato fueron corregidos.
- [x] PGlite autorizado: migrations SQL en memoria, repositorio workflow real inyectado, expiry commit/rollback/ownership/proof/review/history/unique occupancy/outbox probados.
- [x] HTTP uploads/media/review/settings thin routes y router generado; APIs serverFn listas para futura UI.
- [x] 0002 generado offline; solo reemplazo CHECK de dinero, sin DROP de datos/auth/todos.

## Bloque 3 — código completo, infraestructura no activada

- [x] startNumber configurable incluyendo 0 + validadores/constraints/rangos/CSV; no renumeración con historia.
- [x] prizeCostCents/expensesCents y drawAt independiente salesDeadline; preservar campos originales UI antes de bloque 4.
- [x] Sorteo interno paid auditable, digest ganador inmutable, finanzas/comisión como gasto.
- [x] Worker outbox/email y recuperación pending/orphan; no borrar verified tras commit incierto.
- [x] Recuperación del writer interrumpido: código existente preservado, guard global por usuario además de destino, tokens/TTL y gate CLI explícito antes de importar DB.
- [x] 0003 existente y 0004 generada offline; ninguna aplicada en DB real en esa fase histórica. PGlite y transports fake validan el contrato, no carreras PG multiconexión.

La validación final detallada se entrega en el handoff del writer; no confundir código completo con infraestructura activada o UI integrada.

## Bloque 4A — público y compras propias integrados

- [x] Catálogo/detalle/inventario público vía ReactQuery + serverFns, sin seed/useStore ni autoridad de negocio local.
- [x] Numeración incluyendo 0, páginas/búsqueda/sugerencias acotadas, selección máximo 1000, restauración revalidada TTL 30 minutos y confirmación explícita idempotente.
- [x] Mis apartados autenticado, owner gate para client/admin propios, caché privada por identidad y limpieza al cambiar sesión/salir.
- [x] Snapshot bancario/importe servidor, estado/historial/motivos, countdown cliente, comprobante bytes raw y descarga privada; reviewing retenido sin expiry, sin aprobación falsa.
- [x] Tests fixtures puros/SSR; backend PGlite en memoria conservado. Validaciones exactas y límites en handoff del writer.

## Bloque 4B — completo, revisión ordinaria independiente PASS; infraestructura no activada

- [x] Dashboard único protegido en servidor, secciones por hash y componentes/hooks feature-owned; sin negocio local/seed/demo.
- [x] Rifas filtradas/paginadas, editor completo, fechas MX explícitas, creación draft→upload raw→attach verificado→publicación opcional; fallos parciales conservan UUID/borrador.
- [x] Inventario admin incluyendo drafts, búsqueda/start 0/bulk <=1000 estricto, CSV real sin PII, bloqueo atómico backend.
- [x] Compras/filtros/admin customer DTO protegido, snapshots, comprobante privado, approve/reject reviewing+verified, motivos/confirmación e historial.
- [x] Métricas/stock/gráfica 14 días servidor, sorteo irreversible paid-only y resultado original; notificación encolada, nunca correo enviado ficticio.
- [x] Settings bancarios auditados con advertencia; outbox paginado/conteos globales/retry, sin activar jobs.
- [x] Caché private-admin/actorId; limpieza/cancelación en sesión/rol/logout/denegaciones y invalidación own/public/inventory/metrics tras mutación.
- [x] Tests-first leaf SSR/policies/params/cents/estados/snapshots/keys; SQL PGlite existente, no DB/mail/S3 real.
- [x] Corrección posterior 4A: ruta `/mis-compras` conecta actor servidor fresco y props; recuperación GET own por clave antes de filtrar inventario/reemplazar intención. Pruebas coordinator real + repositorio SQL PGlite readonly; HTTP/auth E2E aislado validado posteriormente.
- [x] Harness HTTP/browser aislado: BetterAuth/cookies/guards/servicios reales, PGlite memoria, transports fake; recovery lost POST por confirmación UI, proof/review/draw/outbox y responsive. Sin cambios de producción ni bypass de roles.
- [x] Revisión ordinaria independiente PASS: 19/19 harness (17 anteriores + callback/editor), 0 P1/P2, sin pageerror/hydration en desktop 1440/mobile 390. `gentle-ai-verify` (`muyfqera-1-qt7i`) repitió solo harness, no unit/build. No mezclar UUID con IDs legacy.
- [x] Histórico previo a tarea 21: carrito 0 en contexto sin cookies → login UI/NativeMagicLink 200/email fake → verify cookie/guards y callback con mismo token 32hex/intención/selección; sin trasplante de cookie, cero POST/compras antes de confirmar y exactamente un POST/fila después, UUID original, total 7525/snapshot bancario. Cinco solicitudes magic-link/seis verificaciones con replay tras reset; espera 61s sin desactivar limiter.
- [x] Editor UI real crea draft UUID → PNG file input/raw sharp → memoria S3 → attach/publicación → listado/edición de título/características/costos/ISO/centavos/start 0/media HTTP pixels. Sin API para crear esa rifa; bootstrap API previo conservado. Lost POST real commit+abort recupera ownKey readonly/UUID sin POST automático.
- [x] Evidencia inicial antes de Supabase, parent: 96/96 unit, tsc --noEmit, ESLint vite.e2e.config.ts/tests/e2e, Prettier harness/docs y Vite build PASS (warnings use-client de librería); `.output` sin __fixture/JULIORIFA_FIXTURE_KEY/credenciales fixture, puerto 3212 vacío tras cleanup. Producción congelada durante esa fase previa, sin fix final. Esperas URL/heading/noWaitAfter y foco/admin about:blank sin force-click/DOM dispatch ni mocks auth/negocio.
- [x] RDD off; ASSESS unassessable por árbol completamente untracked. Sin claims de cierre nativo/receipt ni commits/staging.

## Activación pendiente (no blocker de implementación)

Configurar Supabase Storage privado (`SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_STORAGE_BUCKET`; alias server legacy `SUPABASE_SERVICE_ROLE_KEY` solo si falta SECRET_KEY), `RESEND_API_KEY` + `EMAIL_FROM` y singleton bancario real; verificar bancos. Desarrollo ya completó DDL/admin (ver tarea 22 abajo). Para producción, reconciliar baseline 0000 (CREATE auth/todos) y legacy snapshots/importes antes de aplicar 0000–0004 bajo autorización separada; generación offline/no aplicación corresponde a fases históricas. Jobs requieren `JOBS_ENABLED=true` y `--confirm-jobs`, sin ejecutarlos en esta validación. No se probaron conexiones PG múltiples, workers distribuidos, Supabase Storage/Resend reales, privacidad efectiva del bucket, abort temporal contra proveedor real, deploy ni cron. Archivo/TTL vencido y todos los filtros permanecen en evidencia de reglas/repositorio, sin recorrido browser añadido. Sesión HTTP/browser end-to-end sí se probó únicamente en el harness aislado; no en infraestructura real. Contrato completo y límites en [backend.md](../backend.md).

## Tarea 20 — completa, evidencia histórica previa a Auth password; activación pendiente

- [x] Supabase SDK nativo 2.117.3 sin Auth ni fallback AWS; dependencias AWS retiradas. BetterAuth/DB/workflow/leases y keys UUID intactos.
- [x] Proof owner/admin HTTP 200 attachment private,no-store/nosniff/no-referrer, sin URL bearer externa; descarga en memoria acotada 10MiB/30s antes de Blob, no streaming end-to-end. Imágenes URL firmada 60s, cacheControl '0', sin afirmar overrides remotos S3.
- [x] Writer 99/99 unit y 19/19 HTTP/browser PASS (primer intento browser con pageerror intermitente, segundo PASS). Independiente Delta: 99/99 unit, 19/19 harness, tipos/lint/formato PASS, 0 P1/P2; no repitió build. Parent build Vite producción PASS, `.output` sin __fixture/JULIORIFA_FIXTURE_KEY/credenciales fixture; puerto 3212 libre confirmado por reviewer. Sin infraestructura real.

## Tarea 21 — Auth por contraseña, sin activar infraestructura

- [x] Better Auth 1.7.7: signup/sign-in email nativos, password 12–128, hash scrypt/credential existente, rol público ignorado y callback fresco checkout 32hex. Sin dependencia/migración ni cambio de negocio/Storage.
- [x] Registro autoSignIn no prueba correo: emailVerified=false; verificación/reset no disponibles. No Resend requerido para Auth, ni recuperación automática de cuentas magic-only por signup duplicado.
- [x] Promoción privada exige confirmación y credential existente; conserva no verificado. Sin CLI real/admin seed/infra.
- [x] 102/102 tests y 19/19 checkpoints HTTP/browser PASS; formulario password real en contexto anónimo conserva selección 0/token, cero auto POST y una reserva explícita. Wrong password/weak y oversized password/duplicado probados, limiter activo con espera 61s. Proof privado 200/editor/lost POST/sorteo/responsive/logout conservados.
- [x] Outbox no debilitado: eventos atómicos, 0 sent/3 retry/0 mails en cuentas no verificadas; retries pueden terminar en deadletter, incluso configurando Resend mientras falte verificación legítima. No afirmar tres entregas en modo actual.

Incidente RED de promoción y corrección DB lazy/inyección reportados en [auth.md](auth.md); evidencia histórica 99/19 Supabase se conserva arriba. DDL/admin reales de desarrollo completados posteriormente; verificación/recovery y producción siguen pendientes.

Objetos S3 históricos no se migran ni borran automáticamente: copiar SAME keys antes de cambiar proveedor requiere autorización separada. Bucket privado y clave server se configuran manualmente; no se activó Storage real.

## Tarea 22 — cierre operativo autorizado solo en desarrollo

- [x] Login 1–128, registro/confirmación 12–128. Revisión independiente: 102/102 unit, 20/20 browser (incluye credencial corta dummy), 0 P1/P2; tipos/lint/formato PASS y build del escritor PASS.
- [x] Comprobación de `public`/`drizzle` vacíos bajo advisory lock, `search_path=public`; 0000–0004 aplicadas, cinco migraciones registradas y 17 tablas `public` confirmadas. Producción rechazada, flags `--development`/`--confirm`; configuración intacta, otros esquemas sin tocar.
- [x] Cuenta administrativa proporcionada creada en transacción `user`/`account`, rol admin y `emailVerified=false`; hashPassword/verifyPassword Better Auth 1.7.7 contra hash DB antes del COMMIT. Entrada privada STDIN, advisory transaction lock y rechazo de credencial existente diferente; sin sobrescribir otras cuentas ni insertar sesiones.

No se comprobó login HTTP/cookies real ni despliegue. El incidente SELECT sin tabla user fue anterior a este DDL autorizado. Bancos, jobs/outbox, bucket privado/I/O Supabase, objetos S3 históricos, entrega proveedor, PG multiconexión y DDL de producción permanecen independientes y pendientes; guard de correo intacto, 0 sent/3 retry/0 mails en harness, posible deadletter.
