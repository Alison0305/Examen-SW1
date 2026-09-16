## Purpose

Producir un Domain Manifest versionado y determinista que declare las capacidades generadas para consumidores posteriores sin ejecutar lenguaje natural.

## ADDED Requirements

### Requirement: Contrato Domain Manifest v1
The system SHALL generate a permanent `domain-manifest.json` in the generated backend root. Its root SHALL contain exactly `schemaVersion: 1` and `entities`.

#### Scenario: Entidad habilitada
- **WHEN** an entity has declared CRUD and query metadata
- **THEN** the manifest declares exactly `name`, `resourceName`, `attributes`, `relations` and `operations` without reconstructing relationships from OpenAPI

#### Scenario: Atributo, relación y operación
- **WHEN** an enabled entity is projected
- **THEN** each attribute declares exactly `name`, `type`, `required`, `identifier`, `unique`, `searchable`, `sortable` and `defaultSort`; each relation declares exactly `name`, `target`, `cardinality`, `lifecycle` and `required`; and each operation declares exactly `name`, `method` and `path`

#### Scenario: Ejemplo v1
- **WHEN** `pedido` tiene un atributo `id` y una relación requerida `usuarioId`
- **THEN** the generated document has the shape:
```json
{
  "schemaVersion": 1,
  "entities": [{
    "name": "pedido",
    "resourceName": "pedido",
    "attributes": [{ "name": "id", "type": "BIGINT", "required": true, "identifier": true, "unique": false, "searchable": false, "sortable": false, "defaultSort": null }],
    "relations": [{ "name": "usuarioId", "target": "usuario", "cardinality": "MANY_TO_ONE", "lifecycle": "NONE", "required": true }],
    "operations": [{ "name": "getPedido", "method": "GET", "path": "/api/v1/pedido/{id}" }]
  }]
}
```

### Requirement: Orden y validación deterministas
The system SHALL order entities, attributes, relations and operations by binary `name` order and SHALL serialize a stable UTF-8 JSON document without timestamps, random identifiers or local URLs.

#### Scenario: Modelos equivalentes
- **WHEN** equivalent valid relational models are generated twice
- **THEN** their Domain Manifest paths and contents are byte-equivalent

#### Scenario: Operación HTTP verificada
- **WHEN** runtime OpenAPI is available for verification
- **THEN** every manifest operation has the declared method, path and operationId in the OpenAPI contract

### Requirement: Exclusión de capacidades no permitidas
The system SHALL omit operations and fields that are not enabled by generation metadata.

#### Scenario: Operación deshabilitada
- **WHEN** an entity disables delete
- **THEN** the manifest does not declare DELETE for that entity
