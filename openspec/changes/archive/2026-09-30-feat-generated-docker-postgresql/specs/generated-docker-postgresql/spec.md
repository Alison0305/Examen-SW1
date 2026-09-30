## Purpose

Permitir ejecutar PostgreSQL para un backend Spring generado mediante Docker Compose y documentación reproducible, sin preparación manual de base de datos.

## ADDED Requirements

### Requirement: Generated Docker PostgreSQL Environment
The system SHALL include a Docker Compose PostgreSQL environment in every generated Spring backend ZIP.

#### Scenario: Local database startup
- **WHEN** a user runs `docker compose up -d` from an extracted generated backend
- **THEN** PostgreSQL creates the configured development database, persists data in a volume, exposes port 5433 and reports health before Spring connects

### Requirement: Generated Docker Spring Profile
The system SHALL provide an explicit `docker` Spring profile that connects to the generated Compose PostgreSQL service.

#### Scenario: Docker profile startup
- **WHEN** a user starts Spring with `--spring.profiles.active=docker`
- **THEN** Hibernate creates diagram-derived tables in the Docker PostgreSQL database without requiring local PostgreSQL credentials

### Requirement: Generated Development Guide
The system SHALL include a Spanish README with PowerShell commands matching the generated Docker and Spring configuration.

#### Scenario: Swagger and API verification
- **WHEN** a user follows the generated README
- **THEN** they can open `/swagger-ui.html`, request `/v3/api-docs`, and test generated endpoints with Postman
