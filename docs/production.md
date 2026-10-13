# Preparar staging en Vercel sin activar producción

El build selecciona Nitro `vercel`; desarrollo y harness mantienen su runner local. **No se desplegó ni activó cron/monitoreo.** Evidencia: suite183/183, tipos/build Vercel y último E2E completo PASS; PostgreSQL real concurrente/restore de datos ficticios PASS; metadata Supabase readonly confirma bucket privado. Esto no acredita uptime, restore del negocio/Storage ni upload/download real del proveedor. Correo queda pospuesto hasta disponer de dominio y autorización separada.

## Camino de salida

1. Acordar proyecto y plan Vercel apto para uso comercial (Hobby no lo es). Separar staging/producción y sus datos, secretos y permisos.
2. Reconciliar migraciones del destino por hash/fecha antes del deploy, con autorización y backup. La aplicación de 0007/0008 en desarrollo/testing no acredita otro destino. Nunca `db:push` ni baseline ciego.
3. Configurar secretos solo en servidor: DB, Better Auth, Supabase; origen HTTPS exacto de Auth y proxy/IP confiable. No `VITE_`, valores en logs ni secretos en repositorio. Comprobar cookies, login, limiter distribuido y enrolamiento/challenge MFA administrativo en staging.
4. Ejecutar tipos, suite, build y harness del candidato. Verificar `.vercel/output/config.json`, `static` y `functions/__server.func/.vc-config.json`; `.vercel/` queda ignorado. No publicar artefactos de fixtures.
5. Administrador configura contacto y bancos reales; comprobar footer, apartado explícito, snapshot, comprobante privado y revisión manual con cuentas de staging autorizadas.
6. Autorizar despliegue y smoke test por separado; conservar versión anterior compatible y procedimiento de rollback.

## Operación mínima

| Endpoint                    | Contrato                                                                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET `/api/health`           | 200 `HEALTH_OK`: proceso HTTP disponible, sin consultar DB, secretos ni proveedores. **No es readiness DB ni prueba de uptime.**                                                            |
| GET `/api/cron/maintenance` | Opcional: `JOBS_ENABLED=true` y Bearer exacto de `CRON_SECRET` servidor, comparación de digests constant-time. Sin query. Carga runner solo tras guards; lote fijo `{kind:'all',batch:10}`. |
| GET `/api/cron/draw`        | Siempre 410. Sorteo exclusivamente manual con confirmación humana.                                                                                                                          |

No se añade schedule a `vercel.json`, no se cambian variables ni se ejecutan jobs reales. Mantenimiento usa únicamente expiración de reservas y recuperación de Storage actuales, nunca correo/sorteo. Activarlo requiere revisar el destino y autorizar sus efectos de limpieza. El CLI existente conserva su confirmación explícita.

Mantenimiento devuelve 405 por método distinto de GET, 400 por query, 503 deshabilitado/sin secreto, 401 credencial inválida, 500 fallo interno o resumen inválido. Respuestas privadas/no-store, nosniff y no-referrer; no reflejan parámetros ni errores del proveedor. Éxito devuelve exclusivamente conteos acotados: expired y claimed/deleted/retry/stale. `retry>0` o `stale>0` no equivale a limpieza completada y debe revisarse. Un 500 puede ocurrir después de cambios parciales: no implica rollback global.

Logs propios de mantenimiento: requestId aleatorio, código, status y conteos corroborados; jamás URL, bearer, contacto, banco, keys ni excepción cruda. Revisar también redacción/retención de logs de plataforma y proveedores antes de activación. Pendientes: servicio de monitoreo, frecuencia, umbrales, responsable y destinatario de alertas; no se inventa ninguno. Monitorizar liveness y errores/retry de mantenimiento son tareas distintas.

## Recuperación y rollback

- Acordar responsable, retención, cifrado, RPO y RTO para **PostgreSQL y objetos privados de Storage**. Backup de DB no contiene comprobantes.
- Ensayar restore en destino aislado autorizado: esquema/journal, relaciones de compras/boletos, snapshots bancarios, auditoría/ganador y correspondencia de keys/digests con objetos. Medir duración y pérdida máxima observada; no afirmar RPO/RTO sin ensayo.
- Ante incidente, detener nuevas operaciones mediante mecanismo operativo acordado, preservar evidencia y volver a versión compatible. Rollback de código no revierte migraciones, compras, instrucciones históricas ni ganador. No resetear DB ni reescribir snapshots para acomodar una versión antigua.
- Restaurar datos requiere autorización y reconciliación del periodo posterior al backup; documentar compras/pagos afectados antes de reabrir.

## Bloqueos antes de publicar

- [ ] Completar Storage real: metadata nativa ya confirmó bucket privado (sin leer/escribir objetos); quedan upload/download y denegación anónima/otro usuario con evidencia autorizada. Mocks no acreditan esos recorridos reales.
- [ ] Resolver comprobantes históricos mayores al payload request/response Vercel (4.5 MB): nuevos uploads de 4 MiB no solucionan descargas históricas de hasta 10 MiB. No borrar evidencia ni exponer URLs bearer públicas.
- [ ] Validar tamaño de exportación CSV de inventarios grandes: actualmente devuelve todo como string serverFn y puede superar payload Vercel; no se implementó truncado ni transporte nuevo. Medir volumen previsto y acordar descarga paginada/streaming si hace falta.
- [ ] Smoke test HTTPS, banco/contacto real y recuperación independiente de DB/Storage documentados. Restore ficticio PG probado no fija retención/cifrado/RPO/RTO del negocio.
- [ ] Revisar el timeout intermitente del diálogo de compra si reaparece: último E2E instrumentado PASS, fallo anterior conservado, causa todavía no demostrada.
- [ ] Cliente/asesoría entrega y revisa identidad del organizador, reglas, entrega, cancelaciones/reembolsos y privacidad. No hay páginas legales ficticias ni afirmación de validez legal.
- [ ] Correo/verificación/recuperación por correo siguen pendientes; no prometerlos al usuario.

Ver [preparación por bloques](tasks/production-readiness.md) y [evidencia del bloque operativo](tasks/operations.md).
