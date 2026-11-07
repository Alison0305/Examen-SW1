import { describe, expect, it } from "vitest";
import { buildImportFragment, createProjectDocument, type CanonicalUmlModel, type UmlType } from "@examen-sw1/uml-core";
import { exportXmi, parseXmi } from "./index.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const model = (): CanonicalUmlModel => ({
  classes: [
    { id: id(1), name: "Cliente", visibility: "public", attributes: [
      { id: id(11), name: "nombre", visibility: "private", type: { kind: "primitive", name: "string" } },
      { id: id(12), name: "edad", visibility: "protected", type: { kind: "primitive", name: "integer" }, multiplicity: { lower: 0, upper: 1 } },
      { id: id(13), name: "saldo", visibility: "public", type: { kind: "primitive", name: "number" } },
      { id: id(14), name: "activo", visibility: "package", type: { kind: "primitive", name: "boolean" } },
      { id: id(15), name: "alta", visibility: "private", type: { kind: "primitive", name: "date" } },
      { id: id(16), name: "ultimoAcceso", visibility: "private", type: { kind: "primitive", name: "datetime" } },
    ], operations: [] },
    { id: id(2), name: "Pedido", visibility: "public", attributes: [{ id: id(17), name: "estado", visibility: "private", type: { kind: "reference", referenceType: "enumeration", elementId: id(3) } }, { id: id(18), name: "comprador", visibility: "private", type: { kind: "reference", referenceType: "class", elementId: id(1) } }], operations: [] },
    { id: id(4), name: "PedidoUrgente", visibility: "public", attributes: [], operations: [] },
    { id: id(7), name: "Linea", visibility: "public", attributes: [], operations: [] },
  ],
  enumerations: [{ id: id(3), name: "Estado", visibility: "public", literals: ["NUEVO", "ENVIADO"] }],
  packages: [],
  relationships: [
    { id: id(5), type: "Association", name: "realiza", sourceId: id(1), targetId: id(2), sourceMultiplicity: { lower: 1, upper: 1 }, targetMultiplicity: { lower: 0, upper: "unbounded" } },
    { id: id(6), type: "Generalization", sourceId: id(4), targetId: id(2) },
    { id: id(8), type: "Composition", sourceId: id(2), targetId: id(7), sourceMultiplicity: { lower: 1, upper: 1 }, targetMultiplicity: { lower: 1, upper: "unbounded" } },
    { id: id(9), type: "Aggregation", sourceId: id(1), targetId: id(7) },
  ],
});

// Comparable view by names: ids differ after an import, semantics must not.
function semantic(source: CanonicalUmlModel) {
  const nameOf = (elementId: string) => [...source.classes, ...source.enumerations].find((entry) => entry.id === elementId)?.name;
  const typeName = (type: UmlType) => (type.kind === "primitive" ? type.name : `${type.referenceType}:${nameOf(type.elementId)}`);
  return {
    classes: source.classes.map((entry) => ({ name: entry.name, visibility: entry.visibility, attributes: entry.attributes.map((attribute) => ({ name: attribute.name, visibility: attribute.visibility, type: typeName(attribute.type), multiplicity: attribute.multiplicity })) })),
    enumerations: source.enumerations.map((entry) => ({ name: entry.name, literals: entry.literals })),
    relationships: source.relationships.map((entry) => ({ type: entry.type, name: entry.name, source: nameOf(entry.sourceId), target: nameOf(entry.targetId), sourceMultiplicity: entry.sourceMultiplicity, targetMultiplicity: entry.targetMultiplicity })).sort((left, right) => `${left.type}${left.source}${left.target}`.localeCompare(`${right.type}${right.source}${right.target}`)),
  };
}

describe("exportXmi", () => {
  it("genera XMI 2.1 bien formado con clases, tipos, multiplicidades y relaciones", () => {
    const { xml } = exportXmi(model(), { modelName: "Tienda" });
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('xmi:version="2.1"');
    expect(xml).toContain('name="Tienda"');
    expect(xml).toContain('href="http://schema.omg.org/spec/UML/2.1/uml.xml#Integer"');
    expect(xml).toContain('xmi:idref="EAnone_DateTime"');
    expect(xml).toContain('aggregation="composite"');
    expect(xml).toContain('aggregation="shared"');
    expect(xml).toContain('general="EAID_00000000_0000_4000_8000_000000000002"');
    expect(xml).toContain('value="*"');
    expect(parseXmi(xml).ok).toBe(true);
  });

  it("es determinista y escapa caracteres especiales", () => {
    const special = model();
    special.classes[0]!.name = 'Cliente<"&">';
    expect(exportXmi(special).xml).toBe(exportXmi(special).xml);
    expect(exportXmi(special).xml).toContain('name="Cliente&lt;&quot;&amp;&quot;&gt;"');
  });

  it("informa operaciones y clases intermedias N:M que no se exportan como tales", () => {
    const withExtras = model();
    withExtras.classes[0]!.operations.push({ id: id(30), name: "calcular", visibility: "public", parameters: [] });
    withExtras.relationships[0] = { ...withExtras.relationships[0]!, associationClassId: id(7) };
    expect(exportXmi(withExtras).diagnostics.map((entry) => entry.code)).toEqual(["XMI_OPERATIONS_NOT_EXPORTED", "XMI_ASSOCIATION_CLASS_FLATTENED"]);
  });
});

