# Acceso por correo y contraseña

## Corrección operativa: columna de teléfono

Bajo autorización explícita se aplicó `0005_phone_automatic_draw.sql` con `bun run db:migrate` en la DB configurada del servidor. Historial 0000–0005 verificado por hash/fecha; `user.phone` existe y admite NULL. El SELECT de columnas de Auth compila: el error 42703 no era una obligación de teléfono para el administrador, sino una migración pendiente. No se alteraron cuentas/contraseñas ni se verificó login HTTP con credenciales reales. La evidencia de “no aplicada” posterior corresponde a la tarea histórica y no autoriza migrar otro destino.

## Teléfono para nuevos registros — tarea 23

**Writerfix actual:** admin puede consultar teléfono/wa.me manual de solicitudes antes del sorteo; own/public no reciben contacto, legacy NULL permanece sin gate. Fixture seed usa migraciones actuales: full110/110 PASS. Tres cold E2E completos25 checkpoints cada uno,0 pageerrors/hydration y logout PASS (logs `/tmp/juliorifa-writerfix-cold{2,3,4}.log`); fallos globales anteriores quedan como historia, no estado actual. Tsc/build PASS. Sin cuentas reales nuevas ni migración/cron/mensajes reales activados.

Registro público requiere nombre, contraseña/confirmación y **teléfono internacional**, incluyendo + y código de país. Se admiten espacios/paréntesis/guiones de presentación, se almacena normalizado E.164 (+ y 8–15 dígitos, primer dígito no cero); no se infiere país ni se verifica propiedad del número. El middleware servidor Better Auth valida `/sign-up/email` incluso en HTTP directo, antes de crear usuario/sesión; el campo adicional permite persistencia/typing SDK. No afecta `/sign-in/email` ni reservas de cuentas antiguas.

Migración offline `0005_phone_automatic_draw.sql` agrega phone **nullable** y CHECK formato. Sin backfill ni obligación retroactiva: clientes/admin existentes con NULL conservan login/reservas; contacto del ganador legacy dice no disponible. Migración preparada/probada en PGlite, **no aplicada a DB real** en esta tarea. Requiere autorización operativa separada antes de desplegar código que consulta la columna; snapshot0005 generado offline, comparación a esquema actual produce0 sentencias, sin cambiar0004 histórico.

Contacto del ganador solo en resultado admin protegido por rol fresco: nombre/teléfono y enlace wa.me saneado de dígitos. DTO público excluye contacto y referencia de compra. Enlace manual, sin SMS ni mensajes WhatsApp automáticos; teléfono no convierte emailVerified ni habilita recuperación/verificación. Reutilizar checkout/login y Mis apartados: tras confirmación explícita se abre diálogo snapshot/comprobante, sin reserva automática.

Evidencia nueva: tests HTTP Better Auth + Drizzle/PGlite (sin DB real) rechazan teléfono ausente/inválido y persisten normalizado; retirar teléfono de fixture permite login legacy. Tests SSR muestran tel obligatorio solo signup; helper sanea wa.me y devuelve NULL legacy. Harness ejecutado: formulario real→teléfono normalizado persistido→reserva explícita→diálogo snapshot/proof→ganador privado pasa asserts interactivos. Comando global FAIL por1 pageerror fetch/import temprano; no presentar como E2E total aprobado. Evidencia final en [tasks/auth.md](tasks/auth.md). Ninguna cuenta real creada/modificada, ningún secreto leído/editado.

## Modo actual

Better Auth **1.7.7**, Postgres/Drizzle y cookies nativas autentican clientes y administradores. No se usa Supabase Auth. El SDK Supabase sigue siendo exclusivamente Storage.

- `/login`: correo + contraseña de una cuenta existente; nunca registra automáticamente al fallar.
- `/signin`: registro cliente con nombre obligatorio y confirmación de contraseña. Better Auth inicia sesión automáticamente.
- Contraseña nueva de registro requerida de **12 a 128 caracteres**, hash scrypt nativo en `account` con `providerId=credential`. Sin hash manual, nuevas tablas, dependencias ni migraciones.
- **El registro no prueba propiedad del correo**: `emailVerified=false`. Una cuenta es un claim de identidad, no un correo verificado.
- `/auth/complete` consulta sesión y rol actual en servidor: admin → `/dashboard`; cliente → catálogo con checkout válido. Rol público ignorado (`input:false`, hook client y constraint DB). Cache de cookie deshabilitada.

## Configuración y límites

Servidor: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (fallback `SERVER_URL`). Sin prefijo `VITE_`, valores en código, contraseñas en URL/localStorage/logs ni secretos compartidos en chat. Producción requiere HTTPS y un secreto robusto.

**Login/registro no dependen de Resend ni envían correo.** No se configuraron emails de verificación o recuperación; recuperar contraseña/verificar correo no están disponibles. No hay workaround público de reset. Las cuentas históricas magic-link-only, sin credencial password, necesitan recuperación futura por operador confiable fuera de banda, con prueba legítima de identidad y autorización separada. Un registro duplicado no convierte ni reemplaza esas cuentas ni sus credenciales.

Rate limiter nativo activo, memoria por instancia, cinco requests por 60 segundos para cada endpoint `/sign-in/email` y `/sign-up/email`, también en desarrollo. Con múltiples instancias requiere almacenamiento compartido y configuración IP/proxy confiable. No se desactiva para pruebas: el harness espera 61 segundos al recibir 429 antes de un login legítimo. Better Auth conserva cookies y controles de origen.

