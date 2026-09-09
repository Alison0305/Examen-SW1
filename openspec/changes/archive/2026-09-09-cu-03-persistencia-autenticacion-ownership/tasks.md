## 1. Incremento 1 — PostgreSQL, Prisma y ProjectDocument

- [x] 1.1 Agregar Prisma y configuración backend necesaria, documentando `DATABASE_URL` y sin instalar dependencias de funcionalidades futuras.
- [x] 1.2 Definir esquema Prisma `User` y `Project` con `document` JSON/JSONB, `revision`, timestamps, email único y relación owner.
- [x] 1.3 Crear migración PostgreSQL y cliente Prisma integrado al módulo backend.
- [x] 1.4 Implementar servicio/repositorio de proyectos que preserve `ProjectDocument` completo como agregado JSON.
- [x] 1.5 Validar `ProjectDocument` con contratos de `uml-core` antes de persistir, rechazando documento inválido sin escritura.
- [x] 1.6 Implementar tests de persistencia y round-trip de `CanonicalUmlModel`, `DiagramLayout`, tipos UML relevantes, documento inválido y revisión inicial 1.
- [x] 1.7 Ejecutar lint, typecheck y tests relevantes del incremento; documentar resultados y limitaciones.

## 2. Incremento 2 — Registro, login y JWT

- [x] 2.1 Agregar configuración validada de `JWT_SECRET` y `JWT_EXPIRES_IN` mediante entorno y actualizar `.env.example`.
- [x] 2.2 Implementar registro con email normalizado, único y contraseña hasheada con Argon2id centralizado.
- [x] 2.3 Implementar login y emisión de JWT Bearer con payload mínimo.
- [x] 2.4 Implementar guard JWT y `GET /auth/me` sin exponer `passwordHash`.
- [x] 2.5 Implementar DTOs con `class-transformer` y `class-validator` para auth.
- [x] 2.6 Agregar tests de registro, email inválido/duplicado, contraseña inválida, login válido, contraseña incorrecta, usuario inexistente, JWT ausente/inválido/expirado y ausencia de hash en respuestas.
- [x] 2.7 Ejecutar lint, typecheck y tests relevantes del incremento; documentar resultados y limitaciones.

## 3. Incremento 3 — Ownership, revisión e integración

- [x] 3.1 Implementar `POST /projects` protegido con JWT, DTO validado, revisión inicial 1 y ownerId derivado exclusivamente del usuario autenticado.
- [x] 3.2 Implementar `GET /projects/:id` y `PUT /projects/:id` protegidos, devolviendo 404 indistinguible para inexistente o ajeno.
- [x] 3.3 Implementar `PUT /projects/:id` con `expectedRevision` y actualización atómica condicionada por id, ownerId y revisión.
- [x] 3.4 Definir respuesta 409 estructurada de conflicto stale sin sobrescribir documento ni revisión.
- [x] 3.5 Agregar tests de propietario GET/PUT, usuario ajeno GET/PUT, body sin control de ownerId, revisión vigente/incremento y stale sin alteración.
- [x] 3.6 Agregar prueba de integración backend para registro, login, `/auth/me` y ciclo protegido de proyectos.
- [x] 3.7 Documentar CU-03, decisiones, endpoints, variables, pruebas y diferimiento explícito de UI, colaboración, offline y routing manual de bends.
- [x] 3.8 Ejecutar `npm run lint`, `npm run typecheck`, `npm run test` y `npm run build` desde la raíz.
- [x] 3.9 Ejecutar prueba manual: levantar PostgreSQL/backend, registrar/login A, `/auth/me`, crear/recuperar proyecto y verificar UML/layout; registrar/login B, rechazar GET/PUT ajenos; volver a A, actualizar y confirmar 409 stale sin sobrescritura.
- [x] 3.10 Ejecutar `openspec validate "cu-03-persistencia-autenticacion-ownership" --strict` y preparar evidencia para verify sin archivar antes de aceptación.
