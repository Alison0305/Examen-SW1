## Why

CU-2P-08 (issue #17). Hoy el equipo de un proyecto solo puede hablar con el Mentor IA de forma individual (panel Mentor, CU-2P-01 a 06) y ver después lo ocurrido en el historial (CU-2P-07), sin realtime. No existe un canal para que los integrantes conversen entre sí mientras modelan, ni una forma de que la IA participe en esa conversación. Se pide un chat por proyecto, compartido y en tiempo real, en el que conversan las personas y en el que el Mentor IA interviene cuando se le menciona.

## What Changes

- Chat por proyecto, persistente y en tiempo real: OWNER, EDITOR y VIEWER leen y escriben (decisión del usuario del 2026-11-11).
- El Mentor IA responde solo cuando un mensaje lo menciona (`@mentor …`). La respuesta se genera de forma asíncrona con el `MentorService.query` existente (mismo contexto UML, memoria y registro de CU-2P-01/03), sin cambiar prompts de Qwen, y se publica en el chat como mensaje del Mentor.
- Mientras la IA responde, la sala ve que el Mentor está respondiendo; si el modelo no está disponible, agota el tiempo o la cola está llena, la conversación recibe un aviso en lugar de un error silencioso.
- Incremento 1 (backend): tabla `ProjectChatMessage` con migración aditiva, `POST` y `GET` (paginación keyset) de mensajes, autorización `requireView`, aislamiento por proyecto, difusión Socket.IO en la sala del proyecto y orquestación de la mención.
- Incremento 2 (frontend): el chat reemplaza al panel Mentor actual; las acciones explícitas de CU-2P-04 (explicar selección), CU-2P-05 (recomendación técnica) y CU-2P-06 (proponer cambio UML, solo OWNER y EDITOR) se conservan como acciones del chat y sus resultados entran en la conversación; el historial de CU-2P-07 queda como sección plegable «Historial anterior».
- Incremento 3: prueba con varios navegadores e IA real en un entorno de pruebas, documentación y cierre.

## Capabilities

### New Capabilities
- `project-chat`: conversación compartida por proyecto, en tiempo real, con intervención del Mentor IA por mención.

### Modified Capabilities
- Ninguna en el incremento 1. `MentorModule` exporta `MentorService` (cambio aditivo, sin cambio de comportamiento). El reemplazo del panel (incremento 2) evaluará los deltas de `project-contextual-mentor` y `mentor-shared-history`.

## Impact

- Backend: nuevo módulo `project-chat`; eventos nuevos en `RealtimeEvent` y un emisor de chat implementado por el gateway existente (la misma sala `project:<id>`); `MentorModule` exporta `MentorService`.
- Persistencia: tabla `ProjectChatMessage` y enum `ProjectChatMessageKind`, migración aditiva; ninguna tabla existente cambia salvo relaciones inversas.
- IA: sin prompts nuevos ni modelos nuevos; las menciones comparten la cola de `ASSISTANT_LOCAL_MODEL`.
- Frontend (incremento 2): panel de chat en el workspace.
- Despliegue: la migración se aplica sola al arrancar el contenedor (`prisma migrate deploy`).
