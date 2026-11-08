## Why

El segundo parcial inicia un flujo de consulta al Mentor IA vinculado al proyecto activo. El sistema necesita responder sobre el modelo UML persistido y autorizado, sin convertir el asistente existente de comandos estructurados en un chatbot genérico ni revelar información entre proyectos.

La auditoría inicial no encontró una integración de Claude o Anthropic. El runtime disponible es Qwen3 local mediante `node-llama-cpp`; las únicas menciones de Claude describen asistencia de desarrollo.

## What Changes

- Crear el módulo `mentor` con consulta autenticada `POST /projects/:id/mentor/query`.
- Construir un contexto semántico, determinista y acotado desde `ProjectDocument.uml`, excluyendo `DiagramLayout` y secretos.
- Reutilizar el runtime local Qwen mediante un adaptador textual independiente de `MentorService`, sin modificar el contrato ni la semántica de `/assistant/interpret`.
- Definir un registrador de interacciones temporal y reemplazable, sin persistencia de memoria o historial.
- Incorporar un panel Mentor IA dentro del workspace persistido del proyecto.

## Capabilities

### New Capabilities

- `project-contextual-mentor`: consulta autorizada y contextual del Mentor IA para un proyecto UML activo.

### Modified Capabilities

- `local-text-interpreter`: el runtime Qwen local expone generación textual en cola para un adaptador de mentor, conservando la generación JSON restringida de CU-08.

## Impact

- Backend: nuevo módulo `backend/src/mentor`, exportación del modelo local del módulo Assistant y una operación textual en su cola/runtime.
- Frontend: contrato del `ApiClient` y panel acoplado al workspace persistido.
- No hay cambios de Prisma, migraciones, secretos, CU-10 ni mutaciones UML.
