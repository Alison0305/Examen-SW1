## Context

`RelationalModel` already records `lifecycle: "COMPOSITION"` and preserves relation source and target. The confirmed fixture has Pedido as source/composite and Producto as target/part; its FK is correctly owned by Producto. The current generator attaches cascade while rendering the FK field, which makes the part propagate lifecycle to the composite.

## Goals / Non-Goals

**Goals:**

- Emit strong lifecycle from a Composition source/composite to its target parts.
- Preserve FK ownership, column nullability, inverse-side identity and deterministic `GeneratedFile[]` output.
- Keep Association and Aggregation without Composition lifecycle annotations.

**Non-Goals:**

- No change to UML semantics, relational mapping, database schema, Hibernate bootstrap, Docker or Prisma.
- No CRUD, OpenAPI, generated frontend or CU-07 work.

## Decisions

- In the current relational contract, a Composition relation's `sourceTable` is the composite and `targetTable` is the part. Lifecycle derives from these participants, not from the table that physically owns the FK.
- For 1:N Composition, the composite `@OneToMany(mappedBy = ...)` collection receives `cascade = CascadeType.ALL, orphanRemoval = true`; the part's `@ManyToOne` FK field receives no cascade.
- For 1:1 Composition, lifecycle must be emitted on the source/composite field whether that field is the owning or inverse JPA side. The implementation must retain the existing JPA owner determined by the FK while placing lifecycle annotations on the composite association.
- Aggregation and Association retain their existing lifecycle-free mappings. Structural tests will assert this explicitly instead of relying on compilation alone.

Alternative rejected: use `CascadeType.ALL` on every FK with Composition lifecycle. This follows physical ownership rather than aggregate ownership and permits a part removal to remove its composite.

## Risks / Trade-offs

- [One-to-one owner and lifecycle directions can differ] → derive the association field from relation source/target and assert both FK owner variants structurally.
- [Changing inverse fields can regress the prior 1:1 fix] → audit Usuario/Perfil and non-participants in the representative fixture.
- [Generated annotations compile but model an incorrect lifecycle] → add semantic content assertions and retain the compile gate as a separate syntax check.
