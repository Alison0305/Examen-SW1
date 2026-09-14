# spring-backend-generator Specification

## Purpose

Generate a deterministic, safe Spring Boot backend project from a RelationalModel.

## ADDED Requirements

### Requirement: Deterministic generated files
The system SHALL generate ordered `GeneratedFile` artifacts using Handlebars before filesystem writing.

#### Scenario: Equivalent relational model
- **WHEN** the generator receives the same RelationalModel and configuration
- **THEN** it returns the same paths and contents without timestamps or random values

### Requirement: Safe generated output
The system SHALL reject duplicate paths, absolute paths and path traversal before writing generated files.

#### Scenario: Unsafe generated path
- **WHEN** a generated file path escapes the configured output root
- **THEN** generation reports a blocking error and writes no file outside that root
