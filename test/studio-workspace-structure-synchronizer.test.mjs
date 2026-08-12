import assert from "node:assert/strict";
import test from "node:test";
import { createWorkspaceStructureSynchronizer, planWorkspaceStructure } from "../studio/workspace-structure-synchronizer.mjs";

const documentModel = {
  sections: [
    { id: "metrics", components: [{ id: "revenue", type: "kpi", title: "收入", props: {} }, { id: "margin", type: "kpi", title: "毛利率", props: {} }] },
    { id: "trends", components: [{ id: "trend", type: "chart", title: "趋势", props: {} }] }
  ]
};
const layoutModel = {
  sections: [
    { id: "metrics", grouped: true, layout: "2", items: [{ id: "margin", span: 6 }, { id: "revenue", span: 6 }] },
    { id: "trends", grouped: false, layout: "responsive", items: [{ id: "trend", span: 12 }] }
  ]
};

test("plans creates, removals, cross-section moves, updates and stable layout order", () => {
  const existing = [
    { id: "revenue", sectionId: "trends", order: 0, span: 4, cardType: "kpi" },
    { id: "obsolete", sectionId: "metrics", order: 0, span: 12, cardType: "generic" },
    { id: "trend", sectionId: "trends", order: 1, span: 12, cardType: "generic" }
  ];
  const input = structuredClone({ document: documentModel, layout: layoutModel, existing });
  const plan = planWorkspaceStructure(input);
  assert.deepEqual(plan.create.map(({ id }) => id), ["margin"]);
  assert.deepEqual(plan.remove, ["obsolete"]);
  assert.deepEqual(plan.sections.map(({ id, grouped, layout, items }) => ({ id, grouped, layout, ids: items.map(({ id: itemId }) => itemId) })), [
    { id: "metrics", grouped: true, layout: "2", ids: ["margin", "revenue"] },
    { id: "trends", grouped: false, layout: "responsive", ids: ["trend"] }
  ]);
  assert(plan.move.some(({ id, sectionId, order }) => id === "revenue" && sectionId === "metrics" && order === 1));
  assert(plan.update.some(({ id, span }) => id === "revenue" && span === 6));
  assert(plan.update.some(({ id, cardType }) => id === "trend" && cardType === "chart"));
  assert.deepEqual(input, { document: documentModel, layout: layoutModel, existing });
});

test("appends document-only components after known layout items", () => {
  const plan = planWorkspaceStructure({
    document: { sections: [{ id: "one", components: [{ id: "a", type: "list" }, { id: "b", type: "table" }] }] },
    layout: { sections: [{ id: "one", layout: "responsive", items: [{ id: "b", span: 8 }, { id: "missing", span: 4 }] }] },
    existing: [{ id: "a", sectionId: "one", order: 0, span: 3, cardType: "generic" }]
  });
  assert.deepEqual(plan.sections[0].items.map(({ id, span }) => [id, span]), [["b", 8], ["a", 3]]);
});

test("DOM adapter applies removals, creation, order and binding without owning editor behavior", () => {
  const cards = new Map([
    ["revenue", { id: "revenue" }],
    ["obsolete", { id: "obsolete" }],
    ["trend", { id: "trend" }]
  ]);
  const containers = new Map([["metrics", []], ["trends", []]]);
  const events = [];
  const synchronizer = createWorkspaceStructureSynchronizer({
    listExisting: () => [
      { id: "revenue", sectionId: "trends", order: 0, span: 4, cardType: "kpi" },
      { id: "obsolete", sectionId: "metrics", order: 0, span: 12, cardType: "generic" },
      { id: "trend", sectionId: "trends", order: 1, span: 12, cardType: "chart" }
    ],
    beforeSynchronize: () => events.push("before"),
    findCard: (id) => cards.get(id),
    findSectionContainer: (id) => containers.get(id),
    createCard: (component) => {
      const card = { id: component.id };
      cards.set(component.id, card);
      events.push(`create:${component.id}`);
      return card;
    },
    removeCard: (card) => {
      cards.delete(card.id);
      events.push(`remove:${card.id}`);
    },
    prepareCard: (card, item) => Object.assign(card, { span: item.span, cardType: item.cardType }),
    appendCard: (container, card) => {
      containers.forEach((items) => {
        const index = items.indexOf(card.id);
        if (index >= 0) items.splice(index, 1);
      });
      container.push(card.id);
    },
    bindCard: (card) => events.push(`bind:${card.id}`)
  });
  const plan = synchronizer.synchronize(documentModel, layoutModel);
  assert.deepEqual(containers.get("metrics"), ["margin", "revenue"]);
  assert.deepEqual(containers.get("trends"), ["trend"]);
  assert.equal(cards.has("obsolete"), false);
  assert.equal(cards.get("margin").span, 6);
  assert.deepEqual(events.slice(0, 3), ["before", "remove:obsolete", "create:margin"]);
  assert.equal(plan.create[0].id, "margin");
});

test("DOM adapter creates, orders, prepares, and removes workspace sections", () => {
  const sections = new Map([
    ["obsolete", { id: "obsolete", cards: [] }],
    ["metrics", { id: "metrics", cards: [] }]
  ]);
  const sectionOrder = ["obsolete", "metrics"];
  const cards = new Map();
  const synchronizer = createWorkspaceStructureSynchronizer({
    listExisting: () => [],
    listExistingSections: () => sectionOrder.map((id) => ({ id })),
    findCard: (id) => cards.get(id),
    findSection: (id) => sections.get(id),
    createSection: ({ id }) => {
      const section = { id, cards: [] };
      sections.set(id, section);
      return section;
    },
    removeSection: ({ id }) => {
      sections.delete(id);
      sectionOrder.splice(sectionOrder.indexOf(id), 1);
    },
    appendSection: ({ id }) => {
      const index = sectionOrder.indexOf(id);
      if (index >= 0) sectionOrder.splice(index, 1);
      sectionOrder.push(id);
    },
    prepareSection: (section, model) => Object.assign(section, { title: model.title, subtitle: model.subtitle, grouped: model.grouped, layout: model.layout }),
    findSectionContainer: (id) => sections.get(id)?.cards,
    createCard: (component) => {
      const card = { id: component.id };
      cards.set(component.id, card);
      return card;
    },
    removeCard: ({ id }) => cards.delete(id),
    prepareCard: () => {},
    appendCard: (container, card) => container.push(card.id),
    bindCard: () => {}
  });

  synchronizer.synchronize(documentModel, layoutModel);
  assert.deepEqual(sectionOrder, ["metrics", "trends"]);
  assert.equal(sections.has("obsolete"), false);
  assert.deepEqual(sections.get("trends"), { id: "trends", cards: ["trend"], title: undefined, subtitle: "", grouped: false, layout: "responsive" });
  assert.deepEqual(sections.get("metrics").cards, ["margin", "revenue"]);
});
