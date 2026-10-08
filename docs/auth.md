# Acceso por correo y contraseña

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

Login acepta una contraseña existente de 1 a 128 caracteres; no asigna una nueva contraseña ni aplica el mínimo del registro. Un bootstrap privado de desarrollo autorizado puede almacenar una credencial corta con scrypt nativo de Better Auth, conservando `emailVerified=false`. Registro público y confirmación siguen en 12–128. No hay API pública ni CLI nuevo permanente de bootstrap. La operación privada puntual ya creó `user`/`account` en una transacción SQL, con rol `admin` y `emailVerified=false`: `hashPassword`/`verifyPassword` nativos de Better Auth 1.7.7 verificaron la credencial almacenada antes del COMMIT. Contraseña recibida por STDIN, sin sesiones insertadas ni autenticación simulada; rechaza una credencial existente diferente sin sobrescribirla.

La fixture aislada prueba una credencial generada de ocho caracteres mediante formulario, cookie nativa, sesión admin fresca y dashboard. No usa datos reales ni marca el correo verificado.

## Checkout y notificaciones

Selección sin PII en localStorage, TTL 30 minutos, máximo 1000 números, checkout opaco 32hex. Login/registro y sus enlaces alternativos conservan esa intención. Volver revalida selección/disponibilidad: **cero reservas automáticas**, confirmación explícita antes del POST idempotente. Otro origen/dispositivo o almacenamiento bloqueado no conserva el carrito.

Outbox, auditoría, transporte Resend y guard de destinatario verificado siguen intactos. Los eventos de aprobación/rechazo/sorteo permanecen atómicos, pero usuarios password no verificados **no reciben notificaciones**, incluso con Resend configurado: pasan por retry y pueden terminar en deadletter al agotarse intentos. No equivale a una cola eterna ni a entrega prometida. Verificación legítima, configuración de `RESEND_API_KEY`/`EMAIL_FROM` y operación de jobs requieren trabajo/autorización separados.

## Infraestructura y evidencia

**Desarrollo, cierre autorizado:** tras comprobar esquemas `public`/`drizzle` vacíos bajo advisory lock y fijar `search_path=public`, se aplicaron 0000–0004: cinco migraciones registradas y 17 tablas en `public` confirmadas. La operación puntual rechazó producción y exigió `--development`/`--confirm`, con advisory transaction lock; configuración de entorno intacta y sin tocar otros esquemas. La cuenta administrativa proporcionada puede iniciar sesión; no se comprobó login HTTP/cookies contra esta DB real, solo verificación nativa del hash almacenado y UI aislada.

**Histórico:** las migraciones se generaron offline y no se aplicaron durante las fases anteriores. **Producción:** DDL y bootstrap siguen sujetos a revisión y autorización separadas; reconciliar baseline auth/`todos` y journal, nunca `db:push`, borrados ni migración ciega. Storage, correo y jobs reales siguen sin validar/activar.

Validación actual: **102/102 tests**, **20/20 checkpoints HTTP/browser** con Better Auth/Drizzle/guards nativos y PGlite en memoria. Signup client ignora rol; sesiones no verificadas; password incorrecto 401 sin sesión; passwords débiles/excesivos y duplicados rechazados sin reemplazar credencial; promoción privada fixture y rol fresco. Nuevo contexto sin cookies → carrito 0 → login UI password → mismo checkout/selección, cero POST automático y exactamente una reserva al confirmar. Lost POST commit+abort se recupera por GET sin replay; proof privado HTTP 200, editor, revisión, sorteo, responsive/logout y cero pageerror/hydration conservados. Outbox real: 0 sent, 3 retry, 0 correos capturados. No prueba proveedores, despliegue ni carreras PostgreSQL multiconexión.

Los informes anteriores de enlaces mágicos y sus conteos son **históricos**, no describen el modo Auth actual. Ver [tarea Auth](tasks/auth.md) para RED y límites de validación.
