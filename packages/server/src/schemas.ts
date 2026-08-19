import { z } from "zod";

export const CreateTaskSchema = z.object({
  title: z.string().min(1),
  briefing: z.string().min(1),
}).strict();

export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;