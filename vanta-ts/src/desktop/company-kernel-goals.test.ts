import { describe, expect, it, vi } from "vitest";
import type { Goal } from "../types.js";
import { readRunningKernelGoals } from "./company-kernel-goals.js";

const goal = { id: "g1", status: "active" } as unknown as Goal;

function fake(up: boolean, goals: Goal[] = [], failGoals = false) {
  const getGoals = vi.fn(async () => { if (failGoals) throw new Error("boom"); return goals; });
  return { client: { status: async () => up, getGoals }, getGoals };
}

describe("readRunningKernelGoals", () => {
  it("returns the goals of a kernel that is already up", async () => {
    const { client } = fake(true, [goal]);
    expect(await readRunningKernelGoals("/p", { create: () => client })).toEqual([goal]);
  });

  it("returns [] and never asks for goals when the kernel is down", async () => {
    const { client, getGoals } = fake(false, [goal]);
    expect(await readRunningKernelGoals("/p", { create: () => client })).toEqual([]);
    expect(getGoals).not.toHaveBeenCalled();
  });

  it("returns [] when the goals call fails", async () => {
    const { client } = fake(true, [goal], true);
    expect(await readRunningKernelGoals("/p", { create: () => client })).toEqual([]);
  });

  it("probes the URL from VANTA_KERNEL_URL", async () => {
    const create = vi.fn(() => fake(true).client);
    await readRunningKernelGoals("/p", { env: { VANTA_KERNEL_URL: "http://127.0.0.1:9999" }, create });
    expect(create).toHaveBeenCalledWith("http://127.0.0.1:9999", "/p");
  });
});
