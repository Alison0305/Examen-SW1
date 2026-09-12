# Persistencia, autenticación y ownership Specification

## Purpose

Permite conservar proyectos UML completos por usuario autenticado y proteger su acceso mediante ownership y control de revisión optimista.

## Requirements

### Requirement: Persistencia íntegra del documento de proyecto
El sistema SHALL guardar `ProjectDocument` como un único agregado JSON/JSONB, sin normalizar UML en tablas, y SHALL conservar separado `CanonicalUmlModel` de `DiagramLayout` usando los contratos de `@examen-sw1/uml-core`.

#### Scenario: Crear y recuperar proyecto
- **WHEN** un usuario autenticado crea un proyecto con un `ProjectDocument` válido
- **THEN** el sistema devuelve sin pérdida clases, atributos, operaciones, parámetros, enums, literales, relaciones, nombres opcionales, multiplicidades, visibilidades y `DiagramLayout`.

#### Scenario: Documento inválido
- **WHEN** un cliente entrega un `ProjectDocument` que falla la validación estructural o de dominio
- **THEN** el sistema responde 400 y no persiste un proyecto válido.

#### Scenario: Revisión inicial
- **WHEN** se persiste un proyecto nuevo
- **THEN** su revisión inicial es 1.

### Requirement: Registro y autenticación segura
El sistema SHALL normalizar y exigir emails únicos, almacenar exclusivamente `passwordHash` con Argon2id y nunca almacenar ni exponer contraseña plana.

#### Scenario: Registro exitoso
- **WHEN** se registra un email nuevo con contraseña válida
- **THEN** la respuesta no expone `passwordHash` y el usuario puede autenticarse.

#### Scenario: Email inválido, duplicado o contraseña inválida
- **WHEN** se registra un email inválido, ya normalizado/existente o una contraseña corta
- **THEN** el sistema rechaza la solicitud con el código consistente correspondiente y no crea usuario.

### Requirement: Login y JWT Bearer
El sistema SHALL autenticar solo credenciales válidas, emitir JWT con payload mínimo y rechazar token ausente, inválido o expirado sin exponer `passwordHash`.

#### Scenario: Login correcto
- **WHEN** un usuario registrado envía email normalizado y contraseña correcta
- **THEN** recibe un JWT Bearer con payload mínimo.

#### Scenario: Login incorrecto
- **WHEN** la contraseña es incorrecta o el usuario no existe
- **THEN** el sistema responde 401 sin revelar hashes ni distinguir detalles internos.

### Requirement: Usuario autenticado
El sistema SHALL exponer el usuario asociado al JWT en `GET /auth/me` sin incluir `passwordHash`.

#### Scenario: Consultar sesión válida
- **WHEN** un cliente envía un JWT Bearer válido a `/auth/me`
- **THEN** recibe el identificador y email del usuario autenticado.

#### Scenario: Token no aceptado
- **WHEN** `/auth/me` recibe un token ausente, inválido o expirado
- **THEN** el sistema responde 401.

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

### Requirement: Revisión optimista de proyectos
El sistema SHALL requerir `expectedRevision` y realizar una actualización atómica condicionada por `id`, `ownerId` y revisión actual.

#### Scenario: Actualización vigente
- **WHEN** `expectedRevision` coincide con la revisión actual del proyecto del propietario
- **THEN** el documento se guarda y la revisión pasa de 1 a 2.

#### Scenario: Actualización desactualizada
- **WHEN** `expectedRevision` no coincide con la revisión actual
- **THEN** el sistema responde 409 con conflicto estructurado para recargar, sin sobrescribir documento ni alterar revisión.
