import { z } from "zod";

// Request bodies for POST /api/company/*. Strict: an unknown field is a 400
// naming the field, so a typo never silently drops a setting.

const id = (name: string) => z.string({ required_error: `${name} is required` }).trim().min(1, `${name} must not be empty`).max(120);
const requestId = z.string().trim().min(1).max(64).optional();

export const HireBody = z.object({
  role: z.string({ required_error: 'role is required (for example "Engineer")' }).trim().min(1, "role must not be empty").max(120),
  adapter: z.string({ required_error: "adapter is required: a provider id such as openai or anthropic (see GET /api/models)" }).trim().min(1),
  budgetUsd: z.number({ invalid_type_error: "budgetUsd must be a number of US dollars" }).positive("budgetUsd must be greater than 0").optional(),
  title: z.string().trim().min(1).max(120).optional(),
  managerId: id("managerId").optional(),
  departmentId: id("departmentId").optional(),
  requestId,
}).strict();

export const PauseBody = z.object({ workerId: id("workerId"), reason: z.string().trim().max(500).optional() }).strict();
export const ResumeBody = z.object({ workerId: id("workerId") }).strict();

export const CreateTicketBody = z.object({
  title: z.string({ required_error: "title is required" }).trim().min(1, "title must not be empty").max(200),
  description: z.string().trim().max(4000).optional(),
  goalId: id("goalId").optional(),
  parentId: id("parentId").optional(),
  projectId: id("projectId").optional(),
  labels: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  expectedOutput: z.string().trim().min(1).max(60).optional(),
  requireReview: z.boolean().default(true),
  requestId,
}).strict();

export const AssignBody = z.object({ ticketId: id("ticketId"), workerId: id("workerId"), start: z.boolean().default(true) }).strict();
export const CommentBody = z.object({ ticketId: id("ticketId"), text: z.string({ required_error: "text is required" }).trim().min(1, "text must not be empty").max(4000), requestId }).strict();

export const CloseBody = z.object({
  ticketId: id("ticketId"),
  resolution: z.enum(["done", "wontfix"]).default("done"),
  /** Explicit forced close when the ticket declared an expected output but no artifact exists. */
  noArtifactReason: z.string().trim().min(1).max(500).optional(),
}).strict();

export const AnswerBody = z.object({ ticketId: id("ticketId"), answer: z.string({ required_error: "answer is required" }).trim().min(1, "answer must not be empty").max(4000) }).strict();
export const ApproveBody = z.object({ workProductId: id("workProductId") }).strict();
export const ReviseBody = z.object({ workProductId: id("workProductId"), reason: z.string({ required_error: "reason is required: tell the worker what to change" }).trim().min(1, "reason must not be empty").max(2000) }).strict();

export const RaiseBudgetBody = z.object({
  scope: z.string({ required_error: 'scope is required, for example "agent:<workerId>" or "dept:<id>"' }).trim().min(1).max(120),
  limitUsd: z.number({ required_error: "limitUsd is required", invalid_type_error: "limitUsd must be a number of US dollars" }).positive("limitUsd must be greater than 0"),
}).strict();

export const TickBody = z.object({}).strict();

const keyResultInput = z.object({
  name: z.string({ required_error: "key result name is required" }).trim().min(1, "key result name must not be empty").max(120),
  target: z.number({ required_error: "key result target is required", invalid_type_error: "target must be a number" }).positive("target must be greater than 0").finite(),
  current: z.number({ invalid_type_error: "current must be a number" }).finite().default(0),
}).strict();

export const CreateOkrBody = z.object({
  title: z.string({ required_error: "title is required" }).trim().min(1, "title must not be empty").max(200),
  departmentId: id("departmentId").optional(),
  keyResults: z.array(keyResultInput).max(20).default([]),
}).strict();

/** Sets one key result's current value; `target` is only needed to add a key result that does not exist yet. */
export const OkrProgressBody = z.object({
  objectiveId: id("objectiveId"),
  name: z.string({ required_error: "name is required: the key result to update" }).trim().min(1, "name must not be empty").max(120),
  current: z.number({ required_error: "current is required", invalid_type_error: "current must be a number" }).finite(),
  target: z.number({ invalid_type_error: "target must be a number" }).positive("target must be greater than 0").finite().optional(),
}).strict();
