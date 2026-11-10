## ADDED Requirements

### Requirement: Historial por proyecto
El sistema SHALL exponer `GET /projects/:id/mentor/history` a usuarios autenticados y SHALL devolver las interacciones persistidas del Mentor de ese proyecto en una página `{ items, nextCursor }`. Un historial sin interacciones SHALL ser una respuesta válida y no un error.

#### Scenario: Historial vacío
- **WHEN** un integrante autorizado consulta el historial de un proyecto sin interacciones
- **THEN** el sistema SHALL responder 200 con `{ "items": [], "nextCursor": null }`

#### Scenario: Una interacción
- **WHEN** el proyecto tiene una interacción y un integrante autorizado consulta el historial
- **THEN** la respuesta SHALL contener exactamente esa interacción con su pregunta y respuesta completas y `nextCursor` SHALL ser `null`

#### Scenario: Varias interacciones
- **WHEN** el proyecto tiene tres interacciones y ninguna supera el límite de la página
- **THEN** la respuesta SHALL contener las tres interacciones una sola vez

#### Scenario: Más reciente primero
- **WHEN** existen interacciones registradas a las 10:00 (A), 10:20 (B) y 10:30 (C)
- **THEN** los elementos SHALL devolverse en el orden C, B, A, y las interacciones con la misma fecha SHALL ordenarse por `id` descendente

### Requirement: Historial compartido entre integrantes
El sistema SHALL mostrar a cada integrante autorizado las interacciones de todos los integrantes del proyecto, no solo las propias.

#### Scenario: B ve la consulta de A
- **WHEN** el usuario A consulta al Mentor en el proyecto X y después el usuario B, con acceso a X, abre el historial de X
- **THEN** el historial de B SHALL incluir la interacción de A con A como autor

### Requirement: Aislamiento entre proyectos
El sistema SHALL filtrar toda lectura del historial, incluidas la paginación y la búsqueda, por el proyecto autorizado y SHALL NOT devolver interacciones de otro proyecto.

#### Scenario: Dos proyectos
- **WHEN** el proyecto X tiene las interacciones Q1 y Q2 y el proyecto Y tiene Q3, y un usuario con acceso a ambos consulta el historial de Y
- **THEN** la respuesta SHALL contener solo Q3, también cuando la búsqueda coincide con el texto de Q1 o Q2 o se envía un cursor generado en X

### Requirement: Autoría y fecha
Cada elemento SHALL mostrar como autor el email guardado al registrar la interacción y como fecha el instante `occurredAt` registrado por el servidor, en ISO 8601 UTC.

#### Scenario: Autor correcto
- **WHEN** A (`a@example.test`) y B (`b@example.test`) consultan al Mentor en el mismo proyecto
- **THEN** cada elemento SHALL mostrar el email de quien hizo esa consulta y su fecha de registro

### Requirement: Paginación keyset
El sistema SHALL paginar con un cursor opaco sobre `occurredAt DESC, id DESC`, con `limit` por defecto 20 y máximo 50, y SHALL NOT usar paginación por offset. Recorrer todas las páginas SHALL entregar cada interacción una sola vez.

#### Scenario: Recorrer varias páginas
- **WHEN** un proyecto tiene 7 interacciones, algunas con la misma fecha, y el cliente pide páginas de 2 siguiendo `nextCursor`
- **THEN** el cliente SHALL recibir 4 páginas con las 7 interacciones en orden, sin duplicados ni huecos, y la última página SHALL tener `nextCursor: null`

#### Scenario: Límite inválido
- **WHEN** el cliente envía `limit` 0, 51, decimal, negativo, no numérico o repetido
- **THEN** el sistema SHALL rechazar la consulta con `INVALID_LIMIT` sin leer interacciones

#### Scenario: Cursor inválido
- **WHEN** el cliente envía un cursor mal formado, de versión desconocida, con fecha imposible o con un id que no es UUID
- **THEN** el sistema SHALL rechazar la consulta con `INVALID_CURSOR` y un motivo distinguible, sin leer interacciones

