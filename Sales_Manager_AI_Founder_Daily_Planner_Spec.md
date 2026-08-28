# Sales Manager – AI Founder Daily Planner Specification

## 1. Objective

Extend Sales Manager with a central **AI Daily Command Centre** that plans the user's day across all SaaS businesses and all Sales Manager agents.

The system should combine intelligence from:

- AI Lead Research & Scoring
- AI Reply & Follow-Up Agent
- AI Opportunity & Deal Agent
- Existing campaign activity
- Existing content activity
- Future customer success, product, finance and support agents

The goal is to answer:

> **What are the highest-value things I should do today, in what order, and what can Sales Manager handle without me?**

The system should reduce the need for the user to manually inspect each SaaS business, dashboard, campaign and opportunity to decide what deserves attention.

The intended operating model is:

**Agents gather intelligence → Priority Engine evaluates importance → Sales Manager handles routine work → User receives only the highest-value decisions and actions**

---

## 2. Core Principle

The Daily Planner must not become another task list.

It should actively decide:

1. What Sales Manager can handle automatically.
2. What requires user approval.
3. What genuinely requires the user personally.
4. What can wait.
5. What should be ignored.

The system should prioritise business impact rather than activity volume.

A £30,000 ARR opportunity requiring a commercial decision should always outrank reviewing a routine social media post.

---

## 3. New Main Module

Add a new primary section:

# My Day

This should be the default control layer across all businesses.

The user should be able to open Sales Manager and immediately understand:

- what matters today
- why it matters
- what Sales Manager is already handling
- what requires approval
- what requires direct action
- what has changed since the plan was generated

---

## 4. Cross-Business View

The Daily Planner must work across all SaaS businesses.

Default view:

**All Businesses**

Filters:

- All Businesses
- HeyTeam
- CloudColo
- Inspect360
- Other workspaces

Do not create a separate planner per business.

The purpose of this feature is to compare priorities across the entire portfolio.

---

## 5. Daily Planner Structure

The My Day screen should contain five primary sections.

### 1. If You Only Do One Thing Today

Show the single highest-value action.

Example:

**Get the CloudColo proposal discussion booked with XYZ Datacentres**

Reason:

- Highest combination of deal value, urgency and probability
- Prospect has reviewed proposal multiple times
- Internal decision meeting is approaching
- No next meeting is booked

This should sit at the top of the page.

---

### 2. Your Priorities Today

Ranked list of tasks requiring the user's involvement.

Example:

#### Priority 1 – Call ABC Cleaning

**Business:** HeyTeam  
**Potential ARR:** £9,600  
**Deal Probability:** 74%  
**Why Now:** Demo completed yesterday and onboarding concerns remain unresolved.  
**Objective:** Secure agreement for the MD to join the commercial discussion.  
**Estimated Time:** 10 minutes

---

#### Priority 2 – Approve Reply to XYZ Colo

**Business:** CloudColo  
**Potential ARR:** £18,000  
**Why Now:** Operations Director asked a detailed pricing question.  
**Action Required:** Review AI-prepared response.  
**Estimated Time:** 2 minutes

---

#### Priority 3 – Follow Up with DEF FM

**Business:** HeyTeam  
**Potential ARR:** £12,000  
**Why Now:** Proposal has been open for eight days.  
**Last Known Objection:** Implementation workload.  
**Recommended Action:** Send onboarding video rather than a generic follow-up.

---

### 3. Needs Your Approval

Show work already prepared by Sales Manager.

Examples:

- outbound reply
- pricing response
- campaign change
- proposal
- objection response
- sequence adjustment
- A/B test
- discount decision

Each item should have:

- business
- commercial value where applicable
- reason
- AI recommendation
- approval action

Buttons:

- Approve
- Edit
- Reject
- Snooze
- View Context

---

### 4. Sales Manager Is Handling

Show a concise summary of work being completed automatically.

Example:

**37 items being handled automatically**

- 14 follow-ups scheduled
- 8 out-of-office replies processed
- 5 contacts removed from inappropriate sequences
- 4 Apollo lists being researched
- 3 routine prospect replies handled
- 3 social posts scheduled

Do not force the user to inspect these unless there is an exception.

---

### 5. At Risk / Exceptions

Show important problems.

Examples:

- high-value deal stalled
- high-intent reply unanswered
- campaign performance deteriorating
- proposal overdue
- decision maker missing
- important task repeatedly deferred
- automation failure
- customer escalation in future modules

These should be ranked by potential commercial impact.

---

## 6. Priority Engine

