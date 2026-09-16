# generated-api-contracts Specification

## Purpose
Producir contratos OpenAPI y Postman consistentes a partir de la API real generada para documentar y comprobar sus capacidades.

## Requirements

### Requirement: OpenAPI real del backend generado
The system SHALL expose an OpenAPI 3.1 document derived from the generated REST API, including schemas, parameters, responses and structured errors.

#### Scenario: API generada
- **WHEN** the generated backend starts in its controlled verification profile
- **THEN** its OpenAPI endpoint describes only the generated enabled operations

### Requirement: Postman derivado del OpenAPI
The system SHALL generate a deterministic Postman Collection v2.1 from the real OpenAPI document with a configurable base URL variable.

#### Scenario: OpenAPI equivalente
- **WHEN** equivalent generated OpenAPI documents are converted twice
- **THEN** the collection paths, contents and ordering are equivalent
