import { acceptGenerationBundle, acceptPlan, createGenerationRun, prepareGenerationPreview, startPlanning } from "./generation-pipeline.mjs";
import { applyCommandBatch, ContractError, migrateWorkspace } from "./workspace-core.mjs";

const domainProfiles = [
  {
    match: /销售|商机|渠道|收入|客户/,
    title: "销售经营看板",
    subtitle: "收入、商机转化、渠道趋势与重点客户风险",
    metrics: [
      ["priority-customers", "重点客户", "128 家", "较上期 +12.4%"],
      ["opportunity-value", "机会金额", "2,460 万", "较上期 +8.2%"],
      ["conversion-rate", "转化率", "32.8%", "较上期 +3.6%"]
    ],
    trendTitle: "机会金额趋势",
    rankingTitle: "来源表现 Top 5",
    rankingItems: ["核心渠道", "自然流量", "合作伙伴", "内容触达", "客户推荐"],
    healthTitle: "重点客户健康度",
    riskTitle: "风险事项"
  },
  {
    match: /运营|增长|流量|活跃|留存/,
    title: "产品运营看板",
    subtitle: "活跃、转化、留存趋势与异常事项",
    metrics: [
      ["priority-customers", "月活用户", "86,420", "较上期 +9.6%"],
      ["opportunity-value", "新增用户", "12,680", "较上期 +14.2%"],
      ["conversion-rate", "核心转化率", "18.6%", "较上期 +1.8%"]
    ],
    trendTitle: "活跃用户趋势",
    rankingTitle: "渠道贡献 Top 5",
    rankingItems: ["自然访问", "内容活动", "合作渠道", "用户推荐", "付费投放"],
    healthTitle: "核心功能健康度",
    riskTitle: "运营异常"
  },
  {
    match: /项目|交付|研发|迭代|进度/,
    title: "项目交付看板",
    subtitle: "交付进度、质量、资源与风险概览",
    metrics: [
      ["priority-customers", "进行中项目", "18 个", "本周新增 2 个"],
      ["opportunity-value", "按期交付率", "91.3%", "较上期 +2.1%"],
      ["conversion-rate", "缺陷关闭率", "87.6%", "较上期 +4.4%"]
    ],
    trendTitle: "里程碑完成趋势",
    rankingTitle: "项目进度 Top 5",
    rankingItems: ["核心平台升级", "移动端迭代", "数据治理", "客户门户", "质量专项"],
    healthTitle: "项目健康度",
    riskTitle: "交付风险"
  }
];

const explicitChartTypeRules = [
  ["combo-bar-line", /柱(?:状)?图.{0,8}(?:叠加|加上|搭配|和).{0,8}折线图|折线图.{0,8}(?:叠加|加上|搭配|和).{0,8}柱(?:状)?图|柱线(?:复合|组合)图|组合图|复合图|双轴图|combo\s*(?:bar|column)\s*[-+&/]\s*line/i],
  ["data-table", /数据表|明细表|表格图表|data\s*table/i],
  ["bullet", /子弹图|目标达成图|bullet\s*chart/i],
  ["gauge", /仪表盘图?|进度仪表|gauge\s*chart/i],
  ["radar", /雷达图|蛛网图|radar\s*chart/i],
  ["funnel", /漏斗图|转化漏斗|funnel\s*chart/i],
  ["time-series", /时序图|时间序列图|time\s*series/i],
  ["rose", /玫瑰图|南丁格尔玫瑰图|rose\s*chart/i],
  ["sector-pie", /实心饼图|饼图|pie\s*chart/i],
  ["percent-stacked-horizontal-bar", /百分比堆叠条图|百分百堆叠条图|100%\s*堆叠条图/i],
  ["stacked-horizontal-bar", /堆叠条图|堆积条图|stacked\s*horizontal\s*bar/i],
  ["grouped-horizontal-bar", /分组条图|多层条图|并列条图|grouped\s*horizontal\s*bar/i],
  ["diverging-bar", /双向条图|双向条形图|人口金字塔|diverging\s*bar/i],
  ["ranking-bar", /排名图|排行图|榜单图|ranking\s*bar/i],
  ["gantt", /甘特图|gantt/i],
  ["percent-stacked-bar", /百分比堆叠柱图|百分百堆叠柱图|100%\s*堆叠|percent(?:age)?\s*stacked/i],
  ["stacked-bar", /堆叠柱图|堆积柱图|stacked\s*bar/i],
  ["grouped-bar", /分组柱图|多层柱图|并列柱图|簇状柱图|grouped\s*bar/i],
  ["histogram", /直方图|histogram/i],
  ["pie", /环图|环形图|圆环图|甜甜圈图|donut/i],
  ["area", /面积图|area\s*chart/i],
  ["horizontal-bar", /基础条图|横向条形图|横向柱状图|条形图|horizontal\s*bar/i],
  ["bar", /柱状图|柱形图|bar\s*chart/i],
  ["line", /折线图|曲线图|line\s*chart/i]
];

const semanticChartTypeRules = [
  ["combo-bar-line", /柱线复合|柱线组合|柱状.{0,8}折线|折线.{0,8}柱状|双指标.{0,8}(?:柱|折线)|双轴/],
  ["data-table", /精确值|多字段对照|明细数据|逐行查看/],
  ["bullet", /实际.{0,6}目标|目标.{0,6}实际|绩效区间|目标达成对比/],
  ["gauge", /单个(?:完成率|达成率|健康分|风险等级|目标进度)|(?:完成率|达成率|健康分|风险等级|目标进度).{0,8}(?:区间|阈值|目标)/],
  ["radar", /能力模型|能力画像|多维对比|指标画像/],
  ["funnel", /转化路径|阶段流失|销售漏斗|逐层转化/],
  ["time-series", /时间轴|监控趋势|阈值趋势|按时间戳/],
  ["gantt", /项目排期|任务排期|时间进度|里程碑计划/],
  ["diverging-bar", /正负对比|两侧对比|人口结构/],
  ["ranking-bar", /排行|排名|Top\s*\d+|榜单/],
  ["percent-stacked-bar", /各分类.*占比|内部占比|构成比例对比/],
  ["stacked-bar", /总量.*构成|构成.*总量|累计构成/],
  ["grouped-bar", /多系列对比|同类.*对比|分组对比/],
  ["histogram", /频数分布|频率分布|区间分布|连续数值分布/],
  ["pie", /占比|构成|份额/],
  ["horizontal-bar", /排行|排名|横向对比|长标签/],
  ["bar", /分类对比|分布/],
  ["area", /累计趋势|累计变化|规模趋势|总量变化/],
  ["line", /趋势|走势|时间序列|变化/]
];

export function inferChartType(prompt) {
  for (const [type, pattern] of explicitChartTypeRules) if (pattern.test(prompt)) return type;
  for (const [type, pattern] of semanticChartTypeRules) if (pattern.test(prompt)) return type;
  return "line";
}

function requestedRefinementChartType(prompt) {
  for (const [type, pattern] of explicitChartTypeRules) if (pattern.test(prompt)) return type;
  if (!/(?:改成|换成|使用|用|调整为|展示为|显示为)/.test(prompt)) return null;
  for (const [type, pattern] of semanticChartTypeRules) if (pattern.test(prompt)) return type;
  return null;
}

function requestedCopy(prompt, field) {
  const labels = field === "title" ? "(?:卡片)?标题" : field === "subtitle" ? "副标题" : "(?:摘要|正文|内容)";
  const match = prompt.match(new RegExp(`${labels}(?:改为|换成|设为|修改为|写成)[“‘\\"']?([^。；，\\n”’\\"']{1,160})`));
  return match?.[1]?.trim() || null;
}

