## Context

Las columnas `generated` son gestionadas por la persistencia y no son entradas editables.

## Decisions

`ApiField` conserva `generated`; create y update lo filtran, mientras response y entity lo conservan. La decisión no depende del nombre de la columna.
