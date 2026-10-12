# Guía de trabajo — JulioRifa / Rifas Nova

Aplicación de rifas con apartados, comprobantes privados y aprobación manual de pagos. Esta guía reúne las decisiones vigentes; los detalles y evidencias históricas están en `docs/`.

## Antes de cambiar algo

- Leer esta guía, `docs/backend.md`, `docs/auth.md` y la tarea pertinente en `docs/tasks/`.
- Contrastar primero el requisito con lo implementado: no reconstruir flujos existentes ni ampliar el alcance sin acordarlo.
- Distinguir código implementado, verificación aislada e infraestructura realmente activada.
- Usar CodeGraph para navegación estructural cuando esté disponible; confirmar el código actual antes de editar.
- Mantener un solo escritor salvo autorización explícita para trabajo paralelo aislado.

## Arquitectura y organización

- React, TypeScript, TanStack Start/Router/Query, Vite y Nitro.
- PostgreSQL + Drizzle; Better Auth para sesiones/cookies y acceso por correo/contraseña.
- Supabase se usa exclusivamente para Storage, **no para Auth**.
- Código de una funcionalidad en `src/modules/<module>/`: `auth`, `purchases`, `raffles`, `dashboard`.
- Infraestructura común en `src/lib/`, `src/db/`, `src/config/`; rutas del framework en `src/routes/`.
- Esquemas de cada módulo en su `db/`; migraciones y metadatos en `drizzle/`.
- Mantener handlers delgados y reglas de negocio en servicios/dominio/repositorios. No sustituir autoridad del servidor por estado local.
- Regenerar `src/routeTree.gen.ts` mediante el generador de rutas, no mantenerlo a mano.
- La autorización debe consultar sesión/rol actuales en servidor. No confiar en rol, precios, ganador ni estados enviados por el cliente.
- Separar cachés de consultas privadas por identidad/rol; limpiar al cambiar sesión o salir.

## Flujo del cliente

1. Consulta rifas, abre una y selecciona boletos disponibles.
2. Si necesita login/registro, conserva la intención y revalida disponibilidad al regresar.
3. **Confirma explícitamente** el apartado autenticado. Login/registro o recuperación de una intención nunca reservan automáticamente.
4. Tras confirmar, el diálogo muestra importe e instrucciones bancarias guardados en la compra y permite subir comprobante mediante el flujo existente de `PurchaseDetail`.
5. `Mis apartados` (`/mis-compras`), disponible en el menú autenticado, permite consultar detalles, estados, historial y comprobantes.

### Reglas que no deben romperse

- Intención de checkout: token opaco de 32 hex minúsculas, TTL de 30 minutos, máximo 1000 boletos seleccionados. No guardar identidad, comprobantes ni datos bancarios en localStorage.
- Apartado idempotente: conservar la clave/payload al reintentar. Ante respuesta perdida después del commit, recuperar mediante lectura propia por clave; no repetir POST automáticamente.
- Disponibilidad, rangos, importes, vencimiento y pertenencia se validan en servidor. La numeración puede incluir el boleto cero.
- Importes en centavos enteros y snapshots históricos. La comisión es gasto del administrador, **no un recargo al comprador**.
- Instrucciones bancarias de una compra son inmutables; no reemplazarlas por la cuenta actual ni inventar datos de ejemplo.
- Para nuevos apartados se usa configuración existente o variables servidor `PAYMENT_BANK`, `PAYMENT_BENEFICIARY`, `PAYMENT_ACCOUNT`, `PAYMENT_INSTRUCTIONS`, si están completas. Si faltan, informar que no hay instrucciones; no fingir un proveedor de pago.
- Comprobantes privados: conservar límites, validación de bytes/MIME, ownership, guards y leases existentes. Subir un archivo no confirma el pago.

## Estados de solicitudes

Los nombres visibles no cambian los estados persistidos:

| Estado SQL       | Etiqueta        |
| ---------------- | --------------- |
| `awaiting_proof` | Sin comprobante |
| `reviewing`      | Por confirmar   |
| `paid`           | Confirmado      |
| `cancelled`      | Cancelado       |
| `rejected`       | Rechazado       |
| `expired`        | Vencido         |

- Comprobante aceptado: `awaiting_proof → reviewing`.
- Confirmar pago exige administrador y evidencia verificada; no aprobar desde el cliente ni por mero upload.
- Reservas sin comprobante pueden vencer; `reviewing` **no vence automáticamente**.
- Cancelación, rechazo y vencimiento liberan inventario según el dominio, conservando historial/auditoría.
- Escritores bloquean primero la rifa y luego sus órdenes. Mantener transacciones e invariantes entre compras, boletos y ocupación.
- Cuando una expiración debe conservarse pese a rechazar la operación, confirmar esa transacción antes de lanzar el error; no revertir la liberación accidentalmente.