describe("parseXmi", () => {
  it("ida y vuelta: exportar e importar conserva el contenido semántico", () => {
    const original = model();
    const parsed = parseXmi(exportXmi(original).xml);
    if (!parsed.ok) throw new Error("parse");
    let next = 500;
    const { fragment, diagnostics } = buildImportFragment(parsed.proposal, createProjectDocument(), { uuidFactory: () => id(next++) });
    expect(diagnostics).toEqual([]);
    expect(semantic({ ...fragment, packages: [] })).toEqual(semantic(original));
  });

  it("lee el XMI con la forma de Enterprise Architect: tipos EAJava, -1 como ilimitado y paquetes anidados", () => {
    const xml = `<?xml version="1.0" encoding="windows-1252"?>
<xmi:XMI xmi:version="2.1" xmlns:uml="http://schema.omg.org/spec/UML/2.1" xmlns:xmi="http://schema.omg.org/spec/XMI/2.1">
  <xmi:Documentation exporter="Enterprise Architect" exporterVersion="6.5"/>
  <uml:Model xmi:type="uml:Model" name="EA_Model" visibility="public">
    <packagedElement xmi:type="uml:Package" xmi:id="EAPK_1" name="Model" visibility="public">
      <packagedElement xmi:type="uml:Package" xmi:id="EAPK_2" name="Ventas" visibility="public">
        <packagedElement xmi:type="uml:Class" xmi:id="EAID_A" name="Factura" visibility="public">
          <ownedAttribute xmi:type="uml:Property" xmi:id="EAID_A1" name="total" visibility="private">
            <lowerValue xmi:type="uml:LiteralInteger" xmi:id="EAID_A1L"/>
            <upperValue xmi:type="uml:LiteralUnlimitedNatural" xmi:id="EAID_A1U" value="1"/>
            <type xmi:idref="EAJava_double"/>
          </ownedAttribute>
          <ownedAttribute xmi:type="uml:Property" xmi:id="EAID_dstB" name="items" association="EAID_AS" visibility="private" aggregation="none"><type xmi:idref="EAID_B"/></ownedAttribute>
          <ownedOperation xmi:id="EAID_OP" name="calcular"/>
        </packagedElement>
        <packagedElement xmi:type="uml:Class" xmi:id="EAID_B" name="Item" visibility="public"/>
        <packagedElement xmi:type="uml:Association" xmi:id="EAID_AS" visibility="public">
          <memberEnd xmi:idref="EAID_dstB"/>
          <memberEnd xmi:idref="EAID_srcA"/>
          <ownedEnd xmi:type="uml:Property" xmi:id="EAID_srcA" association="EAID_AS" aggregation="composite">
            <lowerValue xmi:type="uml:LiteralInteger" xmi:id="L1" value="1"/>
            <upperValue xmi:type="uml:LiteralUnlimitedNatural" xmi:id="U1" value="-1"/>
            <type xmi:idref="EAID_A"/>
          </ownedEnd>
        </packagedElement>
        <packagedElement xmi:type="uml:Interface" xmi:id="EAID_I" name="Pagable"/>
      </packagedElement>
    </packagedElement>
  </uml:Model>
</xmi:XMI>`;
    const parsed = parseXmi(xml);
    if (!parsed.ok) throw new Error("parse");
    const { proposal } = parsed;
    expect(proposal.classes.map((entry) => entry.name)).toEqual(["Factura", "Item"]);
    expect(proposal.classes[0]!.attributes).toEqual([{ key: "EAID_A1", name: "total", type: "EAJava_double", visibility: "private", multiplicity: { lower: 0, upper: 1 } }]);
    expect(proposal.relationships).toEqual([{ key: "EAID_AS", type: "Composition", source: "EAID_B", target: "EAID_A", targetMultiplicity: { lower: 1, upper: "unbounded" } }]);
    expect(proposal.diagnostics.map((entry) => entry.code).sort()).toEqual(["XMI_OPERATIONS_OMITTED", "XMI_PACKAGES_FLATTENED", "XMI_UNSUPPORTED_ELEMENT"]);
  });

  it("rechaza XML mal formado, documentos que no son XMI y archivos demasiado grandes", () => {
    expect(parseXmi("<xmi:XMI><sin-cerrar></xmi:XMI>")).toMatchObject({ ok: false, diagnostics: [{ code: "XMI_INVALID_XML" }] });
    expect(parseXmi("no es xml")).toMatchObject({ ok: false });
    expect(parseXmi('<?xml version="1.0"?><html><body/></html>')).toMatchObject({ ok: false, diagnostics: [{ code: "XMI_NOT_XMI" }] });
    expect(parseXmi(`<xmi:XMI xmi:version="2.1">${" ".repeat(5 * 1024 * 1024)}</xmi:XMI>`)).toMatchObject({ ok: false, diagnostics: [{ code: "XMI_TOO_LARGE" }] });
  });

  it("advierte versiones distintas de 2.1, multiplicidades inválidas y XMI sin clases", () => {
    const parsed = parseXmi(`<xmi:XMI xmi:version="2.4.1" xmlns:xmi="http://www.omg.org/spec/XMI/20110701"><uml:Model xmlns:uml="u"><packagedElement xmi:type="uml:Class" xmi:id="C" name="A"><ownedAttribute xmi:id="P" name="x"><lowerValue value="3"/><upperValue value="1"/><type href="x#String"/></ownedAttribute></packagedElement></uml:Model></xmi:XMI>`);
    if (!parsed.ok) throw new Error("parse");
    expect(parsed.proposal.diagnostics.map((entry) => entry.code)).toEqual(["XMI_VERSION", "XMI_INVALID_MULTIPLICITY"]);
    expect(parsed.proposal.classes[0]!.attributes[0]).toEqual({ key: "P", name: "x", type: "String" });
    const empty = parseXmi('<xmi:XMI xmi:version="2.1"><uml:Model/></xmi:XMI>');
    expect(empty.ok && empty.proposal.diagnostics.map((entry) => entry.code)).toEqual(["XMI_EMPTY"]);
  });
});
