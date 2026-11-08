import { describe, it, expect } from "vitest";
import { buildTestServer, parseResult } from "./harness.js";

describe("MCP server: tool listing", () => {
  it("exposes exactly the 8 required tools", async () => {
    const { client } = await buildTestServer("alice");
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        "create_study_session",
        "get_exam_readiness",
        "get_study_sessions",
        "get_subject_progress",
        "get_syllabus",
        "get_weak_topics",
        "recommend_next_topic",
        "update_study_progress",
      ].sort()
    );
  });
});

describe("MCP server: reads", () => {
  it("get_syllabus returns alice's 3 subjects", async () => {
    const { client } = await buildTestServer("alice");
    const result = await client.callTool({ name: "get_syllabus", arguments: {} });
    const parsed = parseResult(result as any);
    expect(parsed.ok).toBe(true);
    expect(parsed.data.subjects.map((s: any) => s.name).sort()).toEqual(["Calculus II", "Organic Chemistry", "World History"]);
  });

  it("get_weak_topics ranks Vector Calculus first within Calculus II", async () => {
    const { client, seed } = await buildTestServer("alice");
    const result = await client.callTool({
      name: "get_weak_topics",
      arguments: { subjectId: seed.calc.subject.publicId },
    });
    const parsed = parseResult(result as any);
    expect(parsed.data.weakTopics[0].name).toBe("Vector Calculus");
  });

  it("get_exam_readiness surfaces a high risk level for the imminent Calculus Midterm", async () => {
    const { client, seed } = await buildTestServer("alice");
    const result = await client.callTool({ name: "get_exam_readiness", arguments: { examId: seed.calcMidterm.publicId } });
    const parsed = parseResult(result as any);
    expect(parsed.data.exams[0].riskLevel).toBe("high");
  });
});

describe("MCP server: authorization boundary", () => {
  it("alice cannot read bob's subject through get_syllabus (NOT_FOUND, no data leak)", async () => {
    const { client: aliceClient, seed } = await buildTestServer("alice");
    const result = await aliceClient.callTool({ name: "get_syllabus", arguments: { subjectId: seed.linAlg.subject.publicId } });
    const parsed = parseResult(result as any);
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe("SUBJECT_NOT_FOUND");
  });

  it("bob cannot log a session against alice's subject", async () => {
    const { client: bobClient, seed } = await buildTestServer("bob");
    const result = await bobClient.callTool({
      name: "create_study_session",
      arguments: { subjectId: seed.calc.subject.publicId, startedAt: new Date().toISOString(), durationMinutes: 20, confirm: true },
    });
    const parsed = parseResult(result as any);
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe("SUBJECT_NOT_FOUND");
  });
});

describe("MCP server: write confirmation gate", () => {
  it("create_study_session without confirm performs no write and returns CONFIRMATION_REQUIRED", async () => {
    const { client, seed } = await buildTestServer("alice");

    const before = parseResult(
      (await client.callTool({ name: "get_study_sessions", arguments: { subjectId: seed.calc.subject.publicId, limit: 50 } })) as any
    );

    const result = await client.callTool({
      name: "create_study_session",
      arguments: { subjectId: seed.calc.subject.publicId, startedAt: new Date().toISOString(), durationMinutes: 17 },
    });
    const parsed = parseResult(result as any);
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe("CONFIRMATION_REQUIRED");

    const after = parseResult(
      (await client.callTool({ name: "get_study_sessions", arguments: { subjectId: seed.calc.subject.publicId, limit: 50 } })) as any
    );
    expect(after.data.sessions.length).toBe(before.data.sessions.length);
    expect(after.data.sessions.some((s: any) => s.durationMinutes === 17)).toBe(false);
  });

  it("create_study_session with confirm=true writes the session", async () => {
    const { client, seed } = await buildTestServer("alice");
    const result = await client.callTool({
      name: "create_study_session",
      arguments: { subjectId: seed.calc.subject.publicId, startedAt: new Date().toISOString(), durationMinutes: 42, confirm: true },
    });
    const parsed = parseResult(result as any);
    expect(parsed.ok).toBe(true);
    expect(parsed.data.durationMinutes).toBe(42);
  });

  it("update_study_progress without confirm performs no write", async () => {
    const { client, seed } = await buildTestServer("alice");
    const result = await client.callTool({
      name: "update_study_progress",
      arguments: { topicId: seed.calc.topics[4].publicId, masteryPct: 100 },
    });
    const parsed = parseResult(result as any);
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe("CONFIRMATION_REQUIRED");

    const weak = await client.callTool({ name: "get_weak_topics", arguments: { subjectId: seed.calc.subject.publicId } });
    const weakParsed = parseResult(weak as any);
    expect(weakParsed.data.weakTopics.some((t: any) => t.name === "Vector Calculus")).toBe(true);
  });
});

describe("MCP server: input validation", () => {
  it("rejects create_study_session with a negative duration before the handler runs", async () => {
    const { client, seed } = await buildTestServer("alice");
    const result = (await client.callTool({
      name: "create_study_session",
      arguments: { subjectId: seed.calc.subject.publicId, startedAt: new Date().toISOString(), durationMinutes: -5, confirm: true },
    })) as any;
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Invalid arguments/i);
  });

  it("rejects update_study_progress with an out-of-range masteryPct", async () => {
    const { client, seed } = await buildTestServer("alice");
    const result = (await client.callTool({
      name: "update_study_progress",
      arguments: { topicId: seed.calc.topics[0].publicId, masteryPct: 150, confirm: true },
    })) as any;
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Invalid arguments/i);
  });
});