## Registro y contacto manual

- Registro cliente por correo/contraseña: nombre, correo, contraseña/confirmación y teléfono internacional obligatorios.
- Contraseñas nuevas: 12–128 caracteres; login admite credenciales existentes de 1–128. Hash/cookies nativos de Better Auth, sin autenticación simulada.
- Teléfono validado también en `/sign-up/email` del servidor, normalizado con `+` y 8–15 dígitos, primer dígito distinto de cero. No inferir país ni afirmar verificación de propiedad.
- `user.phone` es nullable para compatibilidad: **solo registros nuevos requieren teléfono**. Cuentas anteriores siguen entrando y apartando sin completar ese dato.
- Registro no verifica el correo: conservar `emailVerified=false`. Sin proveedor configurado no existe recuperación/verificación automática; no improvisar un reset público ni sobrescribir credenciales existentes.
- Rol público solicitado se ignora. Promoción administrativa es operación privada y explícitamente autorizada, nunca un endpoint público.
- Mantener controles de origen, cookies y rate limiter nativo: cinco solicitudes por 60 segundos en cada endpoint de login/registro. No desactivarlo para que pasen pruebas.
- Admin ve teléfono/enlace `wa.me` en solicitudes **antes del sorteo** para confirmar comprobantes, y en el resultado del ganador para avisarle.
- WhatsApp es **manual**: abrir un enlace no acredita que se envió o entregó un mensaje. No hay integración SMS/WhatsApp automática.
- Sanear enlaces a dígitos y conservar protección `noopener noreferrer`/`no-referrer`. Legacy sin teléfono muestra contacto no disponible.
- Contactos de solicitudes/ganador son admin-only; no agregarlos a DTO públicos ni al detalle propio de compras. Conservar allowlists y gates de servidor.

## Panel administrativo vigente

Secciones: **Resumen, Rifas, Compras e Ingresos**, basadas en `docs/design/Rifas-Nova-admin.html`.

- Compras: solicitud, snapshot bancario, comprobante privado/descarga, contacto manual y acciones auditadas de confirmación/cancelación.
- Rifas: edición/inventario y resultado con boleto, datos del ganador y contacto manual.
- Configuración y Notificaciones fueron retiradas de la interfaz y sus funciones actuales; no reactivarlas basándose en descripciones históricas. Tablas/migraciones históricas no se borran por ello.
- `/api/purchases/payment-settings` responde 410. No hay cron de sorteos ni activación de trabajadores históricos de correo o Storage.

## Sorteo exclusivamente manual

- Selección uniforme por **boleto pagado**, mediante `crypto.randomInt`; no permitir ganador, índice ni aleatoriedad enviados por cliente.
- Cumplir cierre de ventas y fecha de sorteo; resolver solicitudes pendientes antes de ejecutar. No cancelar `reviewing` para forzar un ganador.
- Resultado y auditoría inmutables/idempotentes: reintentos conservan el ganador original.
- Solo administrador autenticado: botón de fila **Realizar sorteo** → diálogo existente → confirmación irreversible explícita o cancelación. Abrir/cancelar no ejecuta; resultado existente usa **Ver resultado**.
- Borradores, archivadas, cero boletos pagados o compras pendientes no permiten sortear. Ambas fechas deben haberse cumplido; el servidor sigue siendo la autoridad.
- `vercel.json` no programa cron. GET `/api/cron/draw` es compatibilidad inerte: siempre **410**, private/no-store, sin importar DB/runner ni depender del token. El servicio automático histórico tampoco ejecuta.
- Conservar migraciones, `source=automatic`/actor NULL históricos y constraints; nuevas ejecuciones son `source=manual` con actor humano. Las instrucciones históricas de activar cron/CRON_SECRET en docs quedan reemplazadas por esta decisión.

## Datos reales, secretos y activación

