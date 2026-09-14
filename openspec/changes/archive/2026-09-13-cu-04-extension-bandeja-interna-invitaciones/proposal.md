## Why

Las invitaciones de CU-04 requieren compartir manualmente un link temporal. Un usuario ya registrado debe poder descubrir y resolver sus invitaciones pendientes desde UML Studio sin perder el flujo por token existente.

## What Changes

- Agregar bandeja autenticada de invitaciones PENDING dirigidas al email normalizado del usuario, con contador en `/projects`.
- Permitir aceptar o rechazar por identificador de invitación, verificando identidad en backend y reutilizando las reglas transaccionales de resolución existentes.
- Mantener intactas las rutas actuales por token como alternativa.
- No incluir SMTP, dependencias externas ni migraciones. La actualización en caliente queda fuera: la carga/revalidación de `/projects` es el requisito mínimo.

## Impact

- Backend: listado propio y resolución autenticada por id mínimos sobre `ProjectInvitationsService`.
- Frontend: API client, acceso visible, bandeja MUI y actualización local de proyectos/contador.
- Prisma: se reutilizan `PENDING`, `ACCEPTED`, `REJECTED`, `REVOKED` y el email normalizado actual.
