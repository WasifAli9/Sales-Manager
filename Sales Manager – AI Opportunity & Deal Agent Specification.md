# Sales Manager – AI Opportunity & Deal Agent

## 1. Objective

Extend Sales Manager so that once a prospect shows genuine buying intent, the platform automatically creates, manages and progresses the opportunity without relying on a human to maintain a CRM manually.

The AI Opportunity & Deal Agent should answer:

1. Which prospects are now genuine opportunities?
2. What stage is each opportunity at?
3. What is blocking the deal?
4. What should happen next?
5. Which deals are most likely to close?
6. Which deals are at risk?
7. Which opportunities deserve the user's attention today?

The goal is:

**Qualified lead → Positive engagement → Opportunity created → Deal managed → Next action recommended → Revenue**

This feature should build directly on:

- AI Lead Research & Scoring
- AI Reply & Follow-Up Agent

It should not duplicate those systems.

---

# 2. Core Principle

Do not build a traditional CRM that depends on users manually updating:

- stages
- notes
- probabilities
- next actions
- contact history
- follow-up dates

Sales Manager should automatically infer as much of this as possible from actual activity.

The user should manage **exceptions and decisions**, not CRM administration.

The model should be:

**AI observes activity → Application updates deal → AI recommends next action → User intervenes when judgement is required**

---

# 3. When Should an Opportunity Be Created?

Do not create an opportunity for every lead.

An opportunity should be created when sufficient commercial intent exists.

Possible triggers:

- meeting requested
- demo requested
- pricing discussion
- proposal requested
- product fit discussion
- implementation question
- trial requested
- purchasing process discussed
- prospect explicitly confirms interest
- user manually converts lead into opportunity

The exact trigger should be configurable.

---

# 4. Automatic Opportunity Creation

When the Reply Agent classifies a response as strong buying intent, Sales Manager should evaluate whether an opportunity should be created.

Example:

Prospect replies:

> "This looks relevant. Can we arrange a demo next week?"

System actions:

1. Pause cold sequence.
2. Classify reply as BOOK_MEETING.
3. Set Buying Intent to HIGH.
4. Create Opportunity.
5. Link company and contact.
6. Add full lead research.
7. Add conversation history.
8. Set initial stage.
9. Calculate initial probability.
10. Generate recommended next action.

The user should not need to re-enter information.

---

# 5. New Main Module

Add a new primary section:

# Opportunities

This becomes the active sales pipeline.

Views:

- Pipeline
- My Actions
- At Risk
- High Priority
- Won
- Lost
- All Opportunities

---

# 6. Opportunity Pipeline

Use a Kanban-style pipeline.

Initial stages:

1. Interested
2. Discovery
3. Demo
4. Qualified
5. Proposal
6. Decision
7. Negotiation
8. Won
9. Lost

Allow workspace-specific customisation later.

Do not overcomplicate the initial stages.

---

# 7. Pipeline Card

Each opportunity card should show:

- Company
- Primary contact
- Opportunity value
- Stage
- AI probability
- Last engagement
- Next action
- Next action due date
- Deal health
- Primary pain
- Decision maker status

Example:

**ABC Cleaning**

£7,200 ARR

Stage: Demo

Probability: 68%

Health: Healthy

Primary Pain: Last-minute cover

Next Action:

**Send implementation overview**

Due:

Tomorrow

---

# 8. Opportunity Record

Clicking an opportunity opens a complete Deal Intelligence view.

Sections:

## Summary

- company
- primary contact
- stage
- opportunity value
- probability
- expected close date
- deal health

## AI Deal Summary

One concise description.

Example:

"ABC Cleaning operates across approximately 70 client sites and is evaluating HeyTeam primarily to reduce manual work involved in replacing absent cleaners. Operations Director is engaged, but the Managing Director has not yet participated."

## Pain

Primary pain.

Secondary pains.

Evidence.

## Stakeholders

People involved.

## Activity

Complete chronological timeline.

## Objections

Current objections.

## Competition

Known alternatives.

## Commercials

Pricing discussed.

Proposal value.

Discounts.

## Next Action

AI recommendation.

## Risks

Reasons deal may not close.

---

# 9. Opportunity Timeline

