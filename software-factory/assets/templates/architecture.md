# Architecture

This file describes the system **as it is now**. Edit it in place when the system changes.
State the present only: no dates and no account of how things got here — history lives in git
and in the plan store. Each section names the paths it describes on a `Paths:` line so stale
sections can be found.

## Purpose and context
<what this system is for and who uses it>

## Modules and boundaries
Paths: <dir/, file>
<the main parts, what each owns, and what may call what>

## Data
Paths: <dir/, file>
<what is stored, where, and who reads and writes it>

## Key flows
<the main paths through the system, end to end>

## External dependencies
<third-party services and APIs, env var NAMES (never values)>

## Invariants and baselines
<things that must stay true: budgets, test baselines, compatibility promises>

## Guarded areas
<where a human must stay in the loop: auth, billing, public API, data deletion>

## Conventions
<naming, layering, error handling, testing — the rules new code follows>

## Open questions
<known gaps and deferred work that is not tracked elsewhere>
