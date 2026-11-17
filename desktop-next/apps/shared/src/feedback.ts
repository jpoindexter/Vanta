import { z } from 'zod'

export const FeedbackFactsSchema = z.strictObject({
  appVersion: z.string().max(100),
  platform: z.string().max(30),
  electronVersion: z.string().max(40),
  nodeVersion: z.string().max(40)
})

export const FeedbackDraftSchema = z.object({
  kind: z.enum(['bug', 'idea']),
  title: z.string().max(120),
  details: z.string().max(3000),
  steps: z.string().max(3000),
  includeFacts: z.boolean()
})

export const FeedbackReportSchema = z.strictObject({
  id: z.uuid(),
  kind: z.enum(['bug', 'idea']),
  title: z.string().trim().min(1).max(120).regex(/^[^\r\n]+$/),
  details: z.string().trim().min(1).max(3000),
  steps: z.string().trim().max(3000),
  facts: FeedbackFactsSchema.nullable()
})

export const FeedbackReceiptSchema = z.strictObject({
  id: z.uuid(),
  storedAt: z.iso.datetime(),
  notification: z.enum(['sent', 'pending', 'uncertain'])
})

export type FeedbackDraft = z.infer<typeof FeedbackDraftSchema>
export type FeedbackReport = z.infer<typeof FeedbackReportSchema>
export type FeedbackReceipt = z.infer<typeof FeedbackReceiptSchema>
