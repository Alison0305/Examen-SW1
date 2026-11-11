## Why

CU-2P-03 persiste cada consulta completada del Mentor en `MentorInteraction`, pero esas interacciones solo se usan como memoria interna de Qwen: ningún integrante del proyecto puede revisarlas. El issue #7 (CU-2P-07) pide que los integrantes autorizados de un mismo proyecto consulten las preguntas, respuestas, autor y fecha de las interacciones de ese proyecto, sin mezclar proyectos y sin crear una segunda fuente de verdad.

## What Changes

- Exponer un historial de solo lectura `GET /projects/:id/mentor/history` sobre la tabla existente `MentorInteraction`, autorizado con `requireView` (OWNER, EDITOR y VIEWER).
- Paginación keyset `occurredAt DESC, id DESC` con cursor opaco, `limit` por defecto 20 y máximo 50; sin paginación por offset.
- Búsqueda básica `q` (1–200 caracteres tras recortar), sin distinguir mayúsculas, sobre pregunta y respuesta y siempre dentro del proyecto.
- DTO público con `id`, `author.email`, `question`, `answer` y `occurredAt`; nunca `userId`, `accessRole`, `projectRevision`, `grounded`, prompts ni datos técnicos.
- Sección de historial en el panel Mentor IA con búsqueda, detalle desplegable y carga de más elementos.
- Recomendaciones técnicas de CU-2P-05 registradas: se muestran como texto legible, sin JSON ni campos internos.
- Estado público de las propuestas UML de CU-2P-06 (pendiente, aplicada, rechazada) leído de `MentorProposalHistoryService`, como un conjunto separado de las interacciones.
- Refresco local del historial tras una interacción propia (consulta o recomendación), sin tiempo real.

## Capabilities

### New Capabilities
- `mentor-shared-history`: consulta autorizada, paginada, buscable y aislada por proyecto de las interacciones persistidas del Mentor.

### Modified Capabilities
- Ninguna. La memoria de CU-2P-03 (`mentor-interaction-memory`) y el Mentor de CU-2P-01 no cambian.

## Impact

- Backend: módulo nuevo `backend/src/mentor-history/` (contratos, cursor, consulta, lector Prisma, servicio y controlador). El historial funciona sin `ASSISTANT_MODEL_PATH` y nunca invoca el modelo local. Reutiliza `MentorProposalHistoryService` de CU-2P-06 sin modificarlo.
- Persistencia: reutiliza `MentorInteraction` y su índice `(projectId, occurredAt, id)`. Sin migración Prisma.
- Frontend: sección de historial en `MentorPanel` y cliente HTTP en `frontend/app/auth/api.ts`.
- Pruebas: unitarias de contrato, integración PostgreSQL de paginación y aislamiento, HTTP de permisos y privacidad, y frontend.
- No añade dependencias, secretos, tiempo real, edición, borrado ni llamadas a Qwen.
