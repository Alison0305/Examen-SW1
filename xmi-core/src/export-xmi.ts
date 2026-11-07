import { XMLBuilder } from "fast-xml-parser";
import type { CanonicalUmlModel, ImportDiagnostic, Multiplicity, UmlAttribute, UmlRelationship, UmlType } from "@examen-sw1/uml-core";

// XMI 2.1 export of the supported UML subset, following the shape Enterprise Architect produces.
// Ids derive from canonical ids, so exporting the same model twice yields identical documents.

export interface XmiExportOptions {
  modelName?: string;
}

export interface XmiExportResult {
  xml: string;
  diagnostics: ImportDiagnostic[];
}

type XmlNode = Record<string, unknown>;

export const xmiId = (canonicalId: string): string => `EAID_${canonicalId.replace(/-/g, "_")}`;

const UML_PRIMITIVE_HREF = "http://schema.omg.org/spec/UML/2.1/uml.xml#";
const PRIMITIVE_TYPE: Record<string, XmlNode> = {
  string: { "@_href": `${UML_PRIMITIVE_HREF}String` },
  integer: { "@_href": `${UML_PRIMITIVE_HREF}Integer` },
  boolean: { "@_href": `${UML_PRIMITIVE_HREF}Boolean` },
  number: { "@_href": `${UML_PRIMITIVE_HREF}Real` },
  // UML 2.1 has no date primitives; Enterprise Architect resolves these idrefs by name.
  date: { "@_xmi:idref": "EAnone_Date" },
  datetime: { "@_xmi:idref": "EAnone_DateTime" },
};

function typeNode(type: UmlType): XmlNode {
  return type.kind === "primitive" ? PRIMITIVE_TYPE[type.name]! : { "@_xmi:idref": xmiId(type.elementId) };
}

function multiplicityNodes(ownerId: string, multiplicity: Multiplicity | undefined): XmlNode {
  if (!multiplicity) return {};
  return {
    lowerValue: { "@_xmi:type": "uml:LiteralInteger", "@_xmi:id": `${ownerId}_lower`, "@_value": String(multiplicity.lower) },
    upperValue: { "@_xmi:type": "uml:LiteralUnlimitedNatural", "@_xmi:id": `${ownerId}_upper`, "@_value": multiplicity.upper === "unbounded" ? "*" : String(multiplicity.upper) },
  };
}

function attributeNode(attribute: UmlAttribute): XmlNode {
  const id = xmiId(attribute.id);
  return {
    "@_xmi:type": "uml:Property",
    "@_xmi:id": id,
    "@_name": attribute.name,
    "@_visibility": attribute.visibility,
    ...multiplicityNodes(id, attribute.multiplicity),
    type: typeNode(attribute.type),
  };
}

const AGGREGATION: Record<string, string> = { Association: "none", Aggregation: "shared", Composition: "composite" };

// Source is the whole in Aggregation/Composition; the aggregation kind goes on the end typed by the part.
function associationNode(relationship: UmlRelationship): XmlNode {
  const id = xmiId(relationship.id);
  const sourceEnd = `EAID_src_${relationship.id.replace(/-/g, "_")}`;
  const targetEnd = `EAID_dst_${relationship.id.replace(/-/g, "_")}`;
  const end = (endId: string, typeId: string, multiplicity: Multiplicity | undefined, aggregation: string): XmlNode => ({
    "@_xmi:type": "uml:Property",
    "@_xmi:id": endId,
    "@_visibility": "public",
    "@_association": id,
    "@_aggregation": aggregation,
    ...multiplicityNodes(endId, multiplicity),
    type: { "@_xmi:idref": xmiId(typeId) },
  });
  return {
    "@_xmi:type": "uml:Association",
    "@_xmi:id": id,
    ...(relationship.name ? { "@_name": relationship.name } : {}),
    "@_visibility": "public",
    memberEnd: [{ "@_xmi:idref": sourceEnd }, { "@_xmi:idref": targetEnd }],
    ownedEnd: [
      end(sourceEnd, relationship.sourceId, relationship.sourceMultiplicity, "none"),
      end(targetEnd, relationship.targetId, relationship.targetMultiplicity, AGGREGATION[relationship.type] ?? "none"),
    ],
  };
}

export function exportXmi(model: CanonicalUmlModel, options: XmiExportOptions = {}): XmiExportResult {
  const diagnostics: ImportDiagnostic[] = [];
  const generalizations = model.relationships.filter((relationship) => relationship.type === "Generalization");
  const associations = model.relationships.filter((relationship) => relationship.type !== "Generalization");

  const classNodes = model.classes.map((umlClass): XmlNode => {
    const parents = generalizations.filter((relationship) => relationship.sourceId === umlClass.id);
    if (umlClass.operations.length > 0) {
      diagnostics.push({ severity: "info", code: "XMI_OPERATIONS_NOT_EXPORTED", message: `Las operaciones de "${umlClass.name}" no se exportan.`, key: umlClass.id });
    }
    return {
      "@_xmi:type": "uml:Class",
      "@_xmi:id": xmiId(umlClass.id),
      "@_name": umlClass.name,
      "@_visibility": umlClass.visibility,
      ...(umlClass.attributes.length > 0 ? { ownedAttribute: umlClass.attributes.map(attributeNode) } : {}),
      ...(parents.length > 0 ? { generalization: parents.map((relationship) => ({ "@_xmi:type": "uml:Generalization", "@_xmi:id": xmiId(relationship.id), "@_general": xmiId(relationship.targetId) })) } : {}),
    };
  });
  const enumerationNodes = model.enumerations.map((enumeration): XmlNode => ({
    "@_xmi:type": "uml:Enumeration",
    "@_xmi:id": xmiId(enumeration.id),
    "@_name": enumeration.name,
    "@_visibility": enumeration.visibility,
    ...(enumeration.literals.length > 0 ? { ownedLiteral: enumeration.literals.map((literal, index) => ({ "@_xmi:type": "uml:EnumerationLiteral", "@_xmi:id": `${xmiId(enumeration.id)}_lit${index}`, "@_name": literal })) } : {}),
  }));
  for (const relationship of associations) {
    if (relationship.associationClassId) {
      diagnostics.push({ severity: "info", code: "XMI_ASSOCIATION_CLASS_FLATTENED", message: "La clase intermedia N:M se exporta como clase normal.", key: relationship.id });
    }
  }

  const document = {
    "?xml": { "@_version": "1.0", "@_encoding": "UTF-8" },
    "xmi:XMI": {
      "@_xmi:version": "2.1",
      "@_xmlns:uml": "http://schema.omg.org/spec/UML/2.1",
      "@_xmlns:xmi": "http://schema.omg.org/spec/XMI/2.1",
      "xmi:Documentation": { "@_exporter": "Examen SW1 UML Studio", "@_exporterVersion": "1.0" },
      "uml:Model": {
        "@_xmi:type": "uml:Model",
        "@_name": "EA_Model",
        "@_visibility": "public",
        packagedElement: {
          "@_xmi:type": "uml:Package",
          "@_xmi:id": "EAPK_ExamenSW1_Model",
          "@_name": options.modelName?.trim() || "Modelo",
          "@_visibility": "public",
          packagedElement: [...classNodes, ...enumerationNodes, ...associations.map(associationNode)],
        },
      },
    },
  };
  const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: "@_", format: true, indentBy: "  ", suppressEmptyNode: true });
  return { xml: builder.build(document) as string, diagnostics };
}
