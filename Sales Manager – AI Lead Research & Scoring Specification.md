# Sales Manager – AI Lead Research & Scoring

## 1. Objective

Extend Sales Manager so that every lead imported from Apollo is automatically researched, qualified, scored, prioritised and routed into the most appropriate outreach campaign.

The system should reduce the need for a human to manually review Apollo lists before launching campaigns.

The goal is:

**Apollo import → AI company research → ICP fit analysis → lead score → pain hypothesis → prioritisation → campaign recommendation**

Sales Manager should answer five questions automatically:

1. Is this company actually a good fit?
2. Is this person the right person to contact?
3. What problem are they most likely to care about?
4. How strongly should we prioritise them?
5. Which campaign and messaging angle should they receive?

---

# 2. Core Principle

Apollo provides contact data.

Sales Manager should provide **commercial intelligence**.

Do not treat every imported Apollo contact equally.

A list of 5,000 contacts should be transformed into something more useful, for example:

- 320 Tier A prospects
- 1,180 Tier B prospects
- 2,300 Tier C prospects
- 1,200 rejected / poor fit

The system should help the user focus outreach effort where the probability of conversion is highest.

---

# 3. New Processing Stage

Insert a new stage between:

**Apollo Import**

and

**Email Sequence Enrolment**

The flow becomes:

**Apollo Import**

↓

**AI Research**

↓

**ICP Qualification**

↓

**Lead Scoring**

↓

**Pain / Opportunity Analysis**

↓

**Campaign Recommendation**

↓

**Approved for Outreach**

↓

**Sequence**

A prospect should not automatically enter an email sequence immediately after Apollo import unless the user specifically enables this.

---

# 4. New Main Module

Add a new section to Sales Manager:

# Lead Intelligence

This should display all imported companies and contacts with AI-generated qualification data.

The Lead Intelligence module should be optimised for reviewing large lists quickly.

---

# 5. Lead Intelligence Table

Each row should display:

- Contact name
- Job title
- Company
- Company website
- Industry
- Employee count
- Location
- ICP score
- Contact relevance score
- Buying signal score
- Overall priority score
- Tier
- Primary pain hypothesis
- Recommended campaign
- Research status
- Outreach status

Example:

| Contact | Company | ICP | Contact | Intent | Overall | Tier | Pain |
|---|---|---:|---:|---:|---:|---|---|
| Sarah Jones | ABC Cleaning | 94 | 96 | 72 | 89 | A | Last-minute workforce cover |
| James Patel | XYZ FM | 81 | 88 | 55 | 76 | B | Contractor coordination |
| Mark Smith | Acme | 39 | 67 | 25 | 42 | C | Weak fit |

Allow sorting and filtering by every score.

---

# 6. Company-Level Research

Research should primarily happen at company level.

Do not repeatedly research the same company for every contact.

Create a shared Company Intelligence record.

For every imported company, attempt to determine:

- what the company actually does
- industry
- sub-sector
- company size
- approximate employee count
- geographical coverage
- number of locations where relevant
- customer type
- business model
- services offered
- whether they match the target ICP
- likely operational complexity
- likely workforce structure
- likely buying triggers
- obvious disqualifiers
- relevant website evidence

Use Apollo information first.

Then enrich with permitted external/public information where available.

---

# 7. Research Sources

The architecture should support multiple research sources.

Initial supported sources may include:

1. Apollo data
2. Company website
3. Search engine results
4. Public LinkedIn/company information where legally and technically available
5. Approved third-party enrichment APIs

The system should be modular so research sources can be added later.

Do not tightly couple the scoring engine to one enrichment provider.

---

# 8. Website Research

For every company with a valid website, Sales Manager should analyse relevant website content.

Attempt to understand:

- homepage positioning
- services
- sectors served
- locations
- customer types
- team size signals
- operational model
- job vacancies
- major customers where publicly stated
- technology references
- certifications
- recent growth signals
- site count
- branch count
- relevant operational complexity

Do not simply analyse homepage keywords.

The AI should determine what the company appears to actually do.