function locateComponent(workspace, componentId) {
  for (const [sectionIndex, section] of workspace.document?.sections?.entries() ?? []) {
    const componentIndex = section.components.findIndex(({ id }) => id === componentId);
    if (componentIndex >= 0) return { section, sectionIndex, component: section.components[componentIndex], componentIndex };
  }
  return null;
}

function locateSection(workspace, sectionId) {
  const sectionIndex = workspace.document?.sections?.findIndex(({ id }) => id === sectionId) ?? -1;
  const layoutSectionIndex = workspace.layout?.sections?.findIndex(({ id }) => id === sectionId) ?? -1;
  if (sectionIndex < 0 || layoutSectionIndex < 0) return null;
  return {
    section: workspace.document.sections[sectionIndex],
    sectionIndex,
    layoutSection: workspace.layout.sections[layoutSectionIndex],
    layoutSectionIndex
  };
}

function locateLayoutItem(workspace, sectionId, componentId) {
  const sectionIndex = workspace.layout.sections.findIndex(({ id }) => id === sectionId);
  if (sectionIndex < 0) return null;
  const section = workspace.layout.sections[sectionIndex];
  const itemIndex = section.items.findIndex(({ id }) => id === componentId);
  return itemIndex < 0 ? null : { section, sectionIndex, item: section.items[itemIndex], itemIndex };
}

function requestedStructureAction(prompt) {
  if (/(?:删除|移除)(?:当前|这张|该|这个)?(?:卡片|模块|图表|指标卡)|(?:当前|这张|该|这个)(?:卡片|模块|图表|指标卡)(?:删除|移除)/.test(prompt)) return "delete";
  if (/(?:新增|添加|再加|插入).{0,8}(?:同类|同样|一样)(?:卡片|模块)?/.test(prompt)) return "add-similar";
  if (/(?:复制|拷贝)(?:当前|这张|该|这个)?(?:卡片|模块|图表|指标卡)?|创建.{0,4}副本/.test(prompt)) return "duplicate";
  return null;
}

function requestedLayoutSpan(prompt) {
  if (/整行|全宽|撑满|12\s*列/.test(prompt)) return 12;
  if (/半宽|一半|6\s*列/.test(prompt)) return 6;
  if (/三分之二|8\s*列/.test(prompt)) return 8;
  if (/三分之一|4\s*列/.test(prompt)) return 4;
  if (/四分之一|3\s*列/.test(prompt)) return 3;
  return null;
}

function requestedMoveDirection(prompt) {
  if (/前移|向前|往前|左移|上移/.test(prompt)) return -1;
  if (/后移|向后|往后|右移|下移/.test(prompt)) return 1;
  return 0;
}

function uniqueComponentId(workspace, targetId, suffix) {
  const ids = new Set(workspace.document.sections.flatMap(({ components }) => components.map(({ id }) => id)));
  const stem = `${targetId}-${suffix}`.slice(0, 92).replace(/-+$/g, "");
  let candidate = stem;
  let index = 2;
  while (ids.has(candidate)) candidate = `${stem}-${index++}`;
  return candidate;
}

function uniqueSectionId(workspace, stem = "section") {
  const ids = new Set(workspace.document.sections.map(({ id }) => id));
  let candidate = stem;
  let index = 2;
  while (ids.has(candidate)) candidate = `${stem}-${index++}`;
  return candidate;
}

function requestedSectionAction(prompt) {
  if (/(?:删除|移除)(?:当前|这个|该)?分区|(?:当前|这个|该)分区(?:删除|移除)/.test(prompt)) return "delete";
  if (/(?:新增|添加|插入|再加).{0,8}(?:分区|章节)|(?:分区|章节).{0,8}(?:新增|添加|插入)/.test(prompt)) return "add";
  return null;
}

function sanitizeControlsAfterSectionRemoval(workspace, section) {
  const removedIds = new Set([section.id, ...section.components.map(({ id }) => id)]);
  const controls = structuredClone(workspace.document.controls ?? []);
  const removedFilterIds = [];
  for (let index = controls.length - 1; index >= 0; index -= 1) {
    const control = controls[index];
    if (control.type === "filter-bar") {
      control.props.targets = control.props.targets.filter((id) => !removedIds.has(id));
      if (!control.props.targets.length) {
        removedFilterIds.push(...control.props.controls.map(({ id }) => id));
        controls.splice(index, 1);
      }
    } else if (control.type === "view-tabs") {
      control.props.items = control.props.items
        .map((item) => ({ ...item, sectionIds: item.sectionIds.filter((id) => id !== section.id) }))
        .filter(({ sectionIds }) => sectionIds.length);
      if (!control.props.items.length) controls.splice(index, 1);
      else if (!control.props.items.some(({ id }) => id === control.props.defaultValue)) control.props.defaultValue = control.props.items[0].id;
    }
  }
  return { controls, removedFilterIds };
}

