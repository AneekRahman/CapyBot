# Plans

Every non-trivial change to this repository gets a written plan here **before**
it is implemented. The folder doubles as the history of what was decided, why,
and what actually shipped (verified facts, not intentions).

## Conventions

- One directory per plan: `YYYY-MM-DD-<slug>/` (UTC date of writing).
- Inside it, a `plan.md` following the template below. Update its *Status*
  section as reality changes; do not rewrite past decisions to look right.
- Name files after the problem, not the fix: the fix is often wrong the first
  time; the problem statement stays true.
- Keep domain knowledge in `docs/`; a plan may point at docs, not replace them.
- A plan that changes repository architecture, configuration, or documented
  behavior names every doc that recorded the old state and updates it as part of
  shipping.
- When a plan is implemented, record the commit(s) and the verification evidence
  in the Status section. If the plan was abandoned or superseded, say so and the
  reason.

## Template

```markdown
# <Problem statement as a sentence>

**Status:** proposed / in-progress / implemented / abandoned
**Owner:** <who> · **Created:** <date> · **Shipped:** <commit(s) or "not yet">

## Problem

What is wrong, where it was observed, and how it reproduces. Include the
environment (workspace, version) and any evidence (logs, screenshots, test
failures). No proposed solutions here.

## Root cause

What actually causes it. If unknown when the plan is written, write the
hypotheses and what would confirm or refute each.

## Plan

The chosen fix, in ordered steps sized so each step is verifiable on its own.
Alternatives considered, and why they lost.

## Verification

How the fix is proven, end to end, on an isolated setup (never on live user
data; follow docs/verification/README.md).

## Status log

- <date> — <what happened>
```
