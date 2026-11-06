# Data model

Single home for entity definitions. Product reasoning lives in `design.md`; the extraction pipeline lives in `flows/syllabus-extraction.md`. Once the server exists, the schema in code (migrations and TypeScript types) becomes the source of truth and this document should explain the reasoning and link to it rather than restate every field.

## Relationships

```mermaid
erDiagram
    STUDENT ||--o{ TERM : has
    TERM ||--o{ CLASS : contains
    STUDENT }o--o{ SUPPORTER : "linked via StudentSupporterLink"
    CLASS ||--o{ EVENT : "optional"
    CLASS ||--o{ TASK : "optional"
    CLASS ||--|{ ASSIGNMENT : "required"
    EVENT ||--o{ STEP : breaks-into
    TASK ||--o{ STEP : breaks-into
    ASSIGNMENT ||--o{ STEP : breaks-into
    STUDENT ||--o{ ROUTINE : owns
    STUDENT ||--o{ CHECKIN : submits
    STUDENT ||--o{ PLANNINGSESSION : holds
    STUDENT ||--o{ DOCUMENT : uploads
    DOCUMENT ||--o{ PARSEJOB : "processed by"
    DOCUMENT ||--o{ EXTRACTEDCANDIDATE : stages
```

## People and structure

```
Student      { id, name, email, school, createdAt }
Supporter    { id, name, email, createdAt }
StudentSupporterLink { studentId, supporterId,
                       status: invited|active|revoked, invitedBy: studentId }

Term         { id, studentId, name, startsAt, endsAt }
Class        { id, termId, name }
```

- The student controls the link: only students invite and revoke (see `design.md` §10).
- A Term's dates are required context for document parsing (relative dates like "Week 5" resolve against `startsAt`).

## Calendar items

```
Event        { id, studentId, classId?, title, startsAt, endsAt,
               source: parsed|manual, volatility: stable|variable,
               templateId?, recurrenceRule? }
Task         { id, studentId, classId?, title, dueAt, status: open|done|skipped }
Assignment   { id, studentId, classId, title, dueAt, grade?, status }
```

- **Event**: has a start and end time. **Task**: due date only. **Assignment**: due date plus optional grade; the only type where `classId` is mandatory.
- `volatility: stable` events (class meetings) use `recurrenceRule` and are expanded at render time. `variable` events (hourly shifts) keep a `templateId` for the usual shape, and each week's instance is materialized and confirmed in the planning session.
- `grade` is never shown to supporters.

## Planning

```
Step         { id, parentType: event|task|assignment, parentId, title,
               plannedStartsAt, plannedEndsAt, actualCompletedAt?, order, status }
Routine      { id, studentId, name,
               template: [{ title, duration, offsetFromAnchor,
                            source: default|wizard|learned }] }

PlanningSession { id, studentId, weekStartDate,
                  status: pending|completed|skipped, completedAt? }
Retrospective   { id, studentId, weekStartDate, subjectType: event|assignment,
                  subjectId, promptKey, answer: yes|no|somewhat, answeredAt }
```

- `Step` is the table both scheduling engines write to; the "right now" view reads from it. An item with no Steps is treated as atomic.
- Project breakdowns generate Steps forward from today toward a due date; Routines generate Steps backward from an anchor Event's start.
- `actualCompletedAt` lets the feedback loop compare planned and actual, and drives `Routine` durations toward `source: learned`.

## Check-ins, reminders, notifications

```
CheckIn      { id, studentId, subjectType: task|assignment|step, subjectId,
               type: completion|location, value, at, sharedWithSupporters: bool }
Reminder     { id, targetType: student|supporter, targetId,
               type: due|initiation|missed-followup|planning-session, firesAt }
Notification { id, targetType: student|supporter, targetId, channel: push|email }
```

- `value` is `done` or `skipped` for completion check-ins and a place label for location check-ins. No coordinates are stored.
- `sharedWithSupporters` defaults to true for completion and false for location; the student can override either.

## Document ingestion

```
Document     { id, studentId, classId?, type: syllabus|schedule,
               status: pending|processing|parsed|reviewed|failed, createdAt }
ParseJob     { id, documentId, status: queued|running|succeeded|failed,
               attempts, error?, startedAt?, finishedAt?, tokensIn?, tokensOut? }
ExtractedCandidate { id, documentId, kind, title, when, location?,
               evidence: { quote, page? }, confidence, resolved?,
               issues[], needsInput, status: pending|accepted|edited|discarded }
```

- **No file reference on `Document`.** The upload is deleted when the parse job ends.
- `ParseJob` records counts and status only, never document text or model output. Token counts feed the pricing question.
- `ExtractedCandidate` is staging. `when`, `issues` and `resolved` are defined in `flows/syllabus-extraction.md` §5.

## Retention

| Data | Kept until |
|---|---|
| Uploaded file | Parse job ends (TTL of a few hours as a crash backstop) |
| `ExtractedCandidate` rows and evidence quotes | Student confirms or discards them |
| `ParseJob` rows | Open: not yet decided (they hold no content) |
| `CheckIn`, `Retrospective`, and the rest | Open: see design.md §12 (#8) |