function createDeterministicSectionRefinement(input, baseline, { runId, now }) {
  const target = locateSection(baseline, input.scope.id);
  if (!target) throw new ContractError("Refinement target was not found", [{ path: "/request/scope/id", code: "reference", message: "Target section does not exist in the current workspace" }]);
  const operations = [];
  const sectionPath = `/document/sections/${target.sectionIndex}`;
  const action = requestedSectionAction(input.prompt);
  const requestedTitle = requestedCopy(input.prompt, "title");
  let operationLabel = "修改";
  let addedSection = null;

  if (action === "delete") {
    if (baseline.document.sections.length <= 1) {
      throw new ContractError("Cannot delete the last section", [{ path: "/document/sections", code: "minimum", message: "A workspace must keep at least one section" }]);
    }
    const { controls, removedFilterIds } = sanitizeControlsAfterSectionRemoval(baseline, target.section);
    if (JSON.stringify(controls) !== JSON.stringify(baseline.document.controls ?? [])) {
      operations.push({ op: baseline.document.controls === undefined ? "set" : "replace", path: "/document/controls", value: controls, reason: "清理失效分区控制范围" });
    }
    for (const filterId of removedFilterIds) {
      if (Object.hasOwn(baseline.interactions?.filters ?? {}, filterId)) operations.push({ op: "unset", path: `/interactions/filters/${filterId}`, reason: "清理失效筛选状态" });
    }
    const activeViewIds = new Set(controls.filter(({ type }) => type === "view-tabs").flatMap(({ props }) => props.items.map(({ id }) => id)));
    if (baseline.interactions?.activeView && !activeViewIds.has(baseline.interactions.activeView)) {
      const fallbackView = controls.find(({ type }) => type === "view-tabs")?.props.defaultValue;
      operations.push(fallbackView
        ? { op: "replace", path: "/interactions/activeView", value: fallbackView, reason: "切换到有效视图" }
        : { op: "unset", path: "/interactions/activeView", reason: "清理失效视图状态" });
    }
    for (const field of ["sectionIcons", "sectionSubtitles"]) {
      if (Object.hasOwn(baseline.theme[field] ?? {}, target.section.id)) operations.push({ op: "unset", path: `/theme/${field}/${target.section.id}`, reason: "清理分区视觉设置" });
    }
    for (const component of target.section.components) {
      if (Object.hasOwn(baseline.theme.cardOverrides ?? {}, component.id)) operations.push({ op: "unset", path: `/theme/cardOverrides/${component.id}`, reason: "清理卡片视觉设置" });
      if (Object.hasOwn(baseline.resources?.charts ?? {}, component.id)) operations.push({ op: "unset", path: `/resources/charts/${component.id}`, reason: "清理图表资源" });
    }
    const removedComponentIds = new Set(target.section.components.map(({ id }) => id));
    if (baseline.layout.canvasOrder?.some((id) => removedComponentIds.has(id))) {
      operations.push({ op: "replace", path: "/layout/canvasOrder", value: baseline.layout.canvasOrder.filter((id) => !removedComponentIds.has(id)), reason: "从画布顺序移除分区组件" });
    }
    operations.push(
      { op: "remove", path: `/layout/sections/${target.layoutSectionIndex}`, reason: "删除分区布局" },
      { op: "remove", path: sectionPath, reason: "删除分区" }
    );
    operationLabel = "删除";
  } else if (action === "add") {
    if (baseline.document.sections.length >= 30) throw new ContractError("Section limit reached", [{ path: "/document/sections", code: "limit", message: "A workspace can contain at most 30 sections" }]);
    const sectionId = uniqueSectionId(baseline, "ai-section");
    const componentId = uniqueComponentId(baseline, `${sectionId}-note`, "content");
    const title = requestedTitle || "补充说明";
    addedSection = { id: sectionId, title, components: [{ id: componentId, type: "text", title: "说明", props: { body: "请在这里补充本分区的业务说明。" } }] };
    const layoutSection = { id: sectionId, grouped: false, span: 12, layout: "responsive", items: [{ id: componentId, span: 12 }] };
    operations.push(
      { op: "insert", path: `/document/sections/${target.sectionIndex + 1}`, value: addedSection, reason: "在当前分区后新增说明分区" },
      { op: "insert", path: `/layout/sections/${target.layoutSectionIndex + 1}`, value: layoutSection, reason: "建立新分区布局" }
    );
    if (baseline.layout.canvasOrder) operations.push({ op: "replace", path: "/layout/canvasOrder", value: [...baseline.layout.canvasOrder, componentId], reason: "加入画布顺序" });
    operationLabel = "新增";
  } else {
    if (requestedTitle && requestedTitle !== target.section.title) operations.push({ op: "replace", path: `${sectionPath}/title`, value: requestedTitle, reason: "改写分区标题" });
    const removesSubtitle = /(?:去掉|隐藏|删除).{0,6}(?:分区)?副标题|(?:分区)?副标题.{0,6}(?:去掉|隐藏|删除)/.test(input.prompt);
    const subtitle = removesSubtitle ? "" : requestedCopy(input.prompt, "subtitle");
    if (subtitle !== null && subtitle !== (target.section.subtitle ?? "")) operations.push({ op: target.section.subtitle === undefined ? "set" : "replace", path: `${sectionPath}/subtitle`, value: subtitle, reason: removesSubtitle ? "隐藏分区副标题" : "改写分区副标题" });
    const direction = requestedMoveDirection(input.prompt);
    if (direction) {
      const destination = target.sectionIndex + direction;
      const layoutDestination = target.layoutSectionIndex + direction;
      if (destination < 0 || destination >= baseline.document.sections.length || layoutDestination < 0 || layoutDestination >= baseline.layout.sections.length) {
        throw new ContractError("Section cannot move farther", [{ path: "/request/prompt", code: "boundary", message: direction < 0 ? "The selected section is already first" : "The selected section is already last" }]);
      }
      operations.push(
        { op: "move", from: sectionPath, path: `/document/sections/${destination}`, reason: direction < 0 ? "分区前移" : "分区后移" },
        { op: "move", from: `/layout/sections/${target.layoutSectionIndex}`, path: `/layout/sections/${layoutDestination}`, reason: direction < 0 ? "分区布局前移" : "分区布局后移" }
      );
      const movedIds = new Set(target.section.components.map(({ id }) => id));
      if (baseline.layout.canvasOrder?.some((id) => movedIds.has(id))) {
        const sectionOrder = [...baseline.document.sections];
        const [moved] = sectionOrder.splice(target.sectionIndex, 1);
        sectionOrder.splice(destination, 0, moved);
        const orderedIds = sectionOrder.flatMap(({ components }) => components.map(({ id }) => id));
        const extras = baseline.layout.canvasOrder.filter((id) => !orderedIds.includes(id));
        operations.push({ op: "replace", path: "/layout/canvasOrder", value: [...orderedIds, ...extras], reason: "同步分区画布顺序" });
      }
      operationLabel = direction < 0 ? "前移" : "后移";
    }
  }

  if (!operations.length) throw new ContractError("No supported local change was found", [{ path: "/request/prompt", code: "unsupported", message: "Try changing the section title, subtitle, order, or adding or deleting a section" }]);
  const commands = { batchId: `batch-${runId}`, source: "agent", reason: `${operationLabel}分区：${target.section.title}`, operations };
  const workspace = applyCommandBatch(baseline, commands);
  const request = { ...input, pageType: baseline.theme.pageType, language: input.language || baseline.theme.language || "zh", dataInputs: input.dataInputs ?? [] };
  const planSection = addedSection || target.section;
  const plannedComponents = planSection.components.map(({ id, type, title }) => ({ id, type, purpose: title }));
  const plan = { pageType: baseline.theme.pageType, title: `${operationLabel} ${target.section.title}`, goal: input.prompt, sections: [{ id: planSection.id, title: planSection.title, purpose: `只修改分区 ${target.section.id}`, components: plannedComponents }], assumptions: [], warnings: addedSection ? ["新增分区使用可继续编辑的文本组件作为初始内容。"] : [] };
  const source = baseline.document.sampleDataLabel ? "sample" : "real";
  const sourceLabel = source === "sample" ? baseline.document.sampleDataLabel : "当前工作区数据";
  const bundle = { version: 1, request, plan, workspace, commands, provenance: { mode: source, components: Object.fromEntries(plannedComponents.map(({ id }) => [id, { source, label: sourceLabel }])) } };
  let run = createGenerationRun(request, { runId, now });
  run = startPlanning(run, { at: now });
  run = acceptPlan(run, plan, { at: now });
  run = acceptGenerationBundle(run, bundle, { at: now });
  return prepareGenerationPreview(run, baseline, { at: now });
}

function duplicateComponentOperations(workspace, target, layoutTarget, action, requestedTitle) {
  if (target.component.type === "summary") {
    throw new ContractError("Summary duplication is not supported", [{ path: "/request/prompt", code: "unsupported", message: "Select a card inside a content section before adding or duplicating" }]);
  }
  if (target.section.components.length >= 24) {
    throw new ContractError("Section component limit reached", [{ path: `/document/sections/${target.sectionIndex}/components`, code: "limit", message: "A section can contain at most 24 components" }]);
  }
  const suffix = action === "add-similar" ? "new" : "copy";
  const componentId = uniqueComponentId(workspace, target.component.id, suffix);
  const component = structuredClone(target.component);
  component.id = componentId;
  component.title = requestedTitle || `${target.component.title}${action === "add-similar" ? " 2" : " 副本"}`;
  const operations = [
    { op: "insert", path: `/document/sections/${target.sectionIndex}/components/${target.componentIndex + 1}`, value: component, reason: action === "add-similar" ? "新增同类卡片" : "复制卡片" },
    { op: "insert", path: `/layout/sections/${layoutTarget.sectionIndex}/items/${layoutTarget.itemIndex + 1}`, value: { id: componentId, span: layoutTarget.item.span }, reason: "为新卡片建立布局项" }
  ];
  const sourceOverride = workspace.theme.cardOverrides?.[target.component.id];
  if (sourceOverride) operations.push({ op: "set", path: `/theme/cardOverrides/${componentId}`, value: structuredClone(sourceOverride), reason: "复制单卡样式覆盖" });
  const canvasOrder = workspace.layout.canvasOrder;
  const canvasIndex = canvasOrder?.indexOf(target.component.id) ?? -1;
  if (canvasIndex >= 0) {
    const nextOrder = [...canvasOrder];
    nextOrder.splice(canvasIndex + 1, 0, componentId);
    operations.push({ op: "replace", path: "/layout/canvasOrder", value: nextOrder, reason: "将新卡片放在当前卡片之后" });
  }
  for (const [controlIndex, control] of (workspace.document.controls ?? []).entries()) {
    if (control.type !== "filter-bar" || !control.props.targets.includes(target.component.id) || control.props.targets.includes(componentId)) continue;
    operations.push({
      op: "replace",
      path: `/document/controls/${controlIndex}/props/targets`,
      value: [...control.props.targets, componentId],
      reason: "新卡片继承当前筛选范围"
    });
  }
  return { component, operations };
}

