## Why

El workspace UML de CU-02 existe solo en memoria local. CU-03 incorpora persistencia segura por usuario para conservar `ProjectDocument` entre sesiones y establecer la base de acceso autenticado y ownership requerida por los casos posteriores.

## What Changes

- Persistir proyectos como un único `ProjectDocument` JSON/JSONB con revisión optimista en PostgreSQL mediante Prisma.
- Incorporar registro, login, JWT Bearer y consulta del usuario autenticado.
- Proteger la API de proyectos por owner, sin exponer hashes de contraseña ni permitir acceso entre usuarios.
- Exponer únicamente `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `POST /projects`, `GET /projects/:id` y `PUT /projects/:id`.
- Mantener exactamente tres incrementos: persistencia sin API pública de proyectos, autenticación y API protegida con ownership/revisión.

## Capabilities

### New Capabilities
- `persistencia-autenticacion-ownership`: Persistencia JSONB de proyectos, autenticación JWT, ownership y revisión optimista.

### Modified Capabilities
- Ninguna.

## Impact

- Backend NestJS 11/Fastify: Prisma, PostgreSQL, JWT, DTOs y guards.
- Configuración: `DATABASE_URL`, `JWT_SECRET` y `JWT_EXPIRES_IN` mediante entorno.
- `ProjectDocument` se conserva como documento JSON, con `CanonicalUmlModel` semántico y `DiagramLayout` visual separados dentro del documento.
- No incluye UI completa de autenticación, listado visual, colaboración, persistencia offline ni routing manual de bends.
