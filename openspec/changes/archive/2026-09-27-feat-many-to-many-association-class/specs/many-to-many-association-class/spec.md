## Purpose

Hacer visibles, editables y persistentes las asociaciones UML muchos-a-muchos como clases intermedias canónicas creadas por una única intención de usuario.

## ADDED Requirements

### Requirement: Transformación visible de asociación muchos-a-muchos
The system SHALL conservar una Association creada o editada cuyos dos extremos tengan límite superior ilimitado y vincularle una Association Class canónica visible mediante `associationClassId`.

#### Scenario: Asociación N:M nueva
- **WHEN** una persona crea una asociación entre Cliente y Producto con multiplicidad `0..*` en ambos extremos
- **THEN** el documento contiene Cliente, Producto y ClienteProducto sin atributos, una Association N:M directa y `associationClassId` apuntando a ClienteProducto

#### Scenario: Asociación editada a N:M
- **WHEN** una persona cambia la segunda multiplicidad de una relación existente hasta que ambos extremos tienen límite superior ilimitado
- **THEN** el sistema aplica la transformación una sola vez y conserva la relación directa original

#### Scenario: Relación no N:M
- **WHEN** al menos uno de los extremos no tiene límite superior ilimitado
- **THEN** el sistema conserva la relación original sin crear una clase intermedia

### Requirement: Transformación atómica y reversible
The system SHALL registrar la creación de Association Class, vínculo semántico y layout como una única intención reversible.

#### Scenario: Undo de transformación N:M
- **WHEN** una persona deshace una asociación N:M recién creada
- **THEN** desaparecen juntos la clase intermedia, sus dos relaciones y su layout sin dejar elementos huérfanos

#### Scenario: Redo de transformación N:M
- **WHEN** una persona rehace la transformación deshecha
- **THEN** se restauran los mismos elementos semánticos y visuales con sus identificadores originales

### Requirement: Nombre y colisiones deterministas
The system SHALL nombrar la clase intermedia mediante los nombres de las clases origen y destino en PascalCase y resolver colisiones sin crear nombres duplicados.

#### Scenario: Clase ya generada para la relación
- **WHEN** existe la clase generada correspondiente a la misma transformación
- **THEN** el sistema la reutiliza sin duplicarla

#### Scenario: Colisión con clase manual
- **WHEN** una clase manual ya usa el nombre calculado para una nueva transformación
- **THEN** el sistema crea un nombre determinista alternativo que no colisiona

### Requirement: Persistencia y layout no semántico
The system SHALL persistir la clase intermedia y sus relaciones dentro de `ProjectDocument.uml`, mientras que su posición se conserva únicamente en `ProjectDocument.layout`.

#### Scenario: Recarga de proyecto
- **WHEN** se guarda y recarga un proyecto con una asociación N:M transformada
- **THEN** la clase intermedia y sus relaciones siguen presentes sin reconstruirse desde nodos o aristas visuales

### Requirement: Realtime deterministic identity
The system SHALL transportar `UpdateMultiplicity.associationClassId` sin regenerarlo entre cliente, servidor, ACK, persistencia y reload.

#### Scenario: Movimiento tras sincronización
- **WHEN** se mueve la Association Class usando `associationClassId`
- **THEN** el servidor encuentra el layout del mismo ID y acepta `MoveElement`
