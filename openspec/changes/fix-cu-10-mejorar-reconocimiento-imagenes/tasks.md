## 1. Medición base

- [x] 1.1 Ejecutar `npm run benchmark:vlm` con el código actual (sintético y 19 capturas reales) y registrar las métricas como línea base. Hecho el 2026-11-13 (`main` en `597476e`, Florence-2-base-ft q8 en CPU, reporte `vlm-base-antes-fix-cu10-2026-11-13T15-02-22-183Z.json`). Reproduce las cifras de CU-10:
  - **19 capturas reales, con tolerancia:** clases 0,3444 de precisión y 0,5764 de cobertura; atributos 0,1298 de cobertura; relaciones 0,1905 / 0,1611; multiplicidades 0,0791. p50/p95 de 13,6 s / 28,3 s.
  - **Benchmark sintético, con tolerancia:** clases de 0,89 a 1,00 por condición; relaciones 1,00 en `captura` y `rotada-3`, 0,55 en `baja-resolucion` y 0,82 en `ruido-jpeg`.

## 2. Incremento 1: atributos y regiones sin texto

- [x] 2.1 Aceptar atributos sin tipo, con dos puntos vacíos o con nombre de varias palabras; String y diagnóstico si falta el tipo. Con dos puntos se admiten hasta cinco palabras, que se unen (`ID del usuario` → `IDDelUsuario`, diagnóstico informativo `IMAGE_ATTRIBUTE_NAME_JOINED`). Sin dos puntos solo se acepta una palabra, como antes, para no convertir texto suelto en atributos.
- [x] 2.2 Descartar como clases y como extremos de relación las regiones cerradas sin texto del OCR, con un diagnóstico del número descartado (`IMAGE_EMPTY_REGIONS_DISCARDED`). Siguen contando como geometría, para que sus bordes no se tracen como conectores, y las claves de las clases propuestas siguen siendo consecutivas.
- [x] 2.3 Pruebas unitarias del analizador para cada caso, sin regresiones en las existentes. `diagram-analyzer.test.ts` pasa de 24 a 30 tests:
  - dos puntos sin tipo;
  - nombre de varias palabras, con y sin tipo;
  - varias palabras sin dos puntos, que no se convierten en atributo;
  - operaciones omitidas;
  - regiones sin texto descartadas;
  - una línea hacia una región sin texto, que no produce relación.

  Dos mutaciones (sin descarte; tipo obligatorio tras los dos puntos) hacen fallar los tests correspondientes.
- [x] 2.4 Medir con el benchmark y comparar con la línea base. Hecho el 2026-11-13 (reporte `vlm-incremento1-fix-cu10-2026-11-13T15-10-21-397Z.json`). Las 19 capturas ya se usaron para diagnosticar, así que esta medición **no es independiente**.

  | 19 capturas reales, con tolerancia | Base | Incremento 1 |
  |---|---|---|
  | Clases: precisión / cobertura | 0,3444 / 0,5764 | **0,5287** / 0,5764 |
  | Atributos: cobertura | 0,1298 | 0,1322 |
  | Relaciones: precisión / cobertura | 0,1905 / 0,1611 | **0,2747** / 0,1678 |
  | Multiplicidades | 0,0791 | 0,0791 |

  Benchmark sintético: idéntico en las cuatro condiciones, sin regresiones. Latencia similar (p50/p95 de 13,7 s / 28,5 s).

  Lectura de los resultados:
  - Mejora la **precisión**: hay menos clases y relaciones falsas.
  - La **cobertura** casi no cambia: 4 capturas siguen con 0 clases reconocidas, por las cabeceras rellenas y los fondos (incremento 2), y sus atributos se pierden con ellas. La cobertura de atributos depende primero de detectar la clase.

  **Medición independiente del incremento 1** (2026-11-13). 11 capturas nuevas aportadas por el usuario, nunca usadas para ajustar el analizador: 62 clases, 184 atributos y 54 relaciones, en `C:\Users\USER\vlm-fotos-independiente`, fuera del repositorio. Reportes `vlm-independiente-base-…` y `vlm-independiente-incremento1-…`, y misma máquina. En la captura `112054` hay dos clases que el propio diagrama llama «Test Paper», y una multiplicidad escrita «1..», que no se puede leer y no puntúa; se transcribieron fieles a la imagen.

  | 11 capturas nuevas, con tolerancia | Base | Incremento 1 |
  |---|---|---|
  | Clases: precisión / cobertura | 0,7246 / 0,8065 | **0,7937** / 0,8065 |
  | Atributos: cobertura | 0,3859 | 0,3859 |
  | Relaciones: precisión / cobertura | 0,4054 / 0,2778 | **0,4688** / 0,2778 |
  | Multiplicidades | 0,0455 | 0,0455 |

  Lectura de los resultados:
  - La mejora de **precisión** se confirma con capturas que no se usaron para ajustar el analizador, así que el descarte de regiones sin texto generaliza.
  - El cambio de **atributos** no tuvo efecto en este lote.
  - Ninguna **cobertura** baja. El benchmark sintético es idéntico en ambas corridas.

