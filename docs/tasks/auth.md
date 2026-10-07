# Auth cliente/admin

## Plan y alcance autorizado

Dos unidades revisables: (1) esquema auth, correo, sesión/rol servidor y guardas; (2) formularios, selección con TTL y pruebas. Forecast amplio: ~600+ líneas de código/docs más migración generada, autorizado por requerimiento integral. Sin cambios a backend rifas/pagos, sin aplicar DDL, promoción real, envío real, deploy ni git.

## Implementación

- Better Auth Drizzle: user/session/account/verification; contraseña deshabilitada, creación cliente forzada, magic links hasheados/5 min/rate limit/single-use de versión instalada.
- Transporte correo compartido con remitente servidor fijo y error sanitizado.
- Dashboard con serverFn y rol actual DB; callback central saneado, admin siempre dashboard.
- Login/registro públicos sin passwords, sesión visible/logout, admin link solo con rol servidor.
- Intención local con id callback seguro y selección recuperable en nueva pestaña; TTL 30 min, máximo 1000, revalidación demo.
- CLI privado exige cuenta existente verificada y flag de confirmación. Nunca ejecutado.
- SQL generado offline; revisar baseline `todos` existente antes de migrar. Ver `docs/auth.md`.

## Evidencia y límites

RED observado: tests policy/checkout fallaron por módulos de implementación ausentes. GREEN posterior: 5 tests contractuales pasaron. Triangulación: stubs de sesión actual/revocación y transporte, casos corruptos/expirados/oversize/rutas externas. Validación final: 14 tests pasan (incluidos SSR de formularios); eslint focalizado y tsc sin errores; rutas y build generados. Smoke local sin cookies pasa para login/registro y redirects seguros de dashboard/callback, sin markup dashboard al visitante. El primer assert del smoke asumía erróneamente que no existían redirects canónicos; se corrigió siguiendo solo destinos del mismo origen. Build conserva warnings de directivas de dependencias.

Revisión independiente: 14/14 tests, TypeScript y smoke SSR pasan; navegador confirma recorrido anónimo público, compra exige acceso, transición login/registro conserva checkout y segunda pestaña recupera los mismos boletos. Dashboard visitante redirige a login; sin P1/P2 reproducidos. Inspección de módulos JS de desarrollo no mostró los marcadores de secretos/transportes servidor examinados, sin garantizar auditoría exhaustiva ni bundle de producción.

No se ha aplicado migración ni probado DB/Resend reales. RESEND_API_KEY y EMAIL_FROM están pendientes según nombres de configuración comunicados. Escritura de `.env.example` fue bloqueada por política de herramienta; los nombres sin valores están documentados en `docs/auth.md`.