Create a central:

# Founder Priority Score

Range:

0–100

The score should determine the order of items shown in My Day.

Recommended initial weighting:

### Commercial Value – 30%

How much revenue is potentially affected?

### Probability of Impact – 20%

How likely is the action to create meaningful progress?

### Urgency – 20%

Does this need to happen today?

### Human Dependency – 15%

Does this specifically require the user?

### Revenue / Deal Risk – 10%

Will delay materially damage the opportunity?

### Strategic Importance – 5%

Does this matter beyond immediate revenue?

Total:

100%

---

## 7. Priority Calculation

Application logic should calculate priority using structured inputs.

Example:

Opportunity:

£20,000 ARR

Close probability:

70%

Urgency:

High

Human dependency:

High

Deal risk:

Medium

The resulting priority should be significantly higher than:

Approve routine LinkedIn post.

The scoring system should be deterministic and explainable.

AI should interpret the context.

Application code should calculate the score.

---

## 8. Human Dependency Score

This is a critical component.

The system should determine:

> **Does the user personally need to do this?**

Examples:

### Low Human Dependency

- routine follow-up
- sending approved information
- rescheduling after out-of-office
- removing unsubscribed contact
- research processing
- routine lead scoring

Sales Manager should handle these automatically.

### Medium Human Dependency

- review AI-written proposal
- approve pricing response
- approve important outreach message

User may only need to approve.

### High Human Dependency

- negotiation
- relationship-building call
- strategic partnership conversation
- enterprise pricing decision
- handling a major objection
- important customer escalation
- senior decision-maker conversation

These should appear prominently in My Day.

---

## 9. Task Categories

Every planner item should have one of three execution categories.

### AI Handles

No user action required.

### User Approves

AI has prepared the action but needs approval.

### User Acts

Requires direct human involvement.

The planner should visually distinguish these.

---

## 10. Task Sources

Planner items should be generated from structured events across Sales Manager.

Initial sources:

### Lead Intelligence

Examples:

- unusually strong Tier A lead
- buying signal requiring immediate action
- high-value referral
- lead requiring manual review

### Reply Agent

Examples:

- high-intent response
- pricing question
- meeting request
- complaint
- complex objection
- low-confidence reply

### Opportunity Agent

Examples:

- stalled deal
- proposal requiring follow-up
- decision maker missing
- deal at risk
- important meeting
- negotiation
- next-best action

### Campaign System

Examples:

- campaign performance falls materially
- strong campaign should be scaled
- sequence needs approval
- abnormal bounce/unsubscribe rate

### Content System

Only surface content activity if genuinely important.

Routine content production should not compete with revenue opportunities.

---

## 11. Shared Event Model

Create a shared event structure that all agents can write to.

Example fields:

- event_id
- workspace_id
- source_agent
- source_entity_type
- source_entity_id
- event_type
- title
- description
- commercial_value
- probability
- urgency
- human_dependency
- risk
- strategic_importance
- recommended_action
- action_type
- due_at
- confidence
- created_at
- status

The Daily Planner should consume these events rather than directly reading arbitrary agent data.

This keeps the architecture modular.

---

## 12. Planner Item Status

Statuses:

- New
- Planned
- In Progress
- Awaiting Approval
- Completed
- Snoozed
- Delegated to AI
- Cancelled
- Superseded

When new information makes an item irrelevant:

Mark:

**Superseded**

Do not leave stale recommendations in the daily plan.

---

## 13. Available Time

Allow the user to specify:

# Available Time Today

Examples:

- 1 hour
- 2 hours
- 3 hours
- Half day
- Full day
- Custom

Sales Manager should then build the highest-value plan possible within that time.

Example:

**Available today: 3 hours**

Sales Manager creates:

09:00–09:20  
CloudColo – two high-value opportunity calls

09:20–09:35  
Review four AI-drafted responses

09:35–10:00  
HeyTeam demo

10:00–10:20  
Review proposal

10:20–10:40  
Inspect360 campaign decision

10:40–11:00  
Strategic partner outreach

The planner should optimise for impact, not filling every minute.

---

## 14. Estimated Task Duration

Each task should include an estimated duration.

Initial categories may use simple defaults:

- Approve message: 2 minutes
- Review proposal: 10 minutes
- Prospect call: 15 minutes
- Demo: meeting duration
- Campaign decision: 10 minutes
- Strategic review: 20 minutes

Allow the user to edit duration.

Over time, actual completion behaviour can refine estimates.

---

## 15. Time Blocking

