## Context

CU-06 genera entidades JPA, repositorios `JpaRepository` y controladores/servicios sin operaciones. `GenerationMetadata` ya declara los conceptos API, pero `RelationalModel` no los conserva. Ver `proposal.md` y las specs delta para el comportamiento requerido.

## Goals / Non-Goals

**Goals:**
- Establecer un contrato REST v1 determinista y seguro para entidades habilitadas.
- Derivar DTOs, OpenAPI real, Postman y Domain Manifest del mismo modelo estructurado.
- Probar compilación y CRUD runtime contra PostgreSQL aislado, preservando las relaciones de CU-06.

**Non-Goals:**
- Frontend generado, AssistantCommand, IA, voz, autenticación del backend generado, Prisma, migraciones de UML Studio, Docker Compose, H2 o reglas de negocio no declaradas.

## Decisions

### Contrato REST
- Prefijo `/api/v1`; `resourceName` define el path segment y, si falta, se usa exactamente el nombre de tabla. No hay inflector ni pluralización automática. IDs se expresan como `Long` en `{id}`.
- `POST /recursos`, `GET /recursos/{id}`, `PATCH /recursos/{id}`, `DELETE /recursos/{id}`, `GET /recursos`, `GET /recursos/count`; `GET /recursos/{id}/relations/{relation}` solo para relaciones navegables declaradas.
- List usa `page` base cero, `size` por defecto 20 y máximo 100; responde `content`, `page`, `size`, `totalElements`, `totalPages` y sort aplicado. El fallback estable es PK ASC cuando no existe `defaultSort`.
- Sort admite repetición `sort=campo,asc&sort=id,desc`, limitada a atributos `sortable` y direcciones `asc`/`desc`. Filter admite repetición `filter=campo:operador:valor`, separa solo los primeros dos `:` y permite string `eq`, `ne`, `contains`; integer/number/date/datetime `eq`, `ne`, `gt`, `gte`, `lt`, `lte`; boolean/enum `eq`, `ne`. Search usa `q` case-insensitive solo sobre `searchable` textual y responde 400 `INVALID_SEARCH` si no hay campos habilitados. Count aplica `filter` y `q`, ignora `page`, `size`, `sort` y responde `{ "count": 123 }`.
- Errores usan `{status, code, message, field?, path?, details?}`, donde `details` es una lista tipada de `{field?, code, message}`. No se exponen SQL ni excepciones Hibernate.

### DTOs y relaciones
- Se generan DTOs separados `CreateXRequest`, `UpdateXRequest` y `XResponse`; las entidades JPA permanecen internas. Create contiene el identifier porque CU-06 no genera valores automáticamente. Update no contiene identifier: el `{id}` del path es autoritativo y un ID en body se rechaza como `BAD_REQUEST`.
- PATCH usa un wrapper de presencia por campo: campo ausente preserva valor, valor presente actualiza y `null` explícito solo se acepta para nullable; un required no puede terminar null. Requests expresan N:1/1:1 como IDs y N:M como listas de IDs; responses no serializan grafos JPA. No hay nested writes arbitrarios. Composition conserva lifecycle; Aggregation/Association no adquieren cascade y delete bloqueado por FK devuelve 409 `CONFLICT`.
- `required` genera `@NotNull` para tipos no texto y `@NotBlank` para `VARCHAR`; enum y referencias se validan contra valores/IDs existentes. No se inventan length, precision, scale ni defaults.

### Metadatos y defaults
- Se proyectan `crud?: boolean`, `readOnly?: boolean`, `resourceName?: string`, `searchable?: boolean`, `sortable?: boolean` y `defaultSort?: "ASC" | "DESC"`; `resourceName` debe ser path segment válido y determinista.
- Defaults: `crud: true`, `readOnly: false`, `resourceName` igual a tabla; `crud: false` no expone recurso; `readOnly: true` permite LIST, GET, SEARCH, COUNT y navegación, y bloquea mutaciones. Atributos no son searchable/sortable por defecto; `defaultSort` requiere sortable y hay máximo uno o se genera diagnóstico bloqueante.

### OpenAPI, Postman y Manifest
- El backend generado usa `org.springdoc:springdoc-openapi-starter-webmvc-api:3.1.1`: la documentación oficial de springdoc v3.1.1 declara soporte Spring Boot 4 y publica `/v3/api-docs`. No se usará `@nestjs/swagger` en Java.
- Un perfil de verificación arranca el backend con PostgreSQL aislado y obtiene `/v3/api-docs`; ese JSON es la única fuente para Postman. El spike usa `openapi-to-postmanv2:6.3.3` y lo pinnea sin `^` solo si convierte nuestro OpenAPI real a Collection v2.1 determinista; si falla, se detiene antes de sustituir la herramienta.
- `domain-manifest.json` es un archivo permanente en la raíz del backend generado y usa `schemaVersion: 1`. Su raíz contiene exactamente `schemaVersion` y `entities`.
- Cada entidad contiene exactamente `name`, `resourceName`, `attributes`, `relations` y `operations`. Cada atributo contiene exactamente `name`, `type`, `required`, `identifier`, `unique`, `searchable`, `sortable` y `defaultSort`. Cada relación contiene exactamente `name`, `target`, `cardinality`, `lifecycle` y `required`. Cada operación contiene exactamente `name`, `method` y `path`.
- Las entidades, atributos, relaciones y operaciones se ordenan por su `name` con orden binario. Las rutas y nombres de operaciones se derivan de los metadatos y convenciones CRUD ya validados; las operaciones no habilitadas no se declaran. Los valores booleanos se materializan siempre, y `defaultSort` es `null` cuando no está declarado.
- RelationalModel es fuente semántica primaria de entidades, atributos, tipos, relaciones, required y metadata. OpenAPI verifica paths, methods, operationIds y request/response schemas cuando está disponible; no reconstruye relaciones desde OpenAPI.

### Runtime y determinismo
- El Incremento 1 conserva `gradlew.bat compileJava` sin Docker. El Incremento 2 usa Testcontainers PostgreSQL efímero y profile exclusivo de test con `spring.jpa.hibernate.ddl-auto=create-drop`; producción/default no usa create-drop.
- Docker es requisito manual antes de iniciar Incremento 2. No se instalará ni se sustituirá con H2; al límite se detiene con `DOCKER REQUERIDO — INSTALACIÓN MANUAL PENDIENTE`.
- GeneratedFile[], OpenAPI normalizado (sin servers dependientes de host), Postman y Manifest se ordenan binariamente, sin timestamps ni IDs aleatorios.

## Risks / Trade-offs

- [Docker ausente] → `DOCKER REQUERIDO — INSTALACIÓN MANUAL PENDIENTE` antes del gate runtime del Incremento 2.
- [Conversor Postman no compatible con OpenAPI 3.1] → realizar spike de compatibilidad antes de instalar; no generar una colección manual alternativa.
- [Metadatos insuficientes] → defaults limitados y diagnósticos bloqueantes para combinaciones ambiguas.
- [Consultas dinámicas] → allow-lists tipadas y operadores mínimos, sin SQL/JPQL libre.

## Migration Plan

No hay migración de datos: el backend generado es independiente. La implementación agregará archivos generados y dependencias en el proyecto de salida; rollback consiste en regenerar desde la versión anterior del generador.
