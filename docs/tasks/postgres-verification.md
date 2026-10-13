# Verificación PostgreSQL aislada

## Estado y comandos

**Runner ejecutado por el parent en PostgreSQL real de desarrollo/testing autorizado: job21 PASS, exit0, 68s.** Dos conexiones distintas, reservas concurrentes/idempotencia, aprobación/auditoría, dump/restore con digest igual y cleanup del schema propio pasan. Se usó la excepción expresamente autorizada de seis event triggers, sin desactivarlos ni resetear public. No acredita producción, HTTP Auth, Supabase, entrega de mensajes ni restauración de datos de clientes.

Evidencia proporcionada por el parent, conservada: **job16 FAIL, exit 1**, antes de crear schema por guard de event triggers; no fue timeout. Diagnóstico readonly **job17 PASS**: fingerprint, opciones de aislamiento, vocabulario de migraciones y conexión correctos; PostgreSQL 17, seis event triggers activos, cero schemas propios residuales; herramientas PostgreSQL 18.6 y Node 24.21. Verificación independiente previa offline: 6 pruebas/tipos/diff PASS. Estos resultados no acreditan concurrencia ni restauración.

Sin argumentos o con `--help` muestra PLAN sin dotenv, conexión, archivos temporales ni Storage:

```sh
node --import tsx scripts/verify-postgres.ts
node --import tsx scripts/verify-postgres.ts --help
```

Única ejecución aceptada, después de revisión:

```sh
node --import tsx scripts/verify-postgres.ts --execute-isolated --target-fingerprint f7fb7a27f69664ff
```

Excepción **explícitamente autorizada por el operador para esta misma DB descartable de desarrollo**, sin desactivar triggers ni resetear public:

```sh
node --import tsx scripts/verify-postgres.ts --execute-isolated --target-fingerprint f7fb7a27f69664ff --allow-development-event-triggers --expected-event-triggers 6
```

Requiere ambos flags adicionales, ejecución y fingerprint fijo. Solo acepta el literal `6`; conteo runtime debe ser exactamente seis, incluido rechazo si cambia a cero. Sin excepción, continúa exigiendo cero. El conteo no identifica cuerpos/identidades de triggers: cambios que mantengan seis no quedan detectados. La autorización acepta posibles efectos indirectos/metadata de triggers fuera del schema propio; **no se afirma que public permanezca absolutamente intacto**. El código directo mantiene únicamente DDL/datos del schema propio. Cleanup/locks/ownership/dependencias externas no se omiten por esta excepción.

No acepta URL por argumentos. Flags desconocidos, repetidos, incompletos o fingerprint distinto fallan antes de dotenv/DB. La ejecución carga dotenv silenciosamente desde `['.env.local', '.env']`, conservando precedencia y variables existentes, y compara el destino runtime con el valor autorizado. Algoritmo exacto compartido con el preflight del parent:

```ts
const target = new URL(process.env.DATABASE_URL!)
const fingerprint = createHash('sha256')
  .update(`${target.hostname}:${target.port || '5432'}${target.pathname}`)
  .digest('hex')
  .slice(0, 16)
```

Ignora credenciales/query: identifica destino, **no autentica ni es un secreto**. El runner rechaza parámetros que puedan redirigir la conexión (`host`, `port`, `service`, etc.). Solo admite `sslmode`, `channel_binding`, `connect_timeout`, `application_name` y `options`; sustituye `options` por aislamiento/timeouts. Una configuración diferente falla cerrada, sin modificarla.

## Frontera de aislamiento

- Node >=22.15 (hooks síncronos), herramientas `pg_dump`/`pg_restore` compatibles en PATH, conexión directa o pool de sesión que preserve conexiones/locks y rol con CREATE de schema. No crea roles ni amplía permisos.
- Schema `juliorifa_verify_<UUID sin guiones>` nuevo; CREATE sin IF NOT EXISTS, advisory lock de sesión propietario, COMMENT con token aleatorio y comprobación de propietario/token antes de destruir. No reutiliza schemas encontrados ni acepta nombre por CLI.
- `search_path` exclusivamente schema propio y `pg_catalog`; verifica `current_schema` por conexión. Pool máximo tres conexiones: propietario y dos participantes con `pg_backend_pid` diferentes. Cierra participantes antes de backup: herramienta externa y propietario usan como máximo dos conexiones durante esa fase.
- Statement timeout 15s, lock timeout 5s, idle transaction timeout 20s, conexión 10s. Cada herramienta tiene límite de pared 60s y salida de 64MiB; las herramientas PostgreSQL pueden ajustar internamente sus timeouts SQL.
- Lee únicamente SQL 0000..0008 del repositorio, verifica secuencia completa, permite vocabulario DDL acotado y sustituye referencias `"public".` por schema propio. Aplica en transacción sin migrator/journal. El filtro no pretende ser un parser SQL genérico: futuras migraciones necesitan revisión.
- No consulta usuarios/compras públicos para comparar snapshots. Las tablas de negocio se resuelven solo dentro del schema recién creado; las consultas externas son catálogos de identidad/propiedad/dependencias. Rechaza event triggers activos por defecto; la excepción autorizada permite exclusivamente el conteo seis sin modificarlos. Triggers pueden producir efectos fuera de esa superficie directa.
- Cleanup toma locks exclusivos de tablas propias y rechaza dependientes externos antes de DROP CASCADE. Esto es aislamiento de un runner revisado en entorno cooperativo, no un sandbox contra administradores u otros procesos maliciosos con las mismas credenciales.