Combine information from:

- outbound emails
- inbound replies
- meetings
- notes
- pricing discussions
- demos
- proposals
- follow-ups
- user actions

Example:

**27 Aug**

Lead imported from Apollo.

**28 Aug**

Tier A lead identified.

**29 Aug**

Email sent.

**30 Aug**

Prospect requested information.

**30 Aug**

AI sent overview.

**3 Sep**

Prospect requested demo.

**3 Sep**

Opportunity created automatically.

**8 Sep**

Demo held.

**8 Sep**

Implementation concern identified.

Every activity must be visible in one place.

---

# 10. AI Deal Summary

The system should continuously maintain a concise summary.

Do not require users to read entire email threads.

Example:

### Deal Summary

"Sarah, Operations Director at ABC Cleaning, is actively evaluating HeyTeam. Their main issue is finding short-notice cover across approximately 60 customer sites. They currently coordinate staff through WhatsApp and phone calls. Sarah has requested a demo and asked about SMS acceptance for subcontractors. No budget objection has been raised. MD involvement is still required."

Update summary after significant activity.

---

# 11. Deal Stage Detection

AI should recommend deal-stage changes based on activity.

Examples:

### Interested

Prospect expresses interest.

### Discovery

Needs and requirements being understood.

### Demo

Demo requested or completed.

### Qualified

Problem, fit and buyer are sufficiently established.

### Proposal

Commercial proposal supplied.

### Decision

Prospect is reviewing internally.

### Negotiation

Pricing or contractual negotiation underway.

### Won

Purchase confirmed.

### Lost

Prospect confirms no purchase.

Important:

AI may recommend stage changes.

Deterministic rules should perform obvious changes.

Example:

Proposal generated and sent:

Move to Proposal.

Purchase completed:

Move to Won.

---

# 12. Manual Stage Override

The user must be able to manually change stage.

Store:

- AI recommended stage
- final stage
- user override
- timestamp

Do not immediately override a user-selected stage unless new evidence appears.

---

# 13. Deal Probability

Calculate:

# AI Close Probability

Range:

0–100%

Probability should be explainable.

Do not simply ask an LLM:

"How likely is this deal to close?"

Use a combination of:

- deal stage
- engagement
- buying intent
- decision maker involvement
- pain severity
- urgency
- budget evidence
- proposal activity
- objections
- competitor presence
- time since last interaction
- next steps agreed
- previous win/loss patterns later

---

# 14. Initial Probability Framework

Suggested baseline:

Interested:

15%

Discovery:

30%

Demo:

40%

Qualified:

55%

Proposal:

65%

Decision:

75%

Negotiation:

80%

Won:

100%

Lost:

0%

Then adjust using deal signals.

Example:

Base Proposal:

65%

+10% Economic buyer engaged

+8% Clear problem confirmed

+5% Target implementation date discussed

-10% Strong pricing objection

-15% No contact for 21 days

Result:

63%

Rules must be configurable later.

---

# 15. Deal Health

Separate probability from:

# Deal Health

Values:

- Healthy
- Needs Attention
- At Risk
- Critical

Health measures whether the opportunity is progressing properly.

Example:

An opportunity may have:

Probability:

75%

Health:

At Risk

because no one has followed up after a proposal.

---

# 16. Deal Health Signals

Potential negative signals:

- no response after agreed action
- no contact for configurable number of days
- meeting cancelled repeatedly
- prospect stops opening/responding
- unresolved objection
- missing decision maker
- no agreed next step
- proposal sent but no response
- procurement delay
- competitor introduced
- discount pressure
- implementation concern
- timeline moves repeatedly

Positive signals:

- meeting booked
- multiple stakeholders engaged
- prospect asks detailed implementation questions
- budget confirmed
- timeline established
- pricing accepted
- proposal opened
- follow-up meeting scheduled

---

# 17. Next Best Action

This is the most important feature.

Every active opportunity should have:

# Recommended Next Action

The recommendation should be specific.

Bad:

> Follow up with customer.

Good:

> Send Sarah a one-page implementation plan addressing contractor onboarding before Friday's internal meeting.

Another:

> Ask Sarah to include the Managing Director in the next call because commercial approval has not yet been established.

Another:

