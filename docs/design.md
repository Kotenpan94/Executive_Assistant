# Executive Assistant — Design Doc

Living record of product and architecture decisions. Supersedes/expands on `App Summary.docx` (the original seed doc) — where they conflict, this document reflects the current decision and should say so.

## 1. Product framing

**What it is**: an app that coaches college students with executive functioning (EF) challenges through the normal logistics of college life — planning, time management, task initiation, follow-through.

**What it explicitly is not**: an academic coach. It never answers content questions, never grades, never gives feedback on academic performance. The line is: help with *when and how*, never *what* or *how well*.

**Who it's for**: college students with EF challenges (ADHD, anxiety-driven avoidance, etc.) who know what they need to do but struggle to plan, estimate time, start tasks, or hold a mental model of competing deadlines.

**Guiding principles** (apply these when making future decisions, not just where they were first raised):
- **Autonomy-building, not supervision.** A stated goal is weaning students off needing parental/supporter support over time. Supporters are "cheerleaders," not co-managers.
- **Minimal data collection.** This is a vulnerable population; the business model should favor charging more over monetizing data. No ad SDKs, no data resale, least-data-necessary for every feature (e.g., location check-ins store a place label, never a GPS trail).
- **Uncertainty is an invitation, not a flaw.** When AI extraction is unsure, surface the guess rather than hide it — being asked to confirm/correct is itself useful planning practice for this population.
- **Process over outcome.** Feedback loops (retrospective, reporting) ask about planning behavior ("did you give yourself enough time"), never academic outcome ("how'd you do").

## 2. Roadmap

Following the original phase plan from `App Summary.docx`:

- **Phase 1 — Framework**: data model + stores, student/supporter account screens, event/task/assignment CRUD, syllabus-upload-to-event pipeline.
- **Phase 2 — Basic buildout**: check-ins, notifications + supporter emails.
- **Phase 3 — Intelligence pt. 1**: auto-suggested study schedules (project breakdown + routine chains), progress reporting.
- **Phase 4 — Intelligence pt. 2**: feedback-loop refinement (retrospective-driven learning on `Routine` durations and breakdown estimates).

**Backlog (post-Phase 4, not designed yet)**: peer encouragement / leaderboards. Flagged risk if revisited: competitive comparison can backfire for an anxiety-prone population — lean toward opt-in, non-ranked, effort-based signals rather than a ranked leaderboard.

## 3. Architecture

- **Client**: Expo Router app (this repo) — iOS/Android/Web from one codebase.
- **Server** (not yet built): Node + TypeScript, Fastify API, Postgres, S3-compatible object storage for uploaded documents, a job table for the async document-parsing pipeline (no need for Redis/BullMQ at MVP scale), Claude for AI extraction/breakdown, Expo push notifications.

## 4. Core entities

```
Student      { id, name, email, school, createdAt }
Supporter    { id, name, email, createdAt }
StudentSupporterLink { studentId, supporterId, status: 'invited'|'active'|'revoked', invitedBy: studentId }

Term         { id, studentId, name, startsAt, endsAt }
Class        { id, termId, name }

Event        { id, studentId, classId?, title, startsAt, endsAt,
               source: 'parsed'|'manual', volatility: 'stable'|'variable',
               templateId?, recurrenceRule? }
Task         { id, studentId, classId?, title, dueAt, status: 'open'|'done'|'skipped' }
Assignment   { id, studentId, classId, title, dueAt, grade?, status }
  -- classId is mandatory only on Assignment; optional on Event/Task

Step         { id, parentType: 'event'|'task'|'assignment', parentId, title,
               plannedStartsAt, plannedEndsAt, actualCompletedAt?, order, status }
Routine      { id, studentId, name,
               template: [{ title, duration, offsetFromAnchor, source: 'default'|'wizard'|'learned' }] }

PlanningSession { id, studentId, weekStartDate, status: 'pending'|'completed'|'skipped', completedAt? }
Retrospective    { id, studentId, weekStartDate, subjectType: 'event'|'assignment', subjectId,
                    promptKey, answer: 'yes'|'no'|'somewhat', answeredAt }

CheckIn      { id, studentId, subjectType: 'task'|'assignment'|'step', subjectId,
               type: 'completion'|'location', value, at, sharedWithSupporters: bool }

Document     { id, studentId, classId?, type: 'syllabus'|'schedule', fileUrl,
               status: 'pending'|'parsed'|'reviewed', createdAt }
Reminder     { id, targetType: 'student'|'supporter', targetId,
               type: 'due'|'initiation'|'missed-followup', firesAt }
Notification { id, targetType: 'student'|'supporter', targetId, channel: 'push'|'email' }
```