## Comprobaciones implementadas y ejecutadas en PostgreSQL real

1. Dos conexiones distintas invocan **reserve original** concurrentemente sobre el boleto cero: exactamente una reserva y un TICKET_UNAVAILABLE.
2. Reintento con mismo actor/key/payload conserva UUID/DTO; payload distinto se rechaza. Carrera adicional con misma key/payload conserva UUID y conteos exactos de compras/ocupación.
3. Factories originales de workflow verifican evidencia ficticia local, aprueban concurrentemente y repiten aprobación: paid, ocupación sold, un solo evento approved y estado/auditoría estables.
4. `pg_dump --schema=<propio>` genera archivo custom **en memoria**, no disco. Destruye exclusivamente schema propio; `pg_restore --dbname=` usa PGDATABASE desde entorno y STDIN, sin URL/credenciales en argumentos. `--no-owner --no-privileges --single-transaction --exit-on-error`; comprueba token/propietario y digest de todas las filas ficticias antes/después, luego cleanup.

El hook test-only intercepta únicamente DB/authorization y marcador server-only; AsyncLocalStorage asigna DB y actor ficticio por llamada. No se refactoriza producción ni se clona SQL de negocio. **No prueba sesiones/guards HTTP reales**, ni valida bytes contra Storage: la evidencia de comprobante se fabrica dentro del schema aislado. Configuración bancaria ficticia completa evita fallback a variables bancarias reales.

Prueba del limiter nativo Better Auth entre dos instancias: **siguiente unidad**, no implementada ni acreditada por este runner. La migración 0008 incluida aquí no demuestra su aplicación en public; esa operación/evidencia pertenece al parent.

## Fallos y recuperación

Imprime progreso `STAGE` exclusivamente desde allowlist fija (tools, migration-surface, connect, event-trigger-policy, schema-create, migrations, connections, scenarios, snapshot, dump, restore-drop, restore, restore-verify, cleanup, closed). Fallos dentro de la operación/cleanup identifican también la etapa con texto fijo; fallo de preflight conserva última etapa y error genérico. `closed` indica recursos cerrados, no éxito: solo imprime resumen PASS tras restauración y cleanup completos. Errores nunca interpolan excepciones, SQL, URL, host, usuario, contraseña, cookies, factores ni identificadores de clientes. Un error retorna código 1. No escribe backups, logs ni archivos temporales; no instala herramientas.

Desconexión, terminación forzada o fallo de cleanup puede dejar únicamente el schema propio. No hay barrido por prefijo, reintento destructivo ni recuperación automática: requiere inspección operativa posterior del catálogo y nueva autorización acotada. No garantiza cleanup tras SIGKILL. No es política de backups: faltan retención, cifrado, RPO/RTO, comprobantes y restauración de un volumen real.

## Verificación offline del writer

```sh
node --import tsx --test scripts/verify-postgres.test.ts
node node_modules/typescript/bin/tsc --noEmit
git diff --check
```

RED observado: módulo CLI aún inexistente. Pruebas posteriores detectaron y corrigieron rechazo de calificadores de columna/comentarios en migraciones revisadas. GREEN inicial de guards, fingerprint, superficie SQL y hook real sin conexión: 6/6. Corrección de excepción de triggers: RED observado por módulo de policy inexistente; GREEN 8/8, incluyendo combinaciones inválidas sin cargar entorno/DB, transferencia explícita de opciones, conteos/registros inválidos, drift y allowlist de etapas. La inyección se prueba alcanzando una transacción centinela, no simulando éxito de reservas. Tipos PASS. Revisión independiente inicial6/6 y del opt-in8/8, tipos/diff PASS; ejecución real posterior job21 recorrió todas las etapas hasta `closed` y emitió PASS después de verificar restauración y cleanup. Esto ensaya restauración de datos ficticios, no una política de backup/restore del negocio ni del bucket.