---

# 9. Business-Specific ICP

Sales Manager manages multiple SaaS businesses.

Each workspace must have its own ICP definition.

Example:

## HeyTeam

Potential ICP:

- commercial cleaning companies
- facilities management providers
- maintenance businesses
- field service operators
- contractor-heavy businesses

Potential characteristics:

- multiple sites
- shift workers
- subcontractors
- frequent last-minute cover
- workforce coordination complexity

## CloudColo

Completely different ICP.

The Lead Intelligence engine must never use another workspace's ICP criteria.

---

# 10. ICP Configuration

Add a section within each workspace:

# ICP Definition

Allow the user to define:

### Target industries

Examples:

- Commercial Cleaning
- Facilities Management
- Property Maintenance

### Target company size

Examples:

Employee range:

20–500

Revenue range where available.

### Target geography

Examples:

United Kingdom  
United States

### Target roles

Examples:

- Owner
- Founder
- Managing Director
- Operations Director
- Operations Manager

### Positive characteristics

Examples:

- multiple customer sites
- mobile workforce
- contractors
- shift-based workforce
- reactive jobs

### Negative characteristics

Examples:

- residential-only cleaner
- sole trader
- recruitment agency
- software company
- unrelated industry

### Hard exclusions

Examples:

Employee count below 5.

Or:

Country outside allowed territory.

The scoring engine must distinguish between:

**Preferences**

and

**Hard exclusions.**

---

# 11. Company ICP Score

Calculate:

# ICP Fit Score

Range:

**0–100**

The score should measure how closely the company matches the configured ideal customer profile.

Example scoring model:

### Industry fit — 25 points

Perfect target sector:

25

Adjacent sector:

10–20

Unrelated:

0

### Company size — 15 points

Inside ideal range:

15

Near ideal:

5–10

Clearly unsuitable:

0

### Operational complexity — 20 points

Signals such as:

- multiple sites
- mobile workforce
- contractors
- shifts
- field workers

### Geographic fit — 10 points

Target market:

10

Outside market:

0

### Problem fit — 20 points

Evidence that likely problems match product value proposition.

### Growth / buying signals — 10 points

Recruitment, expansion, new sites, operational growth etc.

Total:

100.

Weights must be configurable later.

---

# 12. Contact Relevance Score

A good company can still contain the wrong contact.

Calculate a separate:

# Contact Relevance Score

Range:

0–100

Determine whether the individual is likely to:

- experience the problem
- influence the buying decision
- control budget
- own the operational process

Consider:

- job title
- seniority
- department
- company size
- target personas configured in workspace

Example for HeyTeam:

Operations Director:

95

Operations Manager:

95

Managing Director:

90

Owner:

90

Facilities Manager:

80

Finance Manager:

30

Marketing Manager:

10

The values should not rely entirely on static title mapping.

AI should interpret unusual job titles.

For example:

**Director of Service Delivery**

may be highly relevant even if not explicitly configured.

---

# 13. Role Classification

Classify each contact into a standard persona group.

Initial groups:

- Founder / Owner
- CEO / Managing Director
- Operations
- Facilities
- Service Delivery
- Workforce / Scheduling
- HR / People
- Finance
- IT
- Procurement
- Sales / Marketing
- Other

Also calculate:

**Decision role**

Possible values:

- Economic Buyer
- Decision Maker
- Champion
- Influencer
- User
- Unknown

Do not present this as fact.

Store as:

**AI-estimated role**

---

# 14. Buying Signal Score

Create:

# Buying Signal Score

Range:

0–100

This should represent whether there are public indications that this company may have a reason to act now.

Potential signals include:

- hiring rapidly
- recruiting relevant operational roles
- opening new locations
- winning major contracts
- expanding geographically
- acquiring another business
- new leadership
- operational change
- increasing headcount
- relevant regulatory change
- technology transformation
- customer service complaints
- evidence of outdated processes
- significant growth

Absence of signals should not mean poor ICP fit.

Buying Signal Score is separate from ICP Score.

---

