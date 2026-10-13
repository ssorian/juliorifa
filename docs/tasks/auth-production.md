# Auth distribuido y MFA administrativo

## Estado y alcance

**Verificado: suite 162/162, tipos, build y E2E aislado completo PASS; revisión independiente 0 P1/P2. 0008 aplicada posteriormente por migrator Drizzle nativo en la DB configurada de desarrollo/testing, bajo autorización explícita.** Preflight 0000–0007 y postflight 0000–0008 por hash/fecha coincidentes, tablas y columnas presentes; credenciales y compras sin reescritura. No desplegado, no login con credenciales reales acreditado. Sin correo, recuperación pública, mensajes WhatsApp ni cambios de dependencias.

Decisión humana: autorizar assurance persistida por sesión mediante hooks, usando exclusivamente verificadores, cifrado, cookies y consumo de respaldos del plugin nativo Better Auth 1.7.7. El plugin solo no agrega assurance a `session`: comprobar `user.twoFactorEnabled` dejaría habilitadas otras sesiones anteriores al enrolamiento.

## Contrato implementado

- Limiter `storage: database`: login y signup mantienen presupuestos independientes de 5/60. `rate_limit.key` único, `count` entero y `last_request` bigint. Consumo e incremento condicionados nativos; no algoritmo propio.
- Factor TOTP nativo: secreto y respaldos cifrados con Better Auth; bandera `verified`, contador de fallos y bloqueo de cuenta según esquema instalado. `user_id` único y FK; índice de secreto como declara el plugin. No hash/verificador manual.
- `session.mfa_factor_id` y `mfa_verified_at` son internos (`input:false`, `returned:false`). El hook de creación borra cualquier assurance heredada, incluso en rotaciones nativas que copian una sesión previa.
- Hook previo captura sujeto/factor nativo de la sesión o challenge firmado. Hook posterior solo acepta respuesta autenticada del verificador TOTP/backup, verifica sujeto/token de sesión emitida o existente, factor idéntico al capturado y factor actual verificado. No concede por ruta, HTTP 200, flag cliente o factor habilitado aislados. Fallos/replays no marcan assurance.
- `readMfaAccess` consulta sesión, usuario y factor actuales; exige vigencia, plugins y coincidencia del factor. `requireUser` deniega al admin sin assurance, cubriendo también los servicios owner/admin que no invocan `requireAdmin`. `requireAdmin` conserva el control de rol.
- `currentUser` permite autenticación previa al factor; `/auth/complete` y `/dashboard` remiten a `/seguridad` sin ciclo. Clientes continúan su navegación y checkout sin MFA obligatorio ni reservas automáticas.
- Administrador legacy entra con contraseña existente y enrola antes del negocio. La UI muestra configuración manual TOTP y respaldos solo en memoria; confirma que los guardó antes de verificar. Login enrolado ofrece TOTP o respaldo one-use. No recursos externos de QR ni persistencia propia de secretos.
- Bloqueados `trustDevice`, `disableSession` y OTP por correo/SMS. Admin no desactiva factor. URI/secreto y regeneración de respaldos de un factor verificado requieren sesión asegurada, evitando acceso desde una sesión vieja de contraseña.

## Migración offline

`0008_auth_security.sql`, `meta/0008_snapshot.json` y entrada 0008 del journal parten de 0007 sin modificarla. Siete sentencias: dos tablas, dos columnas de sesión, bandera de usuario, FK e índice. Los defaults dejan sesiones existentes sin assurance y usuarios sin factor.

Generador específico: `node --import tsx src/modules/auth/db/generate-security-migration.ts`. Solo importa esquemas y API Drizzle, no dotenv/DB. Escribe únicamente los tres destinos 0008/journal autorizados, conserva ID de snapshot al regenerar y valida la cabeza/lineage. **Solo para esta migración no aplicada; no regenerarla una vez desplegada.** Prueba de drift snapshot→esquema produce cero sentencias.

