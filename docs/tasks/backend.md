# Backend por bloques

## Alcance y estado

Escritor único. Árbol inicial untracked preservado; ningún git terminal action, secreto inspeccionado/editado, S3 real/correo real ni DDL en DB real. Instalación autorizada AWS SDK/sharp y PGlite DEV; outputs tooling esperados.

## Bloque 1 — completo

- [x] Dominio modular, sparse occupancy, compra/tickets/auditoría/settings/draw/outbox.
- [x] Rifas/inventario público sin PII, administración/CSV/bulk y reservas own/admin con autorización DB, snapshots cents/fee e idempotencia.
- [x] 0001 generado offline; baseline auth/todos no aplicado.
- [x] Tests reglas/static SQL; no carrera PG real afirmada.

## Bloque 2 — completo, sin activación de infraestructura

- [x] AWS SDK S3 compatible/presigner lazy server-only, configuración nombres exactos y error claro cuando falta.
- [x] Bytes raw acotados antes buffer, MIME/signaturas, sharp decode/reencode/40MP/metadata, proof PDF privado attachment.
- [x] Assets pending/verified/orphan/deleted y asociación owner/purchase/raffle; proof no attachable como image por admin.
- [x] I/O S3 fuera de transacciones; finalize revalida reloj posterior al lock; reviewing sin expiry.
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
- [x] 0003 existente y 0004 generada offline; ninguna aplicada en DB real. PGlite y transports fake validan el contrato, no carreras PG multiconexión.

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
- [x] Carrito 0 en contexto sin cookies → login UI/NativeMagicLink 200/email fake → verify cookie/guards y callback con mismo token 32hex/intención/selección; sin trasplante de cookie, cero POST/compras antes de confirmar y exactamente un POST/fila después, UUID original, total 7525/snapshot bancario. Cinco solicitudes magic-link/seis verificaciones con replay tras reset; espera 61s sin desactivar limiter.
- [x] Editor UI real crea draft UUID → PNG file input/raw sharp → memoria S3 → attach/publicación → listado/edición de título/características/costos/ISO/centavos/start 0/media HTTP pixels. Sin API para crear esa rifa; bootstrap API previo conservado. Lost POST real commit+abort recupera ownKey readonly/UUID sin POST automático.
- [x] Evidencia parent: 96/96 unit, tsc --noEmit, ESLint vite.e2e.config.ts/tests/e2e, Prettier harness/docs y Vite build PASS (warnings use-client de librería); `.output` sin __fixture/JULIORIFA_FIXTURE_KEY/credenciales fixture, puerto 3212 vacío tras cleanup. Producción congelada, sin fix final. Esperas URL/heading/noWaitAfter y foco/admin about:blank sin force-click/DOM dispatch ni mocks auth/negocio.
- [x] RDD off; ASSESS unassessable por árbol completamente untracked. Sin claims de cierre nativo/receipt ni commits/staging.

## Activación pendiente (no blocker de implementación)

Configurar S3 privado (`S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`), `RESEND_API_KEY` + `EMAIL_FROM` y singleton bancario real; verificar bancos/admin y promoción por CLI privada autorizada. Reconciliar baseline 0000 (CREATE auth/todos) y legacy snapshots/importes antes de aplicar 0000–0004, solo generadas offline; aplicación requiere autorización separada. Jobs requieren `JOBS_ENABLED=true` y `--confirm-jobs`, sin ejecutarlos en esta validación. No se probaron conexiones PG múltiples, workers distribuidos, S3/Resend reales, deploy ni cron. Archivo/TTL vencido y todos los filtros permanecen en evidencia de reglas/repositorio, sin recorrido browser añadido. Sesión HTTP/browser end-to-end sí se probó únicamente en el harness aislado; no en infraestructura real. Contrato completo y límites en [backend.md](../backend.md).
