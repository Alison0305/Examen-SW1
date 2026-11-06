## Why

Editar la multiplicidad de una relación exige hoy escribirla a mano y pulsar un botón por extremo. Además, la notación `*` se interpreta como un número inválido y el cambio se rechaza. Las multiplicidades habituales deben poder elegirse de un menú.

## What Changes

- Reemplazar en el inspector de relaciones los campos de texto de multiplicidad por un menú por extremo con las opciones típicas: `1` (Solo uno), `0..1` (Cero o uno), `0..*` (Cero o muchos) y `1..*` (Uno o muchos), además de "Sin especificar" y "Otra…".
- Aplicar al instante la opción elegida mediante el Command Bus (con Undo) y eliminar los botones "Guardar multiplicidad".
- "Otra…" muestra un campo para valores personalizados como `2..5`, que se aplica con un botón.
- Aceptar `*` como sinónimo de `0..*` y `n..*` al interpretar multiplicidades. `*` y `0..*` son el mismo valor en el modelo, por lo que el menú muestra una sola opción.
- Conservar el comportamiento N:M existente: si ambos extremos quedan en "muchos", se crea la clase intermedia.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `uml-workspace`: agrega el requisito del selector de multiplicidades de relación.

## Impact

- `frontend`: inspector de relaciones del workspace, interpretación de multiplicidades y sus tests. No hay cambios en `uml-core`, en el backend ni en el modelo persistido.
- Se implementa antes de iniciar CU-10 a pedido del usuario; CU-10 sigue planificado y sin implementar.
