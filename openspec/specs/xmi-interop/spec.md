# xmi-interop Specification

## Purpose
Intercambiar modelos de clases con herramientas externas, principalmente Sparx Systems Enterprise Architect, mediante XMI 2.1 sobre el subconjunto UML que soporta el producto.

## Requirements

### Requirement: Exportación XMI 2.1
El sistema SHALL exportar el `CanonicalUmlModel` del proyecto abierto como un documento XMI 2.1 descargable que contenga clases, visibilidad, atributos con tipo y multiplicidad, enumeraciones con literales, asociaciones con multiplicidades de sus extremos, agregaciones, composiciones y generalizaciones. La exportación SHALL NOT usar `DiagramLayout` como semántica.

#### Scenario: Exportar un modelo
- **WHEN** el usuario elige Exportar XMI en un proyecto con clases, una enumeración y relaciones
- **THEN** se descarga un archivo XMI 2.1 bien formado que contiene esos elementos con sus identificadores XMI únicos

#### Scenario: Determinismo
- **WHEN** se exporta dos veces el mismo modelo
- **THEN** los dos documentos XMI son idénticos

### Requirement: Importación XMI 2.1
El sistema SHALL leer un documento XMI 2.1 y producir una propuesta de importación con las clases, atributos, enumeraciones, literales, asociaciones con multiplicidades, agregaciones, composiciones y generalizaciones del subconjunto soportado, incluidos los tipos primitivos de Enterprise Architect.

#### Scenario: Importar un XMI de Enterprise Architect
- **WHEN** el usuario importa un XMI 2.1 exportado desde Enterprise Architect con clases, atributos y asociaciones
- **THEN** la revisión muestra esas clases, atributos, tipos y relaciones con sus multiplicidades

#### Scenario: Paquetes anidados
- **WHEN** el XMI organiza las clases en paquetes
- **THEN** las clases se importan sin paquete y se registra un diagnóstico informativo de aplanamiento

### Requirement: Ida y vuelta sin pérdida del subconjunto soportado
El sistema SHALL garantizar que exportar un modelo e importar el XMI resultante produce el mismo contenido semántico del subconjunto soportado: nombres, visibilidades, tipos, multiplicidades, literales y relaciones.

#### Scenario: Round-trip
- **WHEN** se exporta un modelo y se importa el XMI obtenido en un documento vacío
- **THEN** el modelo importado coincide semánticamente con el original

### Requirement: Entrada XMI inválida o no soportada
El sistema SHALL rechazar con un diagnóstico claro un archivo que no sea XML bien formado o que no sea XMI 2.1, SHALL limitar el tamaño del archivo aceptado y SHALL reportar como diagnóstico cada elemento no soportado, como operaciones, otros tipos de diagrama o perfiles, sin abortar el resto de la importación.

#### Scenario: Archivo no XML
- **WHEN** el usuario selecciona un archivo que no es XML
- **THEN** se muestra un error y no se abre la revisión

#### Scenario: Operaciones de clase
- **WHEN** el XMI incluye operaciones en una clase
- **THEN** la clase se importa sin ellas y se registra un diagnóstico por las operaciones omitidas

### Requirement: Interoperabilidad verificada con Enterprise Architect
El sistema SHALL verificarse manualmente con Enterprise Architect en ambos sentidos: un XMI exportado por el producto SHALL poder importarse en Enterprise Architect y un XMI exportado por Enterprise Architect SHALL poder importarse en el producto, documentando la versión utilizada y las diferencias observadas.

#### Scenario: Del producto a Enterprise Architect
- **WHEN** se importa en Enterprise Architect un XMI exportado por el producto
- **THEN** Enterprise Architect muestra las clases, atributos y relaciones exportadas

#### Scenario: De Enterprise Architect al producto
- **WHEN** se importa en el producto un XMI exportado por Enterprise Architect
- **THEN** la propuesta contiene las clases, atributos y relaciones del modelo de origen dentro del subconjunto soportado
