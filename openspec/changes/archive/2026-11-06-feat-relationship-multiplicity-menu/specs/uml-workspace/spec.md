## ADDED Requirements

### Requirement: Selector de multiplicidades de relación
El workspace SHALL ofrecer en el inspector de relaciones, por cada extremo de una relación que admita multiplicidad, un menú con las opciones Sin especificar, `1`, `0..1`, `0..*`, `1..*` y Otra…, y SHALL aplicar la opción elegida al instante mediante el Command Bus, con Undo.

#### Scenario: Elegir una multiplicidad típica
- **WHEN** el usuario elige `1..*` en el extremo destino de una asociación
- **THEN** la multiplicidad se aplica de inmediato, se dibuja en el diagrama y Deshacer la revierte

#### Scenario: Valor personalizado
- **WHEN** el usuario elige Otra…, escribe `2..5` y lo aplica
- **THEN** el extremo queda con multiplicidad `2..5` y el menú muestra Otra… con ese valor

#### Scenario: Notación asterisco
- **WHEN** el usuario aplica `*` como valor personalizado
- **THEN** se guarda como `0..*` y el menú muestra la opción `0..*`

#### Scenario: Ambos extremos en muchos
- **WHEN** el usuario deja ambos extremos de una asociación en una opción de muchos
- **THEN** se crea la clase intermedia N:M como hasta ahora

#### Scenario: Generalización y VIEWER
- **WHEN** la relación es una generalización o el usuario es VIEWER
- **THEN** el menú no se muestra para la generalización y está deshabilitado para el VIEWER