> Do not discount yet. The prospect has asked about price but has not objected to the current figure.

---

# 18. Next Action Categories

Initial types:

- Send follow-up
- Send information
- Book discovery
- Book demo
- Send pricing
- Create proposal
- Send proposal
- Address objection
- Involve decision maker
- Confirm budget
- Confirm timeline
- Check implementation requirements
- Re-engage
- Close deal
- Mark lost
- Wait
- Human review

Each next action should include:

- reason
- priority
- due date
- recommended content/message
- whether AI can execute

---

# 19. AI Execution

For low-risk actions, Sales Manager may offer to perform them.

Example:

Recommended:

**Send case study**

Buttons:

- Send Now
- Review
- Snooze
- Dismiss

Higher-risk actions require review.

Example:

**Respond to discount request**

Always require approval initially.

---

# 20. My Actions Screen

Create:

# My Actions

This should tell the user exactly what needs attention today.

Order by commercial importance.

Example:

## Today

### 1. ABC Cleaning — £7,200 ARR

**Action:** Send implementation overview

Reason:

"Prospect raised implementation concerns during demo."

### 2. XYZ FM — £14,400 ARR

**Action:** Bring decision maker into process

Reason:

"Operations Manager is engaged but budget holder has not participated."

### 3. Acme Services — £4,800 ARR

**Action:** Re-engage

Reason:

"Proposal sent 9 days ago with no response."

Do not force the user to browse the pipeline to discover this.

---

# 21. Priority Score for Opportunities

Create:

# Deal Attention Score

This determines which deals should appear first.

Possible inputs:

- deal value
- close probability
- health risk
- overdue actions
- buying intent
- stage
- strategic importance

Example formula:

**Potential Revenue × Probability × Urgency factor**

Then adjust for risk.

Do not display complex maths by default.

Display:

- Critical
- High
- Medium
- Low

---

# 22. Stakeholder Mapping

Track people involved in the deal.

Fields:

- name
- role
- job title
- email
- influence
- sentiment
- engagement
- last interaction

AI-estimated stakeholder roles:

- Economic Buyer
- Decision Maker
- Champion
- Technical Evaluator
- Procurement
- User
- Blocker
- Unknown

Clearly label these as estimates.

---

# 23. Missing Stakeholder Detection

AI should identify obvious gaps.

Example:

For a £20,000 ARR deal:

Operations Manager heavily engaged.

No owner / MD / finance / procurement involvement.

Sales Manager should flag:

**Decision Maker Not Confirmed**

Recommended action:

"Ask who else needs to approve the purchase."

---

# 24. Pain Tracking

Carry pain hypotheses from Lead Intelligence into the opportunity.

Once prospect confirms a pain:

Change status from:

**AI Hypothesis**

to:

**Confirmed**

Example:

Before discovery:

Likely pain:

Last-minute absence cover.

After call:

Confirmed pain:

"Operations Director says her team spends 5–8 hours per week manually finding cover."

Confirmed pains should influence:

- demo
- proposal
- follow-up
- ROI calculation
- deal strategy

---

# 25. Pain Severity

Classify confirmed pains:

- Low
- Moderate
- High
- Critical

Store supporting evidence.

Example:

**High**

"Three contract managers spend several hours each week coordinating cancellations and cover."

Do not fabricate severity.

---

# 26. Objection Tracking

Build on Reply Agent objection classifications.

Each opportunity should maintain:

# Active Objections

Example:

### Implementation effort

Status:

Open

Raised:

8 Sep

Evidence:

"We don't have time to set all our workers up."

Recommended response:

"Explain CSV import, SMS-based external worker acceptance and staged rollout."

Statuses:

- Open
- Addressed
- Resolved
- Rejected

---

# 27. Objection History

Never delete resolved objections.

This becomes valuable commercial intelligence.

Later Sales Manager should identify:

- most common objections
- objection frequency by product
- objections most associated with losses
- successful responses

Phase 1 only needs to store the data.

---

# 28. Competitor Tracking

If a prospect mentions:

- another software vendor
- spreadsheet
- internal system
- WhatsApp
- manual process
- incumbent supplier

Store it as:

# Competitive Alternative

Types:

- Competitor software
- Internal system
- Manual process
- Do nothing
- Unknown

Example:

Alternative:

Deputy

Status:

Existing system

Prospect comment:

"We already use Deputy for scheduling."

Do not assume that every alternative is a direct competitor.

---

# 29. Qualification Framework

Use a lightweight qualification model.

Do not force a complex MEDDICC-style process initially.

Track:

### Problem

Is there a confirmed business problem?

### Fit

Does product solve it?

### Authority

Do we know who makes the decision?

### Commercials

Has budget / pricing been discussed?

### Timing

Is there a timeframe?

### Next Step

Is a concrete next action agreed?

Display:

Example:

| Qualification | Status |
|---|---|
| Problem | Confirmed |
| Fit | Strong |
| Authority | Unknown |
| Commercials | Discussed |
| Timing | Q4 |
| Next Step | Demo |

---

# 30. Qualification Completeness

Calculate:

# Qualification Completeness

Example:

67%

This is not close probability.

It indicates how much useful deal information is known.

AI should then recommend questions to fill gaps.

Example:

Missing:

**Authority**

Suggested question:

"Who else would normally need to approve something like this?"

---

# 31. Meeting Integration

Phase 1 should allow meeting records to be attached manually or from existing calendar integrations if available.

Store:

- meeting date
- attendees
- type
- notes
- transcript if supplied
- outcome
- next steps

Architecture should support future automatic transcription.

---

# 32. AI Meeting Analysis

If transcript or notes are available, AI should extract:

- confirmed pains
- requirements
- objections
- stakeholders
- competitors
- pricing mentions
- budget
- timeline
- decision process
- next steps
- promises made by seller
- promises made by prospect

Return structured data.

---

# 33. Meeting Summary

Generate:

### Meeting Summary

Maximum approximately 150–250 words.

Follow with:

### Key Findings

### Objections

### Agreed Actions

### Missing Information

### Recommended Next Step

Avoid huge generic AI summaries.

---

# 34. Promises / Commitments

Track commitments made during sales conversations.

Example:

Seller promised:

- pricing document
- security overview
- implementation timeline

Prospect promised:

- introduce MD
- confirm user count
- review internally by Friday

Each should create a task.

This prevents deals being lost because something was forgotten.

---

# 35. Proposal Status

Allow proposal records to be linked to opportunities.

Fields:

- proposal ID
- amount
- recurring value
- one-off value
- sent date
- status
- expiry
- version

Statuses:

- Draft
- Sent
- Viewed
- Under Review
- Accepted
- Rejected
- Expired

If proposal functionality does not yet exist, Phase 1 can allow a link/upload/reference.

Do not build a full proposal builder as part of this feature.

---

# 36. Opportunity Value

Support:

### Monthly Recurring Revenue

### Annual Recurring Revenue

### One-Off Revenue

### Total Contract Value

Workspace should define primary metric.

For SaaS businesses, default should be ARR.

Example:

MRR:

£600

ARR:

£7,200

Setup:

£1,000

TCV Year 1:

£8,200

---

# 37. Weighted Pipeline

Calculate:

**Opportunity value × Close probability**

Example:

£10,000 ARR

Probability:

60%

Weighted ARR:

£6,000

Dashboard should show:

- Total pipeline
- Weighted pipeline
- Forecast ARR
- Won ARR

---

# 38. Expected Close Date

AI can recommend an expected close date based on:

- prospect-stated timeline
- agreed next actions
- stage
- average sales cycle later

If the prospect explicitly gives a date, prefer that.

Clearly distinguish:

**Prospect Timeline**

from

**AI Estimated Close Date**

---

# 39. Stalled Deal Detection

Define:

# Stalled

A deal is stalled when meaningful progression has stopped.

Possible logic:

- no activity for X days
- no next step
- repeated follow-ups unanswered
- stage unchanged beyond threshold

Threshold should vary by stage.

Example:

Interested:

7 days

Proposal:

10 days

Negotiation:

5 days

Configurable later.

---

# 40. Re-Engagement Recommendations

Do not generate endless:

"Just checking in."

AI should use deal context.

Example:

Instead of:

> "Just checking whether you saw my proposal."

Recommend:

> "Send the short contractor onboarding video because implementation workload was the last unresolved concern."

The system should use the reason the deal stalled.

---

# 41. Deal Risk Engine

Every opportunity should track risk factors.

Example:

### Risks

**Decision maker absent**

Severity:

High

**No confirmed implementation date**

Severity:

Medium

**Pricing objection**

Severity:

Medium

The system should explain how to reduce each risk.

---

# 42. Risk Categories

Initial categories:

- No confirmed problem
- Weak product fit
- No decision maker
- No budget
- No urgency
- No timeline
- No next step
- Competitor
- Pricing
- Implementation
- Security
- Integration
- Procurement
- No engagement
- Internal change
- Other

---

# 43. Deal Strategy

For more valuable opportunities, generate:

# AI Deal Strategy

Keep concise.

Example:

**Objective**

Get commercial sponsor involved before proposal.

**Current Strength**

Operations team strongly acknowledges problem.

**Weakness**

No evidence MD has approved spend.

**Recommended Approach**

Use next demo to quantify admin cost and request MD involvement before discussing discount.

This should not become a 10-page account plan.

---

# 44. Draft Communications

From an opportunity record, user should be able to request:

- Follow-up email
- Meeting confirmation
- Information response
- Objection response
- Re-engagement email
- Proposal cover email
- Closing email

Messages must use existing business knowledge and deal context.

The Reply Agent should remain the sending/approval mechanism.

Do not create a second email delivery system.

---

# 45. Integration With Reply Agent

This is critical.

The Opportunity Agent should consume the Reply Agent's structured outputs.

Example:

Reply Agent returns:

```json
{
  "classification": "PRICING_QUESTION",
  "buying_intent": "HIGH",
  "summary": "Prospect wants pricing for 40 users.",
  "objection": null
}
```

Opportunity Agent should:

- update activity
- update deal summary
- potentially increase probability
- create pricing action
- update qualification status

Do not analyse the same message independently in three modules.

---

# 46. Integration With Lead Intelligence

Opportunity should inherit:

- ICP score
- contact relevance
- company intelligence
- persona
- buying signals
- original pain hypothesis
- recommended value proposition
- campaign source

This allows Sales Manager to later understand:

**Which kinds of leads become revenue.**

---

# 47. Source Attribution

Every opportunity should retain:

- Apollo list
- campaign
- sequence
- lead magnet
- source channel
- original contact
- first-touch date

Example:

Source:

Apollo

Campaign:

6am Chaos

Sequence:

Commercial Cleaning Ops V2

This is required for proper ROI analysis.

---

# 48. Lost Deal Reasons

When a deal is marked Lost, require or infer a reason.

Categories:

- No budget
- No priority
- Poor fit
- Competitor chosen
- Existing solution retained
- Price
- Timing
- No decision
- Implementation concern
- Missing feature
- Security / compliance
- Procurement
- Ghosted
- Company change
- Other

AI may suggest the reason.

User can correct it.

---

# 49. Lost Deal Intelligence

Store:

- reason
- objections
- competitor
- stage lost
- value
- sales cycle
- notes

This information should later feed:

- product roadmap
- objection library
- pricing
- ICP refinement
- campaign strategy

Do not delete lost opportunities.

---

# 50. Won Opportunity Logic

When deal is marked Won:

1. Record close date.
2. Record final ARR / value.
3. Preserve source attribution.
4. Stop sales follow-ups.
5. Remove prospect from cold campaigns.
6. Mark company/customer appropriately.
7. Trigger future onboarding integration when available.

Do not automatically build onboarding in this phase.

---

# 51. Pipeline Dashboard

Add:

## Pipeline Value

Total ARR.

## Weighted Pipeline

Probability-adjusted ARR.

## Opportunities

Count.

## High Probability

Count.

## At Risk

Count.

## Expected This Month

Projected value.

## Won This Month

Actual value.

## Lost This Month

Lost value.

---

# 52. Pipeline Funnel

Display:

Interested

↓

Discovery

↓

Demo

↓

Qualified

↓

Proposal

↓

Decision

↓

Negotiation

↓

Won

Show:

- count
- total value
- conversion to next stage
- average days in stage

This enables later optimisation.

---

# 53. CEO / Founder View

