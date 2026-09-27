## 1. Incremento 1 - Transformación canónica atómica

- [x] 1.1 Centralizar la detección de multiplicidad many en `uml-core` a partir de `upper: "unbounded"`, y verificar `0..*`, `*`, `1..*` y límites no múltiples con pruebas unitarias.
- [x] 1.2 Incorporar una intención/comando N:M que conserve la Association original, cree atómicamente su Association Class sin atributos y registre `associationClassId` y layout; verificar nombre, colisiones, asociación conservada y casos no N:M.
- [x] 1.3 Integrar la intención en CreateRelationship y UpdateMultiplicity a través de `UmlCommandBus`; transportar `associationClassId` determinista, verificar Undo/Redo, integridad de borrado y que documentos N:M históricos no se transforman durante deserialización.

## 2. Incremento 2 - Workspace y persistencia

- [x] 2.1 Conectar la creación y edición de multiplicidades al comando canónico, proyectar la Association Class desde `associationClassId` y dibujar una rama visual discontinua sin semántica React Flow; verificar layout, UI y MoveElement.
- [x] 2.2 Verificar realtime, persistencia, hydration y recarga de `ProjectDocument` con Cliente, Producto y ClienteProducto, incluyendo ID determinista, Association conservada, layout y ausencia de duplicados.

## 3. Incremento 3 - Pipeline de generación y evidencia

- [x] 3.1 Verificar en `relational-core` que la clase intermedia genera PK y dos FKs sin join table adicional, manteniendo soporte de N:M directa histórica; verificar en `spring-generator` entidad, repository, service y controller intermedios.
- [x] 3.2 Ejecutar gates relevantes: tests `uml-core`, `relational-core`, frontend/workspace, `spring-generator`, typechecks, build frontend si cambia, OpenSpec strict y `git diff --check`; actualizar STATUS, HANDOFF y la documentación del CU con evidencia real.
- [x] 3.3 Ejecutar prueba manual: crear Cliente y Producto, definir `0..*`/`0..*`, confirmar ClienteProducto visible, guardar, recargar y verificar Undo/Redo; registrar resultado antes de solicitar archive, commit o push.
