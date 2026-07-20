import { z } from 'zod'

export const ChatScopeSchema = z.object({
  chatId: z.string().uuid(),
  repository: z.object({
    id: z.union([z.number(), z.string()]).optional(),
    owner: z.string().min(1),
    name: z.string().min(1),
    fullName: z.string().min(1),
    url: z.string().url().optional()
  }),
  pullRequest: z.object({
    id: z.union([z.number(), z.string()]).optional(),
    number: z.number().int().positive(),
    title: z.string().optional(),
    url: z.string().url().optional(),
    base: z.object({
      owner: z.string().min(1),
      repository: z.string().min(1),
      branch: z.string().min(1),
      sha: z.string().min(1)
    }),
    incoming: z.object({
      owner: z.string().min(1),
      repository: z.string().min(1),
      branch: z.string().min(1),
      sha: z.string().min(1)
    })
  })
})

export type ChatScope = z.infer<typeof ChatScopeSchema>
