import { sqliteTable, text, integer, real, primaryKey, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  publicId: text("public_id").notNull().unique(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const subjects = sqliteTable(
  "subjects",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    publicId: text("public_id").notNull().unique(),
    userId: integer("user_id").notNull().references(() => users.id),
    name: text("name").notNull(),
    color: text("color"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("subjects_user_id_idx").on(t.userId)]
);

export const topics = sqliteTable(
  "topics",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    publicId: text("public_id").notNull().unique(),
    subjectId: integer("subject_id").notNull().references(() => subjects.id),
    userId: integer("user_id").notNull().references(() => users.id),
    name: text("name").notNull(),
    parentTopicId: integer("parent_topic_id"),
    orderIndex: integer("order_index").notNull().default(0),
    weight: real("weight").notNull().default(1.0),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("topics_user_id_idx").on(t.userId),
    index("topics_subject_order_idx").on(t.subjectId, t.orderIndex),
  ]
);

export const topicProgress = sqliteTable(
  "topic_progress",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    topicId: integer("topic_id").notNull().unique().references(() => topics.id),
    userId: integer("user_id").notNull().references(() => users.id),
    status: text("status", {
      enum: ["not_started", "in_progress", "completed", "needs_review"],
    })
      .notNull()
      .default("not_started"),
    masteryPct: real("mastery_pct").notNull().default(0),
    lastPracticedAt: integer("last_practiced_at"),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("topic_progress_user_id_idx").on(t.userId)]
);

export const studySessions = sqliteTable(
  "study_sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    publicId: text("public_id").notNull().unique(),
    userId: integer("user_id").notNull().references(() => users.id),
    subjectId: integer("subject_id").notNull().references(() => subjects.id),
    topicId: integer("topic_id").references(() => topics.id),
    startedAt: integer("started_at").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    notes: text("notes"),
    focusRating: integer("focus_rating"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("study_sessions_user_started_idx").on(t.userId, t.startedAt)]
);

export const exams = sqliteTable(
  "exams",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    publicId: text("public_id").notNull().unique(),
    userId: integer("user_id").notNull().references(() => users.id),
    name: text("name").notNull(),
    examDate: integer("exam_date").notNull(),
    weight: real("weight").notNull().default(1.0),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("exams_user_id_idx").on(t.userId)]
);

export const examSubjects = sqliteTable(
  "exam_subjects",
  {
    examId: integer("exam_id").notNull().references(() => exams.id),
    subjectId: integer("subject_id").notNull().references(() => subjects.id),
  },
  (t) => [primaryKey({ columns: [t.examId, t.subjectId] })]
);

export const examTopics = sqliteTable(
  "exam_topics",
  {
    examId: integer("exam_id").notNull().references(() => exams.id),
    topicId: integer("topic_id").notNull().references(() => topics.id),
    coverageWeight: real("coverage_weight").notNull().default(1.0),
  },
  (t) => [primaryKey({ columns: [t.examId, t.topicId] })]
);
