import test from "node:test";
import assert from "node:assert/strict";
import { loadSource } from "./load-source.mjs";
const { createCatalogClient } = await loadSource("../lib/rebrickable.ts");

test("successful requests are cached and cache is isolated by API key", async () => {
  let calls = 0;
  const client = createCatalogClient(async () => { calls++; return Response.json({ results: ["part"], next: null }); });
  assert.deepEqual(await client.list("/lego/colors/", "key1"), ["part"]);
  await client.list("/lego/colors/", "key1");
  assert.equal(calls, 1);
  await client.list("/lego/colors/", "key2");
  assert.equal(calls, 2);
});

test("simultaneous inventory requests share an in-flight response", async () => {
  let calls = 0;
  const client = createCatalogClient(async () => { calls++; await new Promise(resolve => setTimeout(resolve, 10)); return Response.json({ results: [] }); });
  await Promise.all([client.list("/lego/colors/", "key"),client.list("/lego/colors/", "key")]);
  assert.equal(calls, 1);
});

test("authorization never follows a pagination link outside Rebrickable", async () => {
  let calls = 0;
  const client = createCatalogClient(async () => { calls++; return Response.json({ results: [], next: "https://example.com/steal" }); });
  await assert.rejects(client.list("/lego/colors/", "key"), /Invalid Rebrickable/);
  assert.equal(calls, 1);
});

test("pagination preserves all pages and obeys the requested result bound", async () => {
  const client = createCatalogClient(async url => Response.json({ results: url.includes("page=2") ? [3,4] : [1,2], next: url.includes("page=2") ? null : "https://rebrickable.com/api/v3/lego/sets/?page=2" }));
  assert.deepEqual(await client.list("/lego/sets/", "key",3),[1,2,3]);
});

test("cancelled searches stop and rate-limit errors are not cached", async () => {
  let calls = 0;
  const client = createCatalogClient(async () => { calls++; return new Response("",{status:429}); });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(client.list("/lego/sets/", "key",100,controller.signal),{name:"AbortError"});
  assert.equal(calls,0);
  await assert.rejects(client.list("/lego/sets/", "key"),/too many requests/);
  await assert.rejects(client.list("/lego/sets/", "key"),/too many requests/);
  assert.equal(calls,2);
});
