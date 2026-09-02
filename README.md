# Examen-SW1

Herramienta CASE colaborativa, offline-first, orientada al modelado UML de clases y a la generación automática de aplicaciones.

## Estado actual

El proyecto se encuentra en su etapa inicial.

**Ciclo actual:** Ciclo 1 — Inicio y base arquitectónica  
**Caso de uso activo:** CU-00 — Base del proyecto  
**Estado del CU:** No iniciado

Todavía no existe implementación funcional.

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

## Stack principal previsto

### Frontend

- Next.js App Router
- TypeScript
- Material UI
- React Flow
- ELK.js
- Zustand
- Socket.IO Client

### Backend

- Node.js 24 LTS
- TypeScript
- NestJS 11
- Fastify
- Prisma
- PostgreSQL
- Socket.IO
- JWT Bearer

## Importante

El documento de producto representa la visión y los requisitos del proyecto, pero no significa que esas funcionalidades ya estén implementadas.

El estado real debe comprobarse mediante:

- `docs/STATUS.md`;
- documentación del caso de uso activo;
- OpenSpec;
- código;
- tests.

No se deben implementar funcionalidades pertenecientes a casos de uso futuros antes de tiempo.