Callbacks de ambas APIs se normalizan a `/auth/complete`, conservando únicamente checkout de 32 hex minúsculas. No aceptan destinos externos/arbitrarios ni permiten elegir rol. La UI realiza una sola navegación completa por ese gate; el redirect automático del SDK se deshabilita para evitar carreras con `location.assign`, no se deshabilitan sesiones ni cookies.

## Administrador privado

Primero registra la cuenta mediante `/signin`. Luego un operador autorizado, con DB preparada y autorización explícita, puede ejecutar:

```sh
node --import tsx scripts/promote-admin.ts --email existing@example.com --confirm-promote
```

**No se ejecutó el CLI.** Exige usuario existente y cuenta `credential` con password almacenado no vacío, además de confirmación. No crea usuarios, cambia contraseñas ni marca correo verificado; no existe endpoint público de promoción. Una cuenta magic-link-only no cumple el requisito. El rol se consulta fresco en servidor, también tras revocación. La cuenta administrativa proporcionada ya fue creada mediante la operación privada autorizada de desarrollo descrita abajo, no mediante este CLI. No solicitar contraseñas en chat ni argumentos CLI.

### Compatibilidad del bootstrap de desarrollo

Login acepta una contraseña existente de 1 a 128 caracteres; no asigna una nueva contraseña ni aplica el mínimo del registro. Un bootstrap privado de desarrollo autorizado puede almacenar una credencial corta con scrypt nativo de Better Auth, conservando `emailVerified=false`. Registro público y confirmación siguen en 12–128. No hay API pública de bootstrap; la seed cliente de desarrollo se describe abajo. La operación privada puntual ya creó `user`/`account` en una transacción SQL, con rol `admin` y `emailVerified=false`: `hashPassword`/`verifyPassword` nativos de Better Auth 1.7.7 verificaron la credencial almacenada antes del COMMIT. Contraseña recibida por STDIN, sin sesiones insertadas ni autenticación simulada; rechaza una credencial existente diferente sin sobrescribirla.

La fixture aislada prueba una credencial generada de ocho caracteres mediante formulario, cookie nativa, sesión admin fresca y dashboard. No usa datos reales ni marca el correo verificado.

## Seed cliente de desarrollo

`npm run db:seed` muestra solamente el plan, sin cargar configuración ni DB.
Para ejecutar explícitamente: `npm run db:seed -- --execute` (solo
`NODE_ENV=development` o `test`; por defecto, development). Usa la DB existente
configurada en servidor; no aplica migraciones ni envía correo.

Crea `user@gmail.com` con la contraseña de fixture solicitada, hash nativo Better
Auth, rol `client`, correo no verificado y cuenta `credential`. No crea sesiones:
el acceso posterior usa el login normal. Repetir conserva una cuenta equivalente;
un correo existente con otra contraseña, rol, verificación o proveedor falla sin
cambiarlo. No sirve para recuperar ni convertir cuentas existentes. No se ejecutó
contra DB real durante esta implementación.

## Checkout y notificaciones

Selección sin PII en localStorage, TTL 30 minutos, máximo 1000 números, checkout opaco 32hex. Login/registro y sus enlaces alternativos conservan esa intención. Volver revalida selección/disponibilidad: **cero reservas automáticas**, confirmación explícita antes del POST idempotente. Otro origen/dispositivo o almacenamiento bloqueado no conserva el carrito.

Outbox, auditoría, transporte Resend y guard de destinatario verificado siguen intactos. Los eventos de aprobación/rechazo/sorteo permanecen atómicos, pero usuarios password no verificados **no reciben notificaciones**, incluso con Resend configurado: pasan por retry y pueden terminar en deadletter al agotarse intentos. No equivale a una cola eterna ni a entrega prometida. Verificación legítima, configuración de `RESEND_API_KEY`/`EMAIL_FROM` y operación de jobs requieren trabajo/autorización separados.

## Infraestructura y evidencia

**Desarrollo, cierre autorizado:** tras comprobar esquemas `public`/`drizzle` vacíos bajo advisory lock y fijar `search_path=public`, se aplicaron 0000–0004: cinco migraciones registradas y 17 tablas en `public` confirmadas. La operación puntual rechazó producción y exigió `--development`/`--confirm`, con advisory transaction lock; configuración de entorno intacta y sin tocar otros esquemas. La cuenta administrativa proporcionada puede iniciar sesión; no se comprobó login HTTP/cookies contra esta DB real, solo verificación nativa del hash almacenado y UI aislada.

**Histórico:** las migraciones se generaron offline y no se aplicaron durante las fases anteriores. **Producción:** DDL y bootstrap siguen sujetos a revisión y autorización separadas; reconciliar baseline auth/`todos` y journal, nunca `db:push`, borrados ni migración ciega. Storage, correo y jobs reales siguen sin validar/activar.

Validación actual: **102/102 tests**, **20/20 checkpoints HTTP/browser** con Better Auth/Drizzle/guards nativos y PGlite en memoria. Signup client ignora rol; sesiones no verificadas; password incorrecto 401 sin sesión; passwords débiles/excesivos y duplicados rechazados sin reemplazar credencial; promoción privada fixture y rol fresco. Nuevo contexto sin cookies → carrito 0 → login UI password → mismo checkout/selección, cero POST automático y exactamente una reserva al confirmar. Lost POST commit+abort se recupera por GET sin replay; proof privado HTTP 200, editor, revisión, sorteo, responsive/logout y cero pageerror/hydration conservados. Outbox real: 0 sent, 3 retry, 0 correos capturados. No prueba proveedores, despliegue ni carreras PostgreSQL multiconexión.

Los informes anteriores de enlaces mágicos y sus conteos son **históricos**, no describen el modo Auth actual. Ver [tarea Auth](tasks/auth.md) para RED y límites de validación.
