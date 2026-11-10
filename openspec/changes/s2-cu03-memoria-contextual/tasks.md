## 1. Persistencia de interacciones

- [x] 1.1 Añadir `MentorInteraction`, relaciones Prisma e índices, crear migración y verificar con `npx prisma validate`.
- [x] 1.2 Implementar recorder y lector Prisma preservando autoría, rol, fecha, revisión, pregunta, respuesta y grounded; verificar con pruebas de persistencia entre instancias.

## 2. Memoria contextual del Mentor

- [x] 2.1 Definir contratos de memoria y selección determinista limitada; verificar orden cronológico, máximo de entradas y presupuesto de texto en pruebas unitarias.
- [x] 2.2 Integrar recuperación posterior a autorización y previa a Qwen, con detección de revisión obsoleta; verificar aislamiento por proyecto, acceso denegado y memoria compartida autorizada.
- [x] 2.3 Extender el provider Qwen con secciones separadas de UML y memoria sin identidad; verificar prompt acotado y ausencia de userId, email y rol.

## 3. Regresiones y documentación

- [x] 3.1 Cubrir HTTP anti-suplantación, Mentor sin historial, contexto UML e identidad/autorización existentes; verificar pruebas focalizadas de Mentor, memoria e identidad.
- [x] 3.2 Actualizar documentación de CU-2P-03, STATUS y HANDOFF con implementación real y prueba manual prevista; verificar que no se declara el CU cerrado.
- [x] 3.3 Ejecutar typecheck, lint, test, build, OpenSpec strict, diff-check, Prisma validate y estado de migraciones; registrar resultados reales.