The planner should support optional time blocking.

Modes:

### Priority List

Rank tasks without assigning clock times.

### Planned Day

Assign tasks into available working windows.

Do not require calendar integration for Phase 1.

Architecture should support future calendar integration.

---

## 16. Dynamic Replanning

The Daily Planner must not be static.

When commercially significant events occur, recalculate priorities.

Example:

09:00:

Priority #1 is a proposal follow-up.

10:12:

A CloudColo Operations Director replies:

"Can we discuss this today?"

The new opportunity may immediately become Priority #1.

The planner should show:

**New High-Priority Item**

and explain why the ranking changed.

---

## 17. Replanning Rules

Recalculate when:

- high-intent reply received
- meeting booked
- meeting cancelled
- important prospect replies
- opportunity changes stage
- deal becomes at risk
- proposal sent/viewed/accepted
- user completes task
- task becomes overdue
- important campaign alert occurs

Do not recalculate after trivial events such as email opens.

---

## 18. Explainability

Every planner item must answer:

# Why This Matters

Example:

**Call XYZ Today**

Because:

- £18,000 ARR opportunity
- proposal viewed six times
- prospect has board meeting tomorrow
- no follow-up meeting currently scheduled

This is essential for user trust.

Do not produce unexplained priority scores.

---

## 19. Commercial Context

Every task should show relevant commercial information where available.

Examples:

- ARR
- MRR
- opportunity value
- close probability
- lead tier
- buying intent
- campaign performance
- risk

This allows the user to understand why one activity outranks another.

---

## 20. Focus Protection

The system should identify low-value activity that is consuming disproportionate attention.

Example:

> **You have spent 45 minutes reviewing social content today while £41,000 ARR of active opportunities require action.**

Recommended:

> Move content review to later and focus on the three active opportunities.

Phase 1 may implement this using task completion data rather than active time tracking.

Do not build invasive employee-style monitoring.

---

## 21. One Thing

At the top of My Day include:

# If You Only Do One Thing Today

Select the action with the highest combination of:

- commercial impact
- urgency
- human dependency
- likelihood of progress

Include:

- action
- business
- reason
- estimated time

This is intended to prevent dashboard overload.

---

## 22. My Day Timeline

When Planned Day mode is enabled, display:

### Morning

Priority actions.

### Midday

Meetings and approvals.

### Afternoon

Lower-priority strategic items.

If exact times are available, show them.

Do not invent exact times unless the user has chosen a scheduling mode or provided availability.

---

## 23. Completion Flow

When user marks a task complete:

Prompt only when useful for outcome.

Possible outcomes:

- Completed successfully
- Waiting for prospect
- No answer
- Deal progressed
- Deal lost
- Follow-up required
- Other

The result should feed the originating agent.

Example:

Call completed.

Outcome:

"MD joining demo Friday."

Opportunity Agent updates:

- stakeholder map
- next action
- deal health
- probability

Do not create disconnected planner notes.

---

## 24. Snooze

Allow:

- Later Today
- Tomorrow
- Next Week
- Custom

If a high-priority task is repeatedly snoozed, highlight the risk.

Example:

**This £20,000 ARR opportunity has been deferred three times.**

Do not endlessly accept deferrals without showing consequences.

---

## 25. AI Delegation

Where a task does not genuinely require the user, offer:

**Let Sales Manager Handle This**

Examples:

- routine follow-up
- sending approved case study
- booking reminder
- research
- re-enrolment after out-of-office

The action should pass back to the originating agent.

---

## 26. Approval Queue

For items requiring approval, allow rapid processing.

Example:

# 5 Items Awaiting Approval

Each row:

- business
- contact/company
- type
- commercial value
- summary
- recommended action

Buttons:

- Approve
- Edit
- Reject

Support:

**Approve All Low-Risk Items**

only for categories the user has explicitly allowed.

---

## 27. Critical Alerts

Some items should appear outside the normal ranking.

Examples:

- complaint
- enterprise prospect requesting immediate call
- system automation failure causing outreach issue
- major deal at risk
- duplicate/incorrect outbound message problem
- high-value proposal acceptance

Use a:

# Critical

category.

Do not overuse it.

---

## 28. Strategic Actions

Not every important action relates to an active deal.

Allow strategic events such as:

- high-performing campaign deserves scaling
- new ICP segment strongly outperforming
- repeated objection requires messaging change
- large number of lost deals due to missing feature
- major market signal

Strategic actions should only surface when evidence is meaningful.

Example:

**Inspect360 – BTR campaign**

