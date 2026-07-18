import { z } from 'zod'

export const FindingSeveritySchema = z.enum(['info', 'low', 'medium', 'high'])

export const BriefFindingSchema = z.object({
  severity: FindingSeveritySchema,
  title: z.string(),
  explanation: z.string(),
  evidencePaths: z.array(z.string())
})

export const BlobDecisionSchema = z.object({
  action: z.enum(['fetch', 'skip']),
  reason: z.string()
})

export const RepositoryBriefSchema = z.object({
  kind: z.literal('repository'),
  path: z.literal(''),
  commitSha: z.string(),
  overview: z.string(),
  architecture: z.array(z.string()),
  entryPoints: z.array(z.string()),
  majorSubsystems: z.array(z.string()),
  dependencyFlow: z.array(z.string()),
  observations: z.array(z.string()),
  findings: z.array(BriefFindingSchema)
})

export type BriefFinding = z.infer<typeof BriefFindingSchema>
export type BlobDecision = z.infer<typeof BlobDecisionSchema>
export type RepositoryBrief = z.infer<typeof RepositoryBriefSchema>
