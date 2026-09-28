import { describe, it, expect } from "vitest";
import { evaluateChecklistGate, type GateTask } from "./cleaning-checklist-gate";

function task(id: string, over: Partial<GateTask> = {}): GateTask {
  return {
    id,
    category: "Bedroom",
    task: `Task ${id}`,
    completed: true,
    hasPhoto: true,
    ...over,
  };
}

describe("evaluateChecklistGate", () => {
  it("passes when every task is ticked and has a photo", () => {
    const result = evaluateChecklistGate([task("1"), task("2"), task("3")]);
    expect(result.ok).toBe(true);
    expect(result.error).toBeNull();
    expect(result.totalTasks).toBe(3);
    expect(result.completedTasks).toBe(3);
  });

  it("refuses a checklist with no tasks at all", () => {
    const result = evaluateChecklistGate([]);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no checklist yet/);
  });

  it("blocks on an unticked task and names it", () => {
    const result = evaluateChecklistGate([
      task("1"),
      task("2", { completed: false, task: "Mop floor", category: "Bathroom" }),
    ]);
    expect(result.ok).toBe(false);
    expect(result.incomplete.map((t) => t.id)).toEqual(["2"]);
    expect(result.error).toContain("Bathroom · Mop floor");
  });

  it("blocks on a ticked task with no photo and names it", () => {
    const result = evaluateChecklistGate([
      task("1"),
      task("2", { hasPhoto: false, task: "Clean mirror" }),
    ]);
    expect(result.ok).toBe(false);
    expect(result.missingPhotos.map((t) => t.id)).toEqual(["2"]);
    expect(result.error).toMatch(/need a photo/);
    expect(result.error).toContain("Clean mirror");
  });

  it("requires a photo for every task, not just one per category", () => {
    const result = evaluateChecklistGate([
      task("1", { category: "Kitchen" }),
      task("2", { category: "Kitchen", hasPhoto: false }),
    ]);
    expect(result.ok).toBe(false);
    expect(result.missingPhotos).toHaveLength(1);
  });

  it("reports both problems when tasks and photos are outstanding", () => {
    const result = evaluateChecklistGate([
      task("1", { completed: false }),
      task("2", { hasPhoto: false }),
    ]);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not ticked/);
    expect(result.error).toMatch(/need a photo/);
  });

  it("counts an untouched task once — the missing photo — since the photo ticks it", () => {
    const result = evaluateChecklistGate([
      task("1"),
      task("2", { completed: false, hasPhoto: false }),
      task("3", { completed: false, hasPhoto: false }),
    ]);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/^2 tasks still need a photo/);
    expect(result.error).not.toMatch(/not ticked/);
  });

  it("waits for an in-flight upload instead of failing the submission", () => {
    const result = evaluateChecklistGate([task("1"), task("2", { hasPhoto: false })], {
      pendingUploads: ["2"],
    });
    expect(result.ok).toBe(false);
    expect(result.pendingUploads).toEqual(["2"]);
    expect(result.error).toMatch(/Still uploading/);
  });

  it("surfaces a failed upload as a retry, not as a missing photo", () => {
    const result = evaluateChecklistGate([task("1"), task("2", { hasPhoto: false })], {
      failedUploads: ["2"],
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/failed/);
  });

  it("ignores pending or failed ids that are not on this checklist", () => {
    const result = evaluateChecklistGate([task("1")], {
      pendingUploads: ["ghost"],
      failedUploads: ["ghost"],
    });
    expect(result.ok).toBe(true);
    expect(result.pendingUploads).toEqual([]);
    expect(result.failedUploads).toEqual([]);
  });

  it("names at most three tasks, then counts the rest", () => {
    const result = evaluateChecklistGate(
      ["1", "2", "3", "4", "5"].map((id) => task(id, { completed: false })),
    );
    expect(result.error).toMatch(/\+2 more/);
  });

  it("counts a task as done only when it is ticked AND photographed", () => {
    const result = evaluateChecklistGate([
      task("1"),
      task("2", { hasPhoto: false }), // ticked by hand, no photo
      task("3", { completed: false, hasPhoto: false }),
    ]);
    expect(result.completedTasks).toBe(2);
    expect(result.doneTasks).toBe(1);
  });

  it("counts completed tasks even while blocked", () => {
    const result = evaluateChecklistGate([
      task("1"),
      task("2"),
      task("3", { completed: false }),
    ]);
    expect(result.completedTasks).toBe(2);
    expect(result.totalTasks).toBe(3);
  });

  it("drops the category prefix when a task has none", () => {
    const result = evaluateChecklistGate([
      task("1", { category: "", task: "Air out the unit", completed: false }),
    ]);
    expect(result.error).toContain("Air out the unit");
    expect(result.error).not.toContain("·");
  });
});
