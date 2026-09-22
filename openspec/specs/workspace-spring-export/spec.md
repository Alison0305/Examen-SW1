# workspace-spring-export Specification

## Purpose

Permitir que una persona con acceso a un proyecto UML persistido exporte su modelo semántico como un backend Spring Boot descargable, sin transformar el layout visual en dominio.

## Requirements

### Requirement: Exportación Spring visible y configurable
The system SHALL mostrar en el workspace UML una acción visible `Generar backend` que permita solicitar un backend Spring Boot del proyecto abierto, con paquete base editable y Java 21 como única versión mostrada.

#### Scenario: Solicitud válida desde el workspace
- **WHEN** una persona con acceso de lectura abre un proyecto UML y confirma `Generar backend` con un paquete base válido
- **THEN** la interfaz muestra estado de generación y descarga el archivo ZIP resultante sin abandonar el workspace

#### Scenario: Configuración no soportada
- **WHEN** la persona ingresa un paquete base inválido
- **THEN** la interfaz informa el error y no solicita una exportación

#### Scenario: Rol de solo lectura
- **WHEN** una persona con rol VIEWER abre un proyecto válido
- **THEN** puede solicitar la exportación porque no modifica el `ProjectDocument`

### Requirement: Exportación autorizada desde el documento persistido
The system SHALL generar la exportación solo para una solicitud autenticada con acceso de lectura al proyecto y deberá cargar el `ProjectDocument` persistido autorizado en lugar de aceptar un modelo UML arbitrario del cliente.

#### Scenario: Proyecto inaccesible o inexistente
- **WHEN** una persona solicita la exportación de un proyecto al que no tiene acceso o que no existe
- **THEN** el sistema rechaza la solicitud sin revelar el documento ni generar archivos

#### Scenario: Documento semánticamente inválido
- **WHEN** el documento persistido no es válido, no contiene entidades exportables o no puede convertirse al modelo relacional
- **THEN** el sistema responde un error de generación estructurado sin crear una descarga parcial

### Requirement: Backend Spring descargable y seguro
The system SHALL transformar exclusivamente el `CanonicalUmlModel` persistido mediante el mapeador y generador existentes, empaquetar los archivos generados en un ZIP seguro y responderlo como descarga HTTP.

#### Scenario: Contenido generado desde el diagrama
- **WHEN** el modelo canónico contiene entidades y relaciones válidas
- **THEN** el ZIP incluye la estructura Gradle, configuración y artefactos Java producidos por el generador para esas entidades y relaciones

#### Scenario: Documento creado manualmente sin metadata de generación
- **WHEN** el `CanonicalUmlModel` persistido contiene clases creadas por el workspace sin `generationMetadata`, atributos convencionales `id` y relaciones válidas
- **THEN** el mapeador proyecta esas clases como entidades salvo exclusión explícita `entity: false`, reconoce `id` como identifier salvo `identifier: false` y genera el ZIP sin usar `DiagramLayout`

#### Scenario: Respuesta de descarga
- **WHEN** una exportación termina correctamente
- **THEN** la respuesta usa `application/zip`, `Content-Disposition: attachment` y un nombre de archivo seguro

#### Scenario: Fallo de generación o empaquetado
- **WHEN** falla el mapeo, el generador o el empaquetado ZIP
- **THEN** el sistema no expone stack traces ni entrega un ZIP incompleto y la interfaz muestra un error controlado

### Requirement: Descarga autenticada desde el navegador
The system SHALL enviar la solicitud de exportación con la sesión autenticada, convertir la respuesta ZIP en Blob y activar una descarga de navegador con estados visibles de generación, éxito o error.

#### Scenario: Cancelación de red o error HTTP
- **WHEN** la red falla o la API responde un error durante la exportación
- **THEN** la interfaz termina el estado de generación, conserva el workspace y presenta un mensaje seguro
