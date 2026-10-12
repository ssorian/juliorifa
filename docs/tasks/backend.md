# Backend por bloques

## Sorteo exclusivamente manual — estado vigente

- Sin schedule Vercel; endpoint legado siempre 410 privado, sin DB/runner ni dependencia de token. Export automático legado falla sin consultar DB.
- Fila abre DrawDialog; confirmación explícita dentro del diálogo y cancelación sin ejecución. Resultado original consultable. Servidor paid-only/crypto, ambas fechas, pendientes, admin, draft/archived, expiración con commit e idempotencia conservados; sin DDL.
- RED focal: cron respondió 503 en lugar de 410; servicio tocó DB; helper manual aún inexistente. GREEN final: 10/10, incluyendo draft/archived, fechas, contacto privado/auditoría manual, constraints históricos, expiry e idempotencia.
- Tipos/build PASS. Suite concurrencia2: 140/141, fallo `SSR product transport-isolated subprocess` al importar CSS en Node, sin cambios en este seguimiento. Lint tocado: dos errores y un warning en run.ts reproducidos con HEAD; no PASS global.
- Seguimiento del harness: selector del carrito limitado a `.inventory-details` (sugerencias e inventario representan el mismo boleto). Se conserva exactamente una selección y boleto 0. E2E aislado completo PASS: cron inerte, sorteo manual/cancelación/reintento, carrito/login/confirmación, contacto, logout, pageErrors=0, hydrationErrors=0 e imageFailures=0. Focal 10/10, tipos y diff-check PASS; no se afirma E2E del baseline.
- Pruebas aisladas no acreditan DB real, ACL Storage, despliegue ni mensajes. `env` preservado, sin instalación/migración/seed/commit/push.

### Pulido visual del sorteo manual

Corrección P2: mientras resultado o requisitos se refrescan, la elegibilidad queda deshabilitada y muestra **Verificando requisitos**, sin bloquear cierre/cancelación como una mutación. E2E retiene respuestas GET reales: RED observado (botón seguía habilitado), GREEN tras el fix y habilitación restaurada al recibir datos frescos. Focal 10/10, tipos, E2E completo y diff-check PASS; cero page/hydration/image errors. Primer intento de intercepción agotó timeout por glob que no coincidía; se corrigió el selector antes del RED válido.

Botón de fila con superficie, borde e icono; diálogo Nova con cabecera/cierre accesible, fechas servidor con hora CDMX, boletos pagados, disponibilidad y confirmación irreversible diferenciada. Resultado humano con contacto privado y auditoría desplegable; sin cambios backend. Avisos de borrador/archivo/sin participantes concisos, sin instrucciones de retiro ajenas al sorteo.

Verificación aislada: 10/10 focales, tipos y build PASS; E2E completo PASS, pageErrors=0, hydrationErrors=0, imageFailures=0. Asserts computed de botón y encaje/cierre del modal elegible a 1440/390; capturas `/tmp/juliorifa-draw-eligible-{1440,390}.png`. No se añadió recorrido visual específico de archivo/cero pagos; guardas deterministas existentes conservadas. Fallo global CSS 140/141 y lint históricos no revalidados ni declarados resueltos. Sin DB real, servidor3000, secretos, migraciones o commits.

La tarea 23 y sus instrucciones de activación cron siguientes son **evidencia histórica**, reemplazada por este estado; no reactivar cron/CRON_SECRET.

## Pulido del detalle administrativo de compras

- Resumen único de cliente/estado, total y precio guardados, cantidad y fecha CDMX. Nombre de rifa mediante `adminRaffle` existente con fallback; UUID, comisión y fechas secundarias desplegables. Contacto manual privado conservado.
- Comprobante privado limitado a 180px, descarga accesible; boletos completos en chips con scroll (incluye cero), banco con etiquetas españolas e historial traducido sin alterar motivos desconocidos. Paid sin formulario; cancelación/revisión conservan evidencia, motivo, confirmación y autoridad servidor.
- Modal máximo 90dvh: cabecera/cierre y acciones fuera del scroll interno, CSS exclusivamente `.purchase-dialog`. No cambia Mis apartados, DTO, snapshots, backend ni guards.
- RED de presentación observado: banco mostraba `bank`, no `Banco`. GREEN: 22/22 focales (SSR, fecha CDMX, 1000 boletos, motivos desconocidos, contacto y workflow/SQL en memoria); tipos/build PASS. Layout visual no tiene RED inventado.
- E2E aislado completo PASS con compra real de 108 boletos, paid/reviewing/awaiting, 1440x900, 390x844 y 390x480; cabecera/cierre/footer y scroll de boletos verificados. pageErrors=0, hydrationErrors=0, imageFailures=0, contacto privado/pago/logout conservados. Capturas `/tmp/juliorifa-purchase-{reviewing,paid,awaiting-proof,108-collapsed,108-expanded}-{1440x900,390x844,390x480}.png`; build `/tmp/juliorifa-purchase-build.log`.
- Límites: 1000 boletos cubiertos por SSR, 108 por navegador; fallbacks de banco/contacto sin fixture visual específica. No DB real, secretos, migraciones, mensajes ni servidor3000. Fallos históricos globales CSS/lint no revalidados ni declarados resueltos.

