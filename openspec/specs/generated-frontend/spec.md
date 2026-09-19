# generated-frontend Specification

## Purpose

Generar una interfaz web CRUD utilizable y responsive desde las capacidades ya declaradas por una aplicación generada, sin alterar el contrato Domain Manifest v1.

## Requirements

### Requirement: Frontend generado desde contratos existentes
The system SHALL generate una aplicación web Next.js App Router con Material UI a partir del `domain-manifest.json` v1 y de las operaciones ya declaradas por el backend generado, sin requerir cambios al manifest.

#### Scenario: Generación de un modelo habilitado
- **WHEN** se genera una aplicación para un modelo relacional válido con entidades y operaciones habilitadas
- **THEN** el resultado incluye navegación y pantallas para las entidades y operaciones declaradas, y no inventa entidades, campos ni operaciones ausentes

#### Scenario: Manifest v1 preservado
- **WHEN** el frontend requiere decidir cómo presentar una entidad o campo
- **THEN** usa exclusivamente los campos disponibles en el Domain Manifest v1 y sus contratos existentes, sin modificar el formato ni exigir campos nuevos

### Requirement: CRUD y estados de la interfaz
The system SHALL proporcionar para cada entidad habilitada listados, detalle, creación, edición y eliminación cuando la operación correspondiente esté declarada, con búsqueda, filtros, paginación, ordenamiento, relaciones y estados de carga, error y vacío aplicables.

#### Scenario: Operación disponible
- **WHEN** una entidad declara una operación CRUD o de consulta
- **THEN** la interfaz presenta el control y el flujo correspondiente con los parámetros y datos permitidos

#### Scenario: Operación no disponible
- **WHEN** una entidad no declara una operación, un campo o una capacidad de consulta
- **THEN** la interfaz no muestra un control que intente usar esa capacidad

#### Scenario: Error de la API
- **WHEN** una operación declarada devuelve un error
- **THEN** la interfaz conserva un estado consistente y muestra un mensaje de error sin exponer una URL arbitraria ni detalles internos

### Requirement: Inferencia determinista de controles
The system SHALL inferir los controles de visualización, edición, filtrado y relación de forma determinista a partir del tipo, obligatoriedad, identificador, unicidad, relación y metadatos de búsqueda, ordenamiento y operaciones declarados.

#### Scenario: Campo editable requerido
- **WHEN** un atributo no identificador está habilitado para escritura y es requerido
- **THEN** el formulario generado exige un valor compatible antes de enviar la operación

#### Scenario: Relación declarada
- **WHEN** un campo representa una relación declarada y la operación aplicable está habilitada
- **THEN** la interfaz presenta un selector o navegación de relación en lugar de tratarlo como texto libre

#### Scenario: Identificador
- **WHEN** un atributo está marcado como identificador
- **THEN** la interfaz lo usa para identificar detalle, edición o eliminación y no ofrece cambiarlo mediante una actualización ordinaria

### Requirement: Adaptación responsive y accesible
The system SHALL mantener flujos CRUD operables en viewport de escritorio y móvil, incluyendo navegación, tablas o listas, formularios, acciones y estados informativos.

#### Scenario: Viewport móvil
- **WHEN** la aplicación generada se visualiza en un viewport móvil
- **THEN** los controles esenciales permanecen disponibles sin depender exclusivamente de hover ni de un ancho de escritorio

### Requirement: Campos mutables contractuales y relaciones
The system SHALL renderizar y enviar CREATE exclusivamente desde el request schema CREATE y UPDATE exclusivamente desde el request schema PATCH, conservando `field.wireName`; relaciones fuera del schema no son inputs editables.

#### Scenario: Create y update Rol
- **WHEN** `CreateRolRequest` contiene `id` y `nombre`, y `UpdateRolRequest` contiene `nombre`
- **THEN** Crear muestra solo Id y Nombre, Editar envía solo nombre, y una relación inversa Usuario no es editable.

#### Scenario: Relación mutable
- **WHEN** `CreateUsuarioRequest` contiene `rolId` asociado a Rol
- **THEN** se muestra un `TextField select` con `MenuItem`, cargado desde el LIST existente de Rol, y estado/payload conservan `rolId`.

#### Scenario: Value, label y coerción
- **WHEN** una opción Rol tiene `id: 1` y `nombre: Administrador`, y `rolId` es integer
- **THEN** usa value 1, label Administrador y convierte el valor visual "1" a 1 antes del payload; si falla el LIST, el formulario permanece estable.
