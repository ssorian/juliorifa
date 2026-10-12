# Destinos bancarios por apartado

Configuración vuelve exclusivamente para administrar destinos manuales CLABE, tarjeta y cuenta. No se restauran Notificaciones, proveedores ni cron. El endpoint histórico `/api/purchases/payment-settings` sigue respondiendo 410.

## Uso

1. Administrador: Configuración → agregar o editar banco, beneficiario, número e instrucciones opcionales; activar/desactivar sin borrar historia.
2. Cliente: confirmar explícitamente el apartado; consultar sus destinos guardados y copiar número/referencia junto al comprobante existente.
3. Administración revisa el comprobante: subirlo no confirma el pago. No se verifica titularidad ni se procesa una transferencia.

## Contrato

| Tema         | Decisión                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------- |
| Validación   | CLABE 18 dígitos, tarjeta 16, cuenta 1–20; textos acotados, inputs estrictos, UUID servidor.                  |
| Orden        | Secuencia estable de inserción; admite varios destinos del mismo tipo.                                        |
| Seguridad    | requireAdmin fresco por operación; serverFns nativos; caché private-admin por identidad y limpieza existente. |
| Historia     | `payment_methods_snapshot` nullable separado del objeto legacy; DTO `paymentMethods` explícito array/null.    |
| Fallback     | null: nunca existieron destinos y permite legacy completo; []: todos desactivados, sin fallback.              |
| Idempotencia | Se devuelve compra original antes de consultar configuración; recuperación readonly existente conservada.     |

## Verificación y activación

RED observado: fallback devolvió objeto legacy cuando debía ser null; GREEN: ambos tests de configuración pasan. Domain/SQL/SSR focales pasan; PGlite aplica todas las migraciones en memoria. Pruebas SQL verifican revocación del gate, múltiples destinos, orden, edición/desactivación y recuperación propia inmutable.

0006 generada offline con API Drizzle, sin credenciales ni DB real; journal y snapshot anteriores conservados. **Aplicada posteriormente bajo autorización explícita** en la DB configurada de este workspace con el migrator nativo Drizzle. Preflight: historial 0000–0005 por hash/fecha y sin esquema parcial; postflight: 0000–0006 por hash/fecha, cero pendientes, tabla `payment_methods`, constraints y `purchases.payment_methods_snapshot` jsonb nullable confirmados. No se crearon destinos bancarios ni se modificaron compras históricas. Para otro destino sigue siendo necesaria autorización operativa.

El harness verifica dos destinos por UI real, copia visible, comprobante disponible, edición/desactivación y apartado posterior, además de retry original. **Build y E2E del candidato final PASS**, ejecutados por el parent en copia temporal sin archivos de entorno: cero errores de página/hidratación, cero fallos de imagen y logout correcto. El primer arranque E2E falló por un symlink temporal externo de node_modules; se resolvió copiando las dependencias al aislamiento, sin cambiar producción ni ocultar diagnósticos. El writer no ejecutó build/E2E.

Seguimiento autorizado del test SSR: RED reproducido por import de `purchases/react.css` desde TicketSelection; loader no-op exclusivo de ese archivo en el hijo del test, retirado tras importar ProductDetail. Producción y assertions originales intactas; assertion adicional confirma que se cargó el asset real. GREEN aislado: wrapper 1/1 y child 7/7; suite completa **150/150**, tipos PASS. Settings reformateado únicamente en sus nueve archivos nuevos; lint settings/test SSR PASS.

Lint anterior de otros archivos tocados conserva 4 errores/4 warnings reproducidos en HEAD (services.ts/run.ts), no reescritos en este seguimiento. Snapshot0006 coincide con esquema (cero DDL de drift), prevId/journal PASS. Build/E2E finales verificados por el parent (30 checkpoints). Verificación independiente: 22/22 pruebas focales, tipos y diff-check PASS, cero hallazgos P1/P2. Las verificaciones de código no accedieron a DB real; la aplicación posterior de 0006 se documenta arriba. No se verificó infraestructura externa ni despliegue.
