## Why

La mentoría necesita una identidad de interacción segura y reutilizable antes de conectarse al endpoint de CU-01. Debe derivarse del JWT ya validado y de la autorización vigente del proyecto, sin aceptar autor, rol ni fechas controladas por el cliente.

## What Changes

- Añadir un contrato mínimo de identidad de interacción del Mentor.
- Añadir un resolvedor que derive identidad, rol de acceso y timestamp de servidor mediante `ProjectAccessService.requireView`.
- Exponer el resolvedor desde un módulo independiente, sin endpoint ni integración productiva todavía.
- Cubrir roles, aislamiento por usuario/proyecto, timestamp y ausencia de secretos con pruebas unitarias.

## Capabilities

### New Capabilities
- `mentor-interaction-identity`: identidad segura y contextual de una interacción de Mentor derivada del usuario JWT y de la autorización de proyecto.

### Modified Capabilities
- Ninguna.

## Impact

- Backend: nuevo módulo interno sin controlador, Prisma, migraciones ni cambios de autenticación.
- Integración pendiente: CU-01 conectará este contrato a `POST /projects/:id/mentor/query` cuando esté disponible en `main`.
- No cambia APIs HTTP, prompts Qwen, Assistant ni funcionalidades de CU-10.