function deleteComponentOperations(workspace, target, layoutTarget) {
  if (target.section.components.length <= 1) {
    throw new ContractError("Cannot delete the last component in a section", [{ path: `/document/sections/${target.sectionIndex}/components`, code: "minimum", message: "Move or add another card before deleting the section's last component" }]);
  }
  const operations = [];
  const controls = structuredClone(workspace.document.controls ?? []);
  const removedFilterIds = [];
  let controlsChanged = false;
  for (let index = controls.length - 1; index >= 0; index -= 1) {
    const control = controls[index];
    if (control.type !== "filter-bar" || !control.props.targets.includes(target.component.id)) continue;
    control.props.targets = control.props.targets.filter((id) => id !== target.component.id);
    controlsChanged = true;
    if (!control.props.targets.length) {
      removedFilterIds.push(...control.props.controls.map(({ id }) => id));
      controls.splice(index, 1);
    }
  }
  if (controlsChanged) operations.push({ op: "replace", path: "/document/controls", value: controls, reason: "清理失效筛选目标" });
  for (const filterId of removedFilterIds) {
    if (Object.hasOwn(workspace.interactions?.filters ?? {}, filterId)) operations.push({ op: "unset", path: `/interactions/filters/${filterId}`, reason: "清理失效筛选状态" });
  }
  if (Object.hasOwn(workspace.theme.cardOverrides ?? {}, target.component.id)) {
    operations.push({ op: "unset", path: `/theme/cardOverrides/${target.component.id}`, reason: "清理单卡样式覆盖" });
  }
  if (Object.hasOwn(workspace.resources?.charts ?? {}, target.component.id)) {
    operations.push({ op: "unset", path: `/resources/charts/${target.component.id}`, reason: "清理卡片图表资源" });
  }
  const canvasOrder = workspace.layout.canvasOrder;
  if (canvasOrder?.includes(target.component.id)) {
    operations.push({ op: "replace", path: "/layout/canvasOrder", value: canvasOrder.filter((id) => id !== target.component.id), reason: "从画布顺序移除卡片" });
  }
  operations.push(
    { op: "remove", path: `/layout/sections/${layoutTarget.sectionIndex}/items/${layoutTarget.itemIndex}`, reason: "移除卡片布局项" },
    { op: "remove", path: `/document/sections/${target.sectionIndex}/components/${target.componentIndex}`, reason: "删除卡片" }
  );
  return operations;
}

function moveComponentOperations(workspace, target, layoutTarget, direction) {
  const operations = [];
  const componentDestination = target.componentIndex + direction;
  if (componentDestination >= 0 && componentDestination < target.section.components.length) {
    operations.push({
      op: "move",
      from: `/document/sections/${target.sectionIndex}/components/${target.componentIndex}`,
      path: `/document/sections/${target.sectionIndex}/components/${componentDestination}`,
      reason: direction < 0 ? "卡片前移" : "卡片后移"
    });
  }
  const itemDestination = layoutTarget.itemIndex + direction;
  if (itemDestination >= 0 && itemDestination < layoutTarget.section.items.length) {
    operations.push({
      op: "move",
      from: `/layout/sections/${layoutTarget.sectionIndex}/items/${layoutTarget.itemIndex}`,
      path: `/layout/sections/${layoutTarget.sectionIndex}/items/${itemDestination}`,
      reason: direction < 0 ? "布局项前移" : "布局项后移"
    });
  }
  const canvasOrder = workspace.layout.canvasOrder;
  const canvasIndex = canvasOrder?.indexOf(target.component.id) ?? -1;
  const canvasDestination = canvasIndex + direction;
  if (canvasIndex >= 0 && canvasDestination >= 0 && canvasDestination < canvasOrder.length) {
    const nextOrder = [...canvasOrder];
    const [componentId] = nextOrder.splice(canvasIndex, 1);
    nextOrder.splice(canvasDestination, 0, componentId);
    operations.push({ op: "replace", path: "/layout/canvasOrder", value: nextOrder, reason: direction < 0 ? "画布节点前移" : "画布节点后移" });
  }
  if (!operations.length) {
    throw new ContractError("Component cannot move farther", [{ path: "/request/prompt", code: "boundary", message: direction < 0 ? "The selected card is already first" : "The selected card is already last" }]);
  }
  return operations;
}

function selectProfile(prompt) {
  return domainProfiles.find(({ match }) => match.test(prompt)) || domainProfiles[0];
}

function inferPageType(prompt, requested) {
  if (["dashboard", "analysis-report", "report"].includes(requested)) return requested;
  if (/在线分析报告|在线报告|可刷新报告|实时报告/.test(prompt)) return "analysis-report";
  return /报告|复盘|总结|分析/.test(prompt) && !/看板|监控/.test(prompt) ? "report" : "dashboard";
}

