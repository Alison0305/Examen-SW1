## Purpose

Proveer una interfaz Swagger disponible inmediatamente en cada backend Spring generado, conservando el contrato OpenAPI existente.

## ADDED Requirements

### Requirement: Generated Swagger UI
The system SHALL include Swagger UI in every generated Spring backend without requiring manual changes to an exported ZIP.

#### Scenario: Stable Swagger UI route
- **WHEN** a generated backend runs locally
- **THEN** Swagger UI is available at `/swagger-ui.html`

#### Scenario: OpenAPI contract remains available
- **WHEN** a generated backend runs locally
- **THEN** its OpenAPI JSON remains available at `/v3/api-docs`

### Requirement: Centralized generated configuration
The system SHALL generate the springdoc UI dependency, Swagger path configuration and an explicit H2 demo profile from spring-generator.

#### Scenario: Productive export
- **WHEN** a project is exported through the Spring ZIP endpoint
- **THEN** its build configuration includes `springdoc-openapi-starter-webmvc-ui:3.1.1` and its properties define `springdoc.swagger-ui.path=/swagger-ui.html`

### Requirement: Generated Demo Profile
The system SHALL preserve PostgreSQL as the default generated database configuration and provide a `demo` profile backed by in-memory H2.

#### Scenario: Demo startup without PostgreSQL
- **WHEN** a generated backend starts with `--spring.profiles.active=demo`
- **THEN** it starts without a PostgreSQL server or PostgreSQL credentials and exposes `/swagger-ui.html` and `/v3/api-docs`

#### Scenario: Default database remains PostgreSQL
- **WHEN** a generated backend starts without the demo profile
- **THEN** its normal PostgreSQL configuration remains active
