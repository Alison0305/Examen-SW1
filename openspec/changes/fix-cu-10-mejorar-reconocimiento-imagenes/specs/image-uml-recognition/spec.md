## ADDED Requirements

### Requirement: Atributos sin tipo o con espacios
El analizador de imágenes SHALL proponer como atributo una línea de texto de una clase con visibilidad opcional, un nombre de una o varias palabras y, opcionalmente, dos puntos con o sin tipo. Si falta el tipo, SHALL proponer String con un diagnóstico; si el nombre tiene espacios, SHALL proponerlo sin espacios. SHALL seguir omitiendo las operaciones.

#### Scenario: Dos puntos sin tipo
- **WHEN** una clase contiene la línea `-Nombre:`
- **THEN** la propuesta incluye el atributo privado `Nombre` de tipo String y un diagnóstico de atributo sin tipo legible

#### Scenario: Nombre con espacios
- **WHEN** una clase contiene la línea `-ID del usuario: int`
- **THEN** la propuesta incluye un atributo privado cuyo nombre une las palabras sin espacios y de tipo `int`

#### Scenario: Operación
- **WHEN** una clase contiene la línea `+calcularTotal(): float`
- **THEN** no se propone como atributo y se informa como operación omitida

### Requirement: Regiones cerradas sin texto
El analizador de imágenes SHALL NOT proponer como clase una región cerrada que no contenga ningún texto del OCR, ni usarla como extremo de una relación, y SHALL informar cuántas regiones descartó.

#### Scenario: Cuadrícula de fondo
- **WHEN** la imagen tiene celdas cerradas de fondo sin texto además de las clases
- **THEN** la propuesta contiene solo las clases con texto y un diagnóstico con el número de regiones descartadas

### Requirement: Medición del reconocimiento
Cada cambio del analizador SHALL medirse con `npm run benchmark:vlm` antes y después, sobre el benchmark sintético y las capturas reales disponibles, y SHALL documentarse si el lote de capturas reales ya se usó para diagnosticar.

#### Scenario: Sin regresión sintética
- **WHEN** se mide un cambio del analizador
- **THEN** las métricas del benchmark sintético no empeoran respecto de la medición anterior
