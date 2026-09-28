## 1. Templates And Generation

- [x] 1.1 Reemplazar el starter springdoc API por el starter UI 3.1.1 en la plantilla Gradle generada.
- [x] 1.2 Generar la propiedad estable `springdoc.swagger-ui.path=/swagger-ui.html` sin alterar PostgreSQL, CORS ni OpenAPI.
- [x] 1.3 Añadir H2 runtime y generar `application-demo.properties` con un datasource H2 en memoria sin activar el perfil demo por defecto.

## 2. Automated Verification

- [x] 2.1 Actualizar pruebas de spring-generator para dependencia UI, ausencia de dependencia API exclusiva, propiedad Swagger y determinismo.
- [x] 2.2 Extender la exportación E2E para inspeccionar el ZIP productivo y compilarlo con Gradle.
- [x] 2.3 Verificar perfil demo, H2, PostgreSQL conservado y propiedades generadas en generator y ZIP productivo.
- [x] 2.4 Arrancar un backend generado con perfil demo y verificar `/v3/api-docs` y Swagger UI sin PostgreSQL.

## 3. Validation

- [x] 3.1 Ejecutar tests, typecheck y build de spring-generator; E2E, typecheck, build y lint de backend; typecheck raíz, OpenSpec strict y `git diff --check`.
- [x] 3.3 Repetir gates tras la ampliación H2.
- [x] 3.2 Realizar prueba manual final con `gradle bootRun`, `/swagger-ui.html` y `/v3/api-docs` antes de cualquier archive, commit o push.