**Why Event/Task/Assignment are separate types**: an Event has a start+end time on a date (class meeting, exam). A Task has just a due date. An Assignment has a due date and an optional grade, and is the only one of the three where a Class link is mandatory. Students experience these as one merged calendar (distinguished visually by icon/color), but the underlying types stay distinct.

## 5. The two scheduling engines

Everything about planning reduces to two mechanisms, both of which populate the same `Step` table:

**Engine 1 — "What should I be doing right now?"**
The hero screen. Given the current timestamp, resolve whichever `Step` (or atomic item, if nothing was broken down) has a time window containing "now," with a defined fallback for gaps ("nothing scheduled — here's what's next / what's overdue"). Day/week/month views are just human-browsable projections of this same underlying resolved schedule.

**Engine 2 — Decomposition**, which is two different mechanisms, not one generic "breakdown" feature:
- **Project breakdown** (essay due in a week → research/write/review/turn-in): content-aware, AI-proposed at review time, calendar-aware placement into the student's actual free time. One-off per assignment.
- **Routine chains** (class at noon → wake → dress/eat → commute, backward-scheduled from the anchor time): duration-and-dependency-aware, not content-aware. Modeled as a reusable `Routine` template that attaches to any Event with a fixed start time/location — not just class meetings; a sports game or work shift is equally eligible.

**Routine setup**: a one-time wizard pre-filled with smart defaults (so the student is confirming numbers, not typing from scratch), then durations drift over time based on observed check-in behavior (`source: 'learned'`). This is deliberately a hybrid of "smart defaults," "lightweight wizard," and "learn from data" rather than picking just one.

## 6. Document upload → AI extraction → review

1. Student uploads a syllabus or personal schedule (file/photo/camera).
2. Server queues a parsing job; an LLM extracts candidate items (class meetings, exams/quizzes, assignment due dates), each tagged with a type guess and a confidence signal.
3. **Review screen — nothing is ever auto-committed.** Each candidate is an editable card (accept/edit/discard). Low-confidence guesses are surfaced rather than hidden, clearly marked uncertain — starting from a flawed draft is easier than an empty form for this population, and the correction itself is useful planning engagement.
4. For Assignment-type items with a due date more than a few days out, the review card offers "break this into steps?" — accepting triggers the project-breakdown engine inline, so the student leaves review with both a date and a starting plan.
5. Confirmed items become real `Event`/`Assignment` rows (+ any accepted `Step`s), tied back to the source `Document`.

**Manual entry** (job shifts, team practices, anything not from a syllabus): same "Add Event" screen, supports recurrence (none/daily/weekly/monthly) with an end condition. No new entity — these are `Event` rows with a `recurrenceRule`, virtually expanded at render time if `volatility: 'stable'`. Location is optional but makes the item eligible for a `Routine` the same way a class is.

**Variable-schedule handling** (the "my shift hours change weekly" problem): rather than building single-instance recurrence exceptions in Phase 1, variable-volatility events carry a `templateId` representing the usual shape, and each week's actual instance gets confirmed/edited during the weekly planning session. Falls back to the template's default if the student skips confirming — never leaves a gap.

## 7. Weekly planning session

A ritual, on a student-chosen day (default: before the new week starts), in two parts:

