import { describe, it, expect } from "vitest";
import { evaluateChecklistGate, type GateTask } from "./cleaning-checklist-gate";

function task(id: string, over: Partial<GateTask> = {}): GateTask {
  return {
    id,
    category: "Bedroom",
    task: `Task ${id}`,
    completed: true,
    ...over,
  };
}

describe("evaluateChecklistGate", () => {
  it("passes when every task is ticked and every category has a photo", () => {
    const result = evaluateChecklistGate(
      [task("1"), task("2"), task("3", { category: "Kitchen" })],
      { photoCategories: ["Bedroom", "Kitchen"] },
    );
    expect(result.ok).toBe(true);
    expect(result.error).toBeNull();
    expect(result.completedTasks).toBe(3);
    expect(result.doneTasks).toBe(3);
    expect(result.categories).toEqual(["Bedroom", "Kitchen"]);
  });

  it("fails an empty checklist", () => {
    const result = evaluateChecklistGate([]);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no checklist/i);
  });

  it("names unticked tasks", () => {
    const result = evaluateChecklistGate(
      [task("1"), task("2", { completed: false, task: "Make bed" })],
      { photoCategories: ["Bedroom"] },
    );
    expect(result.ok).toBe(false);
    expect(result.incomplete.map((t) => t.id)).toEqual(["2"]);
    expect(result.error).toContain("Bedroom · Make bed");
  });

  it("needs one photo per category, not per task", () => {
    const result = evaluateChecklistGate(
      [task("1"), task("2"), task("3", { category: "Kitchen" })],
      { photoCategories: ["Bedroom"] },
    );
    expect(result.ok).toBe(false);
    expect(result.missingPhotos).toEqual(["Kitchen"]);
    expect(result.error).toContain("Kitchen");
  });

  it("counts a ticked task as done whether or not its area has a photo yet", () => {
    const result = evaluateChecklistGate([task("1"), task("2", { completed: false })]);
    expect(result.doneTasks).toBe(1);
    expect(result.missingPhotos).toEqual(["Bedroom"]);
  });

  it("reports unticked tasks and missing photos together", () => {
    const result = evaluateChecklistGate([
      task("1", { completed: false }),
      task("2", { category: "Kitchen" }),
    ]);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/1 task not ticked and 2 areas still need a photo/);
  });

  it("waits for in-flight uploads", () => {
    const result = evaluateChecklistGate([task("1")], { pendingUploads: ["Bedroom"] });
    expect(result.ok).toBe(false);
    expect(result.pendingUploads).toEqual(["Bedroom"]);
    expect(result.error).toMatch(/uploading/i);
  });

  it("reports failed uploads by category", () => {
    const result = evaluateChecklistGate([task("1")], { failedUploads: ["Bedroom"] });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Bedroom");
  });

  it("ignores upload states for categories not on the checklist", () => {
    const result = evaluateChecklistGate([task("1")], {
      photoCategories: ["Bedroom"],
      pendingUploads: ["Garage"],
      failedUploads: ["Garage"],
    });
    expect(result.ok).toBe(true);
    expect(result.pendingUploads).toEqual([]);
    expect(result.failedUploads).toEqual([]);
  });
});
