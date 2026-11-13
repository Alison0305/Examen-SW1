## Why

CU-10 se cerró con el reconocimiento de imágenes reales documentado como limitación. Con 19 capturas reales, la cobertura con tolerancia fue: clases 0,58, atributos 0,13, relaciones 0,16 y multiplicidades 0,08, con 158 clases falsas sobre 241 propuestas. El diagnóstico de CU-10 mostró que la mayoría de los fallos están en el **analizador determinista** de píxeles y texto, no en el OCR de Florence-2:

- atributos sin tipo o con espacios (`-Nombre:`, `-ID del usuario:`) que se descartan como ilegibles;
- fondos, sombras y cuadrículas que crean regiones cerradas falsas, que acaban como «clases»;
- cabeceras con relleno de color y texto claro, que la binarización convierte en un bloque de tinta;
- líneas discontinuas fragmentadas, y etiquetas o multiplicidades fusionadas con los conectores.

## What Changes

Correctivo posterior a CU-10 (convención `fix-cu-XX`), en dos incrementos, con medición antes y después:

- **Incremento 1:**
  - atributos sin tipo, con dos puntos vacíos o con espacios en el nombre (el nombre se propone sin espacios y el tipo como String, con diagnóstico);
  - las regiones cerradas sin ningún texto del OCR no se proponen como clases ni como extremos de relaciones, y se informan con un diagnóstico.
- **Incremento 2:**
  - binarización que admite cabeceras con relleno de color;
  - unión de trazos de líneas discontinuas;
  - máscara de las cajas de texto del OCR antes de trazar conectores.
- La propuesta sigue siendo un borrador revisable: nada se aplica sin la revisión del usuario.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `image-uml-recognition`: agrega requisitos de tolerancia a atributos sin tipo o con espacios y de descarte de regiones sin texto, y fija la medición con el benchmark.

## Impact

- `backend/src/vision/diagram-analyzer.ts` y sus pruebas. Sin modelos nuevos, sin dependencias nuevas, sin cambios de API, de frontend ni de despliegue.
- **Medición:** `npm run benchmark:vlm` con el benchmark sintético y las 19 capturas reales. Esas capturas ya se usaron para diagnosticar, así que la nueva medición con ellas **no es independiente**; la medición independiente requiere un lote nuevo de capturas que aportará el usuario.
- Se documenta en el PUDS de CU-10.