Positive reply rate:

7.2%

Other campaigns:

2.4%

Recommended:

Increase BTR lead volume.

---

## 29. Campaign Alerts

Initial planner alerts:

- positive reply rate materially below baseline
- unsubscribe rate exceeds threshold
- bounce rate abnormal
- campaign producing strong opportunities
- Tier A leads not being contacted
- large backlog of responses
- sequence has no active leads

Campaign alerts should be commercially meaningful.

---

## 30. End-of-Day Review

Add:

# End of Day

Automatically summarise:

### Your Actions

Completed:

8 / 10

### Sales Manager Actions

43 completed automatically

### Commercial Movement

- 2 new opportunities
- £23,400 ARR added
- 1 proposal progressed
- 1 deal moved to negotiation
- 3 meetings booked

### Outstanding

- ABC Cleaning follow-up
- CloudColo pricing approval

### Likely Priorities Tomorrow

1. ABC Cleaning
2. XYZ Colo
3. Inspect360 BTR campaign

The review should focus on outcomes rather than activity counts.

---

## 31. Daily Performance Metrics

Track:

- planned user tasks
- completed user tasks
- AI-handled actions
- approvals completed
- revenue progressed
- pipeline added
- deals progressed
- meetings booked
- high-priority items deferred

Avoid turning this into productivity surveillance.

The purpose is commercial effectiveness.

---

## 32. Weekly View

After Phase 1, architecture should support:

# This Week

Showing:

- biggest opportunities
- important meetings
- pipeline risks
- key campaigns
- strategic decisions
- major follow-ups

Phase 1 should focus on My Day.

---

## 33. Planner Intelligence

The planner should learn from outcomes over time.

Example:

If actions involving high-intent replies consistently produce meetings, increase their priority weighting.

If routine content approvals rarely affect commercial outcomes, reduce their priority.

Phase 1 does not require machine learning.

Store enough historical data to support this later.

---

## 34. User Preferences

Allow settings:

### Working Mode

- Revenue First
- Balanced
- Growth
- Custom

Default:

**Revenue First**

### Daily Available Time

Optional default.

### Start of Day

Optional.

### End of Day

Optional.

### Include Content Tasks

Default:

Only High Priority.

### Include Strategic Tasks

Default:

ON.

### Maximum Recommended Tasks

Default:

10.

Avoid showing 40 "priority" tasks.

---

## 35. Revenue First Mode

Recommended default.

Priority order should broadly favour:

1. Live revenue opportunities
2. High-intent replies
3. Meetings and negotiations
4. Proposal follow-ups
5. High-quality new leads
6. Campaign decisions
7. Strategic growth decisions
8. Content approvals
9. Routine administration

The exact order should still respond to urgency and commercial value.

---

## 36. Planner Confidence

Each recommendation should optionally retain:

- AI confidence
- evidence
- source agents

Low-confidence tasks should not outrank high-confidence revenue events without strong reason.

---

## 37. Evidence

Every recommendation should preserve its inputs.

Example:

Recommended:

**Call ABC Cleaning**

Evidence:

- Demo completed yesterday
- Implementation objection unresolved
- £9,600 ARR
- Prospect requested internal discussion
- No next meeting scheduled

This allows the user to inspect why the task exists.

---

## 38. Cross-Agent Context

The planner should not rerun all analysis itself.

It should consume structured outputs produced by the agents.

Example:

Reply Agent:

`BOOK_MEETING`

Opportunity Agent:

`Probability 72%`

Lead Intelligence:

`Tier A`

Planner:

Combines those signals and calculates priority.

Do not duplicate AI reasoning unnecessarily.

---

## 39. AI vs Application Logic

Follow the same architecture used in the other Sales Manager agents.

### AI Should

- interpret context
- summarise importance
- recommend action
- estimate human dependency
- identify strategic significance

### Application Code Should

- calculate priority
- enforce permissions
- allocate time
- maintain task state
- apply due dates
- handle business filters
- prevent duplicate tasks
- store history

Do not ask one large LLM prompt to plan the entire business without structured data.

---

## 40. Duplicate Task Prevention

Multiple agents may generate similar recommendations.

Example:

Reply Agent:

"Respond to pricing question."

Opportunity Agent:

"Address pricing before next meeting."

Planner should detect that these represent the same underlying action.

Create one planner item linked to both source events.

Do not show duplicates.

---

## 41. Task Supersession

Example:

Planner says:

"Follow up with ABC."

Before user acts, ABC replies.

The previous task should become:

**Superseded**

