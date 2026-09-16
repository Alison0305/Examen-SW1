# CU-07 - CRUD avanzado, verificación, OpenAPI, Postman y Domain Manifest

## Estado Actual

INCREMENTOS 1, 2 Y 3 IMPLEMENTADOS / PENDIENTE VALIDACIÓN OPEN SPEC Y ACEPTACIÓN. OpenSpec activo: `cu-07-crud-openapi-postman-domain-manifest`.

## Objetivo

Completar el backend Spring generado con una API REST CRUD determinista y contratos machine-readable derivados de la implementación real.

## Alcance

- CRUD, list, count, paginación, sorting, filtering, search y navegación de relaciones para entidades habilitadas.
- DTOs, validación Jakarta, error contract y validación de referencias.
- OpenAPI 3.1 mediante springdoc-openapi, Postman Collection derivada y Domain Manifest versionado.
- Fixture, compilación Java y pruebas runtime aisladas con PostgreSQL.

## Fuera De Alcance

- Frontend generado y Capacitor (CU-08 o posterior).
- AssistantCommand, IA, voz, Vosk y modelos locales.
- Prisma, migraciones y base de datos de UML Studio.
- Docker Compose, H2 como sustituto silencioso y reglas de negocio no declaradas.

## Dependencias

- CU-06 y sus correctivos cerrados: `RelationalModel`, generator Spring, fixture, Java 21 y Gradle Wrapper 8.14.4.
- La prueba runtime usa PostgreSQL aislado mediante Testcontainers; no usa Prisma ni migraciones de UML Studio.

## Arquitectura Propuesta

`CanonicalUmlModel -> RelationalModel con metadata API -> GeneratedFile[] -> backend Spring DTO/API -> OpenAPI real -> Postman`, mientras el Domain Manifest combina metadata relacional estructurada con rutas y operaciones verificadas del OpenAPI.

La API usa DTOs de request/response; no expone entidades JPA. `resourceName` controla el path o usa table name sin pluralización automática; Create incluye identifier, PATCH es parcial con presencia explícita y relaciones se expresan por IDs. Las consultas se limitan a metadata allow-listed y operadores tipados. El backend generado usa springdoc-openapi, no `@nestjs/swagger`.

## Incrementos

1. Metadata, DTOs, CRUD/query generator, pruebas unitarias y `compileJava`, sin Docker.
2. springdoc/OpenAPI, PostgreSQL Testcontainers, runtime CRUD y spike Postman; Docker requerido.
3. Domain Manifest, determinismo integral, revisión manual, gates y cierre.

## Decisiones Pendientes De Aprobación

- Contrato REST `/api/v1`, `resourceName` sin inflector, DTOs, PATCH, metadata, pagination/sort/filter/search, navegación y error contract fijados en `design.md`.
- `springdoc-openapi-starter-webmvc-api:3.1.1` para Spring Boot 4.1.1.
- `openapi-to-postmanv2:6.3.3` sujeto a spike de compatibilidad OpenAPI 3.1 antes de pinnearse.
- Domain Manifest `schemaVersion: 1`, fuente combinada RelationalModel + OpenAPI verificado.
- PostgreSQL aislado con Testcontainers y profile test `create-drop`; Docker manual requerido antes del Incremento 2.

## Estrategia De Pruebas

- Pruebas unitarias/estructurales de metadata, DTOs, queries, errores, artefactos y determinismo.
- `gradlew.bat compileJava` sobre la fixture generada.
- Runtime CRUD real con Testcontainers PostgreSQL: CREATE, READ, UPDATE, DELETE, LIST, FILTER, SEARCH, SORT, PAGINATION y COUNT.
- Validación semántica de OpenAPI, Postman y Domain Manifest; regresiones CU-06 para 1:1, Composition y Aggregation.

## Implementación Real Del Incremento 1