The most important high-level output should be:

# What Needs My Attention?

Example:

### £41,400 ARR at risk

**XYZ FM — £18,000**

Proposal unanswered for 12 days.

Recommended:

**Call Operations Director.**

**ABC Cleaning — £7,200**

High engagement but no economic buyer.

Recommended:

**Ask Sarah to bring MD into next call.**

**DEF Maintenance — £16,200**

Security concern unresolved.

Recommended:

**Send security documentation before Friday.**

This is more useful than a normal CRM dashboard.

---

# 54. Pipeline Forecast

Create three numbers:

### Commit

Deals with strong evidence they are likely to close.

### Likely

Reasonably strong opportunities.

### Upside

Possible but uncertain.

Use AI plus deterministic criteria.

Do not present forecast as guaranteed.

---

# 55. AI Daily Deal Brief

Generate automatically inside the dashboard.

Example:

## Deal Brief

**3 actions require attention today.**

- £18k ARR proposal has stalled.
- Two high-probability demos are scheduled this week.
- One £7.2k opportunity now has a pricing objection.
- £24k weighted pipeline was added this week.

No need initially to email this externally.

---

# 56. Opportunity Search & Filters

Filters:

- workspace
- stage
- owner
- value
- probability
- health
- next action
- action due
- close date
- source
- campaign
- primary pain
- objection
- competitor
- decision maker status
- won/lost reason

Saved views should be supported later.

---

# 57. Opportunity Ownership

Even if Sales Manager is primarily used by one person initially, include:

- owner_user_id

This prevents future architectural problems.

Possible future:

- founder
- salesperson
- account manager
- reseller

---

# 58. AI Confidence

AI-generated conclusions should have confidence where relevant.

Examples:

**Estimated decision role**

72%

**Deal stage recommendation**

91%

**Lost reason**

68%

**Pain confirmed from transcript**

96%

Low-confidence conclusions should not silently overwrite important records.

---

# 59. Evidence

Important AI assertions should retain evidence.

Example:

### Budget status

Unknown.

Do not infer "budget confirmed" because the prospect asks for price.

### Timeline

Confirmed:

"Would like this live by November."

Source:

Email 12 Sep.

This reduces hallucination.

---

# 60. Human Approval Rules

AI may autonomously:

- update summaries
- create tasks
- update health
- recommend stages
- calculate probability
- identify stalled deals
- identify missing information

Require approval for:

- discounts
- negotiation
- pricing exceptions
- contractual commitments
- marking Won unless payment/order evidence exists
- major stage changes with low confidence
- communications involving sensitive commercial terms

---

# 61. Guardrails

AI must never:

- invent budget
- invent decision authority
- invent deadlines
- invent competitor information
- fabricate meeting outcomes
- mark pain as confirmed without evidence
- offer unauthorised discounts
- agree contract terms
- promise product features
- fabricate implementation dates
- state forecast as certainty

Unknown data should remain:

**Unknown**

---

# 62. Technical Architecture

Recommended components:

## Opportunity Trigger Service

Detects when leads meet opportunity criteria.

## Opportunity Service

Creates and updates opportunities.

## Deal Intelligence Service

Maintains summaries, risks and recommendations.

## Stage Engine

Handles deterministic stage rules and AI recommendations.

## Probability Engine

Calculates close probability.

## Deal Health Engine

Evaluates progression and risk.

## Next Action Engine

Produces next best action.

## Qualification Engine

Tracks known and missing commercial information.

## Pipeline Analytics Service

Calculates pipeline metrics.

Reuse existing:

- contact service
- company service
- activity history
- Reply Agent
- Lead Intelligence
- email delivery
- business knowledge base

---

# 63. AI vs Application Logic

Maintain the same architecture principle used in #1 and #2.

### AI

Interprets:

- intent
- conversation meaning
- objections
- risk
- pains
- next-step recommendations

### Application

Enforces:

- stage rules
- pipeline calculations
- opportunity values
- permissions
- status changes
- due dates
- suppression
- deterministic probability adjustments
- audit records

Do not put the entire CRM state inside one AI conversation.

---

# 64. Suggested Database Entities

## opportunities

