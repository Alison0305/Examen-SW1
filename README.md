# Examen-SW1

Herramienta CASE colaborativa, offline-first, orientada al modelado UML de clases y a la generación automática de aplicaciones.

## Estado actual

**Ciclo actual:** Ciclo 1 — Inicio y base arquitectónica

**Último CU completado:** CU-00 — Base del proyecto

**Estado:** CU-00 implementado, verificado, aceptado y archivado; pendiente commit y push de cierre.

CU-00 entrega una base técnica con monorepo npm, `frontend/`, `backend/`, health del backend y una consulta visual desde el frontend.

El siguiente caso de uso del roadmap es CU-01 — Núcleo UML canónico y validación, pero todavía no ha comenzado y no debe iniciarse antes del commit y push de cierre de CU-00.

## Uso rápido de CU-00

Desde la raíz del repositorio:

```powershell
npm install
npm run dev
```

Servicios locales:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:3001`
- Health: `GET http://localhost:3001/health`

Para ejecutar cada servicio por separado:

```powershell
npm run dev:frontend
npm run dev:backend
```

Verificaciones desde la raíz:

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
```

Variables de entorno de CU-00:

- `BACKEND_PORT`: puerto del backend NestJS/Fastify.
- `FRONTEND_ORIGIN`: origen permitido por CORS.
- `NEXT_PUBLIC_API_BASE_URL`: URL pública que usa el frontend para consultar health.

Copiar `.env.example` a `.env` o `.env.local` es opcional para desarrollo local. Esos archivos no deben commitearse.

## Stack

Stack implementado en CU-00:

- Frontend: Next.js App Router, TypeScript, Material UI, Vitest y React Testing Library.
- Backend: Node.js 24 LTS, TypeScript, NestJS 11 sobre Fastify, Vitest, `@nestjs/testing` y Supertest.
- Monorepo: npm workspaces con `frontend` y `backend`.

El stack completo previsto del producto está documentado en `docs/product/product-01-next-nestjs.md`. Las tecnologías de CUs futuros no deben considerarse implementadas hasta que el CU correspondiente las entregue.

## Documentación principal

Leer en este orden:

1. `docs/product/product-01-next-nestjs.md`
2. `AGENTS.md`
3. `docs/puds/use-cases/README.md`
4. `docs/STATUS.md`
5. `docs/HANDOFF.md`

## Metodología

El proyecto utiliza:

- PUDS;
- 4 ciclos;
- 12 casos de uso (`CU-00` a `CU-11`);
- OpenSpec;
- OpenCode;
- Git;
- GitHub.

Se trabaja un solo caso de uso a la vez.

Flujo general:

```text
plan
→ aprobación
→ prompt OpenCode
→ OpenSpec
→ implementación
→ tests
→ correcciones
→ documentación
→ verify
→ aceptación
→ archive
→ STATUS
→ commit
→ push
```

## Importante

El documento de producto representa la visión y los requisitos del proyecto, pero no significa que todas esas funcionalidades ya estén implementadas.

El estado real debe comprobarse mediante:

- `docs/STATUS.md`;
- documentación del caso de uso activo;
- OpenSpec;
- código;
- tests.

No se deben implementar funcionalidades pertenecientes a casos de uso futuros antes de tiempo.
