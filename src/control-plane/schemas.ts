import { z } from "zod";

export const runInputSchema = z.object({
  userIntent: z.string().trim().min(1).max(500),
  untrustedContent: z.string().trim().min(1).max(2000),
  subjectId: z.string().trim().regex(/^[A-Za-z0-9_-]{1,80}$/),
});

export const hardenInputSchema = z.object({ attackId: z.string().trim().optional() });
