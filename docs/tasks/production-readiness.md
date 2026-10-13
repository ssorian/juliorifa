# Preparación para producción — Vercel

Trabajo por bloques verificables. Sin correo hasta que el cliente disponga de dominio; sin publicación ni operaciones sobre infraestructura real por esta autorización de implementación.

## Decisiones del usuario

- Contacto público editable: WhatsApp y teléfono; no datos de compradores.
- Destino: Vercel; entrega por bloques verificados.
- Nuevos comprobantes: máximo 4 MiB conservando el flujo privado actual.
- Correo, verificación y recuperación por correo quedan pospuestos.
- No commit, push, despliegue ni cambios de Supabase sin autorización específica.
- Usuario autorizó usar la DB configurada, aclarando que es desarrollo/testing. 0007 y 0008 aplicadas de forma acotada y verificada; pruebas de concurrencia/restauración usarán esquema temporal propio, sin reset ni borrar datos existentes.

## Bloques y evidencia

| Bloque                                   | Estado                                   | Evidencia / pendiente                                                                                                                                                                          |
| ---------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contacto público                         | Verificado; 0007 aplicada en dev/testing | [Contrato y evidencia](public-contact.md); 154/154 tests, build, E2E y verificador independiente PASS; migrator nativo y postflight de DB configurada PASS                                     |
| Comprobantes compatibles con Vercel      | Verificado                               | GREEN15/15 e independiente PASS; guard compartido4MiB, imágenes2MiB/descarga histórica10MiB preservadas. Suite162/162/tipos/build/E2E completo PASS;4MiB+1 rechazado sinPOST ni transición     |
| Auth distribuido y MFA administrativo    | Verificado; 0008 aplicada en dev/testing | Suite162/162, tipos, build, E2E completo e independiente PASS. Preservar FAILjob8/job9 y selector antiguo job11 como historia; postflight de nueve migraciones coincidentes                    |
| Operación y diagnóstico                  | Verificado en candidato final            | Health/maintenance opcional, guards/logs, preset Vercel/runbook; focal18/independiente/build/artefactos/suite183 y últimoE2Ejob23 PASS. Conservar FAILjob19 intermitente, sin causa demostrada |
| PostgreSQL multiconexión/restauración    | Verificado en DB desechable autorizada   | Runner realjob21 PASS con opt-in6eventtriggers; schema propio, dos conexiones distintas, UUID/auditoría estables, dump/restore/digest y cleanup PASS; no evidencia HTTPAuth/Storage            |
| Preparación de despliegue y recuperación | Runbook listo, activación pendiente      | [Runbook](../production.md). Metadata Supabase realreadonly confirma bucketprivado; uploads/downloads/denegaciones reales no ejecutados. Sin despliegue ni monitors/schedules activados        |

## Condiciones de salida a producción

- [x] Tipos, suite183/183, build Vercel, artifacts y último navegador aislado completo PASS; verificación independiente por bloque PASS. Sin assessment/receipt nativo; fallback de riesgo alto con verificador separado cumplido.
- [ ] Migraciones del destino reconciliadas por hash/fecha y aplicadas bajo autorización; nunca `db:push` ni baseline ciego.
- [ ] Dominio/origen HTTPS de Auth, cookies y proxy/IP confiable comprobados en staging.
- [ ] Plan Vercel apto para uso comercial; Hobby es personal/no comercial.
- [ ] Bucket Supabase privado probado con acceso autorizado y denegación anónima/otro usuario; pruebas fake no lo acreditan.
- [ ] Destinos bancarios y contacto reales configurados por administrador; no crear datos de ejemplo.
- [ ] Comprobantes históricos mayores al payload Vercel reconciliados antes de publicar; reducir uploads nuevos no resuelve sus descargas.
- [ ] Medir exportación CSV de inventarios grandes: buffer completo por serverFn puede superar payload Vercel. No se cambiaron rangos/contrato ni se truncó información sin acuerdo.
- [x] Concurrencia y restore ensayados con PostgreSQL real multiconexión en schema temporal propio de la DB desechable del usuario, expresamente autorizado. Event triggers activos aceptados mediante opt-in exacto6; no reset ni desactivación de triggers; pueden cambiar metadata externa.
- [ ] Backups DB y comprobantes: responsable, retención, cifrado, RPO/RTO y ensayo de restauración en destino aislado acordados.
- [ ] Alertas operativas con destinatario/servicio definido, sin datos privados en logs; crear un endpoint no activa un monitor.
- [ ] Expiración/limpieza ejecutadas mediante mecanismo autorizado; no reactivar sorteo cron ni correo histórico.
- [ ] Identidad del organizador, reglas, entrega, reembolsos y privacidad revisados por el cliente/asesoría; no inventar datos ni validez legal.
- [ ] Smoke test real y rollback de versión documentados; rollback de código no equivale a revertir migraciones ni auditoría.

## Referencias verificadas

- [Vercel Functions limits](https://vercel.com/docs/functions/limitations): máximo de payload request/response 4.5 MB; 4 MiB son 4,194,304 bytes.
- [Vercel Hobby](https://vercel.com/docs/plans/hobby): uso personal no comercial.
- [Better Auth rate limit](https://better-auth.com/docs/concepts/rate-limit): almacenamiento distribuido/DB y consumo atómico.

Fuentes consultadas durante esta preparación. No acreditan configuración, cuota ni despliegue del proyecto real. `vercel.json` mantiene schedules desactivados; `/api/cron/draw` permanece 410 y los sorteos exclusivamente manuales.
