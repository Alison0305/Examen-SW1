## Context

La autenticación actual valida el JWT, recupera el usuario real y expone solo `id` y `email`. `ProjectAccessService.requireView` ya concentra la autorización de lectura y devuelve OWNER, EDITOR o VIEWER. CU-01 ya aporta la ruta Mentor y el proveedor Qwen contextual en `main`.

## Goals / Non-Goals

**Goals:**
- Producir un contrato mínimo reutilizable para la identidad de interacción.
- Derivar la autorización exclusivamente de los componentes existentes.
- Integrar el resolvedor en el flujo Mentor existente sin crear una ruta paralela.

**Non-Goals:**
- Crear endpoint, DTO HTTP, proveedor Qwen, prompt o registrador de Mentor alternativos.
- Persistir memoria o historial, modificar Prisma o exponer historial UI.
- Cambiar autenticación, JWT, `ProjectAccessService` o `AppModule`.

## Decisions

### Resolver con entradas cerradas

El resolvedor acepta solo `projectId` y `AuthenticatedUser`. Construye `userId` y `author.email` a partir de ese usuario, y el rol de `requireView`. Así no existe una entrada de aplicación para autor, rol o timestamp controlados por cliente. Se descarta aceptar un DTO de identidad porque introduciría una vía de suplantación sin necesidad.

### Autorización antes del timestamp

El resolvedor espera a `requireView` antes de crear `new Date()`. El timestamp representa una interacción autorizada y las pruebas usan timers falsos de Vitest, sin introducir una abstracción de reloj.

### Módulo exportable consumido por Mentor

`MentorInteractionIdentityModule` importa `ProjectsPersistenceModule` y exporta el resolvedor. `MentorModule` lo importa y `MentorService` resuelve la identidad antes de cargar el proyecto. El controlador entrega solo el `AuthenticatedUser` procedente del guard; no hay una segunda autorización ni una ruta paralela.

### Separación de identidad y proveedor

El contrato no se envía a Qwen ni contiene UML, credenciales o datos del proveedor. El servicio usa la identidad solo para autorizar y registrar; el proveedor recibe exclusivamente `MentorProjectContext` y pregunta. Las pruebas HTTP y de proveedor verifican esa separación.

## Risks / Trade-offs

- El email es el único autor visible disponible; se mantiene fuera de prompts y contratos HTTP hasta una integración autorizada.
- Una revocación posterior a la resolución exige volver a autorizar la siguiente interacción; no se reutilizan snapshots como permisos.
- Los campos extra de body se rechazan por el pipe de DTO; la identidad usada por una consulta válida procede del guard autenticado.
