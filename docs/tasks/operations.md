# Operación mínima — candidato preparado, no activado

Infraestructura transversal en `src/lib/operations/`, wrappers HTTP finos y carga diferida del runner. No cambios en modelos, scripts PostgreSQL, secretos, jobs existentes ni schedule. Runbook: [producción y recuperación](../production.md).

## Contrato implementado

- Health GET de liveness sin DB/env/proveedores; rechaza query y otros métodos.
- Mantenimiento opcional: método/query antes de configuración; JOBS_ENABLED y Bearer constant-time acotado antes de importar runner/DB. Lote fijo all/10, exclusivamente expiración y recuperación Storage existentes.
- DTO/logs allowlist sin errores crudos ni PII. Conteos enteros 0–10; deleted+retry+stale coincide con claimed. Unknown fields descartados. Headers private/no-store, nosniff, no-referrer.
- Nitro preset Vercel únicamente para build; fixture evalúa configuración serve conservando aislamiento y readiness. `.vercel/` ignorado sin quitar reglas previas.
- Árbol regenerado con CLI; assertions HTTP añadidas al harness para health y mantenimiento denegado sin cambios en compras/outbox/mensajes. Assertions previas intactas.

## TDD y validación local

| Comando                                                                                                                                                                  | Evidencia observada                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node --import tsx --test src/lib/operations/http.test.ts`                                                                                                               | RED exit1 ERR_MODULE_NOT_FOUND antes de implementación; GREEN exit0 10/10 antes de triangulación adicional.                                                     |
| `node --import tsx --test src/lib/operations/deployment.test.ts`                                                                                                         | RED exit1: preset build-only ausente.                                                                                                                           |
| `TSR_TMP_DIR=src/lib/operations/.route-tmp bun run generate-routes`                                                                                                      | Exit0; warning circular dependency replaceRouteChunk del CLI. Árbol generado, no editado manualmente. Directorio temporal vacío del generador puede permanecer. |
| `node --import tsx --test src/lib/operations/http.test.ts src/lib/operations/deployment.test.ts scripts/run-jobs.test.ts`                                                | GREEN exit0 13/13.                                                                                                                                              |
| `node --import tsx --test src/lib/operations/http.test.ts src/lib/operations/deployment.test.ts scripts/run-jobs.test.ts src/modules/raffles/lib/automatic-draw.test.ts` | GREEN final exit0 18/18, incluyendo 410 inerte, CLI intacto y reglas históricas de sorteo.                                                                      |
| `node node_modules/typescript/bin/tsc --noEmit`                                                                                                                          | Exit0, sin salida.                                                                                                                                              |

Documentación pasiva no requiere RED de comportamiento. Tests rechazan método/query/disabled/secreto ausente/bearer incorrecto o excesivo sin cargar runner; cuentan ejecuciones y verifican redacción, resumen inválido, excepción y campos extra. Casos alternos: health inválido y ausencia/esquema incorrecto de autorización.

## Diagnóstico acotado del navegador (job 19)

El candidato terminó exit1 por timeout de 30 s en `locator.evaluate`, esperando el diálogo accesible `Detalle de compra`, durante `admin paid transition and immutable snapshot`. El log acredita el paso previo de rechazo PDF, pero no identifica cuál evaluación/layout falló ni acredita que el diálogo siguiera abierto. No demuestra una regresión de Ops, MFA ni del producto; el PASS histórico de otra corrida no sustituye este FAIL.

Se añade evidencia en consola antes/después de cada resize, al completar/fallar layout y en los pasos de refresh: presencia del nodo, connected/open/visible, geometría, controles deshabilitados y estados loading/saving/refresh/error categorizados. No imprime textos arbitrarios, rutas/URLs, identificadores, contactos, bancos, motivos ni cookies. Sustituye el diagnóstico previo que volcaba nombres de botones/ruta a JSON y tomaba capturas adicionales. Las assertions y capturas de layout existentes permanecen; no se aumenta timeout, fuerza click ni acepta networkidle como prueba de UI.

Hipótesis pendientes: diálogo cerrado/desmontado o inaccesible durante un checkpoint; faltan observaciones para distinguirlas. No se aplica una corrección especulativa de sincronización ni se modifica producción. Parent puede obtener evidencia nueva con `node --import tsx tests/e2e/run.ts` sobre este candidato instrumentado; no se ejecutó aquí ni se declara GREEN de navegador. Si los flags muestran cierre/desmontaje inesperado, revisar el ciclo público del diálogo antes de decidir un cambio de producto por separado.

## Verificación final del parent

- Revisión independiente: 18/18 focales PASS, sin P1/P2; no receipt nativo (binario de assessment ausente).
- Suite completa: **183/183 PASS**, exit0; tipos/diff sin errores. Build Vercel exit0; artefactos config/static/server y runtime Node comprobados, sin schedules.
- E2E completo instrumentado **job23 PASS**, exit0, 190s: checks HTTP operativos, MFA, compras/pagos, contacto/destinos, desktop/mobile, imágenes sin fallos, cero pageErrors/hydration y logout correcto.
- **job19 FAIL permanece como fallo intermitente sin causa demostrada**; job23 no es una corrección de producto ni demuestra por qué desapareció el diálogo antes. Se conserva instrumentación para un nuevo fallo; no se silenciaron assertions ni aumentaron timeouts.
- PostgreSQL real multiconexión/restore del bloque separado: job21 PASS con schema propio y seis triggers autorizados ([evidencia](postgres-verification.md)). Metadata Supabase real, solo lectura: bucket privado confirmado; no objetos ni ACL cambiados. No acredita upload/download real ni autorización por otro usuario sobre el proveedor.

No se activó cron/JOBS_ENABLED ni desplegó Vercel; no se afirma uptime, política RPO/RTO, alertas activas o entrega de correo. Decisiones/activaciones pendientes están en el runbook.
