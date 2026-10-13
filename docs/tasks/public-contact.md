# Contacto público del negocio — bloque 1

## Uso y límites

Configuración permite editar **Teléfono del negocio** y **WhatsApp del negocio** por separado. Ambos son opcionales: dejar vacío deshabilita únicamente ese canal. La página principal muestra los canales configurados en el footer accesible; no inventa números cuando falta configuración. Un error de lectura no muestra datos anteriores como si estuvieran vigentes.

Los números requieren + y código de país, entre 8 y 15 dígitos; se aceptan espacios, paréntesis y guiones de presentación. Se reutiliza `normalizePhone` de Auth, sin modificar registros ni inferir país. No se verifica propiedad del número.

WhatsApp abre un enlace manual `https://wa.me/<dígitos>`, protegido con `noopener noreferrer` y `no-referrer`. No envía mensajes automáticamente ni acredita entrega. El teléfono abre `tel:`. Correo continúa explícitamente pospuesto; no se restauran Notificaciones ni proveedores.

## Contrato técnico

- `src/modules/settings/` posee dominio, tabla, servicio, serverFns, UI y pruebas. La tabla `business_contact` es independiente de `payment_methods` y del singleton bancario histórico; no afecta snapshots de compras.
- Lectura y escritura administrativas exigen `requireAdmin` fresco. GET público proyecta únicamente `phone` y `whatsapp`; nunca actor, banco, beneficiario ni contactos de clientes.
- Inputs estrictos y CHECKs SQL validan formatos. Upsert atómico mantiene una única fila del negocio. Se conserva último actor/fecha internos, sin afirmar historial de eventos.
- Caché administrativa existente por identidad; guardar invalida tanto consultas administrativas como `public-business-contact`. Lectura pública refresca al montar, recuperar foco y cada 30 segundos; no es push entre navegadores.
- Contacto vacío no bloquea catálogo, login ni apartados. Una migración ausente produce error de contacto, no un número ficticio.

## Verificación y activación

RED observado antes de implementación: tests dominio/SSR y SQL fallaron por módulos de contacto inexistentes (exit 1). GREEN focal: siete pruebas settings pasan (exit 0), incluyendo SQL PGlite en memoria, SSR, normalización, campos extra rechazados, allowlist pública, revocación del gate, deshabilitación y regresión de destinos bancarios. Prueba offline compara snapshot con esquema (cero DDL de drift), SQL generado y lineage/journal.

`0007_business_contact.sql`, snapshot y journal se generaron offline con API Drizzle. **0007 aplicada posteriormente en la DB configurada de desarrollo/testing bajo autorización explícita del usuario**: preflight de 0000–0006 por hash/fecha, migrator nativo Drizzle acotado únicamente a 0007 y postflight con ocho migraciones coincidentes, cinco columnas y cinco constraints. No se modificaron cuentas/compras ni se aplicó Auth 0008; no se desplegó Vercel. Esta evidencia no acredita otros destinos ni privacidad real de Supabase.

Se añadieron assertions E2E de edición administrativa, lectura anónima, enlaces seguros, denegación a cliente/visitante y deshabilitación. Verificación del parent: suite completa **154/154 PASS** y build **PASS** (advertencias de directivas `use client` de dependencias); E2E aislado **PASS**, exit 0: edición administrativa, lectura anónima con allowlist, enlaces seguros, denegación a cliente/visitante y deshabilitación; cero fallos de imágenes, pageErrors e hidratación, logout correcto. Verificación independiente: **PASS, 0 P1/P2**, pruebas focales 7/7, tipos y `git diff --check`, todos exit 0. Sin commit ni push. La persistencia Engram falló en el writer por incompatibilidad de versiones; la arquitectura quedó registrada por el parent.
