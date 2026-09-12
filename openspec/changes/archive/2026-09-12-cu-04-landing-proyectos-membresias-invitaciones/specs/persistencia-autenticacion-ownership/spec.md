## MODIFIED Requirements

### Requirement: Ownership de proyectos
El sistema SHALL derivar el propietario exclusivamente del JWT autenticado y SHALL permitir crear, leer y actualizar un proyecto a su OWNER o, cuando exista membership válida, conforme al rol EDITOR o VIEWER.

#### Scenario: Crear proyecto sin ownerId controlable
- **WHEN** un usuario autenticado crea un proyecto e incluye `ownerId` en el body
- **THEN** el propietario permanece siendo `authenticatedUser.id` y el body no puede asignarlo a otro usuario.

#### Scenario: Acceso de propietario
- **WHEN** el propietario solicita su proyecto
- **THEN** el sistema devuelve el proyecto con accessRole OWNER.

#### Scenario: Acceso de miembro
- **WHEN** un EDITOR o VIEWER solicita un proyecto con membership válida
- **THEN** el sistema devuelve el proyecto con su accessRole correspondiente.

#### Scenario: Acceso ajeno
- **WHEN** otro usuario sin ownership ni membership solicita o actualiza el proyecto
- **THEN** el sistema responde 404 indistinguible de un proyecto inexistente y no modifica documento ni revisión.
