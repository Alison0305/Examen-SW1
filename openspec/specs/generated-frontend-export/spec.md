# generated-frontend-export Specification

## Purpose
Permitir descargar un frontend generado y autónomo para el mismo modelo UML persistido de un proyecto.

## Requirements

### Requirement: Generated Frontend Export
The system SHALL export an independent frontend ZIP from the persisted CanonicalUmlModel without using DiagramLayout as semantic input.

#### Scenario: Authorized export
- **WHEN** an authorized project user requests a frontend export
- **THEN** the system returns a valid frontend ZIP generated from the project's canonical model

### Requirement: Autonomous CRUD Frontend Project
The system SHALL generate a CRUD-first frontend that installs and builds outside the source monorepo without assistant or voice runtime dependencies.

#### Scenario: External installation
- **WHEN** a user extracts the frontend ZIP in another folder
- **THEN** `npm install` and `npm run build` do not require a `file:` dependency to the source repository or an assistant runtime

### Requirement: Configurable Generated API
The system SHALL use one configurable API base URL for generated CRUD and relationship operations.

#### Scenario: LAN API
- **WHEN** a user configures a valid LAN backend URL
- **THEN** generated browser and Capacitor operations use that URL instead of assuming device localhost
