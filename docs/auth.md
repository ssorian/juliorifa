# Acceso por correo

## Alcance

Better Auth + Postgres/Drizzle autentican clientes y administradores. Catálogo y selección son públicos; continuar la simulación requiere sesión. Rifas, disponibilidad y compras siguen siendo **demo local**, sin cobros ni reservas ni backend de pagos.

- `/login`: acceso sin contraseña; un correo nuevo también crea cliente al verificar.
- `/signin`: registro cliente por enlace mágico, nombre opcional, sin entrada de rol.
- `/auth/complete`: consulta sesión y rol actual en servidor. Admin siempre va a `/dashboard`; cliente recupera intención de compra válida o vuelve al catálogo.
- `/dashboard/`: `beforeLoad` consulta servidor antes de renderizar, también en SSR. Cliente y visitante no reciben el HTML del dashboard.

## Configuración servidor

Configura fuera del código: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (URL oficial existente; `SERVER_URL` es fallback compatible), `RESEND_API_KEY`, `EMAIL_FROM` (remitente verificado y fijo). No uses prefijo `VITE_`. No compartir valores ni imprimir enlaces/tokens. El entorno local comunicado ya contiene los tres primeros nombres; **faltan RESEND_API_KEY y EMAIL_FROM**. Su ausencia no bloquea el build, pero el envío falla explícitamente, sin log de enlace ni envío simulado.

Usa la URL y puerto reales de la app en `BETTER_AUTH_URL`. En producción requiere HTTPS, secreto robusto y remitente verificado. El transporte Resend es compartido en `src/lib/email`; futuras notificaciones de ganador quedan fuera de alcance.

## Migraciones: revisión antes de ejecutar

`npx drizzle-kit generate` genera SQL offline; **no se aplicó ninguna migración**. La migración inicial `drizzle/0000_bitter_cassandra_nova.sql` incluye las cuatro tablas auth y la tabla preexistente en código `todos`. No borra tablas.

**No ejecutes `db:migrate` a ciegas**: si la base ya tiene `todos` y no tiene journal Drizzle, su `CREATE TABLE todos` colisionará. Un operador debe revisar el SQL y reconciliar una baseline con el estado real de la base y su journal, preservando todos los datos. Esto requiere autorización independiente y acceso DB: no está validado aquí. No usar `db:push` ni eliminar tablas para resolverlo. En una base nueva vacía, después de revisar y autorizar, el comando de aplicación es `npm run db:migrate`.

## Administrador privado

Primero la cuenta debe existir y tener correo verificado. Un operador autorizado puede ejecutar:

```sh
node --import tsx scripts/promote-admin.ts --email existing@example.com --confirm-promote
```

No se ejecutó este comando. Requiere configuración servidor y migración aplicada. No crea usuarios ni promueve el primer registro; no existe endpoint público para promoción. El campo `role` tiene default DB `client`, constraint de valores, `input: false` y hook que fuerza `client` en creación. La autorización vuelve a consultar el rol DB sin cache de cookie, de modo que una revocación no conserva privilegios en SSR.

## Enlace y selección

Tokens hasheados, duración 5 minutos, límite 5 solicitudes/verificaciones por 60 segundos, activado también en desarrollo. El limitador es en memoria por instancia (demo local); un despliegue de múltiples instancias necesitaría almacenamiento compartido y configuración confiable de IP/proxy. La versión instalada consume verificaciones atómicamente en el primer uso; no usar `allowedAttempts` para reintentos. Better Auth conserva comprobaciones de origen y cookies en `/api/auth/$`. Los callbacks de su API se normalizan a `/auth/complete`, con identificador opaco de 32 caracteres hexadecimales; no aceptan destinos externos. Los fallos de envío o verificación son genéricos, sin revelar existencia de cuenta.

La selección se guarda sin PII en localStorage, con TTL de 30 minutos y máximo 1000 números. El identificador viaja en el callback, permite otra pestaña del mismo navegador/origen, y al volver se filtran números por disponibilidad/rango demo y estado activo. No es reserva ni autoridad de rol. En otro dispositivo, origen diferente o almacenamiento bloqueado no se puede recuperar la selección. Un enlace reenviado también da acceso a la cuenta: trátalo como credencial.

## Validación pendiente

Tests unitarios usan stubs, sin DB ni tráfico Resend. Con el dev server local autorizado activo en puerto 3210, `node --import tsx src/modules/auth/lib/ssr-smoke.ts` comprueba formularios públicos y que visitantes sin cookies sean redirigidos sin HTML dashboard (sigue redirects canónicos solo en el mismo origen). La verificación independiente pasó 14/14 tests, TypeScript, smoke SSR y navegador: formularios públicos, dashboard anónimo → login sin HTML administrativo, selección → acceso obligatorio y recuperación de los mismos boletos en una segunda pestaña. No reprodujo hallazgos P1/P2 en el alcance revisado. Quedan pendientes tras autorización/configuración: migración real, entrega de correo, enlace completo con cookies cliente/admin, expiración/replay en Postgres y auditoría del bundle de producción. No afirmar integración end-to-end validada ni compra real.
