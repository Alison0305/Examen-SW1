## Context

El backend generado usa Spring Boot 4.1.1, Java 21 y springdoc 3.1.1. La plantilla Gradle actual declara el starter API, que expone el documento pero no aporta la interfaz Swagger.

## Goals / Non-Goals

### Goals
- Generar Swagger UI automáticamente para todos los ZIP futuros.
- Mantener `/v3/api-docs`, la configuración PostgreSQL y CORS existentes.
- Proporcionar un perfil `demo` H2 en memoria activado solo de forma explícita.
- Cubrir plantilla, generación determinista, exportación ZIP y compilación Java.

### Non-Goals
- No modificar ZIPs ya generados.
- No cambiar el contrato REST `/api/v1/**` ni añadir configuración por proyecto.
- No cambiar Spring Boot, Java ni la versión de springdoc.

## Decisions

- Reemplazar `springdoc-openapi-starter-webmvc-api:3.1.1` por `springdoc-openapi-starter-webmvc-ui:3.1.1` en la plantilla Gradle; el starter UI incluye la funcionalidad OpenAPI requerida.
- Generar `springdoc.swagger-ui.path=/swagger-ui.html` en `application.properties` para fijar una URL compatible y predecible.
- Mantener PostgreSQL como `runtimeOnly` y añadir H2 como `runtimeOnly`; `application-demo.properties` define datasource H2 en memoria, dialecto H2 y `create-drop` sin activar el perfil de forma predeterminada.
- Validar el contenido mediante tests del generador y mediante el endpoint real de exportación; compilar el ZIP extraído sin editar artefactos generados.
- Arrancar un backend generado en un puerto de prueba con el perfil `demo`, comprobar OpenAPI y Swagger UI, y detener el proceso al finalizar.

## Risks / Trade-offs

- El starter UI añade recursos web al backend generado. La compilación Gradle y la comprobación manual de las rutas confirmarán compatibilidad con Spring Boot 4.1.1.
