function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function cardType(componentType) {
  if (componentType === "kpi") return "kpi";
  if (componentType === "chart") return "chart";
  return "generic";
}

function orderedComponents(section, layoutSection) {
  const componentById = new Map(section.components.map((component) => [component.id, component]));
  const layoutIds = (layoutSection?.items || []).map(({ id }) => id).filter((id) => componentById.has(id));
  const seen = new Set(layoutIds);
  return [...layoutIds, ...section.components.map(({ id }) => id).filter((id) => !seen.has(id))]
    .map((id) => componentById.get(id));
}

export function planWorkspaceStructure({ document: documentModel, layout: layoutModel, existing = [], existingSections = [] }) {
  const existingById = new Map(existing.map((card, index) => [card.id, { ...card, order: card.order ?? index }]));
  const desiredIds = new Set();
  const sections = [];
  const existingSectionIds = new Set(existingSections.map(({ id }) => id));
  const create = [];
  const move = [];
  const update = [];

  for (const section of documentModel?.sections || []) {
    const layoutSection = (layoutModel?.sections || []).find(({ id }) => id === section.id);
    const spanById = new Map((layoutSection?.items || []).map(({ id, span }) => [id, span]));
    const items = orderedComponents(section, layoutSection).map((component, order) => {
      desiredIds.add(component.id);
      const current = existingById.get(component.id);
      const desired = {
        id: component.id,
        sectionId: section.id,
        order,
        span: Number(spanById.get(component.id)) || Number(current?.span) || 12,
        cardType: cardType(component.type),
        component: clone(component)
      };
      if (!current) create.push(clone(desired));
      else {
        if (current.sectionId !== desired.sectionId || current.order !== desired.order) move.push(clone(desired));
        if (Number(current.span) !== desired.span || current.cardType !== desired.cardType) update.push(clone(desired));
      }
      return desired;
    });
    sections.push({
      id: section.id,
      title: section.title,
      subtitle: section.subtitle || "",
      create: !existingSectionIds.has(section.id),
      grouped: layoutSection?.grouped === true,
      layout: layoutSection?.layout ?? null,
      items
    });
  }

  return {
    create,
    move,
    update,
    remove: existing.filter(({ id }) => !desiredIds.has(id)).map(({ id }) => id),
    removeSections: existingSections.filter(({ id }) => !sections.some((section) => section.id === id)).map(({ id }) => id),
    sections: clone(sections)
  };
}

export function createWorkspaceStructureSynchronizer({
  listExisting,
  listExistingSections = () => [],
  beforeSynchronize = () => {},
  findCard,
  findSectionContainer,
  findSection = null,
  createSection = null,
  removeSection = null,
  appendSection = null,
  prepareSection = null,
  createCard,
  removeCard,
  appendCard,
  prepareCard,
  bindCard
}) {
  return Object.freeze({
    synchronize(documentModel, layoutModel) {
      if (!documentModel?.sections || !layoutModel?.sections) return null;
      beforeSynchronize();
      const plan = planWorkspaceStructure({ document: documentModel, layout: layoutModel, existing: listExisting(), existingSections: listExistingSections() });
      plan.remove.forEach((id) => {
        const card = findCard(id);
        if (card) removeCard(card);
      });
      if (findSection && removeSection) plan.removeSections.forEach((id) => {
        const section = findSection(id);
        if (section) removeSection(section);
      });
      plan.sections.forEach((section) => {
        if (findSection && createSection) {
          let sectionElement = findSection(section.id);
          if (!sectionElement) sectionElement = createSection(section);
          if (!sectionElement) return;
          if (prepareSection) prepareSection(sectionElement, section);
          if (appendSection) appendSection(sectionElement);
        }
        const container = findSectionContainer(section.id);
        if (!container) return;
        const sectionModel = { id: section.id, components: section.items.map(({ component }) => component) };
        section.items.forEach((item) => {
          let card = findCard(item.id);
          if (!card) card = createCard(item.component, sectionModel);
          if (!card) return;
          prepareCard(card, item);
          appendCard(container, card);
          bindCard(card);
        });
      });
      return plan;
    }
  });
}
