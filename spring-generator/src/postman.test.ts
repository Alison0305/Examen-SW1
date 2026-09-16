import { describe, expect, it } from "vitest";
import { canonicalizePostmanCollection } from "./postman.js";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type Collection = { [key: string]: JsonValue };

const collection = (): Collection => ({
  info: { name: "Generated API", _postman_id: "11111111-1111-4111-8111-111111111111", schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
  item: [{
    name: "Pedidos",
    item: [{
      id: "22222222-2222-4222-8222-222222222222",
      name: "Create pedido",
      request: {
        method: "POST",
        header: [{ key: "Content-Type", value: "application/json", type: "text" }],
        url: { raw: "{{baseUrl}}/api/v1/pedido?page=0", path: ["api", "v1", "pedido"], query: [{ key: "page", value: "0", disabled: false }] },
        body: { mode: "raw", raw: '{"id":1,"activo":true,"cliente":{"nombre":"Ada"}}', options: { raw: { language: "json" } } },
      },
      response: [{
        id: "33333333-3333-4333-8333-333333333333",
        name: "Created",
        originalRequest: { method: "POST" },
        status: "Created",
        code: 201,
        header: [{ key: "Content-Type", value: "application/json" }],
        body: '{"id":1,"activo":true,"cliente":{"nombre":"Ada"}}',
      }],
    }],
  }],
});

const fingerprint = (value: Collection): string => canonicalizePostmanCollection(value);
const changed = (change: (value: Collection) => void): Collection => {
  const value = structuredClone(collection());
  change(value);
  return value;
};
const item = (value: Collection): Collection => (((value.item as JsonValue[])[0] as Collection).item as JsonValue[])[0] as Collection;
const request = (value: Collection): Collection => item(value).request as Collection;
const response = (value: Collection): Collection => (item(value).response as JsonValue[])[0] as Collection;

describe("Postman structural fingerprint", () => {
  it("normaliza exclusivamente UUID metadata y valores escalares de ejemplos permitidos", () => {
    const baseline = collection();
    const equivalent = changed((value) => {
      (value.info as Collection)._postman_id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
      item(value).id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
      (request(value).url as Collection).query = [{ key: "page", value: "99", disabled: false }];
      (request(value).body as Collection).raw = '{"id":42,"activo":false,"cliente":{"nombre":"Grace"}}';
      response(value).id = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
      response(value).body = '{"id":42,"activo":false,"cliente":{"nombre":"Grace"}}';
    });
    expect(fingerprint(equivalent)).toBe(fingerprint(baseline));

    const nonMetadataUuid = changed((value) => { (value.info as Collection).name = "11111111-1111-4111-8111-111111111111"; });
    expect(fingerprint(nonMetadataUuid)).not.toBe(fingerprint(baseline));
  });

  it.each([
    ["folder name", (value: Collection) => { ((value.item as JsonValue[])[0] as Collection).name = "Otro folder"; }],
    ["request name", (value: Collection) => { item(value).name = "Otro request"; }],
    ["HTTP method", (value: Collection) => { request(value).method = "PATCH"; }],
    ["URL path", (value: Collection) => { ((request(value).url as Collection).path as JsonValue[])[2] = "orden"; }],
    ["query key", (value: Collection) => { (((request(value).url as Collection).query as JsonValue[])[0] as Collection).key = "size"; }],
    ["query disabled state", (value: Collection) => { (((request(value).url as Collection).query as JsonValue[])[0] as Collection).disabled = true; }],
    ["relevant header", (value: Collection) => { (((request(value).header as JsonValue[])[0] as Collection).key = "Accept"); }],
    ["body mode", (value: Collection) => { (request(value).body as Collection).mode = "urlencoded"; }],
    ["request JSON property", (value: Collection) => { (request(value).body as Collection).raw = '{"id":1,"activo":true,"nuevo":"x","cliente":{"nombre":"Ada"}}'; }],
    ["request JSON property type", (value: Collection) => { (request(value).body as Collection).raw = '{"id":"1","activo":true,"cliente":{"nombre":"Ada"}}'; }],
    ["response status", (value: Collection) => { response(value).code = 200; }],
    ["response JSON property", (value: Collection) => { response(value).body = '{"id":1,"activo":true,"cliente":{"nombre":"Ada"},"nuevo":"x"}'; }],
    ["response JSON property type", (value: Collection) => { response(value).body = '{"id":"1","activo":true,"cliente":{"nombre":"Ada"}}'; }],
  ])("changes %s", (_description, change) => {
    expect(fingerprint(changed(change))).not.toBe(fingerprint(collection()));
  });
});
