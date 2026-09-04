## Why

CU-00 necesita establecer una base técnica reproducible antes de construir el núcleo UML y el resto de capacidades del producto. El cambio crea la especificación para que el repositorio pueda instalarse, ejecutarse y demostrar una comunicación mínima frontend -> backend mediante health.

## What Changes

- Se definira un monorepo con npm workspaces para `frontend` y `backend`.
- Se especificara una estructura de carpetas clara con `frontend/` y `backend/` directamente en la raiz, sin `apps/web` ni `apps/api`.
- Se preparara el frontend Next.js App Router con TypeScript y Material UI para mostrar una interfaz tecnica minima de estado de API.
- Se preparara el backend NestJS 11 con TypeScript sobre Fastify, variables de entorno, CORS y un endpoint HTTP minimo de health.
- Se definira la integracion frontend -> backend para mostrar `API disponible` cuando health responda correctamente y `API no disponible` cuando falle.
- Se estableceran scripts raiz para desarrollo, build, lint, typecheck y test.
- Se definiran las variables necesarias en `.env.example` y la exclusion de archivos locales con secretos.
- Se prepararan pruebas automatizadas iniciales para backend y frontend, ademas de verificaciones de lint, typecheck, test, build y una prueba manual documentada.
- No se incluira funcionalidad de CUs futuros: UML, validacion UML, Command Bus, React Flow, ELK, Prisma, PostgreSQL, autenticacion, Socket.IO, generacion, IA, voz, vision, XMI ni Capacitor.

## Capabilities

### New Capabilities

- `base-proyecto`: Base ejecutable del proyecto como monorepo con frontend Next.js, backend NestJS/Fastify, health HTTP, consulta desde frontend, scripts raiz, variables de entorno, pruebas iniciales y documentacion del CU.

### Modified Capabilities

- Ninguna. No existen specs base previas y CU-00 introduce la primera capacidad tecnica del proyecto.

## Impact

- Raiz del repositorio: `package.json`, `.env.example`, `.gitignore`, `README.md` segun corresponda durante apply.
- Frontend: futura carpeta `frontend/` con Next.js App Router, TypeScript, Material UI, cliente de health y pruebas con Vitest + React Testing Library.
- Backend: futura carpeta `backend/` con NestJS 11, Fastify, CORS, variables de entorno, health y pruebas con Vitest + `@nestjs/testing` + Supertest.
- Documentacion: futura creacion o actualizacion de `docs/puds/use-cases/CU-00-base-proyecto.md`, y actualizacion de `docs/STATUS.md` y `docs/HANDOFF.md` cuando corresponda al avance real.
- Dependencias: solo las estrictamente necesarias para CU-00 y el stack aprobado; no se instalaran dependencias de CUs futuros.
