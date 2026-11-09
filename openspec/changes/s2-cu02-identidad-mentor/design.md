## Context

La autenticación actual valida el JWT, recupera el usuario real y expone solo `id` y `email`. `ProjectAccessService.requireView` ya concentra la autorización de lectura y devuelve OWNER, EDITOR o VIEWER. CU-01 todavía no está integrado en `main`, por lo que no existe en esta rama una ruta Mentor que conectar.

## Goals / Non-Goals

**Goals:**
- Producir un contrato mínimo reutilizable para la identidad de interacción.
- Derivar la autorización exclusivamente de los componentes existentes.
- Mantener el módulo independiente y disponible para una futura importación de `MentorModule`.

**Non-Goals:**
- Crear endpoint, DTO HTTP, proveedor Qwen, prompt o registrador de Mentor.
- Persistir memoria o historial, modificar Prisma o exponer historial UI.
- Cambiar autenticación, JWT, `ProjectAccessService` o `AppModule`.

## Decisions

### Resolver con entradas cerradas

El resolvedor acepta solo `projectId` y `AuthenticatedUser`. Construye `userId` y `author.email` a partir de ese usuario, y el rol de `requireView`. Así no existe una entrada de aplicación para autor, rol o timestamp controlados por cliente. Se descarta aceptar un DTO de identidad porque introduciría una vía de suplantación sin necesidad.

### Autorización antes del timestamp

El resolvedor espera a `requireView` antes de crear `new Date()`. El timestamp representa una interacción autorizada y las pruebas usan timers falsos de Vitest, sin introducir una abstracción de reloj.

### Módulo exportable sin consumidor productivo

`MentorInteractionIdentityModule` importa `ProjectsPersistenceModule` y exporta el resolvedor. No se registra en `AppModule`; CU-01 lo importará desde `MentorModule` después de su integración en `main`. Esto evita publicar comportamiento Mentor incompleto o crear una ruta paralela.

### Separación de identidad y proveedor

El contrato no se envía a Qwen ni contiene UML, credenciales o datos del proveedor. La futura integración deberá comprobar explícitamente esa separación en una prueba HTTP de CU-01.

## Risks / Trade-offs

- El email es el único autor visible disponible; se mantiene fuera de prompts y contratos HTTP hasta una integración autorizada.
- Una revocación posterior a la resolución exige volver a autorizar la siguiente interacción; no se reutilizan snapshots como permisos.
- La prueba HTTP de body spoofing no existe aún porque depende de la ruta de CU-01; se documenta como pendiente y no se declara implementada.
