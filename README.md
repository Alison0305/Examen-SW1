# Examen-SW1

Herramienta CASE colaborativa, offline-first, orientada al modelado UML de clases y a la generación automática de aplicaciones.

## Estado actual

**Ciclo actual:** Ciclo 1 — Inicio y base arquitectónica

**Último CU completado:** CU-01 — Núcleo UML canónico y validación

**OpenSpec activo:** ninguno

**Estado:** CU-01 aceptado por el usuario, verificado, archivado y con spec principal sincronizada; quedan pendientes commit y push.

CU-02 — Command Bus, Undo/Redo y workspace UML manual todavía no está iniciado.

## Uso rápido

Desde la raíz del repositorio:

```powershell
npm install
npm run dev
```

Servicios locales:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:3001`
- Health: `GET http://localhost:3001/health`

Verificaciones desde la raíz:

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
npm run demo:uml
```

## Stack Implementado

- Frontend: Next.js App Router, TypeScript, Material UI, Vitest y React Testing Library.
- Backend: Node.js 24 LTS, TypeScript, NestJS 11 sobre Fastify, Vitest, `@nestjs/testing` y Supertest.
- Núcleo UML: TypeScript, Vitest y workspace `uml-core` con paquete conceptual `@examen-sw1/uml-core`.
- Monorepo: npm workspaces con `frontend`, `backend` y `uml-core`.

El stack completo previsto del producto está documentado en `docs/product/product-01-next-nestjs.md`. Las tecnologías de CUs futuros no deben considerarse implementadas hasta que el CU correspondiente las entregue.

## Documentación Principal

Leer en este orden:

1. `docs/product/product-01-next-nestjs.md`
2. `AGENTS.md`
3. `docs/puds/use-cases/README.md`
4. `docs/STATUS.md`
5. `docs/HANDOFF.md`

## Metodología

El proyecto utiliza PUDS, OpenSpec, OpenCode, Git y GitHub. Se trabaja un solo caso de uso a la vez, siguiendo el orden `CU-00` a `CU-11`.

El documento de producto representa la visión estable, no el estado real. El estado real debe comprobarse en `docs/STATUS.md`, la documentación del CU activo cuando exista, OpenSpec, código y tests.
