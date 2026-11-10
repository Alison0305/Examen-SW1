# CU-2P-03 - Persistir y recuperar memoria contextual del Mentor IA

## Estado

Cerrado y aceptado. PR #10 fusionado en `main`; issue #3 cerrado automáticamente por `Closes #3`. Merge commit `150e62911469d0b8b0e0063365163546d7dae8ca`. OpenSpec archivado en `openspec/changes/archive/2026-11-09-s2-cu03-memoria-contextual/`.

## Objetivo Y Alcance

RF-08 a RF-11: persistir interacciones Mentor, recuperar antecedentes por proyecto, compartirlos entre miembros autorizados y señalar antecedentes de revisiones UML anteriores. Depende de CU-2P-01 (Mentor Qwen contextual) y CU-2P-02 (identidad JWT y `requireView`).

## Arquitectura

`MentorInteraction` persiste `projectId`, `userId`, `authorEmail`, `accessRole`, `occurredAt`, `projectRevision`, pregunta, respuesta y `grounded`. La migración es `20261109170000_add_mentor_interactions`. `PrismaMentorInteractionRecorder` escribe respuestas exitosas; los retornos deterministas previos al provider no cambian su comportamiento ni se registran.

`PrismaMentorInteractionMemory` recupera exclusivamente por `projectId` después de autorización, selecciona antecedentes recientes y los devuelve cronológicamente. La memoria es compartida por miembros autorizados del proyecto, mientras PostgreSQL conserva la autoría individual.

## Límites Y Privacidad

- Máximo 6 interacciones, 1.200 caracteres por pregunta/respuesta y 6.000 caracteres aproximados totales.
- `isStale` es verdadero cuando `projectRevision` es menor que la revisión actual.
- Si la memoria utilizada incluye un antecedente `isStale`, el servicio añade determinísticamente una nota visible de posible desactualización; no depende de que Qwen la mencione.
- Qwen recibe UML actual y memoria en secciones separadas. La memoria no contiene userId, email, rol, JWT, hashes, contraseñas ni secretos.

## Pruebas

- Focalizadas Mentor/memoria/identidad: 29/29 correctas.
- Integración PostgreSQL entre dos instancias Prisma: correcta; verifica persistencia y recuperación tras desconexión.
- Typecheck, lint, Prisma validate/migrate status, OpenSpec strict y diff-check: correctos.
- Suite raíz y build correctos; React emite advertencias preexistentes `act(...)` sin fallo.

## Prueba Manual

1. Reiniciar backend y abrir un proyecto con clases `Categoria` y `Producto`.
2. Consultar una solución para su relación y guardar la respuesta.
3. Reiniciar el backend, volver a iniciar sesión y preguntar qué solución sugirió antes.
4. Confirmar que Qwen recibe/usa el antecedente, que otro proyecto no lo ve y que un miembro autorizado sí puede reutilizarlo.
5. Cambiar el UML, volver a consultar y comprobar que el antecedente se presenta como histórico.

Resultado: aprobada. La memoria sobrevivió al reinicio, se aisló entre proyectos y una respuesta basada en revisión anterior mostró la advertencia determinista de posible desactualización.

## Limitaciones

La recuperación es reciente y determinista, sin embeddings ni búsqueda semántica. No existe interfaz de historial; corresponde a CU-2P-07.