function buildPageControls(prompt, sections, dataContext = null) {
  const controls = [];
  const chart = sections.flatMap(({ components }) => components).find(({ type }) => type === "chart");
  const chartOnly = /当前图表|这个图表|图表右上角|图表上方/.test(prompt) && chart;
  const targets = chartOnly ? [chart.id] : sections.flatMap((section) => [section.id, ...section.components.map(({ id }) => id)]);
  const filterDefinitions = [];
  if (/年份|年度|按年/.test(prompt)) filterDefinitions.push({ id: "year", label: "年份", field: "year", options: [{ value: "", label: "全部年份" }, { value: "2026", label: "2026 年" }, { value: "2025", label: "2025 年" }], defaultValue: "" });
  if (/月份|月度|按月/.test(prompt)) filterDefinitions.push({ id: "month", label: "月份", field: "month", options: [{ value: "", label: "全部月份" }, { value: "current", label: "本月" }, { value: "previous", label: "上月" }], defaultValue: "" });
  if (/战区|区域|地区/.test(prompt)) filterDefinitions.push({ id: "region", label: "区域", field: "region", options: [{ value: "", label: "全部区域" }, { value: "east", label: "华东" }, { value: "south", label: "华南" }, { value: "north", label: "华北" }], defaultValue: "" });
  if (/行业/.test(prompt)) filterDefinitions.push({ id: "industry", label: "行业", field: "industry", options: [{ value: "", label: "全部行业" }, { value: "technology", label: "科技" }, { value: "retail", label: "零售" }, { value: "manufacturing", label: "制造" }], defaultValue: "" });
  if (/筛选|过滤/.test(prompt) && !filterDefinitions.length) filterDefinitions.push({ id: "period", label: "周期", field: "period", options: [{ value: "", label: "全部周期" }, { value: "current", label: "本期" }, { value: "previous", label: "上期" }], defaultValue: "" });
  const sourceFields = dataContext?.context?.fields || [];
  const sourceDimensions = dataContext?.context?.semanticModel?.dimensions || [];
  const resolvedFilters = filterDefinitions.map((filter) => {
    if (!sourceFields.length) return filter;
    const dimension = sourceDimensions.find(({ fieldId, label }) => fieldId === filter.field || label === filter.label || label.includes(filter.label));
    const field = sourceFields.find(({ id }) => id === dimension?.fieldId) || sourceFields.find(({ id, label }) => id === filter.field || label === filter.label || label.includes(filter.label));
    if (!field) return null;
    return {
      ...filter,
      field: field.id,
      options: [{ value: "", label: `全部${filter.label}` }, ...field.samples.filter((value) => value !== null).map((value) => ({ value: String(value), label: String(value) }))]
    };
  }).filter(Boolean);
  if (resolvedFilters.length) controls.push({ id: "dashboard-filters", type: "filter-bar", props: { controls: resolvedFilters.map((filter) => ({ ...filter, control: "select" })), targets, surface: chartOnly ? "plain" : "card", ...(chartOnly ? { placement: { kind: "component-header", targetId: chart.id } } : {}) } });
  if (/视图|tab|切换/i.test(prompt)) {
    const splitIndex = Math.max(1, Math.ceil(sections.length / 2));
    controls.push({
      id: "dashboard-views",
      type: "view-tabs",
      props: {
        items: [
          { id: "overview", label: "概览", sectionIds: sections.slice(0, splitIndex).map(({ id }) => id) },
          { id: "details", label: "明细", sectionIds: sections.slice(splitIndex).map(({ id }) => id) }
        ],
        defaultValue: "overview"
      }
    });
  }
  return controls;
}

function buildSampleRecords(profile) {
  const regions = ["east", "south", "north"];
  const industries = ["technology", "retail", "manufacturing"];
  const owners = ["王琳", "陈昊", "李敏"];
  const statuses = ["稳健", "关注", "风险"];
  const sources = profile.rankingItems;
  const risks = ["进度风险", "跟进停滞", "数据待确认"];
  return Array.from({ length: 12 }, (_, index) => ({
    year: index < 8 ? "2026" : "2025",
    month: index % 2 === 0 ? "current" : "previous",
    period: index < 6 ? "current" : "previous",
    region: regions[index % regions.length],
    industry: industries[index % industries.length],
    periodLabel: `第 ${index % 6 + 1} 周`,
    priorityCustomers: 8 + index * 2,
    opportunityValue: 120 + index * 35,
    conversionRate: 22 + index * 1.7,
    objectName: `重点对象 ${String.fromCharCode(65 + index)}`,
    ownerName: owners[index % owners.length],
    healthScore: Math.max(58, 94 - index * 3),
    statusName: statuses[index % statuses.length],
    sourceName: sources[index % sources.length],
    riskName: risks[index % risks.length],
    riskCount: 1 + index % 4
  }));
}

