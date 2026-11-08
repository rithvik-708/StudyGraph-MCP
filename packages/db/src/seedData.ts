/**
 * Core seeding logic, factored out of seed.ts so both the `npm run seed` CLI script and
 * tests/evals can populate an identical, hand-computable fixture dataset against any DB
 * instance (a real file or an in-memory one).
 *
 *  - alice: the "primary" demo user with a rich dataset used by the demo (Phase 6) and
 *    most eval scenarios.
 *  - bob: a second user with minimal data, used only to test cross-user authorization
 *    boundaries in evals.
 */
import bcrypt from "bcryptjs";
import type { DB } from "./client.js";
import { genId } from "./ids.js";
import { users, subjects, topics, topicProgress, studySessions, exams, examSubjects, examTopics } from "./schema.js";

const DAY_MS = 24 * 60 * 60 * 1000;

type TopicSeed = {
  name: string;
  weight: number;
  masteryPct: number;
  status: "not_started" | "in_progress" | "completed" | "needs_review";
  lastPracticedDaysAgo: number | null;
};

export async function seedDemoData(db: DB, sqlite: { exec: (sql: string) => void }) {
  const now = Date.now();
  const daysAgo = (n: number) => now - n * DAY_MS;
  const daysFromNow = (n: number) => now + n * DAY_MS;

  // Wipe in FK-safe order so this is safe to call repeatedly.
  for (const table of ["exam_topics", "exam_subjects", "exams", "study_sessions", "topic_progress", "topics", "subjects", "users"]) {
    sqlite.exec(`DELETE FROM ${table};`);
  }

  const passwordHash = (pw: string) => bcrypt.hashSync(pw, 10);

  const [alice] = await db
    .insert(users)
    .values({
      publicId: genId("usr"),
      username: "alice",
      email: "alice@example.com",
      passwordHash: passwordHash("StudyHard!1"),
      displayName: "Alice Chen",
      createdAt: daysAgo(90),
    })
    .returning();

  const [bob] = await db
    .insert(users)
    .values({
      publicId: genId("usr"),
      username: "bob",
      email: "bob@example.com",
      passwordHash: passwordHash("StudyHard!2"),
      displayName: "Bob Diaz",
      createdAt: daysAgo(60),
    })
    .returning();

  async function makeSubjectWithTopics(userId: number, subjectName: string, topicSeeds: TopicSeed[]) {
    const [subject] = await db
      .insert(subjects)
      .values({ publicId: genId("sub"), userId, name: subjectName, createdAt: daysAgo(80) })
      .returning();

    const createdTopics = [];
    for (let i = 0; i < topicSeeds.length; i++) {
      const seed = topicSeeds[i];
      const [topic] = await db
        .insert(topics)
        .values({
          publicId: genId("top"),
          subjectId: subject.id,
          userId,
          name: seed.name,
          orderIndex: i,
          weight: seed.weight,
          createdAt: daysAgo(80),
        })
        .returning();

      await db.insert(topicProgress).values({
        topicId: topic.id,
        userId,
        status: seed.status,
        masteryPct: seed.masteryPct,
        lastPracticedAt: seed.lastPracticedDaysAgo === null ? null : daysAgo(seed.lastPracticedDaysAgo),
        updatedAt: seed.lastPracticedDaysAgo === null ? daysAgo(80) : daysAgo(seed.lastPracticedDaysAgo),
      });

      createdTopics.push(topic);
    }
    return { subject, topics: createdTopics };
  }

  const calc = await makeSubjectWithTopics(alice.id, "Calculus II", [
    { name: "Integration Techniques", weight: 1.2, masteryPct: 75, status: "completed", lastPracticedDaysAgo: 3 },
    { name: "Sequences and Series", weight: 1.5, masteryPct: 40, status: "in_progress", lastPracticedDaysAgo: 12 },
    { name: "Parametric Equations", weight: 1.0, masteryPct: 55, status: "needs_review", lastPracticedDaysAgo: 6 },
    { name: "Polar Coordinates", weight: 0.8, masteryPct: 85, status: "completed", lastPracticedDaysAgo: 1 },
    { name: "Vector Calculus", weight: 1.3, masteryPct: 20, status: "not_started", lastPracticedDaysAgo: null },
  ]);

  const chem = await makeSubjectWithTopics(alice.id, "Organic Chemistry", [
    { name: "Nomenclature", weight: 0.5, masteryPct: 90, status: "completed", lastPracticedDaysAgo: 5 },
    { name: "Reaction Mechanisms", weight: 1.5, masteryPct: 35, status: "in_progress", lastPracticedDaysAgo: 15 },
    { name: "Stereochemistry", weight: 1.0, masteryPct: 60, status: "in_progress", lastPracticedDaysAgo: 4 },
    { name: "Spectroscopy", weight: 1.0, masteryPct: 50, status: "needs_review", lastPracticedDaysAgo: 1 },
    { name: "Aromatic Compounds", weight: 0.8, masteryPct: 70, status: "completed", lastPracticedDaysAgo: 6 },
  ]);

  const history = await makeSubjectWithTopics(alice.id, "World History", [
    { name: "Industrial Revolution", weight: 1.0, masteryPct: 80, status: "completed", lastPracticedDaysAgo: 10 },
    { name: "World War I", weight: 1.0, masteryPct: 65, status: "in_progress", lastPracticedDaysAgo: 8 },
    { name: "Cold War", weight: 1.0, masteryPct: 30, status: "not_started", lastPracticedDaysAgo: null },
    { name: "Decolonization", weight: 1.0, masteryPct: 55, status: "needs_review", lastPracticedDaysAgo: 20 },
    { name: "Globalization", weight: 1.0, masteryPct: 45, status: "in_progress", lastPracticedDaysAgo: 9 },
  ]);

  type SessionSeed = {
    subjectId: number;
    topicId: number;
    daysAgo: number;
    durationMinutes: number;
    notes?: string;
    focusRating?: number;
  };

  const sessionSeeds: SessionSeed[] = [
    { subjectId: calc.subject.id, topicId: calc.topics[3].id, daysAgo: 1, durationMinutes: 45, notes: "Practice problems, polar graphs", focusRating: 4 },
    { subjectId: calc.subject.id, topicId: calc.topics[0].id, daysAgo: 3, durationMinutes: 60, notes: "Review integration by parts", focusRating: 5 },
    { subjectId: calc.subject.id, topicId: calc.topics[2].id, daysAgo: 6, durationMinutes: 30, notes: "Parametric curves worksheet", focusRating: 3 },
    { subjectId: calc.subject.id, topicId: calc.topics[1].id, daysAgo: 12, durationMinutes: 90, notes: "Series convergence tests", focusRating: 3 },
    { subjectId: chem.subject.id, topicId: chem.topics[3].id, daysAgo: 1, durationMinutes: 40, notes: "IR spectra practice", focusRating: 4 },
    { subjectId: chem.subject.id, topicId: chem.topics[2].id, daysAgo: 4, durationMinutes: 50, notes: "Stereo-isomer drawings", focusRating: 4 },
    { subjectId: chem.subject.id, topicId: chem.topics[1].id, daysAgo: 15, durationMinutes: 100, notes: "SN1/SN2 mechanisms", focusRating: 2 },
    { subjectId: history.subject.id, topicId: history.topics[1].id, daysAgo: 8, durationMinutes: 35, notes: "WWI causes timeline", focusRating: 3 },
    { subjectId: history.subject.id, topicId: history.topics[4].id, daysAgo: 9, durationMinutes: 25, notes: "Globalization reading", focusRating: 3 },
  ];

  for (const s of sessionSeeds) {
    await db.insert(studySessions).values({
      publicId: genId("ses"),
      userId: alice.id,
      subjectId: s.subjectId,
      topicId: s.topicId,
      startedAt: daysAgo(s.daysAgo),
      durationMinutes: s.durationMinutes,
      notes: s.notes ?? null,
      focusRating: s.focusRating ?? null,
      createdAt: daysAgo(s.daysAgo),
    });
  }

  const [calcMidterm] = await db
    .insert(exams)
    .values({
      publicId: genId("exm"),
      userId: alice.id,
      name: "Calculus Midterm",
      examDate: daysFromNow(5),
      weight: 2.0,
      createdAt: daysAgo(30),
    })
    .returning();
  await db.insert(examSubjects).values({ examId: calcMidterm.id, subjectId: calc.subject.id });
  const calcCoverage = [1.0, 1.5, 1.0, 0.8, 1.2];
  for (let i = 0; i < calc.topics.length; i++) {
    await db.insert(examTopics).values({ examId: calcMidterm.id, topicId: calc.topics[i].id, coverageWeight: calcCoverage[i] });
  }

  const [chemFinal] = await db
    .insert(exams)
    .values({
      publicId: genId("exm"),
      userId: alice.id,
      name: "Organic Chemistry Final",
      examDate: daysFromNow(20),
      weight: 1.5,
      createdAt: daysAgo(30),
    })
    .returning();
  await db.insert(examSubjects).values({ examId: chemFinal.id, subjectId: chem.subject.id });
  const chemCoverage = [0.5, 1.5, 1.0, 1.0, 0.8];
  for (let i = 0; i < chem.topics.length; i++) {
    await db.insert(examTopics).values({ examId: chemFinal.id, topicId: chem.topics[i].id, coverageWeight: chemCoverage[i] });
  }
  // World History intentionally has no exam, to exercise "no upcoming exam for this subject" paths.

  const linAlg = await makeSubjectWithTopics(bob.id, "Linear Algebra", [
    { name: "Matrix Operations", weight: 1.0, masteryPct: 50, status: "in_progress", lastPracticedDaysAgo: 2 },
    { name: "Eigenvalues", weight: 1.0, masteryPct: 30, status: "not_started", lastPracticedDaysAgo: null },
  ]);

  const [linAlgQuiz] = await db
    .insert(exams)
    .values({ publicId: genId("exm"), userId: bob.id, name: "Linear Algebra Quiz", examDate: daysFromNow(3), weight: 1.0, createdAt: daysAgo(10) })
    .returning();
  await db.insert(examSubjects).values({ examId: linAlgQuiz.id, subjectId: linAlg.subject.id });
  for (const topic of linAlg.topics) {
    await db.insert(examTopics).values({ examId: linAlgQuiz.id, topicId: topic.id, coverageWeight: 1.0 });
  }

  await db.insert(studySessions).values({
    publicId: genId("ses"),
    userId: bob.id,
    subjectId: linAlg.subject.id,
    topicId: linAlg.topics[0].id,
    startedAt: daysAgo(2),
    durationMinutes: 40,
    notes: "Matrix multiplication practice",
    focusRating: 3,
    createdAt: daysAgo(2),
  });

  return { alice, bob, calc, chem, history, linAlg, calcMidterm, chemFinal, linAlgQuiz };
}