- id
- workspace_id
- company_id
- primary_contact_id
- owner_user_id
- name
- stage
- status
- currency
- mrr
- arr
- one_off_value
- total_contract_value
- probability
- health
- expected_close_date
- source
- campaign_id
- sequence_id
- created_at
- updated_at
- won_at
- lost_at

## opportunity_contacts

- id
- opportunity_id
- contact_id
- stakeholder_role
- influence
- sentiment
- decision_role_confidence
- primary_contact
- created_at

## opportunity_intelligence

- id
- opportunity_id
- summary
- primary_pain
- pain_severity
- qualification_score
- deal_strategy
- recommended_next_action
- next_action_reason
- next_action_due
- attention_priority
- updated_at

## opportunity_risks

- id
- opportunity_id
- risk_type
- description
- severity
- evidence
- status
- recommended_mitigation
- created_at
- resolved_at

## opportunity_objections

- id
- opportunity_id
- objection_type
- description
- evidence
- status
- raised_at
- resolved_at

## opportunity_qualification

- id
- opportunity_id
- problem_status
- fit_status
- authority_status
- commercials_status
- timing_status
- next_step_status
- completeness_score
- updated_at

## opportunity_stage_history

- id
- opportunity_id
- from_stage
- to_stage
- change_source
- ai_confidence
- reason
- changed_at

## opportunity_actions

- id
- opportunity_id
- action_type
- description
- due_at
- priority
- status
- generated_by
- completed_at

## competitors

- id
- opportunity_id
- name
- type
- notes
- evidence
- created_at

## lost_deal_details

- id
- opportunity_id
- reason
- competitor
- notes
- ai_suggested_reason
- user_confirmed
- created_at

---

# 65. Opportunity Creation Logic

Example decision logic:

Create automatically when:

- reply classification = BOOK_MEETING

OR

- demo booked

OR

- proposal requested

OR

- user manually converts

OR

- high buying intent + configured trigger

Do not automatically create from:

- generic email open
- website visit
- low-intent reply
- "send information" alone unless configured

---

# 66. Opportunity Deduplication

Before creating an opportunity, check whether:

- company already has active opportunity
- same contact already has opportunity
- same campaign created duplicate
- duplicate inbound event occurred

If active opportunity exists:

Attach new activity instead of creating another record.

Allow multiple opportunities for one company later when genuinely required.

---

# 67. AI Update Cycle

Re-evaluate an opportunity when a meaningful event occurs.

Examples:

- prospect replies
- meeting completed
- proposal sent
- proposal viewed
- meeting booked
- user adds note
- objection added
- stakeholder added
- pricing changed

Do not continuously call AI unnecessarily.

---

# 68. Cost Control

Avoid running expensive AI analysis after trivial events.

Do not regenerate deal intelligence for:

- email opens
- insignificant metadata changes
- UI views

Run only after commercially meaningful events.

Cache summaries.

---

# 69. Audit Log

Every major AI-driven update must record:

- previous value
- new value
- reason
- event source
- AI confidence
- whether automatically applied
- whether user changed it

Especially:

- stage
- probability
- health
- next action
- lost reason
- stakeholder role

---

# 70. Settings

Add:

# Opportunity Settings

### Automatically create opportunities

Default:

ON

### Opportunity trigger

Default:

High commercial intent.

### Auto-update opportunity stage

Default:

ON for deterministic events.

### Allow AI stage recommendations

Default:

ON

### Require approval for low-confidence stage changes

Default:

ON

### Stalled deal threshold

Default:

Stage dependent.

### Auto-generate next actions

Default:

ON

### Deal risk alerts

Default:

ON

### Default pipeline currency

Workspace setting.

### Default opportunity metric

ARR / MRR / TCV.

---

# 71. Phase 1 Scope

Build:

- opportunity creation
- pipeline
- Deal Intelligence page
- stage management
- opportunity values
- activity timeline
- AI deal summary
- close probability
- deal health
- next best action
- My Actions
- qualification status
- stakeholder tracking
- pain tracking
- objections
- deal risks
- stalled opportunity detection
- won/lost handling
- weighted pipeline
- basic forecast
- audit trail

Do NOT initially build:

- full proposal builder
- contract management
- e-signatures
- invoicing
- sophisticated revenue forecasting
- automatic call recording
- advanced machine-learning predictions
- account-based sales orchestration
- complex MEDDICC
- commission management
- onboarding
- customer success

---

# 72. Recommended Build Order

Build in this order.

## Sprint 1

Opportunity entity.

Opportunity creation triggers.

Pipeline.

Manual stage management.

## Sprint 2

Deal Intelligence page.

Timeline.

Inherited Lead Intelligence data.

Inherited Reply Agent data.

## Sprint 3

Qualification framework.

Pain confirmation.

Stakeholders.

Objections.

## Sprint 4

Probability engine.

Health engine.

Risk detection.

Stalled deal logic.

## Sprint 5

Next Best Action.

My Actions dashboard.

Action scheduling.

## Sprint 6

Weighted pipeline.

Forecast.

Won/lost analysis.

Lost reasons.

## Sprint 7

AI summaries.

Deal strategies.

AI stage recommendations.

Confidence and evidence.

## Sprint 8

Analytics.

Audit trail.

Performance optimisation.

---

# 73. Acceptance Criteria

The feature is complete when:

- [ ] Genuine buying intent can automatically create an opportunity.
- [ ] Duplicate opportunities are prevented.
- [ ] Opportunities inherit Lead Intelligence information.
- [ ] Opportunities inherit Reply Agent conversation activity.
- [ ] Users can manage opportunities visually in a pipeline.
- [ ] Each opportunity has a complete activity timeline.
- [ ] AI maintains a concise deal summary.
- [ ] Primary pain can move from hypothesis to confirmed.
- [ ] Stakeholders can be mapped.
- [ ] Missing decision makers can be detected.
- [ ] Objections are captured and tracked.
- [ ] Deal risks are identified.
- [ ] Qualification gaps are visible.
- [ ] Close probability is calculated consistently.
- [ ] Deal probability is explainable.
- [ ] Deal Health is separate from probability.
- [ ] Stalled opportunities are detected.
- [ ] Every active opportunity receives a recommended next action where appropriate.
- [ ] My Actions prioritises deals requiring attention.
- [ ] Opportunity values support ARR.
- [ ] Weighted pipeline is calculated.
- [ ] Won and Lost opportunities are retained.
- [ ] Lost reasons are captured.
- [ ] AI-generated information distinguishes evidence from inference.
- [ ] Low-confidence AI conclusions cannot silently make high-risk changes.
- [ ] Major automated changes are audited.

---

# 74. Definition of Success

The main success metric is not:

**How many opportunities are stored?**

It is:

**Can the user open Sales Manager and immediately know exactly which deals require action and what action is most likely to move them forward?**

Secondary measures:

### CRM administration time

Target:

Near zero.

### Opportunities with a defined next action

Target:

90%+

### Opportunities with no activity beyond threshold

Target:

Less than 10%.

### Proposal-to-close conversion

Should improve over time.

### Sales cycle duration

Should decline as stalled deals are identified sooner.

### Pipeline accuracy

Forecast should become more accurate as historical data accumulates.

---

# 75. End-State Workflow

With all three modules operating together:

## Step 1 – Find

Apollo contacts are imported.

**AI Lead Intelligence** identifies:

- best companies
- best contacts
- likely pain
- recommended campaign

## Step 2 – Engage

Sales Manager executes the sequence.

**AI Reply & Follow-Up Agent**:

- understands replies
- stops inappropriate automation
- handles routine responses
- schedules follow-ups

## Step 3 – Convert

A prospect demonstrates buying intent.

**AI Opportunity & Deal Agent** automatically creates an opportunity.

## Step 4 – Progress

Sales Manager monitors:

- stakeholders
- pain
- objections
- engagement
- stage
- probability
- risk
- next action

## Step 5 – Focus

The user opens:

**My Actions**

and only deals with the opportunities where human judgement or intervention is genuinely required.

## Step 6 – Close

Opportunity becomes:

**Won**

Revenue and source are recorded.

The complete system therefore becomes:

**Apollo → AI Qualification → Outreach → AI Reply Handling → Opportunity → AI Deal Management → Won Revenue**

That should be the commercial backbone of Sales Manager before adding broader operating-system functionality.