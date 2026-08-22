import assert from "node:assert/strict";
import test from "node:test";
import { generationProgressStates, normalizeGenerationProgress } from "../studio/generation-progress-model.mjs";

test("normalizes authoritative generation progress within the workspace section limit", () => {
  assert.deepEqual(normalizeGenerationProgress({ sectionsReady: 2, sectionCount: 4 }), { sectionsReady: 2, sectionCount: 4 });
  assert.deepEqual(normalizeGenerationProgress({ sectionsReady: 20, sectionCount: 50 }), { sectionsReady: 12, sectionCount: 12 });
  assert.deepEqual(normalizeGenerationProgress(null, 3), { sectionsReady: 0, sectionCount: 3 });
});

test("derives section and validation states only from authoritative progress", () => {
  assert.deepEqual(generationProgressStates({ sectionsReady: 2, sectionCount: 4 }), {
    sectionsReady: 2,
    sectionCount: 4,
    sections: ["done", "done", "generating", "pending"],
    validation: "pending"
  });
  assert.deepEqual(generationProgressStates({ sectionsReady: 4, sectionCount: 4 }), {
    sectionsReady: 4,
    sectionCount: 4,
    sections: ["done", "done", "done", "done"],
    validation: "generating"
  });
  assert.deepEqual(generationProgressStates({ sectionsReady: 4, sectionCount: 4 }, { completed: true }).validation, "done");
});
