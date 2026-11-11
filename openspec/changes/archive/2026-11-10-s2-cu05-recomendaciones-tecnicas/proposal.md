## Why

El Mentor actual responde consultas libres fundamentadas en UML y memoria, pero no distingue una recomendación técnica verificable de una posible modificación del modelo. CU-2P-05 incorpora esa respuesta estructurada sin ejecutar cambios, preparando el límite de responsabilidad para la futura propuesta confirmable de CU-2P-06.

## What Changes

- Añadir una consulta de recomendación técnica autenticada y autorizada al flujo Mentor existente, sin romper la consulta libre actual.
- Devolver una recomendación tipada con problema, alternativas, razón, riesgos, certeza e indicación explícita de si requeriría cambiar UML; nunca declarará una modificación como aplicada.
- Construir el prompt exclusivamente con arquitectura ShareGrams verificable, contexto semántico UML, capacidades verificables del generador Spring y memoria autorizada del mismo proyecto.
- Añadir guardas deterministas para elementos, relaciones, servicios o componentes concretos ausentes y preguntas externas o ambiguas no verificables (por ejemplo, pagos). Estas guardas devuelven solo una aclaración estructurada sin invocar Qwen; las preguntas generales de arquitectura verificable se admiten aunque no nombren una entidad UML literal.
- Validar estrictamente la salida estructurada de Qwen: una forma inválida produce el error controlado existente, sin coerción ni invención a partir de texto libre.
- Mantener Qwen local, la identidad derivada por JWT, la autorización previa y la memoria Prisma existente sin nuevas fuentes de verdad ni proveedores cloud.

## Capabilities

### New Capabilities
- `mentor-technical-recommendations`: recomendaciones técnicas estructuradas, verificables y de solo lectura para un proyecto autorizado.

### Modified Capabilities
- `project-contextual-mentor`: la capacidad Mentor incorpora una consulta de recomendación separada de la consulta libre, con contexto técnico verificable y límites de no ejecución.

## Impact

- Backend: contratos, servicio, proveedor Qwen, DTO/controlador y pruebas de `backend/src/mentor/`.
- API: se propone una ruta específica de recomendación bajo el recurso Mentor del proyecto, sin cambiar `POST /projects/:id/mentor/query`.
- Contexto: reutiliza `MentorContextBuilder`, `MentorInteractionIdentityResolver`, `MentorInteractionMemory`, `ProjectDocument.uml` y las capacidades existentes de exportación Spring.
- Dependencias: ninguna librería, proveedor, secreto, migración Prisma ni cambio de `CanonicalUmlModel`.
