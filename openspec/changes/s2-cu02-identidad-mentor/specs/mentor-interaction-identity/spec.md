## Purpose

Provee una identidad mínima, autorizada y aislada por proyecto para las interacciones del Mentor sin exponer secretos ni depender del proveedor de IA.

## ADDED Requirements

### Requirement: Identidad derivada del usuario autenticado
El sistema SHALL construir la identidad de interacción únicamente desde el proyecto solicitado y el usuario ya autenticado por el servidor. La identidad SHALL contener `projectId`, `userId`, `author.email`, `accessRole` y `occurredAt`, sin hashes, JWT, tokens, datos UML ni datos del proveedor.

#### Scenario: Usuario autenticado consulta un proyecto autorizado
- **WHEN** el sistema resuelve una interacción para un proyecto y un usuario autenticado
- **THEN** la identidad devuelve el id y email de ese usuario, el proyecto solicitado y exclusivamente los campos permitidos

### Requirement: Rol y aislamiento derivados de acceso a proyecto
El sistema SHALL autorizar el proyecto antes de producir identidad y SHALL derivar el rol exclusivamente de la autorización vigente del proyecto. El sistema SHALL conservar el aislamiento entre usuarios y proyectos.

#### Scenario: Usuario sin acceso al proyecto
- **WHEN** el usuario autenticado no tiene acceso de lectura al proyecto solicitado
- **THEN** el sistema SHALL rechazar la resolución con el mismo resultado de autorización y no producir identidad

#### Scenario: Dos proyectos o usuarios distintos
- **WHEN** se resuelven interacciones para proyectos o usuarios distintos
- **THEN** cada identidad SHALL conservar solamente su propio proyecto, usuario, email y rol autorizado

### Requirement: Timestamp generado por servidor
El sistema SHALL generar `occurredAt` después de autorizar el acceso y SHALL not aceptar una fecha enviada por el cliente.

#### Scenario: Autorización exitosa
- **WHEN** se autoriza la lectura del proyecto
- **THEN** la identidad SHALL incluir la fecha y hora actuales generadas por el servidor

### Requirement: Integración Mentor diferida
El sistema SHALL mantener este contrato reutilizable sin crear una ruta alternativa de Mentor. La integración con la ruta de CU-01, el registrador y la prueba HTTP anti-suplantación SHALL permanecer pendientes hasta que CU-01 esté integrado.

#### Scenario: Módulo de identidad disponible sin endpoint Mentor
- **WHEN** el módulo de identidad se incorpora al backend antes de CU-01
- **THEN** el sistema SHALL exponer el resolvedor para futuros consumidores sin publicar un endpoint Mentor nuevo
