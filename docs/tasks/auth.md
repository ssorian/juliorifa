# Auth cliente/admin — tarea 21

## Tarea 23 — teléfono nuevo registro, contacto privado y checkout inmediato

### Writerfix actual — evidencia nueva

RED local: seed con solo0000 falla `column phone does not exist`; PurchaseFacts SSR no muestra aviso/contacto manual. GREEN focal5/5 tras migraciones ordenadas y DTO admin protegido con teléfono/wa.me previo al sorteo. FULL110/110 PASS, TypeScript/build PASS. E2E cold2/3/4 completos exit0,25 checkpoints cada uno,0 pageerrors/hydration y logout; incluye cliente denegado/own sin customer ni phone antes de aprobar/sortear. Logs `/tmp/juliorifa-writerfix-full-suite-final.log`, `/tmp/juliorifa-writerfix-cold{2,3,4}.log`, `/tmp/juliorifa-writerfix-build.log`. Cold readiness/preoptimización solucionan late discovery504 sin filtros/mocks/limiter debilitado. Ejecuciones interrumpidas no cuentan PASS; FAIL abajo es histórico superado.

Persisten404 de imagen según headers de request dev (mismo objeto200 Accept genérico/404 imagen navegador), no ocultados ni corregidos mediante cambios productivos ajenos. Sin cuentas/secretos/DB real; cron requiere deploy/configuración aparte.

- [x] Criterios: obligatorio SOLO signup, validación servidor/formulario, E.164 internacional, nullable legacy sin gate login/reservas; no SMS ni WhatsApp automático, no contacto público.
- [x] Better Auth additionalField y middleware de signup; SDK inferAdditionalFields tipado sin importar servidor en runtime. Helper feature-owned auth normaliza sin inferir país; DB CHECK permite NULL legacy.
- [x] Ganador admin por join compra/user tras requireAdmin, wa.me manual saneado; NULL legacy contacto no disponible. Cron source automatic/actor NULL no usa credenciales/admin arbitrario.
- [x] Checkout confirmado mantiene diálogo pago/comprobante existente y Mis apartados; selección/login/idempotencia/confirmación explícita conservados.
- [x] RED inicial phone.test: módulo ausente antes de implementar. GREEN HTTP real Better Auth/PGlite:400 ausente/inválido,200 válido y normalizado persistido,200 login después de convertir phone=NULL. SSR tel required solo signup; helper rechaza URLs/control/inyección y limita formato.
- [x] Validación focal27/27, tsc PASS. Harness actualizado: migración0005 en memoria, signup con teléfono, diálogo snapshot/proof, contacto ganador privado y cron automático autorizado/idempotente. Primera ejecución nueva llegó a confirmación/login existente; falló selector exacto de teléfono por texto auxiliar del label, corregido a nombre accesible prefijado. También pageerror fetch/import previo a cache aislada; no afirmar recorrido nuevo completo por HTML ni checks parciales.
- [ ] Segunda/tercera ejecución harness completa el nuevo viaje interactivo y cron HTTP automático/idempotente, pero comando global FAIL por1 pageerror fetch/import temprano (esperado0). No ocultado ni marcado PASS global. Validación independiente/build pendientes. Config fixture autorizado envDir:false, cacheDir /tmp por PID y CRON_SECRET dummy; no carga archivos env de usuario ni comparte caché dev principal.

Migración SQL/journal offline, no DB real/cuentas reales/secretos/instalaciones/commits. Snapshot0005 generado offline (1645 líneas metadata tras formato); comparación a esquema produce0 sentencias, sin modificar snapshot0004. Detalles operativos en [auth.md](../auth.md) y [backend.md](../backend.md); no cron activado sin deploy+CRON_SECRET.

## Tarea 22 — compatibilidad de login

Login requiere 1–128 caracteres para verificar credenciales ya almacenadas; registro y confirmación conservan 12–128. Copy de longitud mínima solo en registro. **Tarea 22 completa en desarrollo:** bootstrap privado autorizado ejecutado, sin API pública nueva: cuenta administrativa proporcionada creada en `user`/`account`, rol admin, correo no verificado y hash nativo Better Auth 1.7.7 verificado contra DB antes del COMMIT. Sin filas de sesión ni login HTTP real comprobado. DDL 0000–0004 aplicado: cinco migraciones registradas, 17 tablas `public` confirmadas; producción requiere autorización separada.

