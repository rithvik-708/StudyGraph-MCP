import { z } from "zod";

/**
 * Shared zod shapes. These are plain ZodRawShape objects (not z.object(...)) so they can be
 * passed directly as an MCP tool's `inputSchema`, and `z.object(shape)` is used wherever a
 * parsed/validated TS type is needed in the core service layer. One definition, two uses.
 */

export const getSyllabusShape = {
  subjectId: z.string().optional().describe("Public id of a single subject to scope the syllabus to. Omit to get all subjects."),
};

export const getSubjectProgressShape = {
  subjectId: z.string().optional().describe("Public id of a single subject. Omit to get progress for all subjects."),
};

export const getWeakTopicsShape = {
  subjectId: z.string().optional().describe("Public id of a subject to scope to. Omit to search across all subjects."),
  limit: z.number().int().min(1).max(50).default(10).describe("Maximum number of weak topics to return."),
  masteryThreshold: z.number().min(0).max(100).default(60).describe("Topics at or above this mastery percentage are not considered weak."),
};

export const getStudySessionsShape = {
  subjectId: z.string().optional().describe("Public id of a subject to filter by."),
  topicId: z.string().optional().describe("Public id of a topic to filter by."),
  from: z.string().datetime().optional().describe("ISO 8601 datetime; only sessions started at or after this time."),
  to: z.string().datetime().optional().describe("ISO 8601 datetime; only sessions started at or before this time."),
  limit: z.number().int().min(1).max(100).default(20).describe("Maximum number of sessions to return, most recent first."),
};

export const getExamReadinessShape = {
  examId: z.string().optional().describe("Public id of a single exam. Omit to get readiness for all exams."),
  includeUpcomingOnly: z.boolean().default(true).describe("If true (default), only exams whose date is in the future are included when examId is omitted."),
};

export const recommendNextTopicShape = {
  subjectId: z.string().optional().describe("Public id of a subject to scope recommendations to. Omit to consider all subjects."),
  horizonDays: z.number().int().min(1).max(180).default(14).describe("Only exams within this many days are treated as 'upcoming' for prioritization."),
};

export const createStudySessionShape = {
  subjectId: z.string().describe("Public id of the subject this session belongs to."),
  topicId: z.string().optional().describe("Public id of the specific topic studied, if any."),
  startedAt: z.string().datetime().describe("ISO 8601 datetime the session started."),
  durationMinutes: z.number().int().min(1).max(600).describe("Length of the session in minutes (1-600)."),
  notes: z.string().max(1000).optional().describe("Free-text notes about the session."),
  focusRating: z.number().int().min(1).max(5).optional().describe("Self-rated focus level, 1 (low) to 5 (high)."),
  confirm: z.boolean().default(false).describe(
    "Must be set to true to actually write the session. This tool writes data: first call it (or reason " +
      "about it) without confirm, show the user the proposed session details, and only resend the call " +
      "with confirm=true after they approve. Omitting it (or false) performs no write."
  ),
};

export const updateStudyProgressShape = {
  topicId: z.string().describe("Public id of the topic to update."),
  masteryPct: z.number().min(0).max(100).optional().describe("New mastery percentage, 0-100."),
  status: z
    .enum(["not_started", "in_progress", "completed", "needs_review"])
    .optional()
    .describe("New status for the topic."),
  markPracticedNow: z.boolean().default(true).describe("If true (default), sets last_practiced_at to now."),
  confirm: z.boolean().default(false).describe(
    "Must be set to true to actually write the update. This tool writes data: first show the user the " +
      "proposed change, and only resend the call with confirm=true after they approve. Omitting it (or " +
      "false) performs no write."
  ),
};

export type CreateStudySessionInput = z.infer<z.ZodObject<typeof createStudySessionShape>>;
export type UpdateStudyProgressInput = z.infer<z.ZodObject<typeof updateStudyProgressShape>>;
export type GetWeakTopicsInput = z.infer<z.ZodObject<typeof getWeakTopicsShape>>;
export type GetStudySessionsInput = z.infer<z.ZodObject<typeof getStudySessionsShape>>;
export type GetExamReadinessInput = z.infer<z.ZodObject<typeof getExamReadinessShape>>;
export type RecommendNextTopicInput = z.infer<z.ZodObject<typeof recommendNextTopicShape>>;