## 3. Incremento 2: cabeceras rellenas, líneas discontinuas y texto sobre conectores

- [x] 3.1 Binarización que admita cabeceras con relleno de color y texto claro.

  **Diagnóstico.** Se generaron máscaras de lo que ve el analizador para las 4 capturas antiguas con 0 clases. Hay dos tipos de fallo:
  - **A. Cabecera rellena** (`223837` azul, `224343` verde). La cabecera se binariza como un bloque de tinta, el nombre queda fuera de la caja y la clase toma su primer atributo como nombre.
  - **B. Texto diminuto** (`224138`, `224226` de 430×330 px, `224513`). El OCR lee basura, por ejemplo «dolce» o «dolcos» en 64 líneas, aunque las cajas se detectan. Es un límite del OCR de Florence-2 (trabaja a unos 768 px), no del analizador, y queda fuera de este correctivo.

  **Solución para A.** Si encima del primer compartimento hay una banda de al menos 12 px con mayoría de tinta en todo el ancho de la caja, que termina en fondo y no se sale por los lados, se añade como compartimento de cabecera. Su texto pasa a ser el nombre de la clase y su tinta queda dentro de la caja, de modo que deja de trazarse como conector. Para las pruebas, el generador sintético admite `headerFill`. Hay 4 tests nuevos (cabeceras azul, verde y gris oscuro, y un diagrama con herencia y composición), y desactivar la detección los hace fallar.

  **Medición** (reportes `vlm-inc2-cabeceras-19-…` y `vlm-inc2-cabeceras-independiente-…`):

  | Con tolerancia | Incremento 1 | Problema 1 resuelto |
  |---|---|---|
  | 19 capturas: clases P / R | 0,5287 / 0,5764 | **0,5732 / 0,6250** |
  | 19 capturas: atributos R | 0,1322 | **0,1538** |
  | 19 capturas: relaciones P / R | 0,2747 / 0,1678 | 0,2796 / 0,1745 |
  | 11 independientes | sin cambios | sin cambios (el lote no tiene cabeceras rellenas) |

  - **Por captura:** `223837` pasa de 0 a 5 de 7 clases bien nombradas (de 0 a 7 atributos) y `224343` de 0 a 2 de 9. Ninguna otra captura cambió. Benchmark sintético sin cambios.
  - **Alternativa medida y descartada:** la misma detección sobre la imagen en grises, en lugar de la máscara de tinta, no recuperó las cabeceras verdes (el OCR también lee mal su texto blanco) y bajó la cobertura de clases a 0,6181, así que se mantuvo la máscara de tinta.
  - **Limitaciones:** las cabeceras de color medio con texto blanco que el OCR lee mal, y el tipo B.
- [ ] 3.2 Unión de trazos de líneas discontinuas.
- [ ] 3.3 Máscara de las cajas del OCR antes de trazar conectores.
- [ ] 3.4 Pruebas y medición con el benchmark.

## 4. Cierre

- [ ] 4.1 Medición independiente con un lote nuevo de capturas aportado por el usuario.
- [ ] 4.2 Gates del backend, OpenSpec strict y diff-check.
- [ ] 4.3 PUDS de CU-10 y STATUS actualizados; aceptación del usuario, archivo, commit y push.
