# CU-2P-02 - Identificar al desarrollador y personalizar la mentoría

## Estado

Track paralelo desde `main` en la rama `feat/s2-cu02-identidad-mentor`. No está integrado con CU-2P-01 ni altera el estado funcional de CU-10.

## Objetivo

Preparar una identidad de interacción segura y reutilizable para Mentor, derivada del usuario autenticado y del ámbito autorizado del proyecto.

## Alcance

- RF-05: identificar al desarrollador con el usuario real validado por JWT.
- RF-06: derivar el rol efectivo OWNER, EDITOR o VIEWER mediante `ProjectAccessService.requireView`.
- RF-07: impedir la suplantación evitando entradas independientes para `userId`, autor, rol o fecha.

## Implementación Realizada

- Se añadió `MentorInteractionIdentity` con `projectId`, `userId`, `author.email`, `accessRole` y `occurredAt`.
- El resolvedor recibe solamente `projectId` y `AuthenticatedUser`, autoriza antes de construir la identidad y genera la fecha con el servidor.
- El módulo es exportable e independiente; no está registrado en `AppModule` mientras no tenga consumidor productivo.
- No se modifican Auth, JWT, Prisma, proyectos, Assistant, Qwen, frontend ni CU-10.

## Integración Pendiente Con CU-01

- Conectar el resolvedor a `POST /projects/:id/mentor/query` cuando CU-01 llegue a `main`.
- Entregar la identidad al registrador de interacción.
- Probar por HTTP que `userId` o `author` falsos en el body no sustituyen al usuario autenticado.
- Confirmar de forma integrada que identidad y email no llegan al prompt Qwen.

## Fuera De Alcance

- Persistencia o memoria de interacciones: CU-03.
- Historial visible en la interfaz: CU-07.
- Endpoint alternativo de chat, proveedor de IA y cambios de autenticación.

## Pruebas

- `npx vitest run src/mentor-identity/mentor-interaction-identity.resolver.test.ts`: 9/9 correctas.
- `npx vitest run src/auth/auth.service.test.ts src/projects/project-access.service.test.ts`: 4/4 correctas.
- No existe prueba unitaria independiente de `JwtAuthGuard`; no se añadió una fuera de alcance.
- `npm run lint`, `npm run typecheck` y `openspec validate s2-cu02-identidad-mentor --strict`: correctos.
- No se ejecutó `backend/src/auth/auth.integration.test.ts` ni se leyó `backend/.env`.