function buildDocument(profile, request, pageType, dataContexts = []) {
  const requestedTitle = request.prompt.match(/(?:叫做|标题为|名称为)[“‘"']?([^。，“”‘’"']{2,30})/)?.[1]?.trim();
  const title = requestedTitle || `${profile.title}${["analysis-report", "report"].includes(pageType) ? "报告" : ""}`;
  const sampleDataLabel = request.dataInputs.some(({ kind }) => kind !== "sample") ? undefined : "示例数据";
  const dataRef = request.dataInputs[0]?.id || "primary-data";
  const importedContext = dataContexts[0];
  const bindData = request.dataInputs.every(({ kind }) => kind === "sample") || Boolean(importedContext?.portableDataset) || (["dashboard", "analysis-report"].includes(pageType) && Boolean(importedContext));
  const semanticMetrics = importedContext?.context.semanticModel?.metrics ?? [];
  const semanticDimensions = importedContext?.context.semanticModel?.dimensions ?? [];
  const metricFields = semanticMetrics.length ? semanticMetrics : [{ fieldId: "priorityCustomers", aggregation: "sum", format: { suffix: " 家" } }, { fieldId: "opportunityValue", aggregation: "sum", format: { suffix: " 万" } }, { fieldId: "conversionRate", aggregation: "average", format: { suffix: "%", maximumFractionDigits: 1 } }];
  const chartMetric = metricFields[1] || metricFields[0];
  const chartValueField = chartMetric.fieldId;
  const chartCategoryFieldFromData = semanticDimensions[0]?.fieldId || "periodLabel";
  const tableFields = importedContext?.context.fields.slice(0, 4) ?? [];
  const chartType = inferChartType(request.prompt);
  const supportsSingleMetricBinding = !["bullet", "combo-bar-line"].includes(chartType);
  const asksForTimeSeries = /最近|趋势|走势|时间|周|月|季度|年度/.test(request.prompt);
  const usesCompositionCategories = ["pie", "horizontal-bar", "grouped-horizontal-bar", "stacked-horizontal-bar", "percent-stacked-horizontal-bar", "diverging-bar", "ranking-bar", "gantt", "bullet", "radar", "funnel"].includes(chartType)
    || (!asksForTimeSeries && /渠道|来源|分类|排行|排名|对比|分布/.test(request.prompt));
  const chartCategoryField = importedContext ? chartCategoryFieldFromData : usesCompositionCategories ? "sourceName" : "periodLabel";
  const chartTitle = chartType === "combo-bar-line" ? "收入与转化率趋势" : chartType === "gauge" ? "目标完成率" : chartType === "bullet" ? "目标达成对比" : chartType === "pie" ? profile.rankingTitle.replace(/\s*Top\s*5/i, "构成") : usesCompositionCategories ? profile.rankingTitle : profile.trendTitle;
  const chartSubtitle = chartType === "combo-bar-line" ? "金额柱状图与转化率折线图" : chartType === "gauge" ? "当前进度与目标区间" : chartType === "bullet" ? "实际值、目标线与绩效区间" : chartType === "pie" ? "本周期贡献占比" : usesCompositionCategories ? "各分类对比" : "最近 7 个周期";
  const metricBindings = [
    { kind: "aggregate", operation: metricFields[0].aggregation, field: metricFields[0].fieldId, format: metricFields[0].format },
    { kind: "aggregate", operation: chartMetric.aggregation, field: chartMetric.fieldId, format: chartMetric.format },
    { kind: "aggregate", operation: (metricFields[2] || metricFields[0]).aggregation, field: (metricFields[2] || metricFields[0]).fieldId, format: (metricFields[2] || metricFields[0]).format }
  ];
  const trendCategoryField = importedContext ? semanticDimensions[0]?.fieldId : "periodLabel";
  const trendBindings = metricFields.slice(0, 3).map((metric) => trendCategoryField ? ({
    kind: "series", categoryField: trendCategoryField, valueField: metric.fieldId, operation: metric.aggregation, limit: 7
  }) : null);
  const sampleSparklineLabels = ["第 1 周", "第 2 周", "第 3 周", "第 4 周", "第 5 周", "第 6 周", "第 7 周"];
  const sampleSparklineValues = [
    [52, 56, 55, 61, 63, 65, 68],
    [720, 810, 780, 890, 940, 1030, 1110],
    [23.4, 24.8, 24.1, 26.2, 27.5, 28.4, 29.7]
  ];
  const totals = importedContext?.context.querySnapshots?.totals?.rows?.[0] || [];
  const totalColumns = importedContext?.context.querySnapshots?.totals?.columns || [];
  const seriesRows = importedContext?.context.querySnapshots?.series?.rows || [];
  const seriesColumns = importedContext?.context.querySnapshots?.series?.columns || [];
  const formatMetric = (value, metric, fallback) => {
    if (!Number.isFinite(Number(value))) return fallback;
    const format = metric?.format || {};
    const formatted = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: format.maximumFractionDigits ?? 0 }).format(Number(value) * (format.multiplier ?? 1));
    return `${format.prefix ?? ""}${formatted}${format.suffix ?? ""}`;
  };
  const snapshotColumnIndex = (columns, id, fallback) => {
    const index = columns.findIndex((column) => column.id === id);
    return index >= 0 ? index : fallback;
  };
  const metricValue = (index, fallback) => {
    const metric = metricFields[index] || metricFields[0];
    return formatMetric(totals[snapshotColumnIndex(totalColumns, metric.id, index)], metric, fallback);
  };
  const seriesCategoryIndex = snapshotColumnIndex(seriesColumns, semanticDimensions[0]?.id, 0);
  const seriesValueIndex = snapshotColumnIndex(seriesColumns, chartMetric.id, 1);
  const seriesValues = seriesRows.map((row) => Number(row[seriesValueIndex]) || 0);
  const seriesLabels = seriesRows.map((row) => String(row[seriesCategoryIndex] ?? ""));
  const multiSeriesChart = ["grouped-bar", "stacked-bar", "percent-stacked-bar", "grouped-horizontal-bar", "stacked-horizontal-bar", "percent-stacked-horizontal-bar", "bullet", "radar", "combo-bar-line"].includes(chartType);
  const sampleChartLabels = chartType === "gauge" ? ["完成率"] : ["华东", "华南", "华北", "西部"];
  const sampleChartSeries = chartType === "combo-bar-line" ? [{ name: "收入", values: [128, 156, 142, 188, 214, 246, 268] }, { name: "转化率", values: [18, 21, 20, 25, 27, 30, 33] }] : chartType === "gauge" ? [{ name: "目标完成率", values: [76.8] }] : chartType === "bullet" ? [
    { name: "实际", values: [82, 68, 91, 74] },
    { name: "目标", values: [90, 75, 88, 85] }
  ] : multiSeriesChart ? [
    { name: "本期", values: [42, 36, 31, 24] },
    { name: "上期", values: [34, 29, 27, 21] },
    { name: "目标", values: [18, 22, 16, 20] }
  ] : chartType === "diverging-bar" ? [{ name: "减少", values: [24, 18, 30, 15] }, { name: "增加", values: [31, 28, 22, 35] }]
    : chartType === "gantt" ? [{ name: "开始", values: [0, 2, 5, 7] }, { name: "工期", values: [3, 4, 3, 5] }]
      : chartType === "histogram" ? [{ name: "样本", values: [12, 18, 21, 22, 24, 25, 27, 29, 31, 35, 36, 42, 48, 53] }] : null;
  const groundedRankingItems = seriesRows.map((row) => ({
    label: String(row[seriesCategoryIndex] ?? ""),
    value: Number(row[seriesValueIndex]) || 0
  })).sort((left, right) => right.value - left.value);
  const portableRecords = importedContext?.portableDataset?.records || [];
  const groundedTableRows = portableRecords.slice(0, 8).map((record) => tableFields.map(({ id }) => record[id] ?? ""));
  const snapshotTableColumns = seriesColumns.map(({ label }) => label);
  const snapshotTableRows = seriesRows.map((row) => row.map((value) => value ?? ""));
  const sections = [
      {
        id: "summary",
        title: "经营摘要",
        subtitle: sampleDataLabel || "核心结论",
        components: [{ id: "summary-card", type: "summary", title: "经营摘要", subtitle: sampleDataLabel || "核心结论", props: { body: `${title}当前整体表现稳定，核心指标保持增长，仍需关注风险事项并持续验证数据口径。`, score: "91.3%", scoreLabel: "综合目标完成率" } }]
      },
      {
        id: "metrics",
        title: "核心指标",
        subtitle: sampleDataLabel || "当前周期",
        components: profile.metrics.map(([id, titleText, value, trend], index) => ({
          id, type: "kpi", title: metricFields[index]?.label || titleText, subtitle: trend, dataRef,
          ...(bindData ? { binding: metricBindings[index] } : {}),
          ...(bindData && trendBindings[index] ? { trendBinding: trendBindings[index] } : {}),
          props: {
            value: importedContext ? metricValue(index, value) : value,
            trend,
            ...(sampleDataLabel ? { sparkline: { labels: sampleSparklineLabels, values: sampleSparklineValues[index] || sampleSparklineValues[0], unit: metricFields[index]?.format?.suffix?.trim() || "" } } : {})
          }
        }))
      },
      {
        id: "trends",
        title: "趋势与来源",
        subtitle: sampleDataLabel || "最近周期",
        components: [
          { id: "opportunity-trend", type: "chart", title: chartTitle, subtitle: chartSubtitle, ...(supportsSingleMetricBinding ? { dataRef, ...(bindData ? { binding: { kind: "series", categoryField: chartCategoryField, valueField: chartValueField, operation: chartMetric.aggregation } } : {}) } : {}), props: { chartType, labels: supportsSingleMetricBinding && importedContext ? seriesLabels : sampleChartLabels, values: supportsSingleMetricBinding && importedContext ? seriesValues : sampleChartSeries?.[0]?.values || [], ...(sampleChartSeries ? { series: sampleChartSeries } : {}), ...(chartType === "combo-bar-line" ? { combo: { dualAxis: true, barUnit: "万元", lineUnit: "%" } } : {}), ...(chartType === "gauge" ? { gauge: { min: 0, max: 100, unit: "%", precision: 1, thresholds: [60, 85] } } : {}), ...(chartType === "bullet" ? { bullet: { min: 0, max: 120, unit: "%", precision: 0, ranges: [60, 85, 100] } } : {}) } },
          { id: "source-ranking", type: "list", title: profile.rankingTitle, subtitle: "本周期贡献占比", dataRef, ...(bindData ? { binding: { kind: "ranking", labelField: chartCategoryField, valueField: chartValueField, operation: chartMetric.aggregation, limit: 5 } } : {}), props: { items: importedContext && seriesRows.length ? groundedRankingItems.slice(0, 5) : profile.rankingItems.map((label, index) => ({ label, value: [92, 78, 66, 57, 44][index] })) } }
        ]
      },
      {
        id: "health",
        title: "健康与风险",
        subtitle: sampleDataLabel || "最近 30 天",
        components: [
          { id: "customer-health", type: "table", title: profile.healthTitle, subtitle: "最近 30 天综合表现", dataRef, ...(bindData ? { binding: { kind: "rows", columns: importedContext ? tableFields.map(({ id, label }) => ({ field: id, label })) : [{ field: "objectName", label: "对象" }, { field: "ownerName", label: "负责人" }, { field: "healthScore", label: "健康分" }, { field: "statusName", label: "状态" }], limit: 8 } } : {}), props: { columns: importedContext ? (portableRecords.length ? tableFields.map(({ label }) => label) : snapshotTableColumns) : ["对象", "负责人", "健康分", "状态"], rows: importedContext ? (portableRecords.length ? groundedTableRows : snapshotTableRows) : [["重点对象 A", "王琳", 92, "稳健"], ["重点对象 B", "陈昊", 84, "关注"], ["重点对象 C", "李敏", 63, "风险"]] } },
          { id: "risk-items", type: "list", title: profile.riskTitle, subtitle: "当前待处理事项", dataRef, ...(bindData ? { binding: { kind: "ranking", labelField: chartCategoryField, valueField: chartValueField, operation: chartMetric.aggregation, limit: 3 } } : {}), props: { items: importedContext && seriesRows.length ? groundedRankingItems.slice(0, 3) : [{ label: "进度风险", value: 6 }, { label: "跟进停滞", value: 4 }, { label: "数据待确认", value: 3 }] } }
        ]
      }
    ];
  if (/(?:文字说明|补充说明|口径说明|使用说明|备注|文本卡|文本组件)/.test(request.prompt)) {
    sections.find(({ id }) => id === "health").components.push({
      id: "methodology-note",
      type: "text",
      title: "数据口径说明",
      props: { body: "本看板按当前周期汇总展示，指标口径、时间范围与数据更新频率需在正式使用前由业务负责人确认。" }
    });
  }
  const controls = buildPageControls(request.prompt, sections, importedContext);
  return { title, subtitle: profile.subtitle, ...(sampleDataLabel ? { sampleDataLabel } : {}), ...(controls.length ? { controls } : {}), sections };
}

