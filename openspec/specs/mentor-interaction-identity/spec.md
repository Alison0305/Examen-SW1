# mentor-interaction-identity Specification

## Purpose

Provee una identidad mínima, autorizada y aislada por proyecto para las interacciones del Mentor sin exponer secretos ni depender del proveedor de IA.

## Requirements

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

### Requirement: Integración autorizada con Mentor
El sistema SHALL reutilizar la ruta Mentor existente sin crear una ruta alternativa. La ruta SHALL derivar la identidad desde el usuario autenticado, autorizar mediante la identidad antes de cargar el proyecto y entregar la identidad completa al registrador desacoplado.

#### Scenario: Cliente intenta suplantar identidad
- **WHEN** un cliente envía campos de identidad adicionales junto con una pregunta Mentor
- **THEN** el sistema SHALL rechazar los campos no permitidos y una consulta válida posterior SHALL usar exclusivamente la identidad autenticada

#### Scenario: Proveedor Mentor recibe contexto privado
- **WHEN** una interacción autorizada llega al proveedor local
- **THEN** el proveedor SHALL recibir solamente el contexto UML y la pregunta, sin id, email, rol ni timestamp de identidad
