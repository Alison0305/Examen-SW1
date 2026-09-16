# HANDOFF

## Estado Operativo

- CU activo: CU-07, Incrementos 1, 2 y 3 implementados y validados. OpenSpec: `cu-07-crud-openapi-postman-domain-manifest`; 12/12 tareas completas.
- Implementado: metadata API, DTOs tipados, `PatchField`, identifier PATCH rechazado, lookups FK nullable, responses con IDs de relaciones directas/inversas/to-many, navegación allow-listed que devuelve DTOs relacionados, filtros tipados y errores sanitizados.
- Correcciones de revisión: navegación no devuelve el origen; relaciones inversas/to-many no se omiten; booleanos inválidos generan `INVALID_FILTER`; no hay referencias 1:1 fuera de sus participantes.
- Incremento 2: `springdoc-openapi-starter-webmvc-api:3.1.1`, `/v3/api-docs`, Testcontainers PostgreSQL con `create-drop` exclusivo de test, runtime CRUD y `openapi-to-postmanv2` 6.3.3 para Collection v2.1 determinista. No usa H2, Prisma ni migraciones de UML Studio.
- Incremento 3: `domain-manifest.json` v1 se genera permanentemente en la raíz del backend con raíz `schemaVersion`/`entities`, campos fijos, orden binario y sin valores variables. El smoke runtime verificó sus operaciones contra OpenAPI, Postman canónico y limpieza de `.generated-test`/`.postman-diagnostics`.
- Gates: `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, `npm run test:generated-backend` y `openspec validate cu-07-crud-openapi-postman-domain-manifest --type change --strict` correctos. El esquema OpenSpec no proporciona un comando `verify` independiente.
- Pendiente: aceptación explícita. No archivar ni hacer commit todavía.

## Siguiente Accion Exacta

1. Solicitar aceptación explícita de CU-07; no archivar, hacer commit ni iniciar CU-08 antes de recibirla.