0008 aplicada únicamente al destino dev/testing autorizado tras reconciliar historial; no regenerarla ni modificar su SQL/snapshot después de aplicada. Para otro destino se exige nueva reconciliación y autorización. Backups, secreto Auth estable, HTTPS y cabeceras IP confiables son requisitos de despliegue, no hechos acreditados por PGlite.

## Evidencia TDD

1. `node --import tsx --test src/modules/auth/lib/production-security.test.ts`: RED exit 1, 0/2; tabla de limiter ausente (`false !== true`) y endpoint MFA ausente (`404 !== 400`). Primera observación anterior: el test entre instancias pasaba con memoria compartida del mismo proceso; se reforzó con persistencia PostgreSQL antes del GREEN.
2. Mismo comando tras plugin/DDL: GREEN exit 0, 2/2. Warnings nativos `User not found` corresponden a intentos inválidos fixture, sin datos de cuentas.
3. `node --import tsx --test src/modules/auth/lib/session-assurance.test.ts`: RED exit 1 (`Missing expected exception`) con admin promovido sin assurance. Después del gate, un fallo fixture 401 reveló que la URI contiene Base32: decodificación con utilidad nativa corrigió el generador de códigos de prueba, no el verificador. GREEN exit 0.
4. Triangulación HTTP/PGlite: budgets persistidos y separados, expiración almacenada; enrolamiento y challenge; clientes/password corto/NULL phone; rol público ignorado; otras sesiones pre-enrolamiento y promoción denegadas; step-up de sesión vieja solo con TOTP válido; códigos inválidos/flags falsificados; factor/plugin ausentes; rotación no hereda assurance; backup replay y consumo intercalado (exactamente un éxito). Endpoint HTTP de prueba usa el mismo lector/guard de negocio.
5. `node --import tsx --test src/modules/auth/lib/production-security.test.ts src/modules/auth/lib/session-assurance.test.ts src/modules/auth/db/security-migration.test.ts`: PASS 4/4 observado. `session-assurance.test.ts` volvió a pasar tras agregar rotación nativa.
6. `node --import tsx --test src/modules/auth/lib/auth-settings.test.ts src/modules/auth/lib/registration.test.ts src/modules/auth/lib/phone.test.ts src/modules/auth/lib/policy.test.ts src/modules/auth/lib/session-resolution.test.ts src/modules/auth/components/EmailAccess.test.tsx`: PASS 12/12.
7. Generador de rutas: `TSR_TMP_DIR=src/modules/auth/.route-tmp bun run generate-routes`, exit 0; warning circular de librería. Temporal limitado a superficie autorizada; árbol no editado manualmente.
8. TypeScript inicial encontró tipos de unión OTP/TOTP, paths opcionales y varianza del adaptador; corregidos. `node node_modules/typescript/bin/tsc --noEmit` posterior exit 0.
9. `node --import tsx --test src/modules/auth/services/promote-admin.test.ts src/modules/auth/services/seed-client.test.ts`: PASS 2/2. `git diff --check`: exit 0, sin salida. Total focal observado: 18 pruebas; no equivale a suite completa.

El harness E2E se actualizó para enrolamiento UI real, challenge UI con ausencia de sesión intermedia y admin con contraseña corta. **Su ejecución corresponde al parent y aún no se afirma PASS.** No se silenciaron errores/hidratación ni desactivaron limitadores.

## Diagnóstico del primer E2E — pendiente de reproducción

Evidencia del parent: build PASS; suite inicial 158/160 con dos expectations previas actualizadas por el parent (límite proof 4 MiB y drift contra snapshot 0008), focales de esas correcciones PASS. Revisión independiente Auth: 4 pruebas y tipos PASS, sin P1/P2. Esto no sustituye el fallo de navegador: `node --import tsx tests/e2e/run.ts` terminó exit 1 tras aproximadamente 55 segundos, stage `private fixture promotion`, timeout de 30 segundos esperando `Clave de configuración` después de enviar enrolamiento. **No se declara resuelto.**

