## Why

CU-06 entrego el mapeador relacional y el generador Spring determinista, pero no los conecto al workspace UML persistido. Por ello una persona usuaria no puede exportar el backend generado desde el diagrama que edita ni descargar el proyecto resultante.

## What Changes

- Agregar una exportacion Spring Boot visible desde el workspace UML con configuracion minima y estados de generacion/descarga.
- Agregar una ruta NestJS autenticada que carga el `ProjectDocument` autorizado, usa exclusivamente su `CanonicalUmlModel`, reutiliza el mapeador y `spring-generator`, y responde un ZIP seguro en memoria.
- Agregar descarga autenticada de Blob y validaciones de interfaz, API, ZIP e integracion desde el documento persistido hasta el archivo generado.
- Mantener `DiagramLayout` fuera de la semantica de generacion y no modificar el motor, templates ni contratos de CU-06/CU-07.

## Capabilities

### New Capabilities
- `workspace-spring-export`: Exportacion autenticada de un proyecto UML persistido como backend Spring Boot descargable.

### Modified Capabilities

- Ninguna.

## Impact

- Frontend principal: workspace, cliente autenticado y descarga de archivo.
- Backend NestJS: modulo/controlador/servicio de exportacion y dependencia ZIP compatible.
- Reutiliza `@examen-sw1/uml-core`, `@examen-sw1/relational-core` y `@examen-sw1/spring-generator` sin duplicar generador o mapper.