function buildLayout(document) {
  const layout = {
    canvasOrder: ["summary-card", "metrics", "opportunity-trend", "source-ranking", "customer-health", "risk-items"],
    sections: [
      { id: "summary", grouped: false, span: 12, layout: null, items: [{ id: "summary-card", span: 12 }] },
      { id: "metrics", grouped: true, span: 12, layout: "responsive", items: [{ id: "priority-customers", span: 4 }, { id: "opportunity-value", span: 4 }, { id: "conversion-rate", span: 4 }] },
      { id: "trends", grouped: false, span: 12, layout: "responsive", items: [{ id: "opportunity-trend", span: 8 }, { id: "source-ranking", span: 4 }] },
      { id: "health", grouped: false, span: 12, layout: "responsive", items: [{ id: "customer-health", span: 8 }, { id: "risk-items", span: 4 }] }
    ]
  };
  if (document.sections.some(({ components }) => components.some(({ id }) => id === "methodology-note"))) {
    layout.canvasOrder.push("methodology-note");
    layout.sections.find(({ id }) => id === "health").items.push({ id: "methodology-note", span: 12 });
  }
  return layout;
}

export function createDeterministicDraft(input, baseWorkspace, { dataContexts = [], runId = `run-${input.id}`, now = new Date().toISOString() } = {}) {
  const profile = selectProfile(input.prompt);
  const pageType = inferPageType(input.prompt, input.pageType);
  const baseline = migrateWorkspace(baseWorkspace);
  const request = {
    ...input,
    pageType,
    dataInputs: input.dataInputs?.length ? input.dataInputs : [{ id: "primary-data", kind: "sample", name: "AI 首稿示例数据" }]
  };
  const document = buildDocument(profile, request, pageType, dataContexts);
  const dataRef = request.dataInputs[0]?.id || "primary-data";
  const portableDataset = request.dataInputs.every(({ kind }) => kind === "sample")
    ? { [dataRef]: { portable: true, records: buildSampleRecords(profile) } }
    : dataContexts[0]?.portableDataset ? { [dataRef]: dataContexts[0].portableDataset } : null;
  const onlineDataset = !portableDataset && ["dashboard", "analysis-report"].includes(pageType) && dataContexts[0]
    ? { [dataRef]: { portable: false } }
    : null;
  if (onlineDataset) for (const component of document.sections.flatMap(({ components }) => components)) {
    if (component.binding && component.dataRef === dataRef) component.props.refreshPolicy = { mode: "dataset-event", pauseWhenHidden: true };
  }
  const cardOverrides = Object.fromEntries(Object.entries(baseline.theme.cardOverrides ?? {}).map(([cardId, override]) => {
    const next = { ...override };
    delete next.chartType;
    return [cardId, next];
  }).filter(([, override]) => Object.keys(override).length));
  const generatedChart = document.sections.flatMap(({ components }) => components).find(({ type }) => type === "chart");
  if (pageType === "dashboard" && generatedChart && /点击.*联动|图表联动|交叉筛选|cross.?filter/i.test(request.prompt)) {
    generatedChart.props.selection = {
      enabled: true,
      targetScope: /当前图表|仅.*图表/.test(request.prompt) ? "component" : /当前分组|分组内/.test(request.prompt) ? "section" : "page"
    };
  }
  if (pageType === "dashboard" && generatedChart && /下钻|层级分析|drill.?down/i.test(request.prompt)) {
    const semantic = dataContexts[0]?.context?.semanticModel;
    const hierarchy = semantic?.hierarchies?.[0];
    const dimensions = new Map((semantic?.dimensions || []).map((dimension) => [dimension.id, dimension]));
    const levels = hierarchy?.levels?.map((id) => dimensions.get(id)).filter(Boolean) || [];
    if (hierarchy && levels.length === hierarchy.levels.length && generatedChart.binding?.categoryField === levels[0].fieldId) generatedChart.props.drilldown = {
      enabled: true,
      hierarchyId: hierarchy.id,
      targetScope: /整页|全局/.test(request.prompt) ? "page" : /当前分组|分组内/.test(request.prompt) ? "section" : "component",
      levels: levels.map(({ fieldId, label }) => ({ field: fieldId, label }))
    };
  }
  if (["pie", "sector-pie", "rose", "radar", "funnel"].includes(generatedChart?.props.chartType) && !cardOverrides[generatedChart.id]?.chartPalette) {
    cardOverrides[generatedChart.id] = { ...(cardOverrides[generatedChart.id] ?? {}), chartPalette: "categorical" };
  }
  const workspace = {
    ...baseline,
    document,
    theme: { ...baseline.theme, cardOverrides, pageType, language: request.language || "zh", paletteVersion: "1.2.0" },
    layout: buildLayout(document),
    ...(document.controls?.length ? {
      interactions: {
        filters: Object.fromEntries(document.controls.filter(({ type }) => type === "filter-bar").flatMap(({ props }) => props.controls.map(({ id, defaultValue }) => [id, defaultValue]))),
        ...(document.controls.some(({ type }) => type === "view-tabs") ? { activeView: document.controls.find(({ type }) => type === "view-tabs").props.defaultValue } : {})
      }
    } : {})
  };
  const preservedResources = { ...(baseline.resources ?? {}) };
  delete preservedResources.datasets;
  if (portableDataset || onlineDataset) workspace.resources = { ...preservedResources, datasets: portableDataset || onlineDataset };
  else if (Object.keys(preservedResources).length) workspace.resources = preservedResources;
  else delete workspace.resources;
  if (!document.controls?.length) delete workspace.interactions;
  const plan = {
    pageType,
    title: document.title,
    goal: request.prompt,
    sections: document.sections.map((section) => ({
      id: section.id,
      title: section.title,
      purpose: section.subtitle || section.title,
      components: section.components.map((component) => ({ id: component.id, type: component.type, purpose: component.title, dataInputId: component.dataRef || null }))
    })),
    assumptions: request.dataInputs.every(({ kind }) => kind === "sample") ? ["当前使用示例数据生成首稿。"] : [],
    warnings: ["正式使用前请确认指标口径和数据来源。"]
  };
  const source = request.dataInputs[0]?.kind === "sample" ? "sample" : "real";
  const componentProvenance = document.sections.flatMap(({ components }) => components.map((component) => [
    component.id,
    {
      source,
      label: source === "sample" ? "示例数据" : "用户提供数据",
      ...(component.dataRef ? { dataInputId: component.dataRef } : {})
    }
  ]));
  const bundle = {
    version: 1,
    request,
    plan,
    workspace,
    commands: { batchId: `batch-${runId}`, source: "agent", reason: "生成自然语言首稿", operations: [{ op: "replace", path: "/", value: workspace }] },
    provenance: {
      mode: source,
      components: Object.fromEntries(componentProvenance)
    }
  };
  let run = createGenerationRun(request, { runId, now });
  run = startPlanning(run, { at: now });
  run = acceptPlan(run, plan, { at: now });
  run = acceptGenerationBundle(run, bundle, { at: now });
  run = prepareGenerationPreview(run, baseline, { at: now });
  return run;
}

