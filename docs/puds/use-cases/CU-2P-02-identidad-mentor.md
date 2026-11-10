# CU-2P-02 - Identificar al desarrollador y personalizar la mentoría

## Estado

Rama `feat/s2-cu02-identidad-mentor`. CU-2P-01 ya está integrado en `main`; CU-2P-02 está completado y aceptado. Su OpenSpec está archivado en `openspec/changes/archive/2026-11-09-s2-cu02-identidad-mentor/`.

## Objetivo

Preparar una identidad de interacción segura y reutilizable para Mentor, derivada del usuario autenticado y del ámbito autorizado del proyecto.

## Alcance

- RF-05: identificar al desarrollador con el usuario real validado por JWT.
- RF-06: derivar el rol efectivo OWNER, EDITOR o VIEWER mediante `ProjectAccessService.requireView`.
- RF-07: impedir la suplantación evitando entradas independientes para `userId`, autor, rol o fecha.

## Implementación Realizada

- Se añadió `MentorInteractionIdentity` con `projectId`, `userId`, `author.email`, `accessRole` y `occurredAt`.
- El resolvedor recibe solamente `projectId` y `AuthenticatedUser`, autoriza antes de construir la identidad y genera la fecha con el servidor.
- `MentorModule` importa `MentorInteractionIdentityModule`; `MentorService` resuelve la identidad desde `AuthenticatedUser` antes de cargar el proyecto y usa el rol autorizado por `requireView`.
- El registrador efímero recibe la identidad completa junto con la respuesta, sin añadir persistencia.
- El proveedor Qwen conserva exclusivamente contexto UML y pregunta; identidad, email, rol y timestamp no entran al prompt.
- No se modifican Auth, JWT, Prisma, Assistant, Qwen, frontend ni CU-10.

## Seguridad Integrada

- `POST /projects/:id/mentor/query` mantiene el body limitado a `question`; campos de identidad adicionales son rechazados por el DTO.
- Una consulta válida usa solamente el usuario autenticado por JWT para derivar `userId`, `author.email`, `accessRole` y `occurredAt`.
- Las pruebas HTTP cubren campos de suplantación, dos usuarios distintos y rechazo de acceso antes de cargar el proyecto.

## Fuera De Alcance

- Persistencia o memoria de interacciones: CU-03.
- Historial visible en la interfaz: CU-07.
- Endpoint alternativo de chat, proveedor de IA y cambios de autenticación.

## Pruebas

- `npx vitest run src/mentor-identity src/mentor src/projects/project-access.service.test.ts`: 25/25 correctas.
- `npx vitest run src/assistant/assistant-interpreter.service.test.ts src/assistant/assistant-interpret.controller.test.ts src/assistant/local-text-model.test.ts`: 18/18 correctas.
- `npm run typecheck`, `npm run lint` y `openspec validate s2-cu02-identidad-mentor --strict`: correctos.
- No existe prueba unitaria independiente de `JwtAuthGuard`; no se añadió una fuera de alcance.
- No se ejecutó `backend/src/auth/auth.integration.test.ts` ni se leyó `backend/.env`.

## Resultado Final

- La identidad de interacción del Mentor se deriva exclusivamente del JWT/autenticación y el rol autorizado por `ProjectAccessService.requireView`.
- `MentorInteractionRecorder` recibe la identidad segura; los campos de suplantación se rechazan y userId, email y rol no llegan al proveedor ni al prompt de Qwen.
- No se implementaron memoria ni historial de interacciones; corresponden a CU-03 y CU-07.
- CU-2P-02 no tiene pendientes funcionales y fue aceptado. El OpenSpec quedó archivado.