# 15. Signal Evidence

Every buying signal must include evidence.

Example:

## Signal

**Rapid recruitment**

Evidence:

"Company careers page currently lists 17 cleaning operative vacancies across four locations."

Date detected:

27 August 2026

Source:

Company careers page

Confidence:

93%

Do not let AI manufacture buying signals without evidence.

---

# 16. Pain Hypothesis

For every qualified company, AI should identify the most likely pain point relevant to the SaaS product.

This should be called:

# Pain Hypothesis

Not:

"Known problem."

Unless the prospect has explicitly confirmed it.

Example:

### HeyTeam

Primary Pain Hypothesis:

**Last-minute workforce cover**

Reason:

"ABC Cleaning operates across multiple client sites and is recruiting mobile cleaning operatives."

Secondary:

**Coordinating permanent staff and external contractors**

Confidence:

78%

---

# 17. Pain Categories

Each SaaS workspace should have configurable pain categories.

For HeyTeam, examples could include:

- last-minute absence cover
- finding available workers
- contractor coordination
- multiple-site workforce coordination
- excessive WhatsApp / phone calls
- missed jobs
- poor crew visibility
- scheduling administration
- customer communication
- compliance / access requirements

Each pain category should map to:

- messaging angle
- email campaign
- video
- lead magnet
- landing page
- relevant feature

This allows research to drive outreach automatically.

---

# 18. Value Proposition Matching

AI should determine which value proposition is most relevant for the company.

Example:

Company:

Commercial cleaner with 180 staff.

Pain:

Last-minute sickness and absence.

Recommended value proposition:

**Fill jobs without ringing around your workforce.**

Not:

**AI-powered workforce management platform.**

The system should prioritise the practical business outcome rather than generic product descriptions.

---

# 19. Recommended Campaign

Once the company and contact have been analysed, recommend the most relevant existing campaign.

Example:

### Campaign Recommendation

**6am Chaos – Emergency Cover**

Reason:

"Company employs cleaners across multiple client sites and advertises frequent shift-based roles."

Confidence:

86%

If no suitable campaign exists:

Show:

**No suitable campaign found.**

Recommended action:

**Create campaign for contractor coordination.**

Do not automatically create campaigns without user approval in Phase 1.

---

# 20. Campaign Routing

Add optional automation:

### Automatically assign Tier A and B leads to recommended campaigns

Default:

OFF.

When enabled:

Only enrol leads where:

- ICP score meets threshold
- Contact score meets threshold
- research is complete
- campaign confidence meets threshold
- contact is not suppressed
- contact is not already active in another campaign

---

# 21. Overall Priority Score

Create a consolidated score:

# Priority Score

0–100

Suggested initial formula:

**45% ICP Fit**

**30% Contact Relevance**

**25% Buying Signals**

Example:

ICP:

90

Contact:

95

Signal:

60

Overall:

85.5

Display as:

**86**

This formula must be configurable later.

---

# 22. Tiering

Convert Priority Score into a simple tier.

### Tier A

85–100

Highest priority.

Use stronger research-driven personalisation.

### Tier B

70–84

Strong prospect.

Standard targeted campaign.

### Tier C

50–69

Possible fit but lower priority.

Use lower-cost nurture or broader outreach.

### Tier D

Below 50

Do not contact by default.

Thresholds should be configurable.

---

# 23. Hard Disqualification

Some prospects should automatically fail regardless of score.

Examples:

- prohibited geography
- clearly unrelated industry
- existing customer
- competitor
- employee count below minimum where configured
- missing valid email
- suppressed contact
- personal email where business email required

Display:

**DISQUALIFIED**

and reason.

Example:

**Disqualified: Company has 2 employees. Minimum configured size is 10.**

---

# 24. Research Status

Every lead/company should have a research state.

Statuses:

- Not Started
- Queued
- Researching
- Complete
- Partial
- Failed
- Needs Review

Do not hold up an entire Apollo import because one company cannot be researched.

---

# 25. Company Intelligence Card

Clicking a company should open:

# Company Intelligence