1. **Look back — retrospective.** A capped 2–3 process-focused yes/no/somewhat questions about the prior week, generated from higher-stakes items and/or plan-vs-actual divergence (e.g., "You had a quiz Thursday — did you give yourself enough time to study?"). Never about academic outcome. This is the training signal for the Phase 4 feedback loop: a "no" biases future similar breakdowns/routines toward more lead time. *(Not yet fleshed out in detail — flagged for a later pass.)*
2. **Look forward.** Confirm this week's fixed commitments (including variable-schedule instances) → review upcoming assignments/tasks → system proposes work blocks in remaining free time → student accepts/moves/skips each.

If a student skips the session entirely, the system still generates a best-effort week (stable commitments + template defaults for variable ones + whatever work blocks it can place) — the session makes the plan *better and reviewed*, its absence shouldn't mean no plan at all.

Day-of changes don't require re-running the ritual — a student can always edit/delete a single Event instance directly; the session is the cadence for getting ahead of the week, not the only entry point.

## 8. Check-ins

- **Completion check-in**: not a separate mechanism — it's the UI framing ("check in," not "mark complete") for setting a Task/Assignment/Step's status to done/skipped. Triggered by student tap, or by a `missed-followup` nudge if a planned window passes unconfirmed.
- **Location check-in**: opt-in per item (toggle "ask me to check in here"), never continuous tracking. At the expected time, a prompt to confirm a place label (e.g. "Library") — device location, if permitted, only suggests the label, it's never stored as an ongoing coordinate trail.
- **Supporter visibility**: `CheckIn.sharedWithSupporters` defaults to `true` for completion check-ins, `false` for location check-ins (student can override either way). Completion is unambiguously cheer-worthy; location edges toward monitoring, so it stays opt-in for sharing even when the check-in feature itself is turned on.

## 9. Supporters

- Many-to-many with students (`StudentSupporterLink`); **student controls the relationship** — invites and revokes, not the other way around.
- **Default permissions**: view-only. Supporters see check-ins the student shares and basic calendar info (titles/times) — never task breakdowns, subtasks, grades, raw location, or AI-coaching interactions.
- Supporters cannot create, edit, or delete anything on the student's behalf — a deliberate departure from the original doc's "students and supporters can manually create tasks" line, in favor of the autonomy-building principle.
- Noted for later, not designed yet: supporter visibility might need to *taper* over time as a student demonstrates consistency (ties to the "wean off support" goal) — a natural Phase 3/4 feature once there's behavioral data to act on.

## 10. Screen inventory

| Screen | Status |
|---|---|
| Sign up | exists (`src/app/sign-up.tsx`) |
| Sign in | missing — needs adding |
| Today/Now view | repurpose `(tabs)/index.tsx` — this should be the hero screen per Engine 1, not a generic agenda |
| Week/Month/Term views | new |
| Create class / Term | new |
| Upload syllabus | new |
| Review extracted events | new |
| Add/Edit event (incl. recurrence) | new |
| Task/Assignment breakdown | new |
| Weekly planning session (retrospective + forward planning) | new |
| Check-in (completion/location) | new |
| Settings/profile | repurpose `(tabs)/explore.tsx` or add fresh |

## 11. Open questions (not yet resolved)

- **#5 — Notification/nudge tone and frequency.** How pushy the system should be, and how the "cheerleader not pressure" principle translates into actual copy and timing rules.
- **#6 — Supporter invite flow.** How a student actually adds a supporter, and check-in email cadence (immediate vs. digest).
- **#7 — Onboarding sequence.** First-session path to value, given EF users are prone to abandoning multi-step setup.
- **#8 — Privacy/retention specifics.** Concrete retention windows for location check-ins and documents, consistent with the minimal-data-collection principle.
- **Business/cost questions from the original doc**, not design decisions but need real research before provider selection: cost of a notification/SMS service at scale, and cost of AI-based syllabus extraction per document.

## 12. Retrospective design — flagged for a later pass

The weekly retrospective (§7.1) is sketched but not fully designed: exact question bank, how many questions is too many, how answers concretely adjust `Routine`/breakdown estimates. Revisit before Phase 4.
