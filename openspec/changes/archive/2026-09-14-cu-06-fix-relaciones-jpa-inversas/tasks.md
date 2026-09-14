## 1. Corrección del generador

- [x] 1.1 Restringir la generación 1:1 inversa a la tabla participante opuesta al owner, verificando la identidad de relación mediante `RelationalRelation` y su FK.
- [x] 1.2 Añadir una prueba estructural Usuario/Perfil que demuestre owning side, inverse side y ausencia de Perfil en Producto, Pedido y Categoria; verificar que falla antes del fix y pasa después.

## 2. Validación de regresión

- [x] 2.1 Auditar el Java generado de la fixture CU-06 para 1:1, 1:N, Composition, Aggregation y N:M, verificando que ninguna entidad ajena recibe una relación.
- [x] 2.2 Ejecutar `npm run test:generated-backend --workspace @examen-sw1/spring-generator` y verificar `BUILD SUCCESSFUL` con exit code 0.
- [x] 2.3 Ejecutar secuencialmente `npm run lint`, `npm run typecheck`, `npm run test` y `npm run build`, verificando que todos finalizan correctamente.
- [x] 2.4 Regenerar `spring-generator/.manual-review/backend` con la fixture existente, sin compilarla ni editar su Java, y dejarla disponible para inspección.
- [x] 2.5 Validar `openspec validate cu-06-fix-relaciones-jpa-inversas --strict` y registrar la evidencia del fix sin archivar, commitear ni hacer push.