### Seguimiento acotado: frescura de compra y diagnóstico de cierre

- P2 confirmado: acciones de compra con datos cacheados seguían habilitadas durante refetch. RED navegador con GET real retenido: Confirmar pago `false !== true` para disabled. Fix: aprobación/rechazo/cancelación awaiting se deshabilitan y handlers rechazan mientras `query.isFetching`; cierre sigue dependiendo solo de mutación busy. Snapshot/evidencia/motivo/confirmación intactos.
- GREEN E2E completo: aprobación/rechazo y cancelación awaiting deshabilitadas durante GET, habilitadas tras respuesta fresca, cero POST hasta click explícito. 22/22 focales, tipos y diff-check PASS; cero pageErrors/hydrationErrors/imageFailures.
- Fallo independiente de cierre paid **no reproducido; causa desconocida**, no se declara arreglado ni fallo de baseline. Diagnóstico antes/después de restaurar 1440 y catch del click: pathname, presencia/open, nombres/disabled/rect de botones; capturas enmascaradas sin contactos/comprobantes. `/tmp/juliorifa-purchase-close-{restored,before-click}.{json,png}`: dialog open y Cerrar compra habilitado dentro del viewport; click normal pasó. Si falla generará `failure` equivalente; sin force-click, retries ni esperas ciegas.
- Primera ejecución tras GREEN de compra falló el assert previo del sorteo antes de esperar su indicador de refetch. Se ordenó la espera existente `Verificando requisitos` antes de evaluar disabled; assertions conservadas. El siguiente recorrido completo pasó; no acredita una causa para el cierre independiente.
- Sincronización harness posterior: el verifier independiente pasó cierre paid y GET reviewing, pero awaiting falló al evaluar disabled antes del render fetching. El helper ahora espera `Verificando compra` dentro del mismo diálogo antes de comprobar acciones disabled y cero POST, manteniendo el gate cerrado; conserva la restauración con datos frescos. Una ejecución propia completa tras este cambio PASS, pageErrors/hydrationErrors/imageFailures=0. No hubo cambio productivo; la causa del fallo antiguo de cierre sigue desconocida.
- Retirar del catálogo: botón con superficie/borde/icono archive y estado disabled, sin cambiar elegibilidad, etiquetas, motivos ni confirmación. E2E verifica borde/background/icono y denegación de retiro de rifa pagada sin resultado. Sin eliminación ni cambios backend.

## Tarea 23 — apartado, estados, contacto y cron diario (implementación; activación pendiente)

### Cierre independiente — PASS del alcance solicitado

Reverificación final: 110/110 pruebas, 25 checkpoints de navegador con caché fría, cero errores de página/hidratación y logout correcto. TypeScript, build y diff-check PASS; lint sin errores y una advertencia histórica. Los tres P2 están corregidos, sin nuevos hallazgos en este alcance. Las imágenes dev siguen con 18 respuestas404 dependientes de headers; no se declara ese comportamiento correcto ni se atribuye a esta feature. Migración y cron reales pendientes de activación.

### Writerfix de tres P2 — evidencia de corrección

- Contacto pre-sorteo: `adminPurchase`/listado administrativo incluyen teléfono/wa.me saneado usando helper auth; PurchaseFacts permite abrir WhatsApp manual para confirmar comprobante antes de sortear. Legacy NULL informa contacto no disponible. E2E prueba reviewing antes del sorteo, cliente denegado y own DTO sin customer/phone; no cambia DTO público ni envía mensajes.
- Seed fixture: RED local reprodujo `column phone does not exist`; ahora aplica todas SQL0000–0005 ordenadas en PGlite, sin retirar assertions ni tocar seed/DB real. GREEN focal5/5, full suite110/110.
- Startup: readiness anterior esperaba solo DB; descubrimiento tardío ReactQuery/modern invalidaba cachecold y causaba504/import. Fixture ahora preoptimiza lista cliente explícita (React/DOM, Query, Router deps, BetterAuth y CJS dayjs), noDiscovery:true; readiness transforma entry cliente y espera imports/optimizer. No se optimiza el entry framework saltando transformaciones TanStack. envDir:false/cacheDir PID/outbound guard intactos; sin filtros pageerror ni desactivar limiter.
- Cold independientes completos: `/tmp/juliorifa-writerfix-cold2.log`, `cold3.log`, `cold4.log`, **25 checkpoints PASS cada uno, exit0, pageErrors0/hydration0/logout PASS**. Las ejecuciones interrumpidas y los fallos anteriores siguen siendo históricos, no evidencia PASS.
- FULL: `node --import tsx --test $(find src tests scripts -type f \( -name '*.test.ts' -o -name '*.test.tsx' \) | sort)` →110/110 PASS, `/tmp/juliorifa-writerfix-full-suite-final.log`. Build Vite PASS (warnings deprecación inputValidator/use-client), `/tmp/juliorifa-writerfix-build.log`; tsc/diffcheck PASS; lint correctivo0 errores,1 warning no-shadow histórico en callback image del harness.
- Diagnóstico404 no ocultado:18 respuestas imagen en UI por ejecución; misma imagen publicada da200 con Accept genérico y404 con headers navegador imagen, `/tmp/juliorifa-writerfix-cold4.log`. No objeto ausente ni regresión de contacto/cron; frontera dev routing por headers, pendiente análisis independiente sin refactor productivo en este writerfix.

