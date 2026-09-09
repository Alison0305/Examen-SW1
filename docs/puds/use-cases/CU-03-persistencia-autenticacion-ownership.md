# CU-03 - Persistencia, autenticacion y ownership

## Objetivo

Incorporar persistencia para proyectos UML, autenticacion y ownership en incrementos separados.

## Incremento 1 completado

- PostgreSQL 17 dedicado y Prisma CLI/Client 6.19.3.
- Modelos `User` y `Project`; `User.email` es unico y `Project.ownerId` tiene FK hacia `User`.
- `Project.document` se almacena como JSONB y `Project.revision` usa el default de base de datos `1`.
- Migracion aplicada: `20260908150000_init_persistence`.
- `PrismaModule`, `PrismaService` y `ProjectsPersistenceService` interno implementados, sin controllers ni endpoints.
- El servicio valida `ProjectDocument` mediante `@examen-sw1/uml-core`, serializa antes de escribir y deserializa/valida al leer.

## Pruebas

- Suite actual: 109 tests (frontend 49, backend 7 y `uml-core` 53).
- Unitarias: documento invalido rechaza con `InvalidProjectDocumentError` sin llamar a Prisma; el servicio no envia revision explicita.
- Integracion PostgreSQL real: crea un `User` de fixture, persiste y recupera un `ProjectDocument` representativo.
- El round-trip cubre `CanonicalUmlModel`, `DiagramLayout`, clases, atributos, operaciones, parametros, enum, literales, relacion con nombre y multiplicidades, visibilidades y posiciones.
- La integracion consulta metadata de PostgreSQL para confirmar JSONB, default `revision = 1`, indice unico de email y FK de `ownerId`.
- La limpieza elimina exclusivamente el Project y User identificados por los IDs propios del test.

## Decisiones

- `ProjectDocument` permanece como agregado JSONB; no se normaliza el modelo UML.
- La revision inicial procede del default Prisma/PostgreSQL, sin enviar `revision: 1` desde el servicio.
- `backend/.env` aporta `DATABASE_URL` local para integracion y permanece ignorado; no contiene secretos documentados aqui.

## Incremento 2 completado

- `POST /auth/register`, `POST /auth/login` y `GET /auth/me`.
- Email normalizado con trim/lowercase; password minima de 8 caracteres y Argon2id.
- JWT Bearer con payload minimo `{ sub }`; `JWT_SECRET` y `JWT_EXPIRES_IN` obligatorios por entorno.
- DTOs con class-validator, 400 para entrada invalida, 401 para credenciales/token no valido y 409 para email duplicado.
- Prueba HTTP PostgreSQL real valida hash Argon2id, login, sesion y token expirado; no expone `passwordHash`.

## Incremento 3 completado

- Endpoints protegidos: `POST /projects`, `GET /projects/:id` y `PUT /projects/:id`.
- El propietario se deriva exclusivamente del JWT autenticado; `ownerId` no forma parte de los DTOs y no se expone en las respuestas.
- GET y PUT condicionan el acceso por `id` y propietario, con `404` indistinguible para proyecto inexistente o ajeno.
- PUT exige `expectedRevision` entero mayor que cero y realiza un `updateManyAndReturn` atómico condicionado por `id`, `ownerId` y revisión.
- Una actualización vigente incrementa la revisión; una stale devuelve `409` estructurado y conserva documento y revisión.

## Pruebas finales

- Integración HTTP con PostgreSQL real para registro/login de propietario y usuario ajeno, autorización, creación, recuperación, ownership, validación de DTO/documento, stale y concurrencia.
- La concurrencia de dos PUT con la misma revisión devuelve exactamente un `200` y un `409`; solo se conserva el documento de la respuesta exitosa.
- Prueba manual confirmada: backend levantado con PostgreSQL, `/health` 200, ciclo A de auth/proyecto, rechazo de GET/PUT ajenos para B y conflicto stale para A sin sobrescritura.
- Gates de raíz correctos: lint, typecheck y build; 117 tests correctos (frontend 49, backend 15, `uml-core` 53).
- `prisma migrate status` confirma la migración aplicada y esquema PostgreSQL al día; `openspec validate --strict` es correcto.

## Limitaciones

- No incluye UI de autenticación o proyectos, colaboración, persistencia offline/LAN ni routing manual de bends; pertenecen a alcance posterior.

## Resultado final

- CU-03 aceptado explícitamente el 2026-09-09 con `Acepto el CU-03`.
- OpenSpec archivado en `openspec/changes/archive/2026-09-09-cu-03-persistencia-autenticacion-ownership/` y especificación principal sincronizada.
- Commit de cierre pendiente de solicitud explícita.
