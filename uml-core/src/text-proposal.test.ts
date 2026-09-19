import { describe, expect, it } from "vitest";
import { UmlCommandBus, adaptUmlTextProposal, createProjectDocument, parseUmlTextProposal } from "./index.js";

describe("propuestas textuales UML", () => {
  it("reconoce exclusivamente la gramática cerrada", () => {
    expect(parseUmlTextProposal('CREATE_CLASS name="Cliente"')).toEqual({ success: true, proposal: { type: "CREATE_CLASS", name: "Cliente" } });
    expect(parseUmlTextProposal('RENAME_CLASS targetId="class-1" name="Cuenta"')).toEqual({ success: true, proposal: { type: "RENAME_CLASS", targetId: "class-1", name: "Cuenta" } });
    expect(parseUmlTextProposal('DELETE_CLASS targetId="class-1"')).toEqual({ success: true, proposal: { type: "DELETE_CLASS", targetId: "class-1" } });
    expect(parseUmlTextProposal('CREATE_CLASS name="Cliente";')).toMatchObject({ success: false });
    expect(parseUmlTextProposal('RENAME_CLASS targetId="class-1" name="Cuenta";')).toMatchObject({ success: false });
    expect(parseUmlTextProposal('DELETE_CLASS targetId="class-1";')).toMatchObject({ success: false });
    expect(parseUmlTextProposal('CREATE_CLASS name=""')).toMatchObject({ success: false });
    expect(parseUmlTextProposal('DROP TABLE classes;')).toMatchObject({ success: false });
  });

  it("adapta propuestas al Command Bus y conserva Undo/Redo", () => {
    const proposal = parseUmlTextProposal('CREATE_CLASS name="Cliente"');
    if (!proposal.success) throw new Error("La propuesta debe ser válida.");
    const bus = new UmlCommandBus(createProjectDocument({ id: "11111111-1111-4111-8111-111111111111", uuidFactory: () => "11111111-1111-4111-8111-111111111111" }));

    const created = bus.execute(adaptUmlTextProposal(proposal.proposal, () => "22222222-2222-4222-8222-222222222222"));
    expect(created.success).toBe(true);
    expect(bus.document.uml.classes).toMatchObject([{ id: "22222222-2222-4222-8222-222222222222", name: "Cliente" }]);

    bus.undo();
    expect(bus.document.uml.classes).toEqual([]);
    bus.redo();
    expect(bus.document.uml.classes).toMatchObject([{ id: "22222222-2222-4222-8222-222222222222", name: "Cliente" }]);
  });

  it("no altera el documento cuando la entrada es inválida", () => {
    const document = createProjectDocument({ id: "11111111-1111-4111-8111-111111111111", uuidFactory: () => "11111111-1111-4111-8111-111111111111" });
    const before = structuredClone(document);

    expect(parseUmlTextProposal('DELETE_CLASS targetId=""')).toMatchObject({ success: false });
    expect(document).toEqual(before);
  });
});
