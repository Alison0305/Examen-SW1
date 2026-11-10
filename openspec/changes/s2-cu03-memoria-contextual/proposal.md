## Why

El Mentor responde con contexto UML actual, pero olvida antecedentes al terminar cada consulta. Se necesita memoria persistente y aislada por proyecto para recuperar decisiones y respuestas relevantes en consultas posteriores sin introducir proveedores cloud ni una segunda fuente de verdad.

## What Changes

- Persistir interacciones completadas del Mentor en PostgreSQL mediante Prisma, conservando autoría, rol efectivo, revisión del proyecto, pregunta, respuesta y estado grounded.
- Reemplazar el registrador efímero por un adaptador persistente detrás del contrato existente.
- Recuperar una ventana determinista y limitada de antecedentes autorizados del mismo proyecto antes de consultar Qwen local.
- Marcar en el contexto de memoria los antecedentes de revisiones UML anteriores sin borrar el historial.
- Mantener el endpoint existente, el cuerpo de consulta cerrado y la separación entre identidad y prompt.

## Capabilities

### New Capabilities
- `mentor-interaction-memory`: persistencia y recuperación autorizada, acotada y aislada por proyecto de interacciones del Mentor.

### Modified Capabilities
- `project-contextual-mentor`: la consulta contextual puede incorporar antecedentes persistidos separados del contexto UML vigente.

## Impact

- Backend: migración Prisma, relaciones con `Project` y `User`, adaptadores de memoria, flujo Mentor y provider Qwen local.
- Pruebas: persistencia Prisma, recuperación, aislamiento, obsolescencia, límites y regresiones de Mentor e identidad.
- No añade endpoint, proveedor IA, dependencia, secreto, memoria del navegador, embeddings ni interfaz de historial.