- No leer/publicar valores secretos ni versionar `env`, `.env*`, credenciales, contraseñas o artefactos de pruebas/build.
- Secretos solo en servidor, nunca con prefijo `VITE_`: DB/Auth, claves de Supabase y `CRON_SECRET`.
- Bucket de comprobantes privado; no asumir que su ACL está validada por pruebas con mocks.
- No ejecutar seed, migraciones, `db:push`, reset, bootstrap o cambios contra DB real sin autorización operativa y verificación del destino. No matar/reiniciar servidores del usuario sin permiso.
- `db:seed` muestra plan por defecto; ejecución explícita de desarrollo requiere `--execute`. No convertirlo en recuperación de cuentas ni sobrescribir colisiones.
- Desarrollo tuvo 0000–0004 aplicadas bajo autorización previa; esa evidencia no autoriza repetirlas sobre otra DB o producción. Reconciliar baseline y journal antes de migrar.
- `drizzle/0005_phone_automatic_draw.sql` agrega teléfono y auditoría automática. **Aplicada con Drizzle bajo autorización explícita en la DB configurada de este workspace**: historial 0000–0005 verificado por hash/fecha, `phone` nullable y constraints confirmados. Esto no acredita su aplicación en otro destino ni activa cron/despliegue.
- Conservar journal/snapshot coherentes; no modificar snapshots históricos. Snapshot 0005 comparado con esquema actual genera cero DDL: esto no significa que la migración fue aplicada.
- Para otro destino: aplicar migración revisada y autorizada **antes de desplegar código que consulta `phone`**. No configurar/activar cron de sorteo; no hay mensajes reales activados por las pruebas.
- Commit/push/PR requieren autorización del usuario; un permiso de commit no implica push o despliegue. Excluir cambios ajenos y archivos de entorno.

## Pruebas y verificación

Usar pruebas primero para cambios deterministas de comportamiento. Documentación pasiva requiere verificación estructural/formato, no inventar RED. Mantener pruebas y migraciones con la funcionalidad; evitar refactors/formato global ajenos al objetivo.

```sh
bun run dev
node --import tsx --test --test-concurrency=2 $(find src scripts tests -type f \( -name '*.test.ts' -o -name '*.test.tsx' \) | sort)
node node_modules/typescript/bin/tsc --noEmit
bun run build
node --import tsx tests/e2e/run.ts
git diff --check
```

- Harness: `vite.e2e.config.ts` + `tests/e2e/`; PGlite en memoria aplica todas las migraciones SQL ordenadas, Auth/roles/servicios reales con transporte de Storage ficticio y tráfico externo bloqueado.
- Fixture en puerto 3212, `envDir:false`, caché aislada por PID en `/tmp`; no compartir optimización con la app del usuario en 3000.
- Cold startup: mantener inclusiones explícitas de dependencias cliente, `noDiscovery` y readiness del optimizador. No filtrar errores de import/504 ni quitar assertions de cero pageErrors/hydration.
- Si MCP no encuentra Chrome, revisar navegadores ya instalados en caché Playwright antes de instalar o cambiar configuración.
- Cleanup solo de procesos/artefactos propios. Capturas y logs temporales no se versionan.
- Evidencia de cierre de tarea 23: **110/110 pruebas, 25 checkpoints cold, pageErrors=0, hydrationErrors=0, logout correcto, tipos/build PASS**. ESLint de archivos tocados: cero errores y una advertencia `no-shadow` histórica.
- Revalidar según el cambio; resultados históricos no acreditan un candidato nuevo. No afirmar carreras PostgreSQL multiconexión, privacidad real del bucket, deployment ni entrega de mensajes por pruebas aisladas.

## Imágenes en desarrollo — diagnóstico corregido tras la tarea 23

Los 18 errores 404 se aislaron en `Sec-Fetch-Dest: image`: Nitro dev clasificaba la petición como asset y omitía el renderer SSR del endpoint; `Accept` de imagen por sí solo no fallaba. `vite.config.ts` registra ahora únicamente `/api/media/images/**`, con `src/lib/storage/media-handler.ts` reenviando el Request intacto al SSR existente. Autorización, validación, Storage y redirect 302 no cambian.

Verificación independiente en el harness aislado: requests genéricos y con headers de imagen responden 200 al seguir el redirect; `<img>` real tiene `naturalWidth > 0` y `imageFailures=0`. Esto no acredita ACL real de Supabase ni despliegue. Si aparecen nuevos fallos, conservar sus diagnósticos: no ocultarlos para aprobar pruebas ni atribuirlos a pagos/contacto/cron sin evidencia.

Referencias de contexto y evidencia: `docs/backend.md`, `docs/auth.md`, `docs/tasks/backend.md`, `docs/tasks/auth.md` y `docs/tasks/html-adaptation.md`. Las secciones históricas pueden describir mecanismos retirados; prevalecen código actual y cierre vigente, no conteos antiguos o una infraestructura nunca activada.