RED SSR observado: login seguía con `minLength=12`; GREEN: ambos tests SSR pasan. Harness actualizado: **20/20 checkpoints PASS**, incluyendo admin fixture con credencial corta generada en memoria, login UI real, cookie nativa y sesión fresca en dashboard; registro HTTP de ocho caracteres rechazado. Primera corrida nueva tuvo timeout antes de hidratar el formulario; esperar networkidle corrigió la prueba sin cambiar Auth. Outbox conserva 0 sent/3 retry/0 mails.

## Implementación actual

- Better Auth 1.7.7 conserva adapter/cookies/roles frescos; magic-link eliminado, login nativo 1–128 y registro correo + contraseña 12–128, autoSignIn en registro, `emailVerified=false` honesto.
- Sin nuevas dependencias/DDL, hashes manuales, Supabase Auth, rol público o emails Auth. Verificación/reset indisponibles; cuentas magic-only requieren futura recuperación privada legítima.
- Callbacks de ambas APIs saneados a `/auth/complete` con checkout 32hex; roles DB prevalecen. Limiter memoria activo: 5/60 por endpoint.
- Formularios con nombre obligatorio en registro, confirmación de contraseña, autocomplete correcto, errores genéricos y navegación completa única. Sin passwords persistidos ni identidad/credenciales en URL.
- Promoción privada exige confirmación, usuario existente y credential con hash no vacío; conserva correo no verificado. Repositorio inyectable y DB lazy para tests sin infraestructura. CLI no ejecutado; admin real creado por la operación puntual de desarrollo de tarea 22.
- Carrito TTL 30 minutos/restauración se conserva; ninguna reserva hasta confirmar explícitamente.
- Decisión A del orquestador: conservar guard `RECIPIENT_UNVERIFIED`; outbox nativo prueba 0 sent/3 retry/0 mails, con posible deadletter posterior. No debilitar guard ni falsificar emailVerified para reproducir tres entregas antiguas.

## Tests-first y evidencia observada

RED inicial: 100 tests, 97 PASS/3 FAIL; controles SSR seguían siendo magic-link y módulo auth-settings ausente. GREEN actual: **102/102 PASS**. Triangulación: límites/callbacks, roles/revocación existentes, confirmación/usuario/credential para promoción, HTTP nativo wrong password/weak y oversized password/duplicado sin reemplazo.

**Incidente histórico en RED de promoción, anterior a las migraciones reales autorizadas:** el servicio anterior ignoró el repositorio inyectado y su import eager cargó configuración dotenv e intentó un SELECT contra la DB configurada. Falló `relation "user" does not exist`; no llegó a UPDATE ni promoción. No se imprimieron/inspeccionaron valores de entorno. Se corrigió usando import DB lazy después de validaciones y repositorio inyectado; GREEN ya no necesita configuración real. Se reporta al orquestador, no se presenta ese RED como prueba aislada PGlite.

Harness histórico de tarea 21: **19/19 checkpoints PASS**, server propio 3212, PGlite/memory Storage/mail capturado, Better Auth sin mocks. Se observó 429 nativo y espera efectiva 61s antes de login legítimo. Dos intentos previos fallaron al leer body después de navegación y por doble redirect SDK/UI; corrección usa header Location y una única navegación UI. Nuevo contexto anonymous-cart se autentica realmente por formulario password, no cookie transplant; restaura mismo token/selección 0, cero POST previo y una fila al confirmar. Proof HTTP 200 privado, recovery lost POST, editor, approval/reject, sorteo, seis tabs/responsive/logout y cero pageerror/hydration permanecen.

Revisión ordinaria independiente actualizada para tarea 22: **102/102 unit y 20/20 checkpoints PASS**, TypeScript, ESLint y formato correctos; sin P1/P2 en el alcance revisado. Se auditó el aislamiento de promoción antes de repetir las pruebas. El puerto 3212 quedó libre; el build fue validado por el escritor, no repetido por el revisor. No constituye un cierre nativo ni valida infraestructura real.

Los 14 tests/smoke y reportes de magic-link previos quedan como evidencia histórica, no validación del modo actual. El CLI de promoción no se ejecutó; la operación puntual de desarrollo sí completó DDL/admin, sin cambiar fuente, configuración ni generar DDL nuevo. Tipos, lint y formato PASS; build PASS del escritor, no despliegue. Storage/proveedor, PG multiconexión, verificación/recovery de correo y producción siguen pendientes. Ver [auth.md](../auth.md).