## Overview

Company name  
Website  
Industry  
Location  
Employees  
Locations  
Apollo data

## What They Do

Short AI summary.

Example:

"ABC Cleaning provides contract commercial cleaning services to offices, schools and healthcare sites across London and the South East."

## ICP Fit

Score:

92/100

Reasoning:

- direct commercial cleaning provider
- approximately 150 employees
- multiple client sites
- target geography
- operational workforce

## Likely Challenges

1. Last-minute absence cover
2. Coordinating staff across customer sites
3. Managing subcontractors

## Buying Signals

- currently recruiting 12 cleaning operatives
- opened Manchester branch
- recently won healthcare contract

## Recommended Angle

"Focus outreach on filling last-minute jobs without manual calling."

## Recommended Campaign

6am Chaos.

---

# 26. Contact Intelligence Card

Each person should have:

## Contact

Name  
Role  
Email  
LinkedIn URL if provided  
Company

## Persona

Operations

## Estimated Decision Role

Champion / Decision Maker

## Contact Relevance Score

94/100

## Why This Person

"Operations Director is likely responsible for service delivery, staff availability and contract fulfilment."

## Suggested Opening Angle

"Managing last-minute cover across multiple client sites."

## Personalisation Facts

Only display externally verifiable facts.

Example:

- joined company in 2024
- leads regional operations
- company currently expanding

Do not create creepy or irrelevant personalisation.

---

# 27. Personalisation Generation

For Tier A leads, create a small set of safe personalisation data.

Generate:

### Company observation

One factual sentence.

### Relevant pain hypothesis

One sentence.

### Outreach hook

One sentence.

Example:

**Observation**

"You operate commercial cleaning contracts across multiple customer sites."

**Pain Hypothesis**

"That usually creates a lot of pressure when somebody calls off at short notice."

**Outreach Hook**

"We built HeyTeam specifically to automate finding available cover without ringing around."

Avoid meaningless personalisation such as:

"I saw your impressive website."

or:

"Congratulations on your exciting journey."

---

# 28. AI Output Schema

Research output should use structured JSON.

Example:

```json
{
  "company_summary": "Commercial cleaning provider operating across London and the South East.",
  "industry": "Commercial Cleaning",
  "subsector": "Contract Cleaning",
  "icp_score": 92,
  "icp_reasoning": [
    "Direct target sector",
    "Estimated 150 employees",
    "Multiple client locations",
    "Target geography"
  ],
  "operational_complexity": "high",
  "primary_pain": "Last-minute workforce cover",
  "secondary_pains": [
    "Multi-site workforce coordination",
    "Contractor communication"
  ],
  "pain_confidence": 82,
  "buying_signal_score": 67,
  "buying_signals": [
    {
      "signal": "Recruiting cleaning operatives",
      "confidence": 94
    }
  ],
  "recommended_campaign": "6am Chaos",
  "campaign_confidence": 88
}
```

Contact analysis should be a separate structured object.

---

# 29. Evidence vs AI Inference

The UI must clearly distinguish:

### Confirmed Data

Example:

"145 employees – Apollo"

### Public Evidence

Example:

"Five regional offices listed on website."

### AI Inference

Example:

"Likely experiences complex workforce coordination."

Never display AI inference as a confirmed fact.

Use labels where necessary:

**AI Hypothesis**

**AI Estimated**

**Public Evidence**

---

# 30. Research Cost Control

This feature could become unnecessarily expensive if badly designed.

Implement research in stages.

### Stage 1 – Apollo qualification

Use existing Apollo data.

Reject obvious poor fits before using external research.

### Stage 2 – Website analysis

Only research companies passing minimum fit threshold.

### Stage 3 – Deeper research

Only perform expensive research for higher-value prospects.

Example:

Tier A candidates receive deeper research.

Tier C prospects do not.

Add configurable research budgets if necessary.

---

# 31. Company Deduplication

If 12 contacts come from the same company:

Research the company once.

Store shared Company Intelligence.

Then analyse each contact individually.

This is essential for:

