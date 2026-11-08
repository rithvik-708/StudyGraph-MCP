export type ErrorCode =
  | "SUBJECT_NOT_FOUND"
  | "TOPIC_NOT_FOUND"
  | "EXAM_NOT_FOUND"
  | "SESSION_NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFIRMATION_REQUIRED"
  | "NO_FIELDS_PROVIDED"
  | "INVALID_CREDENTIALS"
  | "INVALID_TOKEN";

export class AppError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "AppError";
  }
}

export class SubjectNotFoundError extends AppError {
  constructor(subjectId?: string) {
    super("SUBJECT_NOT_FOUND", subjectId ? `Subject '${subjectId}' was not found.` : "Subject was not found.");
  }
}

export class TopicNotFoundError extends AppError {
  constructor(topicId?: string) {
    super("TOPIC_NOT_FOUND", topicId ? `Topic '${topicId}' was not found.` : "Topic was not found.");
  }
}

export class ExamNotFoundError extends AppError {
  constructor(examId?: string) {
    super("EXAM_NOT_FOUND", examId ? `Exam '${examId}' was not found.` : "Exam was not found.");
  }
}

export class SessionNotFoundError extends AppError {
  constructor(sessionId?: string) {
    super("SESSION_NOT_FOUND", sessionId ? `Study session '${sessionId}' was not found.` : "Study session was not found.");
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super("VALIDATION_ERROR", message);
  }
}

export class ConfirmationRequiredError extends AppError {
  constructor(message = "This action modifies data and requires confirm=true after the user has approved it.") {
    super("CONFIRMATION_REQUIRED", message);
  }
}

export class NoFieldsProvidedError extends AppError {
  constructor(message = "At least one field to update must be provided.") {
    super("NO_FIELDS_PROVIDED", message);
  }
}

export class InvalidCredentialsError extends AppError {
  constructor() {
    super("INVALID_CREDENTIALS", "Invalid username or password.");
  }
}

export class InvalidTokenError extends AppError {
  constructor(message = "The provided auth token is missing, malformed, or expired.") {
    super("INVALID_TOKEN", message);
  }
}