Nueva prueba aislada `node --import tsx --test src/modules/auth/lib/enrollment-client.test.ts`: 2/2 PASS. Usa el SDK React real (incluyendo `twoFactorClient` y `disableDefaultFetchPlugins`) contra handler Better Auth/Drizzle/PGlite real con cookie nativa: contraseña incorrecta → 400; enrolamiento válido → `{method: 'totp', totpURI, backupCodes}` correctamente recibido. Esto descarta un fallo reproducido del contrato SDK/handler en ese transporte; no acredita el navegador/TanStack ni identifica todavía la causa.

`enrollAdminUI` ahora espera explícitamente la respuesta POST `/api/auth/two-factor/enable` y registra únicamente status, código de una allowlist fija y booleano de forma TOTP. Nunca imprime body, mensaje proveedor, cookies, URI, clave, contraseña ni respaldos. Un error HTTP o forma inesperada falla inmediatamente, sin cambiar timeouts, MFA ni rate limits.

Reproducción corta, **a ejecutar en background por el parent**:

```sh
node --import tsx tests/e2e/run.ts --mfa-only
```

Modo `--mfa-only`: fixture aislada existente, bootstrap de admin con contraseña corta, login UI → enrolamiento UI → nuevo login con challenge sin sesión → TOTP UI → dashboard; exige cero pageErrors/hydrationErrors y conserva el cleanup existente. No es la suite completa y no aplica migraciones reales. Si pasa, repetir el comando completo para contrastar el contexto específico de promoción. No se ejecutó el runner síncrono en el subagent.

### Segunda reproducción y sincronización del harness

Parent, job9: `node --import tsx tests/e2e/run.ts --mfa-only` **FAIL exit 1**, aproximadamente 44 segundos, timeout 30 segundos de `waitForResponse` en `isolated MFA bootstrap and native login UI`. No se observó POST login ni línea `CHECK MFA enrollment`. Es anterior y distinto del fallo job8, que llegó al envío de enrolamiento; no confundirlos ni afirmar la misma causa.

Contraste de código: el recorrido histórico de contraseña corta espera `waitForLoadState('networkidle')` después de `goto('/login')`; el nuevo modo MFA y el nuevo login challenge omitían esa espera, y `enrollAdminUI` esperaba solo URL. Candidato corregido: estos tres puntos usan ahora la misma sincronización explícita de carga antes de rellenar/enviar. No añade sleep, retry ni timeout; no modifica producción. **Network idle no prueba por sí solo hidratación, ni acredita haber resuelto job8/job9: falta reproducción del candidato.**

Diagnóstico adicional del runner: request y response de cuatro rutas Auth con etiquetas fijas (LOGIN/ENABLE/VERIFY_TOTP/VERIFY_BACKUP), método POST/OTHER, status numérico y navegación LOGIN/SECURITY/DASHBOARD/OTHER. Al fallar devuelve contadores, cantidad de inputs inválidos, submit disabled y clasificación allowlist de mensajes genéricos UI; nunca valores de inputs, bodies, cookies, URLs/query, URI ni códigos. Conserva pageErrors/hydrationErrors y todos los límites.

Siguiente comprobación del parent en background: `node --import tsx tests/e2e/run.ts --mfa-only`; si pasa, verificar después la suite completa para el contexto específico de promoción job8. Ambos FAIL anteriores permanecen como evidencia.

## Límites de evidencia y revisión

- PGlite intercalado no demuestra carreras PostgreSQL multiconexión ni configuración Vercel/proxy.
- Hooks ligados al contrato instalado 1.7.7 (respuesta autenticada, `newSession` y challenge firmado `two_factor`). Cambiar versión requiere repetir la matriz HTTP y revisar hooks antes de desplegar.
- Acceso legítimo anterior a una revocación concurrente conserva la ventana habitual entre autorización y negocio; no se promete transacción conjunta entre todas las tablas de dominio y Auth.
- Recuperación de factores perdidos no implementada. Nunca deshabilitar el plugin para eludir un bloqueo: el gate falla cerrado.
- Intento Engram falló por incompatibilidad gentle-engram 0.4.2 / core 2.2.1; no se exploró ni modificó el servicio.