- cost
- speed
- consistency

Use:

- domain
- company ID
- normalised company name

for deduplication.

---

# 32. Research Cache

Do not repeatedly research the same company every time it appears in a campaign.

Store:

- last researched date
- website snapshot/reference
- AI analysis version
- intelligence freshness

Default company research freshness:

30 days.

Allow:

**Refresh Research**

button.

---

# 33. Re-Research Triggers

Research may be refreshed when:

- company has not been researched for configured period
- user manually requests refresh
- company website changes significantly
- new buying signal is discovered
- company enters a high-value opportunity

Phase 1 can use time-based refresh only.

---

# 34. Apollo Import Changes

Current Apollo import flow should be updated.

After import, show:

# Import Complete

5,000 contacts imported.

Then:

**Run AI Qualification**

Estimated processing:

- 2,340 unique companies
- 5,000 contacts

Do not automatically send any emails until analysis is complete unless configured.

---

# 35. Import Summary

After processing show:

## Lead Intelligence Summary

**5,000 contacts analysed**

### Tier A

421

### Tier B

1,208

### Tier C

1,876

### Disqualified

1,495

Top reasons for rejection:

- company too small
- wrong industry
- incorrect role
- outside target geography

Top predicted pains:

- last-minute cover
- multi-site scheduling
- contractor coordination

Recommended campaigns:

- 6am Chaos: 683
- Contractor Coordination: 492
- Operations Visibility: 311

---

# 36. User Review

Allow bulk actions.

Examples:

### Select Tier A

Actions:

- Add to campaign
- Export
- Mark approved
- Re-run research
- Change tier
- Exclude
- Assign campaign

Allow users to manually override:

- ICP score
- contact score
- tier
- pain
- campaign

Store AI recommendation separately from final user decision.

---

# 37. Learning from Corrections

When the user changes:

ICP status  
Pain category  
Campaign  
Tier  
Contact relevance

store:

- original AI result
- user change
- timestamp

Example:

AI:

Tier B

User:

Tier A

Reason optionally:

"Owners convert better in firms this size."

This correction data should eventually improve future scoring.

Phase 1 does not require model training.

---

# 38. Suppression & Existing Contacts

Before approving outreach, check whether contact:

- has unsubscribed
- is suppressed
- is an existing customer
- is already an open opportunity
- is already active in a campaign
- has recently been contacted
- has bounced previously

Display warnings.

Do not automatically re-contact suppressed users.

---

# 39. Existing Customer Detection

If imported Apollo data contains an existing customer:

Mark:

**Existing Customer**

Do not place them into cold outbound.

If company matches but email differs, use company/domain matching where appropriate.

---

# 40. Duplicate Contact Detection

Detect duplicate contacts based on:

- email
- Apollo contact ID
- LinkedIn URL
- company + name

Avoid creating multiple records or enrolling the same person repeatedly.

---

# 41. Campaign Performance Feedback

Once enough data exists, Lead Intelligence should eventually use actual Sales Manager performance.

Example:

Sales Manager discovers:

Operations Managers at commercial cleaners with 50–250 staff respond at 8.2%.

Managing Directors respond at 3.1%.

The system should later use this to refine prioritisation.

For Phase 1:

Store the data required for future performance-based scoring.

Do not build advanced predictive modelling yet.

---

# 42. Lead Intelligence Dashboard

Add high-level metrics.

## Current List

Total contacts  
Unique companies  
Research completed  
Tier A  
Tier B  
Tier C  
Disqualified

## Average Scores

ICP fit  
Contact relevance  
Buying intent  
Priority

## Best Segments

Examples:

Commercial cleaners 50–250 employees

Operations Directors

London / South East

## Most Common Pains

Display count and percentage.

---

# 43. Recommended Filters

Allow filtering by:

- workspace
- Apollo list
- campaign
- country
- industry
- company size
- job role
- ICP score
- contact score
- buying signal score
- priority score
- tier
- pain category
- recommended campaign
- research status
- outreach status

Allow saved filters.

Example:

**Tier A Cleaning Ops Directors**

---

# 44. Search

Allow free-text search across:

- company
- contact
- website
- title
- pain
- campaign

---

# 45. Workspace Knowledge

Lead Intelligence should use existing Sales Manager workspace information.

Inputs:

- website analysis
- ICP
- value proposition
- product features
- target sectors
- existing campaigns

Do not require the user to re-enter information already stored.

---

# 46. AI Research Prompt Behaviour

The AI should be instructed to:

- analyse evidence conservatively
- distinguish fact from inference
- avoid inventing company information
- avoid assuming a problem merely because the SaaS solves it
- provide confidence scores
- return structured JSON only

A key system instruction should be:

"Do not assume the prospect has a problem. Determine whether public information supports a reasonable hypothesis that the problem may exist."

---

# 47. Guardrails

The AI must never:

- invent company facts
- invent employee counts where no estimate is available
- claim a business uses software without evidence
- invent customer names
- invent contracts
- invent growth
- invent job vacancies
- claim a pain point as confirmed without evidence
- fabricate buying signals
- create fake personalisation

If information is unavailable:

Return:

**Unknown**

rather than guessing.

---

# 48. External Research Failure

If website cannot be accessed:

Continue using available Apollo data.

Mark research:

**Partial**

Do not fail entire lead.

If external search fails:

Use Apollo + website data where available.

If AI fails:

Mark:

**Needs Review**

Do not enrol automatically.

---

# 49. Technical Architecture

Recommended components:

## Apollo Import Service

Existing service.

Extend to create:

- company records
- contact records
- research jobs

## Company Research Service

Responsible for:

- website retrieval
- enrichment
- company facts
- buying signals

## ICP Evaluation Service

Compares company against workspace ICP.

## Contact Evaluation Service

Scores person against target personas.

## Pain Matching Service

Matches company evidence against configured pain categories.

## Campaign Recommendation Service

Maps pains/personas to existing campaigns.

## Scoring Engine

Calculates deterministic scores.

## Research Queue

Processes jobs asynchronously within application infrastructure.

## Audit Service

Stores AI outputs and overrides.

---

# 50. AI vs Deterministic Code

As with the Reply Agent:

AI should interpret.

Application code should score and enforce rules.

Example:

AI returns:

```json
{
  "industry_match": "strong",
  "operational_complexity": "high",
  "target_geography": true,
  "company_size": 120
}
```

Application calculates:

Industry: 25/25  
Complexity: 18/20  
Geography: 10/10  
Size: 15/15

Do not ask the model:

"What score out of 100 should I give this lead?"

without deterministic scoring criteria.

This improves:

- consistency
- explainability
- debugging
- future optimisation

---

# 51. Suggested Database Entities

## company_intelligence

- id
- company_id
- workspace_id
- summary
- industry
- subsector
- employee_estimate
- locations_estimate
- operating_model
- complexity
- researched_at
- research_status
- research_version
- source_data

## company_icp_analysis

- id
- company_id
- workspace_id
- industry_score
- size_score
- geography_score
- complexity_score
- problem_fit_score
- signal_score
- total_score
- disqualified
- disqualification_reason
- reasoning
- created_at

## contact_intelligence

- id
- contact_id
- persona
- estimated_decision_role
- role_relevance
- seniority_relevance
- contact_score
- reasoning
- created_at

## buying_signals

- id
- company_id
- signal_type
- description
- evidence
- source
- source_url
- confidence
- detected_at

## pain_hypotheses

- id
- company_id
- workspace_id
- pain_category
- confidence
- evidence
- priority

## lead_scores

- id
- contact_id
- company_id
- icp_score
- contact_score
- buying_signal_score
- priority_score
- tier
- calculated_at

## campaign_recommendations

- id
- contact_id
- campaign_id
- confidence
- reason
- created_at

---

# 52. Research Job Queue

Do not attempt to analyse an Apollo import in one synchronous request.

Use queued jobs.

Example:

Import 5,000 contacts.

System:

1. deduplicates companies
2. creates research jobs
3. processes companies
4. analyses contacts
5. calculates scores
6. displays progress

Show progress:

**1,842 / 2,340 companies researched**

Allow user to leave page while processing.

---

# 53. Rate Limiting

Respect:

- enrichment provider limits
- Apollo limits
- website request limits
- LLM limits

Use retry and backoff.

Do not repeatedly hammer company websites.

---

# 54. Data Freshness

Display:

**Last researched**

Example:

24 August 2026.

Allow user to identify stale data.

Potential status:

- Fresh
- Ageing
- Stale

Suggested defaults:

Fresh:

0–30 days

Ageing:

31–90 days

Stale:

90+ days

---

# 55. Research Transparency

Click:

**Why this score?**

Display:

### ICP Score: 92

Industry:

25/25

Size:

15/15

Geography:

10/10

Operational complexity:

18/20

Problem fit:

18/20

Buying signals:

6/10

This makes the AI explainable.

Do not show users a mysterious "92" with no reasoning.

---

# 56. Bulk Campaign Routing

Once research is complete allow:

**Add Qualified Leads to Campaign**

Example modal:

Selected:

421 Tier A leads.

Recommended campaign distribution:

6am Chaos:

210

Contractor Coordination:

134

Multi-Site Scheduling:

77

Actions:

- Approve Recommendations
- Review
- Manually Choose Campaign
- Cancel

Do not scatter Tier A prospects into campaigns without visibility.

---

# 57. Tier-Specific Outreach

Prepare architecture so different tiers can receive different levels of personalisation.

### Tier A

Use:

- company research
- pain hypothesis
- personalised first line
- sector-specific messaging

### Tier B

Use:

- sector
- persona
- pain category

### Tier C

Use:

- broad ICP campaign

Phase 1 only needs to expose the variables to the sequence engine.

Do not redesign the entire email system.

---

# 58. Sequence Variables

Make Lead Intelligence values available to existing email sequences.

Potential merge fields:

`{{company_summary}}`

`{{primary_pain}}`

`{{company_observation}}`

`{{relevant_value_proposition}}`

`{{buying_signal}}`

`{{recommended_hook}}`

`{{persona}}`

Do not expose raw AI reasoning as merge variables.

---

# 59. Safe Personalisation Rule

Any merge field used in outbound communication must be categorised as:

### Safe to Send

or

### Internal Only

Example:

Safe:

"Your website shows you operate across London and Essex."

Internal only:

"AI estimates you may struggle with staff absence."

Do not accidentally send speculative internal analysis as if it were fact.

---

# 60. Settings

Add:

# Lead Intelligence Settings

### Run AI qualification after Apollo import

Default:

ON

### Auto-reject hard exclusions

Default:

ON

### Minimum ICP score for deeper research

Default:

50

### Tier A threshold

Default:

85

### Tier B threshold

Default:

70

### Tier C threshold

Default:

50

### Automatically enrol qualified leads

Default:

OFF

### Research freshness

Default:

30 days

### Deep research Tier A prospects

Default:

ON

### Require valid company website

Default:

OFF

---

# 61. Audit Log

Record:

- imported data
- research sources used
- AI interpretation
- score calculation
- tier assignment
- campaign recommendation
- user overrides
- research refreshes

This will be important when scoring improves later.

---

# 62. Phase 1 Scope

Build only:

- Apollo import integration
- company deduplication
- company website analysis
- ICP configuration
- ICP scoring
- contact role scoring
- buying signal support where accessible
- pain hypothesis
- priority scoring
- tiering
- Lead Intelligence table
- Company Intelligence card
- Contact Intelligence card
- campaign recommendation
- bulk campaign assignment
- audit trail

Do NOT initially build:

- full LinkedIn scraping
- intent-data vendor integrations
- predictive machine learning
- autonomous web crawling at massive scale
- automatic creation of new campaigns
- social listening
- competitor intelligence
- advanced technographic enrichment
- AI-generated company dossiers several pages long

Keep the first release commercially useful and operationally manageable.

---

# 63. Recommended Build Order

