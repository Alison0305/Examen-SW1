## 1. Incremento 1 - CRUD, Consultas Y Compilación Sin Docker

- [x] 1.1 Proyectar `crud`, `readOnly`, `resourceName`, `searchable`, `sortable` y `defaultSort` con defaults/diagnósticos; verificar mapper y validación UML.
- [x] 1.2 Generar DTOs con ID en Create, ID excluido/rechazado en Update y PATCH con presencia explícita; verificar validación Jakarta y relaciones por IDs.
- [x] 1.3 Generar CRUD, list, count, filtros tipados, search, sort repetible, paginación y error contract tipado; verificar campos/direcciones/operadores inválidos y determinismo.
- [x] 1.4 Generar navegación, delete con conflicto FK sin cascades inventados y extender `gradlew.bat compileJava`; verificar relaciones CU-06 y `BUILD SUCCESSFUL` sin Docker.

## 2. Incremento 2 - OpenAPI, Runtime PostgreSQL Y Postman

- [x] 2.1 Detenerse y solicitar Docker manual con el mensaje acordado antes de configurar Testcontainers; verificar disponibilidad sin instalar Docker ni WSL.
- [x] 2.2 Configurar fixture y profile TEST con PostgreSQL efímero y `ddl-auto=create-drop` exclusivo de test; verificar aislamiento de Prisma y producción/default.
- [x] 2.3 Ejecutar runtime CRUD Testcontainers y obtener OpenAPI real con springdoc 3.1.1; verificar operaciones, errores, schemas y regresiones CU-06.
- [x] 2.4 Ejecutar spike `openapi-to-postmanv2:6.3.3`; pinnearlo solo si convierte el OpenAPI real a Collection v2.1 determinista.

## 3. Incremento 3 - Domain Manifest, Integración Y Cierre

- [x] 3.1 Generar `domain-manifest.json` `schemaVersion: 1` con RelationalModel como semántica primaria y OpenAPI como verificación HTTP; comprobar relaciones, metadata y operaciones.
- [x] 3.2 Verificar determinismo integral de GeneratedFile[], OpenAPI normalizado, Postman y Manifest; comprobar ausencia de timestamps, IDs aleatorios y URLs locales.
- [x] 3.3 Crear output manual temporal y demostrar DTOs, controllers, OpenAPI, Postman, Manifest y runtime; verificar eliminación antes del cierre.
- [x] 3.4 Ejecutar gates relevantes, `openspec verify`, revisión manual de los artefactos y actualizar CU-07/STATUS/HANDOFF con resultados reales; verificar que temporales, secretos y Prisma no se versionen antes de solicitar aceptación.