A new task may become:

"Respond to ABC's pricing question."

This is essential for a live planner.

---

## 42. Technical Architecture

Recommended components:

### Agent Event Bus

Receives structured events from all agents.

### Priority Engine

Calculates Founder Priority Score.

### Planner Service

Builds ranked daily task list.

### Time Allocation Service

Creates schedule from available time.

### Replanning Service

Responds to meaningful events.

### Delegation Router

Sends AI-handled tasks back to the appropriate agent.

### Planner Audit Service

Records decisions, rankings and completion.

---

## 43. Suggested Database Entities

### agent_events

- id
- workspace_id
- source_agent
- source_entity_type
- source_entity_id
- event_type
- title
- description
- commercial_value
- probability
- urgency
- human_dependency
- risk_score
- strategic_score
- confidence
- recommended_action
- action_type
- due_at
- status
- created_at

### planner_items

- id
- user_id
- workspace_id
- title
- description
- execution_type
- priority_score
- priority_level
- commercial_value
- estimated_minutes
- why_it_matters
- due_at
- planned_start
- planned_end
- status
- source_event_ids
- created_at
- completed_at

### daily_plans

- id
- user_id
- date
- available_minutes
- mode
- generated_at
- last_replanned_at

### planner_outcomes

- id
- planner_item_id
- outcome_type
- notes
- commercial_result
- resulting_event_id
- completed_at

### planner_preferences

- id
- user_id
- working_mode
- default_available_minutes
- maximum_tasks
- include_content
- include_strategy
- created_at
- updated_at

---

## 44. Priority Levels

Display simple labels:

- Critical
- High
- Medium
- Low

The underlying 0–100 score should remain available internally and within details.

Suggested initial bands:

Critical:

90–100

High:

75–89

Medium:

50–74

Low:

Below 50

Critical should remain rare.

---

## 45. Suggested Priority Formula

Initial deterministic formula:

```text
Founder Priority Score =
(Commercial Value Score × 0.30)
+ (Probability of Impact × 0.20)
+ (Urgency × 0.20)
+ (Human Dependency × 0.15)
+ (Risk × 0.10)
+ (Strategic Importance × 0.05)
```

Each component should be normalised to 0–100.

Do not use raw ARR directly without normalisation because one unusually large opportunity could distort the whole planner.

---

## 46. Commercial Value Normalisation

Use workspace/portfolio-relative bands.

Example:

0:

No meaningful commercial value.

25:

Low-value opportunity.

50:

Normal opportunity.

75:

High-value opportunity.

100:

Top-tier commercial opportunity.

This should eventually adapt to typical deal sizes per workspace.

---

## 47. Dynamic Portfolio Comparison

The planner needs to compare different businesses fairly.

Example:

A £5,000 ARR HeyTeam opportunity may be commercially significant.

A £5,000 CloudColo opportunity may be relatively small.

Commercial scoring should consider typical deal size within each SaaS business as well as absolute value.

---

## 48. My Day Row Design

Each planner row should show:

- rank
- task title
- business
- category
- commercial value
- estimated duration
- reason
- due status
- execution type

Example:

### 1. Call ABC Cleaning

HeyTeam

£9,600 ARR

**User Acts**

10 min

**Why:** High-probability deal with unresolved onboarding concern.

Buttons:

- Start
- View
- Snooze
- Delegate where allowed
- Complete

---

## 49. Mobile-Friendly Design

My Day should work particularly well on mobile.

The user should be able to:

- see priorities
- approve messages
- mark actions complete
- snooze
- review context

without needing the full desktop CRM interface.

---

## 50. Notifications

Phase 1 should keep notifications restrained.

Notify only for:

- Critical priority event
- major high-intent prospect event
- significant reprioritisation
- approval that is time-sensitive

Do not send a notification for every planner change.

---

## 51. Planner Refresh

Generate daily plan:

- on first login each day
- after user changes available time
- after significant commercial events
- after major task completion

Do not regenerate continuously.

---

## 52. Failure Handling

If one agent is unavailable:

Planner should still function using available data.

If Priority Engine fails:

Do not discard existing plan.

Show:

**Planner update failed. Existing priorities remain available.**

If AI recommendation generation fails:

Use deterministic event priority where possible.

---

## 53. Audit Trail

Record:

- why planner item was created
- source events
- original priority score
- ranking changes
- why task was reprioritised
- user snoozes
- user overrides
- delegation to AI
- outcome

This will allow future learning and debugging.

---

## 54. Phase 1 Scope

Build:

- My Day module
- shared agent events
- cross-workspace task aggregation
- Founder Priority Score
- AI Handles / User Approves / User Acts categories
- If You Only Do One Thing Today
- priority list
- available-time input
- simple time planning
- dynamic replanning
- task completion
- snooze
- AI delegation
- approval queue
- At Risk / Exceptions
- Sales Manager Is Handling summary
- end-of-day review
- audit log

Do NOT initially build:

- full calendar replacement
- employee productivity monitoring
- complex personal task management
- project management
- personal lifestyle scheduling
- automated meeting rescheduling
- complex machine learning
- full Chief of Staff functionality
- finance/customer-success integration before those agents exist

---

## 55. Recommended Build Order

### Sprint 1

Shared Agent Event model.

Planner item entity.

Cross-workspace aggregation.

---

### Sprint 2

Priority Engine.

Founder Priority Score.

Explainability.

---

### Sprint 3

My Day interface.

One Thing Today.

Ranked priorities.

AI Handles / User Approves / User Acts.

---

### Sprint 4

Completion.

Snooze.

Delegation.

Approval actions.

---

### Sprint 5

Available-time input.

Estimated durations.

Simple daily time planning.

---

### Sprint 6

Dynamic replanning.

Task supersession.

Duplicate-task detection.

---

### Sprint 7

At Risk / Exceptions.

Sales Manager Is Handling.

Critical alerts.

---

### Sprint 8

End-of-day review.

Analytics.

Audit trail.

Performance optimisation.

---

## 56. Acceptance Criteria

The feature is complete when:

- [ ] Data from multiple Sales Manager agents can generate planner events.
- [ ] Events from multiple SaaS workspaces appear in one My Day view.
- [ ] Planner items receive a deterministic priority score.
- [ ] Commercial value materially influences ranking.
- [ ] Human dependency influences ranking.
- [ ] Low-value routine work does not outrank important revenue activity.
- [ ] The user can see why every important task is recommended.
- [ ] Sales Manager clearly distinguishes AI-handled work from approval-required work and user-only work.
- [ ] The system identifies one highest-priority action for the day.
- [ ] The user can specify available time.
- [ ] Sales Manager can create a prioritised plan within that time.
- [ ] Significant new events can trigger reprioritisation.
- [ ] Outdated tasks can be superseded automatically.
- [ ] Duplicate recommendations from different agents are merged.
- [ ] User can complete, snooze and delegate eligible tasks.
- [ ] Task outcomes flow back to the originating agent.
- [ ] Critical commercial exceptions are surfaced.
- [ ] Routine AI activity is summarised rather than cluttering the plan.
- [ ] End-of-day review summarises commercial progress.
- [ ] Priority decisions and overrides are auditable.

---

## 57. Definition of Success

The primary success measure is:

> **Can the user open Sales Manager and know, within seconds, the most valuable things they personally need to do today?**

Secondary metrics:

### Time spent deciding what to work on

Target:

Near zero.

### High-priority actions completed

Target:

80%+ daily.

### User tasks that could have been automated

Should decline over time.

### Opportunities without next actions

Target:

Below 10%.

### High-value opportunities left unattended

Target:

Near zero.

### AI-handled actions vs human-handled actions

The AI share should increase without reducing commercial quality.

---

## 58. Critical Product Principle

The Daily Planner is not a productivity tool.

It is a **commercial decision engine**.

Its job is not to make the user busier.

Its job is to make sure the user's limited time is applied where human judgement, relationships and commercial intervention create the greatest value.

The system should therefore actively suppress low-value work rather than merely organise it.

---

## 59. End-State Architecture

The Sales Manager commercial operating system should now work as follows:

### Agent 1 – AI Lead Intelligence

Finds the best companies, contacts, pains and campaigns.

↓

### Agent 2 – AI Reply & Follow-Up

Handles prospect responses and routine follow-up.

↓

### Agent 3 – AI Opportunity & Deal Agent

Manages opportunities, risk, probability and next-best actions.

↓

### Agent 4 – AI Founder Daily Planner

Collects the most important outputs from all agents and decides what the user should personally do.

The complete commercial workflow becomes:

**Apollo → AI Qualification → Outreach → AI Reply Handling → Opportunity → AI Deal Management → Founder Priority Engine → User Acts Only Where Needed → Revenue**

The Daily Planner should become the primary interface the user opens each day.

Instead of asking:

> "What should I work on?"

Sales Manager should answer:

> **"These are the three things most likely to move revenue today. I am handling everything else."**
