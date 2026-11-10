# Architecture: {{title}}

## Fit
<which existing services/modules this touches, and how>

## Endpoints
<route + verb + purpose, one line each — or "none">

## Data
<new or changed tables/collections, with outlines of the queries that will hit them>

## Flow
<the end-to-end call order for the main path: what calls what>

## External
<third-party APIs, env var NAMES (never values), webhooks — or "none">

## Decisions
<one line each: "- <decision> — instead of <alternative> — because <reason>". These become ADRs at close-out.>

## Load-bearing bets
<assumptions this design rests on, each with the spike that proved it (see 00-research.md) or "unproven">

## Where a human must stay in the loop
<auth, billing, public API, data deletion, anything irreversible — or "nowhere">