- Se proyectaron los metadatos CRUD, recurso, búsqueda y ordenamiento al modelo relacional con validación UML y defaults deterministas.
- El generador produce requests y responses con campos Java tipados. Create incluye identifier; Update usa `PatchField<T>` para distinguir ausencia de null explícito y rechaza identifier presente en JSON.
- Los Response DTOs incluyen IDs to-one, inversos 1:1 y colecciones to-many de IDs, sin entidades ni grafos recursivos. Un `ResponseMapper` estático transforma entidades sin usar reflexión abierta.
- Las FK se reciben como IDs y se resuelven mediante el repositorio generado de la entidad referenciada. Las referencias nullable aceptan null sin lookup; una referencia requerida rechaza null. Las consultas usan una única `Specification` para list y count, con filtros, búsqueda y sort allow-listed; boolean solo acepta `true` o `false`.
- La navegación valida un allow-list derivado de relaciones reales y devuelve el Response DTO relacionado o una colección relacionada, no el recurso origen.
- Se generaron errores estructurados para validación, JSON inválido, conflictos de integridad y errores internos sin exponer excepciones de persistencia.
- La revisión funcional corrigió navegación que retornaba el origen, omisión de relaciones inversas/to-many, identifier PATCH, referencias nullable y booleanos ambiguos. Se añadió cobertura de regresión estructural para esos contratos y para CU-06.
- Gates finales: `spring-generator` 35/35, `relational-core` 11/11, `uml-core` 59/59; `gradlew.bat compileJava` con Java 21 y Gradle 8.14.4 terminó `BUILD SUCCESSFUL` sin Docker. También pasaron lint, typecheck, test raíz (266) y build.

## Implementación Real Del Incremento 2

- El backend generado incorpora `springdoc-openapi-starter-webmvc-api:3.1.1` y expone el documento OpenAPI real en `/v3/api-docs` durante el perfil controlado de verificación.
- La fixture generada incluye perfil `test` con PostgreSQL efímero mediante Testcontainers y `spring.jpa.hibernate.ddl-auto=create-drop` exclusivamente en `application-test.properties`; la configuración por defecto no recibe esa propiedad.
- La prueba runtime generada cubre el ciclo CRUD y consultas de la fixture contra PostgreSQL aislado, obtiene dos documentos OpenAPI y comprueba el contrato generado sin usar Docker Compose, H2, Prisma ni migraciones de UML Studio.
- El spike fue satisfactorio: `openapi-to-postmanv2` quedó fijado exactamente en `6.3.3` y convierte el OpenAPI real en una Collection Postman v2.1. La verificación compara dos conversiones mediante una huella estructural que normaliza únicamente metadata y ejemplos variables permitidos.

## Revisión Manual Y Gates

- La inspección controlada del output temporal cubrió DTOs, controllers, services, OpenAPI, Postman, Manifest y runtime CRUD con PostgreSQL aislado. El output no se versionó y el smoke test eliminó `.generated-test` y `.postman-diagnostics` al finalizar.
- Pasaron `npm run lint`, `npm run typecheck`, `npm run test` (incluyendo 54 pruebas de `spring-generator`), `npm run build`, `npm run test:generated-backend` y `openspec validate cu-07-crud-openapi-postman-domain-manifest --type change --strict`.
- La comprobación OpenSpec disponible para este esquema es `validate --strict`; no existe un artefacto o subcomando `verify` independiente. Falta aceptación explícita antes de archivar, hacer commit o push.

## Implementación Real Del Incremento 3

- El generador emite `domain-manifest.json` como archivo permanente en la raíz del backend generado. El contrato v1 contiene exclusivamente `schemaVersion` y `entities`; cada entidad, atributo, relación y operación materializa los campos fijos establecidos en OpenSpec.
- `RelationalModel` es la fuente de entidades, atributos, relaciones, required y metadata. Las operaciones CRUD se derivan de metadata habilitada y se verifican contra el OpenAPI runtime por path, método y `operationId`.
- Las colecciones del Manifest se ordenan binariamente por `name`; la serialización usa LF, no incluye timestamps, IDs aleatorios ni URLs locales. Las pruebas comparan modelos clonados y rechazan un OpenAPI que no declare una operación del Manifest.
- El smoke test generó el backend temporal con Java 21 y Gradle 8.14.4, ejecutó CRUD/OpenAPI contra PostgreSQL Testcontainers, convirtió dos OpenAPI a Postman y verificó el Manifest contra el OpenAPI real. Al finalizar no quedaron `spring-generator/.generated-test` ni `spring-generator/.postman-diagnostics`.

## Riesgos Y Precondiciones

- Las pruebas runtime dependen de Docker disponible para Testcontainers.
- No hay inferencias silenciosas para metadata, filtros, sort o relaciones.

## Criterios De Aceptación

- API, OpenAPI y Postman se derivan determinísticamente de la misma entrada declarativa; el Manifest pertenece al Incremento 3.
- La API rechaza consultas, referencias y operaciones no habilitadas con errores estructurados.
- El backend compila y pasa prueba runtime aislada; CU-06 permanece verde.
- Se realizará revisión manual de runtime/OpenAPI/Postman y del Manifest antes del cierre completo del CU; la revisión del Manifest pertenece al Incremento 3.
