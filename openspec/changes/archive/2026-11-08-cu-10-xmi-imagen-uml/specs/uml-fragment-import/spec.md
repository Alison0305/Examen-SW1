## Purpose

Permitir que fuentes externas (XMI e imagen) propongan un conjunto de elementos UML que el usuario revisa y que se aplica de forma atómica y validada mediante el Command Bus, sin escribir directamente sobre el modelo canónico.

## ADDED Requirements

### Requirement: Propuesta de importación independiente de la fuente
El sistema SHALL representar todo lo importado desde XMI o imagen como una propuesta intermedia con clases, atributos, enumeraciones, literales y relaciones identificados por claves locales y tipos por nombre, sin ids del modelo canónico, junto con diagnósticos estructurados de lo omitido o dudoso.

#### Scenario: Misma representación para XMI e imagen
- **WHEN** se obtiene una propuesta desde un archivo XMI y otra desde una imagen
- **THEN** ambas tienen la misma estructura y pasan por la misma revisión y aplicación

#### Scenario: Elemento no soportado
- **WHEN** la fuente contiene un elemento que el producto no soporta
- **THEN** la propuesta lo omite y registra un diagnóstico con su nombre y el motivo

### Requirement: Traducción determinista a fragmento
El sistema SHALL traducir una propuesta a un fragmento del modelo de forma determinista: asignar ids nuevos, normalizar tipos primitivos, resolver por nombre los tipos que referencian clases o enumeraciones de la propuesta o del documento y calcular una posición inicial para cada elemento nuevo.

#### Scenario: Tipo que referencia una clase
- **WHEN** un atributo de la propuesta tiene un tipo cuyo nombre coincide con una clase
- **THEN** el fragmento usa una referencia a esa clase en lugar de un tipo primitivo

#### Scenario: Tipo desconocido
- **WHEN** un atributo tiene un tipo que no es primitivo ni coincide con ninguna clase o enumeración
- **THEN** el fragmento usa el tipo `string` y registra un diagnóstico de advertencia sobre ese atributo

#### Scenario: Relación con extremo inexistente
- **WHEN** una relación de la propuesta referencia una clase que no está en la propuesta ni en el documento
- **THEN** la relación se omite y se registra un diagnóstico

### Requirement: Validación previa a la aplicación
El sistema SHALL validar el fragmento aplicándolo sobre una copia del documento con el motor de validación existente antes de ofrecer su aplicación, y SHALL mostrar los diagnósticos resultantes. Un fragmento con errores bloqueantes SHALL NOT poder aplicarse.

#### Scenario: Conflicto de nombre con el documento
- **WHEN** el fragmento agrega una clase con el mismo nombre que una clase existente
- **THEN** la revisión muestra el diagnóstico de nombre duplicado y no permite aplicar hasta resolverlo

#### Scenario: Validación sin efectos
- **WHEN** se valida un fragmento
- **THEN** el documento del proyecto, su revisión y su historial no cambian

### Requirement: Aplicación atómica mediante el Command Bus
El sistema SHALL aplicar un fragmento revisado como un único comando que agrega todos sus elementos y su layout, o ninguno si la validación falla, siguiendo la ruta única de mutación.

#### Scenario: Importación aceptada
- **WHEN** el usuario aplica un fragmento válido
- **THEN** todos sus elementos y su layout aparecen en el documento mediante un solo comando y una sola entrada de historial

#### Scenario: Importación inválida
- **WHEN** el comando de importación produce errores de validación
- **THEN** el documento no cambia y se muestran los diagnósticos

### Requirement: Undo de una importación
El sistema SHALL deshacer una importación aplicada en un solo paso, retirando exactamente los elementos y layouts agregados por ella, tanto en edición local como colaborativa.

#### Scenario: Undo local
- **WHEN** el usuario pulsa Deshacer tras aplicar una importación
- **THEN** desaparecen todos los elementos importados y el documento vuelve a su estado previo

#### Scenario: Undo colaborativo
- **WHEN** el usuario deshace una importación en un proyecto colaborativo
- **THEN** se envía una única operación inversa que retira los elementos importados y los demás participantes ven el mismo resultado

### Requirement: Revisión por el usuario antes de aplicar
El sistema SHALL mostrar la propuesta antes de aplicarla y permitir editar nombres de clases, atributos y tipos, excluir elementos y relaciones, y consultar los diagnósticos; nada SHALL aplicarse sin una acción explícita del usuario. El rol VIEWER SHALL NOT poder aplicar importaciones.

#### Scenario: Excluir un elemento
- **WHEN** el usuario desmarca una clase en la revisión
- **THEN** la clase y las relaciones que dependen de ella no se aplican

#### Scenario: Cancelar la revisión
- **WHEN** el usuario cancela la revisión
- **THEN** el documento no cambia

#### Scenario: Usuario VIEWER
- **WHEN** un VIEWER abre el workspace
- **THEN** las acciones de importación no están disponibles