Build in this exact order.

## Sprint 1

Update Apollo import.

Company/contact normalisation.

Deduplication.

Research states.

## Sprint 2

Workspace ICP configuration.

Hard exclusion logic.

Basic deterministic company scoring.

## Sprint 3

Website research.

Structured company intelligence.

Company Intelligence card.

## Sprint 4

Contact persona analysis.

Contact relevance score.

Decision-role estimation.

## Sprint 5

Pain hypothesis.

Value proposition matching.

Campaign recommendation.

## Sprint 6

Priority score.

Tiering.

Lead Intelligence table.

Filters and bulk actions.

## Sprint 7

Research caching.

Refresh logic.

Audit trail.

Sequence variables.

## Sprint 8

Buying signals where appropriate data sources are available.

Deep research for Tier A leads.

Analytics.

---

# 64. Acceptance Criteria

The feature is complete when:

- [ ] Apollo contacts can be imported into Lead Intelligence.
- [ ] Contacts are linked to deduplicated companies.
- [ ] Companies are researched once rather than once per contact.
- [ ] Every company is evaluated against the correct workspace ICP.
- [ ] Hard exclusions are applied automatically.
- [ ] Every qualifying company receives an ICP score.
- [ ] Every contact receives a Contact Relevance score.
- [ ] AI classifies the individual's likely persona.
- [ ] AI estimates the individual's likely decision role.
- [ ] Qualified companies receive at least one pain hypothesis where evidence supports it.
- [ ] Pain hypotheses are clearly marked as inference rather than fact.
- [ ] Buying signals require evidence.
- [ ] Priority Score is calculated consistently.
- [ ] Leads are assigned Tier A, B, C or D.
- [ ] Users can see exactly why a score was assigned.
- [ ] Recommended campaigns can be generated.
- [ ] Users can bulk assign qualified prospects to campaigns.
- [ ] Existing customers and suppressed contacts are not automatically enrolled.
- [ ] Research failures do not cause the overall import to fail.
- [ ] AI does not mix business information between workspaces.
- [ ] AI-generated personalisation does not invent facts.
- [ ] User corrections are preserved.
- [ ] Research is cached to prevent unnecessary repeated cost.

---

# 65. Definition of Success

Do not measure this module based on how much information it collects.

Measure whether it improves outbound efficiency.

Key metrics:

### Percentage of imported contacts rejected before outreach

This indicates how much bad data the system removes.

### Positive reply rate by tier

Tier A should materially outperform Tier B and C.

### Meeting rate by tier

The strongest leads should generate more meetings.

### Conversion rate by persona

Identify who actually buys.

### Conversion rate by pain hypothesis

Determine which problems drive revenue.

### Conversion rate by campaign recommendation

Determine whether AI routing works.

---

# 66. Critical Product Principle

The purpose of this feature is not to create impressive-looking AI research reports.

The purpose is to answer:

**Who should we contact first, why should we contact them, and what should we say?**

If Sales Manager cannot use the research to make better outbound decisions, the research is unnecessary.

The first release should therefore prioritise:

**qualification**

**scoring**

**pain matching**

**campaign routing**

over deep research for its own sake.

---

# 67. End-State Workflow

The user experience should eventually be:

### Step 1

Import 5,000 contacts from Apollo.

### Step 2

Sales Manager automatically reports:

**1,487 strong ICP matches identified.**

### Step 3

Sales Manager identifies:

**384 Tier A prospects.**

### Step 4

Each Tier A prospect has:

- company intelligence
- relevant buyer
- primary pain hypothesis
- outreach hook
- recommended campaign

### Step 5

User clicks:

**Approve Tier A Outreach**

### Step 6

Sales Manager enrols those contacts into the correct existing sequences.

From there, the previously built **AI Reply & Follow-Up Agent** handles responses.

The resulting flow becomes:

**Apollo → AI Qualification → Intelligent Outreach → AI Reply Handling**

This is the first point where Sales Manager starts behaving like an actual autonomous outbound system rather than a campaign-building tool.