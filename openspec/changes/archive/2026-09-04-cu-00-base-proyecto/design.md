## Context

El repositorio esta en preparacion inicial: existe documentacion base, pero no hay `frontend/`, `backend/` ni `package.json` raiz. El cambio debe crear una base ejecutable y verificable para CU-00, sin adelantar las capacidades UML, persistencia, colaboracion, generacion, IA, voz, vision ni mobile de CUs posteriores.

La especificacion normativa esta en `specs/base-proyecto/spec.md`.

## Goals / Non-Goals

**Goals:**

- Establecer un monorepo npm con workspaces directos `frontend` y `backend`.
- Dejar scripts raiz consistentes para operar ambos workspaces desde la raiz.
- Crear una aplicacion Next.js App Router + TypeScript + MUI minima y tecnica.
- Crear una API NestJS 11 + Fastify minima con CORS y `GET /health`.
- Demostrar integracion frontend -> backend con estados `API disponible` y `API no disponible`.
- Preparar bases de testing con Vitest, React Testing Library, `@nestjs/testing` y Supertest.
- Documentar la implementacion real de CU-00 al finalizar apply.

**Non-Goals:**

- No crear landing completa, workspace UML, editor UML, canvas, toolbox, inspector ni autenticacion.
- No introducir CanonicalUmlModel, ProjectDocument, DiagramLayout, validacion UML, Command Bus, Undo/Redo, React Flow ni ELK.
- No introducir Prisma, PostgreSQL, JWT, ownership, Socket.IO, colaboracion, generacion Spring Boot, Domain Manifest, Postman, IA, Vosk, Florence-2, XMI ni Capacitor.
- No declarar CU-00 como implementado en `STATUS.md` hasta que existan codigo, tests, build y verificacion manual correspondientes.

## Decisions

### Decision: workspaces directos en raiz

Se usaran `frontend/` y `backend/` como workspaces npm directos definidos en el `package.json` raiz.

Alternativa considerada: `apps/web` y `apps/api`. Se descarta porque el alcance aprobado exige nombres de carpetas claros directamente en la raiz.

### Decision: scripts raiz finales

El `package.json` raiz debera exponer scripts equivalentes a:

- `dev`: iniciar frontend y backend en paralelo para desarrollo.
- `dev:frontend`: iniciar solo el workspace `frontend`.
- `dev:backend`: iniciar solo el workspace `backend`.
- `build`: ejecutar build de los workspaces.
- `lint`: ejecutar lint de los workspaces.
- `typecheck`: ejecutar typecheck de los workspaces.
- `test`: ejecutar tests de los workspaces.

Para `dev` se permite usar una dependencia de desarrollo liviana como `concurrently`, justificada solo para ejecutar ambos procesos de CU-00 desde la raiz. Las verificaciones `build`, `lint`, `typecheck` y `test` deberan apoyarse en npm workspaces y scripts propios de cada workspace.

Alternativa considerada: pedir dos terminales y no definir `dev` agregado. Se descarta porque el CU requiere scripts raiz utiles y una experiencia reproducible desde la raiz.

### Decision: puertos y variables de entorno de CU-00

Los valores por defecto de CU-00 seran:

- Frontend: `http://localhost:3000`.
- Backend: `http://localhost:3001`.
- Health: `GET http://localhost:3001/health`.

`.env.example` debera documentar al menos:

- `BACKEND_PORT=3001`.
- `FRONTEND_ORIGIN=http://localhost:3000`.
- `NEXT_PUBLIC_API_BASE_URL=http://localhost:3001`.

El backend puede leer `process.env` con valores por defecto para CU-00. No se requiere introducir un sistema complejo de configuracion ni secretos.

Alternativa considerada: usar un prefijo `/api` o rutas versionadas desde el primer CU. Se descarta para mantener la ruta de health simple y evitar fijar convenciones de APIs futuras.

### Decision: backend NestJS sobre Fastify

El backend debera usar NestJS 11 con Fastify adapter, no Express. El bootstrap habilitara CORS para `FRONTEND_ORIGIN` y escuchara en `BACKEND_PORT`.

`GET /health` debera responder HTTP 200 con JSON minimo que indique que la API esta correcta, por ejemplo `{ "status": "ok" }`.

Alternativa considerada: usar el adaptador Express por defecto de NestJS. Se descarta porque el stack aprobado exige Fastify.

### Decision: frontend minimo con componente de estado

La pagina inicial del App Router mostrara una UI tecnica y minima con MUI. El estado de conexion debera consultar `${NEXT_PUBLIC_API_BASE_URL}/health` desde el navegador y mostrar:

- `API disponible` si la respuesta HTTP es correcta.
- `API no disponible` si la red falla, el backend esta apagado o la respuesta no es correcta.

Alternativa considerada: renderizar solo texto estatico. Se descarta porque CU-00 debe demostrar comunicacion real frontend -> backend.

### Decision: testing minimo por workspace

Backend usara Vitest, `@nestjs/testing` y Supertest para cubrir el arranque de la aplicacion o `GET /health`.

Frontend usara Vitest y React Testing Library para cubrir el comportamiento de estado disponible/no disponible. La prueba frontend debera mockear la llamada de red para ser deterministica y no depender de un backend real.

Alternativa considerada: usar solo pruebas manuales. Se descarta porque AGENTS.md y el alcance de CU-00 exigen bases automatizadas de testing.

### Decision: documentacion al final de apply

Durante la implementacion se creara o actualizara `docs/puds/use-cases/CU-00-base-proyecto.md` con lo realmente implementado. `docs/STATUS.md` y `docs/HANDOFF.md` se actualizaran cuando corresponda al avance real, sin afirmar que CU-00 esta completado antes de superar verificaciones y revision.

Alternativa considerada: actualizar ahora la documentacion de estado como si el CU estuviera en progreso o implementado. Se descarta en esta etapa porque este cambio solo prepara OpenSpec.

## Risks / Trade-offs

- [Risk] Los scaffolds iniciales de Next.js o NestJS pueden generar scripts o configuraciones no alineadas entre workspaces -> Mitigation: normalizar scripts por workspace y verificar desde la raiz con `lint`, `typecheck`, `test` y `build`.
- [Risk] La consulta de health puede fallar en navegador por CORS aun si el backend esta vivo -> Mitigation: configurar `FRONTEND_ORIGIN` y probar manualmente desde el frontend real.
- [Risk] El script raiz `dev` agrega una dependencia de desarrollo adicional -> Mitigation: limitarla a ejecucion concurrente de procesos y no introducir dependencias funcionales de CUs futuros.
- [Risk] Tests frontend acoplados a red real producirian falsos negativos -> Mitigation: mockear `fetch` en Vitest/RTL y reservar la red real para la prueba manual.

## Migration Plan

No hay migracion de datos ni compatibilidad previa que preservar. Apply creara la estructura inicial de aplicaciones y scripts sobre un repositorio que todavia no contiene implementacion funcional de CU-00.

## Open Questions

Ninguna bloqueante para CU-00. Los nombres exactos de comandos internos generados por los scaffolds podran normalizarse durante apply siempre que se mantengan los scripts raiz definidos en este diseno.
