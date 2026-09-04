# CU-00 — Base del proyecto

## Objetivo

Crear la base técnica ejecutable del proyecto y demostrar comunicación mínima entre el frontend Next.js y el backend NestJS/Fastify mediante una consulta de health.

## Alcance

Implementado en CU-00:

- monorepo con npm workspaces `frontend` y `backend`;
- carpetas directas `frontend/` y `backend/` en la raíz;
- `package.json` raíz con scripts de desarrollo y verificación;
- `.env.example` con variables necesarias para CU-00;
- frontend Next.js App Router + TypeScript + Material UI;
- backend Node.js 24 + TypeScript + NestJS 11 sobre Fastify;
- CORS configurado para el origen local del frontend;
- endpoint HTTP `GET /health`;
- interfaz técnica mínima que muestra `API disponible` o `API no disponible`;
- pruebas automatizadas frontend y backend;
- verificaciones de lint, typecheck, test y build desde la raíz;
- prueba manual visual correcta;
- 28/28 tareas completadas.

Fuera de alcance de CU-00:

- landing completa;
- workspace o editor UML;
- CanonicalUmlModel, ProjectDocument, DiagramLayout;
- validación UML, UmlCommand, Command Bus, Undo/Redo;
- React Flow, ELK, Prisma, PostgreSQL, autenticación, JWT, Socket.IO;
- colaboración, generación, OpenAPI generado, Postman, Domain Manifest;
- IA, Qwen, Vosk, Florence-2, XMI y Capacitor.

## Dependencias

Frontend principal:

- Next.js;
- React;
- Material UI;
- Emotion.

Backend principal:

- NestJS 11;
- `@nestjs/platform-fastify`;
- Fastify transitivo de NestJS;
- RxJS;
- `reflect-metadata`.

Testing y tooling:

- Vitest;
- React Testing Library;
- `@nestjs/testing`;
- Supertest;
- TypeScript;
- ESLint;
- `concurrently` para `npm run dev` desde la raíz.

## Implementación realizada

La raíz del repositorio funciona como monorepo npm. Los workspaces declarados son `frontend` y `backend`.

El frontend renderiza una página técnica de CU-00 con Material UI. Al cargar, consulta `${NEXT_PUBLIC_API_BASE_URL}/health` y muestra el estado de la API.

El backend arranca con NestJS 11 usando Fastify, lee `BACKEND_PORT` y `FRONTEND_ORIGIN` con valores por defecto, habilita CORS y expone `GET /health` con respuesta JSON `{ "status": "ok" }`.

## Decisiones técnicas

- Se usaron `frontend/` y `backend/` directamente en la raíz para cumplir la estructura aprobada.
- Se definieron valores por defecto `3000` para frontend y `3001` para backend.
- Se eligió `GET /health` sin prefijos ni versionado para no fijar convenciones de APIs futuras.
- El frontend maneja errores de red devolviendo estado visual `API no disponible`.
- Las pruebas frontend mockean `fetch` para cubrir estados de conexión de forma determinística.
- Las pruebas backend crean la app NestJS/Fastify en memoria y verifican health, CORS, adapter Fastify y defaults de entorno.

## Archivos principales

- `package.json`
- `package-lock.json`
- `.env.example`
- `README.md`
- `frontend/package.json`
- `frontend/app/page.tsx`
- `frontend/app/api-status.tsx`
- `frontend/app/api-status.test.tsx`
- `frontend/app/providers.tsx`
- `backend/package.json`
- `backend/src/main.ts`
- `backend/src/create-app.ts`
- `backend/src/health.controller.ts`
- `backend/src/health.controller.test.ts`
- `openspec/specs/base-proyecto/spec.md`
- `openspec/changes/archive/2026-09-04-cu-00-base-proyecto/`

## Pruebas automatizadas

Comandos ejecutados desde la raíz:

```powershell
npm run typecheck
npm run test
npm run lint
npm run build
```

Resultado:

- frontend: 4 tests correctos para health disponible/no disponible y helper de consulta;
- backend: 4 tests correctos para Fastify, defaults de entorno, `GET /health` y CORS;
- total: 8 tests correctos;
- typecheck correcto en frontend y backend;
- lint correcto en frontend y backend;
- build correcto en frontend y backend.

## Prueba manual

La prueba manual visual fue realizada por el usuario y salió correctamente.

Se verificó manualmente:

- la interfaz del frontend renderiza correctamente los componentes Material UI;
- con el backend iniciado, el frontend muestra claramente `API disponible`;
- el endpoint consultado es `http://localhost:3001/health`;
- al detener únicamente el backend y mantener el frontend ejecutándose, después de actualizar el navegador el frontend muestra claramente `API no disponible`;
- la prueba manual completa de frontend/backend fue satisfactoria.

Prueba manual repetible:

1. Ejecutar `npm run dev` desde la raíz.
2. Abrir `http://localhost:3000`.
3. Comprobar que se muestra `API disponible`.
4. Detener únicamente el backend.
5. Recargar el frontend.
6. Comprobar que se muestra `API no disponible`.

## Verify

El verify de CU-00 fue realizado y no encontró issues críticos.

Resultado verificado:

- completitud: 28/28 tareas completas y 7/7 requirements encontrados;
- correctitud: 7/7 requirements cubiertos y 18/18 escenarios cubiertos por código, tests, documentación o evidencia manual;
- coherencia: decisiones de diseño seguidas sin inconsistencias bloqueantes.

## Archive y spec sincronizada

El OpenSpec `cu-00-base-proyecto` fue archivado en `openspec/changes/archive/2026-09-04-cu-00-base-proyecto/`.

La spec principal `base-proyecto` fue sincronizada en `openspec/specs/base-proyecto/spec.md`.

## Errores encontrados

- El primer `npm install` excedió el timeout de 120 segundos y se repitió con un timeout mayor.
- La primera comprobación HTTP del frontend durante `npm run dev` usó timeout de 10 segundos y expiró mientras Next.js compilaba la ruta inicial; se repitió con un timeout mayor y respondió HTTP 200.
- `npm audit --omit=dev` reporta vulnerabilidades transitivas en `fastify` usado por `@nestjs/platform-fastify` 11 y `postcss` usado por Next 15. `npm audit fix --force` propone upgrades mayores a NestJS 12 y Next 16, por lo que no se aplicó para respetar el stack aprobado de CU-00.

## Correcciones

- Se repitió `npm install` con mayor timeout hasta completar instalación y `package-lock.json`.
- Se repitió la verificación de `npm run dev` con mayor timeout para permitir la compilación inicial de Next.js.
- Se intentó resolver el audit con overrides compatibles, pero npm dejó el árbol en estado inválido; se retiraron los overrides para conservar una instalación coherente con NestJS 11 y Next 15.

## Limitaciones conocidas

- La auditoría de npm conserva 4 vulnerabilidades transitivas que requieren upgrades mayores propuestos por npm. No se aplicaron porque exceden el alcance y las decisiones de stack de CU-00.
- `next build` muestra una advertencia no bloqueante indicando que no detecta el plugin de ESLint de Next en la configuración flat config actual, aunque `npm run lint` y `npm run build` terminan correctamente.

## Deuda técnica

- Revisar en un cambio posterior si existen versiones menores compatibles de NestJS 11 o Next 15 que resuelvan las vulnerabilidades transitivas sin cambiar mayores.
- Revisar la configuración ESLint/Next si se desea eliminar la advertencia no bloqueante de `next build`.

## Resultado final

CU-00 quedó implementado, con 28/28 tareas completadas, pruebas automatizadas correctas, prueba manual correcta, verify correcto, aceptación confirmada, OpenSpec archivado y spec sincronizada. Pendiente únicamente commit y push de cierre.

## Commit de cierre

Pendiente. Se completará después de realizar el commit y push de cierre de CU-00.