export function createDeterministicRefinement(input, baseWorkspace, { runId = `refine-${input.id}`, now = new Date().toISOString() } = {}) {
  const baseline = migrateWorkspace(baseWorkspace);
  if (!["section", "component"].includes(input.scope?.kind) || !input.scope.id) {
    throw new ContractError("Local AI refinement requires a section or component scope", [{ path: "/request/scope", code: "required", message: "Select a structured section or component before requesting a local refinement" }]);
  }
  if (input.scope.kind === "section") return createDeterministicSectionRefinement(input, baseline, { runId, now });
  const target = locateComponent(baseline, input.scope.id);
  if (!target) throw new ContractError("Refinement target was not found", [{ path: "/request/scope/id", code: "reference", message: "Target component does not exist in the current workspace" }]);

  const operations = [];
  const componentPath = `/document/sections/${target.sectionIndex}/components/${target.componentIndex}`;
  const layoutTarget = locateLayoutItem(baseline, target.section.id, target.component.id);
  if (!layoutTarget) throw new ContractError("Refinement layout target was not found", [{ path: "/layout/sections", code: "reference", message: "Target component does not have a layout item" }]);
  const structureAction = requestedStructureAction(input.prompt);
  const requestedTitle = requestedCopy(input.prompt, "title");
  let addedComponent = null;
  let operationLabel = "修改";

  if (structureAction === "delete") {
    operations.push(...deleteComponentOperations(baseline, target, layoutTarget));
    operationLabel = "删除";
  } else if (["duplicate", "add-similar"].includes(structureAction)) {
    const duplicated = duplicateComponentOperations(baseline, target, layoutTarget, structureAction, requestedTitle);
    operations.push(...duplicated.operations);
    addedComponent = duplicated.component;
    operationLabel = structureAction === "duplicate" ? "复制" : "新增";
  } else {
    const chartType = target.component.type === "chart" ? requestedRefinementChartType(input.prompt) : null;
    if (chartType && target.component.props.chartType !== chartType) {
      operations.push({ op: target.component.props.chartType === undefined ? "set" : "replace", path: `${componentPath}/props/chartType`, value: chartType, reason: "按局部指令替换图表类型" });
      if (chartType === "pie" && !baseline.theme.cardOverrides?.[target.component.id]?.chartPalette) {
        const cardOverrides = structuredClone(baseline.theme.cardOverrides ?? {});
        cardOverrides[target.component.id] = { ...(cardOverrides[target.component.id] ?? {}), chartPalette: "categorical" };
        operations.push({ op: baseline.theme.cardOverrides === undefined ? "set" : "replace", path: "/theme/cardOverrides", value: cardOverrides, reason: "环形图使用分类色板" });
      }
    }

    if (requestedTitle && requestedTitle !== target.component.title) operations.push({ op: "replace", path: `${componentPath}/title`, value: requestedTitle, reason: "改写卡片标题" });
    const removesSubtitle = /(?:去掉|隐藏|删除).{0,6}副标题|副标题.{0,6}(?:去掉|隐藏|删除)/.test(input.prompt);
    const subtitle = removesSubtitle ? "" : requestedCopy(input.prompt, "subtitle");
    if (subtitle !== null && subtitle !== (target.component.subtitle ?? "")) {
      operations.push({ op: target.component.subtitle === undefined ? "set" : "replace", path: `${componentPath}/subtitle`, value: subtitle, reason: removesSubtitle ? "隐藏卡片副标题" : "改写卡片副标题" });
    }
    const body = target.component.type === "summary" ? requestedCopy(input.prompt, "body") : null;
    if (body && body !== target.component.props.body) operations.push({ op: "replace", path: `${componentPath}/props/body`, value: body, reason: "改写摘要正文" });

    const span = requestedLayoutSpan(input.prompt);
    if (span && span !== layoutTarget.item.span) {
      operations.push({ op: "replace", path: `/layout/sections/${layoutTarget.sectionIndex}/items/${layoutTarget.itemIndex}/span`, value: span, reason: "调整卡片宽度" });
      if (layoutTarget.section.grouped && layoutTarget.section.layout !== "custom") {
        operations.push({ op: "replace", path: `/layout/sections/${layoutTarget.sectionIndex}/layout`, value: "custom", reason: "启用组内自由尺寸" });
      }
    }
    const moveDirection = requestedMoveDirection(input.prompt);
    if (moveDirection) operations.push(...moveComponentOperations(baseline, target, layoutTarget, moveDirection));
  }

  if (!operations.length) {
    throw new ContractError("No supported local change was found", [{
      path: "/request/prompt",
      code: "unsupported",
      message: target.component.type === "chart"
        ? "Try changing the chart type, title, subtitle, width, order, or card structure"
        : target.component.type === "summary" ? "Try changing the title, subtitle, summary body, or width" : "Try changing the title, subtitle, width, order, or card structure"
    }]);
  }

  const commands = { batchId: `batch-${runId}`, source: "agent", reason: `${operationLabel}卡片：${target.component.title}`, operations };
  const workspace = applyCommandBatch(baseline, commands);
  const request = {
    ...input,
    pageType: baseline.theme.pageType,
    language: input.language || baseline.theme.language || "zh",
    dataInputs: input.dataInputs ?? []
  };
  let run = createGenerationRun(request, { runId, now });
  const plannedComponents = [
    { id: target.component.id, type: target.component.type, purpose: input.prompt },
    ...(addedComponent ? [{ id: addedComponent.id, type: addedComponent.type, purpose: `${operationLabel}自 ${target.component.id}` }] : [])
  ];
  const plan = {
    pageType: baseline.theme.pageType,
    title: `${operationLabel} ${target.component.title}`,
    goal: input.prompt,
    sections: [{
      id: target.section.id,
      title: target.section.title,
      purpose: `只修改组件 ${target.component.id}`,
      components: plannedComponents
    }],
    assumptions: [],
    warnings: addedComponent ? ["新增卡片沿用原卡片的数据绑定和局部样式，可继续单独修改。"] : []
  };
  const source = baseline.document.sampleDataLabel ? "sample" : "real";
  const sourceLabel = source === "sample" ? baseline.document.sampleDataLabel : "当前工作区数据";
  const bundle = {
    version: 1,
    request: run.request,
    plan,
    workspace,
    commands,
    provenance: {
      mode: source,
      components: Object.fromEntries(plannedComponents.map(({ id }) => [id, { source, label: sourceLabel }]))
    }
  };
  run = startPlanning(run, { at: now });
  run = acceptPlan(run, plan, { at: now });
  run = acceptGenerationBundle(run, bundle, { at: now });
  run = prepareGenerationPreview(run, baseline, { at: now });
  return run;
}
