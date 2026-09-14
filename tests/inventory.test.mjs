import test from "node:test";
import assert from "node:assert/strict";
import { loadSource } from "./load-source.mjs";

const core = await loadSource("../lib/brickcheck.ts");
const { createPartMatcher, parseQuantityEntry, resolveFound } = await loadSource("../lib/part-search.ts");
const { previewPosition } = await loadSource("../lib/preview-position.ts");
const part = (overrides = {}) => ({ id: "p1", partNum: "3069b", name: "Tile 1 x 2 with Groove", colorName: "Black", colorRgb: "000000", colorId: 0, imageUrl: "https://cdn.rebrickable.com/media/parts/ldraw/0/3069b.png", quantity: 10, found: 3, ...overrides });
const set = (overrides = {}) => ({ id: "set1", setNum: "76239-1", name: "Batmobile", year: 2021, theme: "Batman", setImage: "", setImages: [], catalogParts: 10, parts: [part()], minifigs: [], minifigMode: "assembled", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-02T00:00:00Z", ...overrides });

test("quantity entry supports totals, additions, subtraction and zero", () => {
  assert.equal(parseQuantityEntry(" 12 "), 12);
  assert.equal(parseQuantityEntry("0"), 0);
  assert.deepEqual(parseQuantityEntry("+5"), { delta: 5 });
  assert.deepEqual(parseQuantityEntry("−2"), { delta: -2 });
  for (const entry of ["", "1.5", "5foo", "+", "Infinity", "1e3", "999999999999999999"]) assert.equal(parseQuantityEntry(entry), null);
});

test("quantity updates are bounded and relative updates use the latest total", () => {
  assert.equal(resolveFound(2, 10, 7), 7);
  assert.equal(resolveFound(2, 10, { delta: 5 }), 7);
  assert.equal(resolveFound(8, 10, { delta: 5 }), 10);
  assert.equal(resolveFound(2, 10, { delta: -9 }), 0);
  assert.equal(resolveFound(5, 10, NaN), 5);
  let found = 0;
  for (let i = 0; i < 100; i++) found = resolveFound(found, 100, { delta: 1 });
  assert.equal(found, 100);
});

test("inventory search accepts dimensions, reordered words, color and IDs", () => {
  for (const query of ["tile 1x2", "1 x 2 tile", "1×2 BLACK", "black groove 1x2", "3069b", ""]) assert.equal(createPartMatcher(query)(part()), true, query);
  assert.equal(createPartMatcher("1x6")(part({ name: "Plate 1 x 6" })), true);
  assert.equal(createPartMatcher("2x6 brick")(part({ name: "Brick 2 x 6" })), true);
  assert.equal(createPartMatcher("tile 1x2")(part({ name: "Tile 1 x 20" })), false);
  assert.equal(createPartMatcher("1x2")(part({ name: "Brick 11 x 2" })), false);
  assert.equal(createPartMatcher("red tile")(part()), false);
  assert.equal(createPartMatcher("1x2")(part({ name: "Brick 1 x 2 x 3" })), true);
});

test("piece size estimates dimensions rather than unrelated numbers", () => {
  assert.equal(core.pieceSizeScore(part({ name: "Bracket 1 x 2 - 1 x 2" })), 2);
  assert.equal(core.pieceSizeScore(part({ name: "Brick 1 x 2 x 1 1/3" })), 8/3);
  assert.equal(core.pieceSizeScore(part({ name: "Technic connector with 4 holes" })), 0);
  assert.equal(core.pieceSizeScore(part({ name: "Plate 1/2 x 2" })), 1);
});

test("sorting is reversible, leaves the source intact and puts unknown sizes last", () => {
  const items = [part({ partNum: "10", name: "Brick 2 x 6", quantity: 2 }), part({ partNum: "2", name: "Tile 1 x 2", quantity: 5 }), part({ partNum: "1", name: "Connector", quantity: 3 })];
  assert.deepEqual(core.sortParts(items, "part", "asc").map(p => p.partNum), ["1", "2", "10"]);
  assert.deepEqual(core.sortParts(items, "quantity", "desc").map(p => p.quantity), [5, 3, 2]);
  assert.deepEqual(core.sortParts(items, "size", "asc").map(p => p.partNum), ["2", "10", "1"]);
  assert.deepEqual(core.sortParts(items, "size", "desc").map(p => p.partNum), ["10", "2", "1"]);
  assert.equal(items[0].partNum, "10");
});

test("grouping never mutates parts and missing items come before completed ones", () => {
  const items = [part({ found: 10 }), part({ id: "p2", found: 0 })];
  const groups = core.groupParts(items, "status", "part", "asc");
  assert.deepEqual(groups.map(g => g.label), ["Missing", "Completed"]);
  assert.equal(groups[1].parts[0], items[0]);
});

test("progress excludes spares and only shows 100% when actually complete", () => {
  assert.deepEqual(core.getProgress(set({ parts: [part(), part({ spare: true, found: 0, quantity: 50 })] })), { required: 10, found: 3, percent: 30 });
  assert.equal(core.getProgress(set({ parts: [part({ quantity: 1000, found: 999 })] })).percent, 99);
  assert.equal(core.getProgress(set({ parts: [part({ quantity: 10, found: 10 })] })).percent, 100);
});

test("JSON round-trip preserves progress, identities, timestamps and gallery", () => {
  const original = set({ setImages: ["https://example.com/set.jpg"] });
  const normalized = core.normaliseImportedSet(JSON.parse(JSON.stringify(original)));
  assert.equal(normalized.id, original.id);
  assert.equal(normalized.updatedAt, original.updatedAt);
  assert.equal(normalized.parts[0].found, 3);
  assert.deepEqual(normalized.setImages, original.setImages);
  assert.deepEqual(core.normaliseImportedSet(JSON.parse(JSON.stringify(normalized))), normalized);
});

test("legacy repeated minifig components migrate once, preserving found counts", () => {
  const fig = { id: "fig1", figNum: "fig-1", name: "Batman", quantity: 2, found: 0, imageUrl: "", parts: [part({ quantity: 1, found: 1 })] };
  const migrated = core.normaliseImportedSet(set({ minifigMode: "parts", minifigs: [fig] }));
  assert.equal(migrated.minifigs[0].parts[0].quantity, 2);
  assert.equal(migrated.minifigs[0].parts[0].found, 1);
  assert.equal(core.normaliseImportedSet(migrated).minifigs[0].parts[0].quantity, 2);
  assert.equal(core.getProgress(migrated).required, 12);
});

test("MOC imports retain exact color images and reject dangerous links", () => {
  const moc = core.normaliseImportedSet(set({ setNum: "MOC-262378", parts: [part({ imageUrl: "https://example.com/wrong.png", colorId: 4 })], setUrl: "javascript:alert(1)" }));
  assert.equal(moc.parts[0].imageUrl, "https://cdn.rebrickable.com/media/parts/ldraw/4/3069b.png");
  assert.equal(moc.setUrl, undefined);
  assert.throws(() => core.normaliseImportedSet(set({ parts: [null] })), /part number/);
  assert.equal(core.normaliseImportedSet(null), null);
});

test("MOC ID and URL parsing, CSV grouping and spares stay compatible", () => {
  assert.equal(core.parseMocReference("moc-262378").id, "MOC-262378");
  assert.equal(core.parseMocReference("https://rebrickable.com/mocs/MOC-262378/brickbarfalot/the-batpod-lotdk/#details").suggestedName, "The batpod lotdk");
  const csv = '\ufeffPart,Color,Quantity,Is Spare\n3001,0,4,False\n3001,0,3,False\n3001,0,1,True';
  assert.deepEqual(core.parseMocInventoryCsv(csv).map(p => [p.quantity, p.spare]), [[7,false],[1,true]]);
  assert.equal(core.parseMocInventoryCsv('Part;Color;Quantity\r\n"3001";4;2')[0].colorId, 4);
  assert.throws(() => core.parseMocInventoryCsv("foo,bar\na,b"), /Rebrickable CSV/);
});

test("catalog keeps real sets and rejects merchandise", () => {
  for (const name of ["Batman Costume", "Batman Plush Clip", "Batman Activity Book"]) assert.equal(core.isBrickBuiltSet({ set_num: "12345-1", num_parts: 4, name }), false);
  assert.equal(core.isBrickBuiltSet({ set_num: "76239-1", num_parts: 422, name: "Batmobile Tumbler" }), true);
});

test("previews fit all viewport edges, including narrow and short windows", () => {
  for (const [width, height] of [[1920,1080],[800,600],[320,568],[568,320]]) {
    for (const [left,top] of [[0,0],[width-80,0],[0,height-80],[width-80,height-80],[width/2,height/2]]) {
      const bounds = { left, top, width: 80, height: 80, right: left+80, bottom: top+80 };
      const pos = previewPosition(bounds,width,height);
      assert.ok(pos.left >= 0 && pos.top >= 0);
      assert.ok(pos.left + pos.size <= width && pos.top + pos.size <= height, JSON.stringify(pos));
    }
  }
});
