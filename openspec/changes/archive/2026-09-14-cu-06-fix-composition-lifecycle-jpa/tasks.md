## 1. Lifecycle JPA de Composition

- [x] 1.1 Corregir el generator para proyectar `CascadeType.ALL` y `orphanRemoval = true` desde el source/composite hacia sus partes, preservando FK owner y nullability; verificar la prueba estructural de Composition 1:N.
- [x] 1.2 Cubrir estructuralmente Composition 1:1 para ambos propietarios posibles de FK, verificando que lifecycle queda en source/composite sin alterar el owning side JPA.
- [x] 1.3 Añadir regresiones que prueben que Aggregation y Association no contienen `CascadeType.ALL` ni `orphanRemoval = true` por reglas de Composition.

## 2. Auditoría Y Pipeline Real

- [x] 2.1 Auditar los `GeneratedFile[]` de la fixture real para Pedido/Producto, Usuario/Perfil, Usuario/Pedido, Categoria/Producto y N:M, verificando que no reaparecen inverse sides 1:1 en entidades no participantes.
- [x] 2.2 Ejecutar `npm run test:generated-backend --workspace @examen-sw1/spring-generator` y verificar el pipeline real completo hasta `BUILD SUCCESSFUL` con exit code 0.
- [x] 2.3 Regenerar `spring-generator/.manual-review/backend` con la fixture existente, sin editar Java generado ni versionar el output, y comprobar manualmente Pedido.java y Producto.java.

## 3. Cierre Del Correctivo

- [x] 3.1 Ejecutar `npm run lint`, `npm run typecheck`, `npm run test` y `npm run build`; verificar todas las suites y registrar sus resultados reales.
- [x] 3.2 Actualizar STATUS, HANDOFF y el registro de CU-06 con la corrección real, limitaciones y evidencia, verificando que no se declare implementado antes de completar los gates.
- [x] 3.3 Validar `openspec validate cu-06-fix-composition-lifecycle-jpa --strict`, revisar `git diff --check` y preparar la revisión manual sin archivar, commitear ni hacer push.
