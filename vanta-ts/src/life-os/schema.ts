import { z } from "zod";

// LIFE-OS-SCHEMA: the typed schema for the 14 entity kinds that the
// command-center (BRIEF-CMD, MONEY-OS, COMMAND-CENTER, PROJECT-RADAR) sits on.
// Reuses goals.tsv as the goals source; everything else lives in ~/.vanta/life-os.json.
// Kept deliberately small: a flat array per entity kind, not a relational DB.

export const GoalRef = z.object({
  id: z.string(),
  text: z.string(),
  status: z.string(),
});

export const Project = z.object({
  id: z.string(),
  name: z.string(),
  stack: z.string().optional(),
  status: z.enum(["active", "stalled", "done", "parked"]).default("active"),
  nextAction: z.string().optional(),
  lastSeen: z.string().optional(),
});

export const Task = z.object({
  id: z.string(),
  title: z.string(),
  projectId: z.string().optional(),
  status: z.enum(["pending", "active", "done", "blocked", "parked"]).default("pending"),
  dueDate: z.string().optional(),
});

export const Opportunity = z.object({
  id: z.string(),
  title: z.string(),
  value: z.number().optional(),
  status: z.enum(["lead", "active", "closed", "lost"]).default("lead"),
  nextAction: z.string().optional(),
});

export const Contact = z.object({
  id: z.string(),
  name: z.string(),
  company: z.string().optional(),
  role: z.string().optional(),
  lastContact: z.string().optional(),
  notes: z.string().optional(),
});

export const Revenue = z.object({
  id: z.string(),
  description: z.string(),
  amount: z.number(),
  date: z.string(),
  category: z.string().optional(),
});

export const Expense = z.object({
  id: z.string(),
  description: z.string(),
  amount: z.number(),
  date: z.string(),
  category: z.string().optional(),
});

export const Decision = z.object({
  id: z.string(),
  title: z.string(),
  choice: z.string(),
  rationale: z.string().optional(),
  date: z.string(),
  reversible: z.boolean().optional(),
});

export const Agent = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  provider: z.string().optional(),
  model: z.string().optional(),
});

export const CreativeSystem = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  status: z.string().optional(),
});

export const LearningTrack = z.object({
  id: z.string(),
  topic: z.string(),
  progress: z.string().optional(),
  resources: z.array(z.string()).optional(),
});

export const Risk = z.object({
  id: z.string(),
  description: z.string(),
  severity: z.enum(["low", "medium", "high"]).default("medium"),
  mitigation: z.string().optional(),
});

export const Routine = z.object({
  id: z.string(),
  name: z.string(),
  cadence: z.string(),
  steps: z.array(z.string()).optional(),
  lastRun: z.string().optional(),
});

export const LifeOsSchema = z.object({
  updatedAt: z.string().default(() => new Date().toISOString()),
  projects: z.array(Project).default([]),
  tasks: z.array(Task).default([]),
  opportunities: z.array(Opportunity).default([]),
  contacts: z.array(Contact).default([]),
  revenue: z.array(Revenue).default([]),
  expenses: z.array(Expense).default([]),
  decisions: z.array(Decision).default([]),
  agents: z.array(Agent).default([]),
  creativeSystems: z.array(CreativeSystem).default([]),
  learningTracks: z.array(LearningTrack).default([]),
  risks: z.array(Risk).default([]),
  routines: z.array(Routine).default([]),
});

export type LifeOs = z.infer<typeof LifeOsSchema>;
export type LifeOsProject = z.infer<typeof Project>;
export type LifeOsTask = z.infer<typeof Task>;
export type LifeOsOpportunity = z.infer<typeof Opportunity>;