### Requirement: Búsqueda dentro del proyecto
El sistema SHALL aceptar un texto de búsqueda opcional `q` que, tras recortar espacios, tenga entre 1 y 200 caracteres sin caracteres de control, y SHALL devolver solo las interacciones del proyecto autorizado cuya pregunta o respuesta lo contengan sin distinguir mayúsculas.

#### Scenario: Búsqueda por pregunta
- **WHEN** el cliente busca `cliente` y una interacción del proyecto tiene la pregunta "¿Qué hace la clase Cliente?"
- **THEN** esa interacción SHALL aparecer y las que no contienen el texto en pregunta ni en respuesta SHALL NOT aparecer

#### Scenario: Búsqueda por respuesta
- **WHEN** el cliente busca `pedido.cliente_id` y solo la respuesta de una interacción contiene ese texto
- **THEN** esa interacción SHALL aparecer en los resultados

#### Scenario: Búsqueda inválida
- **WHEN** `q` está vacía, contiene solo espacios, supera 200 caracteres, se repite o contiene caracteres de control
- **THEN** el sistema SHALL rechazar la consulta con `INVALID_SEARCH`

### Requirement: Autorización en el servidor
El sistema SHALL autorizar cada lectura con `ProjectAccessService.requireView` usando solo el usuario del JWT, antes de leer interacciones, y SHALL NOT aceptar `userId`, `projectId` ni otros parámetros de identidad desde la consulta.

#### Scenario: OWNER consulta
- **WHEN** el propietario del proyecto consulta el historial
- **THEN** el sistema SHALL responder 200 con el historial del proyecto

#### Scenario: EDITOR consulta
- **WHEN** un integrante con rol EDITOR consulta el historial
- **THEN** el sistema SHALL responder 200 con el mismo historial que ve el propietario

#### Scenario: VIEWER consulta
- **WHEN** un integrante con rol VIEWER consulta el historial
- **THEN** el sistema SHALL responder 200 con el mismo historial, en solo lectura

#### Scenario: Usuario ajeno
- **WHEN** un usuario autenticado sin acceso al proyecto, o un proyecto inexistente, consulta el historial o busca en él
- **THEN** el sistema SHALL responder 404 sin leer ni revelar interacciones

#### Scenario: Parámetro de identidad del cliente
- **WHEN** la consulta incluye `userId`, `projectId` u otro parámetro distinto de `limit`, `cursor` y `q`
- **THEN** el sistema SHALL rechazarla con `UNKNOWN_PARAMETER`

### Requirement: Privacidad del DTO
Cada elemento del historial SHALL contener únicamente `id`, `author.email`, `question`, `answer` y `occurredAt`, y SHALL NOT exponer `userId`, `projectId`, `accessRole`, `projectRevision`, `grounded`, `createdAt`, prompts, contexto enviado al modelo, rutas del modelo, causas de error, trazas ni tokens.

#### Scenario: Fila con campos internos
- **WHEN** la fila persistida contiene `userId`, `accessRole`, `projectRevision` y `grounded`
- **THEN** el elemento devuelto SHALL contener solo los cinco campos públicos

### Requirement: Independencia del modelo local
Consultar el historial SHALL NOT requerir ni invocar el modelo local, y el módulo de historial SHALL NOT importar `AssistantModule`.

#### Scenario: Sin Qwen configurado
- **WHEN** `ASSISTANT_MODEL_PATH` no está configurado y un integrante consulta el historial
- **THEN** el sistema SHALL responder 200 con las interacciones persistidas

### Requirement: Estado de propuestas diferido a CU-2P-06
El sistema SHALL NOT inventar campos, tablas ni valores de estado de propuestas. Cuando CU-2P-06 proporcione su fuente de verdad, el historial SHALL mostrar el estado real (pendiente, aplicada o rechazada) leído de ella; hasta entonces el resto del historial SHALL funcionar sin esa integración.

#### Scenario: CU-2P-06 aún no integrado
- **WHEN** se consulta el historial antes de que exista el modelo de propuestas de CU-2P-06
- **THEN** los elementos SHALL contener solo los campos públicos definidos y SHALL NOT incluir ningún estado de propuesta