La evidencia FAIL global que aparece abajo corresponde a la entrega anterior, **superada por los cold PASS del writerfix**. Migración/cron/WhatsApp reales siguen sin activar; cero cuentas reales creadas/modificadas.


Criterios autorizados: cuatro bloques, escritor único, sin commits/PR, instalación, lectura/cambio de secretos ni DB real. Teléfono solo nuevos registros; mantener cuentas antiguas, Mis apartados, idempotencia y confirmación explícita. Ninguna cancelación de reviewing ni atribución automática a un administrador. Forecast 450–750 líneas de cambio funcional/documental; metadatos de esquema se contabilizan aparte.

- [x] Tras POST confirmado, TicketSelection mantiene diálogo con PurchaseDetail existente: snapshot bancario/importe, copia, plazo, carga privada, historial y enlace a Mis apartados. Sin nuevo upload ni autoridad local; selección/login y recuperación de respuesta perdida conservados.
- [x] Cliente/admin: Sin comprobante / Por confirmar / Confirmado / Cancelado; conservar Rechazado/Vencido. Estados SQL y reglas intactos.
- [x] Registro requiere teléfono internacional normalizado en formulario y middleware servidor Better Auth. Columna nullable, login y reservas legacy sin gate. Contacto ganador admin-only; enlace wa.me saneado manual, legacy no disponible; DTO público por allowlist sin contacto. Sin SMS/mensajes automáticos.
- [x] GET /api/cron/draw falla cerrado sin CRON_SECRET y exige Bearer exacto antes de cargar DB. Diario 12:00 UTC (06:00 Ciudad de México), lote 10, máximo interno 25; elegibilidad antes de limit evita starvation por rifas pendientes/vacías. Reutiliza performDraw, randomInt, paid-only, locks/transacción/idempotencia. Awaiting vencido usa expiración existente; reviewing jamás vence/cancela. Pendientes se reconsideran días posteriores, botón manual conservado.
- [x] Auditoría mínima: source manual/automatic y actor nullable; CHECK exige actor humano en manual y NULL en automatic. Filas antiguas default manual, FK intacta. Evento ganador automático tiene actor NULL y motivo automatic:crypto-randomInt-v1. Fuente no expuesta como input servidor público. Respuesta cron solo conteos/códigos, sin PII/logs crudos.
- [x] 0005_phone_automatic_draw.sql y journal preparados offline; PGlite aplica SQL en memoria. **No aplicada en DB real**. Snapshot0005 generado offline con API Drizzle; comparación nuevo snapshot→esquema produce0 sentencias. Snapshot0004 histórico intacto.
- [x] RED observado: etiquetas SSR esperaba Por confirmar pero recibió En revisión; nuevos módulos phone/cron/dialog ausentes fallaron import antes de implementar. GREEN focal: 27/27 tests; HTTP directo Better Auth rechaza teléfono ausente/inválido, persiste normalizado, login con NULL permitido. SQL prueba ready después de blocked con limit1, reviewing conservado, expiry, actor/source CHECK, retry original y contacto privado/DTO público.
- [x] TypeScript --noEmit PASS tras corregir acceso UI a unión público/admin; ESLint scoped0 errores/1 warning no-shadow existente en callback image del harness; git diff --check PASS. Formato únicamente archivos tocados, no global.
- [x] Harness final y reverificación independiente:25 checkpoints PASS, pageErrors0/hydration0/logout correcto; build PASS. Histórico RED: primer intento falló selector tel exacto; siguientes intentos completaron el flujo pero fallaron globalmente por import temprano. Esperas networkidle/cache aislada no bastaron; la preoptimización/readiness del writerfix resolvió el arranque sin suprimir errores. Un smoke HTTP200 por sí solo no acredita interacción.

Sizing observado: 1327 líneas authored additions+deletions incluyendo writerfix; 1645 líneas adicionales de snapshot generado (2972 total,42 archivos; +2893/−79). Exceso sobre forecast750 notificado al padre, sin recortar pruebas. Las capturas/cachés /tmp, router generado y vite.e2e.config.ts (solo envDir:false/cacheDir PID/CRON_SECRET dummy) fueron ampliaciones técnicas autorizadas; servidor3000 no reiniciado.

Activación separada: revisar/aplicar 0005 con autorización operativa, configurar CRON_SECRET únicamente en Vercel y desplegar vercel.json. Hobby admite diario, no exactitud horaria y retraso hasta 59 minutos; Vercel no reintenta fallos. Rifas omitidas/fallidas se reconsideran al día siguiente. No se activó cron, no cuentas reales creadas/modificadas en esta tarea. Contrato/configuración en [backend.md](../backend.md); teléfono en [auth.md](../auth.md).

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
