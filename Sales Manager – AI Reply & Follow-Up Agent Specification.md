# Sales Manager – AI Reply & Follow-Up Agent

## 1. Objective

Extend Sales Manager so that it can automatically process replies received from outbound email sequences and determine the correct next action.

The system should reduce the need for a human to manually monitor inboxes, classify replies, write responses, pause sequences, and decide when to follow up.

The AI Reply & Follow-Up Agent should:

1. Detect inbound replies.
2. Understand what the prospect is saying.
3. Classify the reply.
4. Stop or pause the existing outbound sequence where appropriate.
5. Recommend or automatically perform the correct next action.
6. Draft or send an appropriate reply.
7. Schedule future follow-ups when required.
8. Record everything against the contact and campaign.
9. Escalate important or ambiguous conversations to the user.

The goal is:

**Outbound sequence → Prospect replies → AI understands reply → AI takes appropriate action → Human only handles important exceptions**

---

# 2. Core Principle

The system should not blindly respond to every email.

There must be clear separation between:

### Autonomous actions

Actions the AI can safely take without approval.

Examples:

- unsubscribe requests
- out-of-office detection
- pausing the current sequence
- scheduling a follow-up
- drafting standard information replies
- logging responses
- updating prospect status

### Approval-required actions

Actions that should be presented to the user before sending.

Examples:

- pricing negotiation
- contractual questions
- complaints
- complex objections
- enterprise opportunities
- unusual product questions
- sensitive conversations
- anything where AI confidence is low

Create configurable settings so the user can determine which categories can be sent automatically.

---

# 3. New Main Module

Add a new primary section to Sales Manager:

# AI Inbox

This should act as an intelligent sales inbox rather than a traditional email inbox.

The screen should prioritise conversations requiring attention.

---

# 4. AI Inbox Layout

Create the following tabs:

### Needs Attention

Messages requiring user review or approval.

### AI Handled

Replies that the AI has successfully processed automatically.

### Interested

Contacts classified as showing buying intent.

### Follow-Up

Contacts where future contact has been scheduled.

### Not Interested

Prospects who declined.

### Unsubscribed

Contacts who requested no further communication.

### Out of Office

Automatic replies and temporary absence messages.

### All Replies

Complete inbox history.

---

# 5. Reply Status Labels

Each reply should receive one clear status.

Use the following initial reply classifications:

1. INTERESTED
2. SEND_INFORMATION
3. BOOK_MEETING
4. PRICING_QUESTION
5. PRODUCT_QUESTION
6. OBJECTION
7. NOT_NOW
8. NOT_INTERESTED
9. WRONG_PERSON
10. REFERRAL
11. UNSUBSCRIBE
12. OUT_OF_OFFICE
13. AUTOMATED_REPLY
14. COMPLAINT
15. EXISTING_CUSTOMER
16. UNKNOWN

Store the classification against the reply.

---

# 6. AI Confidence Score

Every classification must contain a confidence score between:

0–100

Example:

Classification:

**INTERESTED**

Confidence:

**94%**

Confidence thresholds:

### 90–100%

AI may perform configured autonomous actions.

### 70–89%

AI may draft a response but require approval where appropriate.

### Below 70%

Send to:

**Needs Attention**

The confidence thresholds must be configurable in Settings.

---

# 7. Reply Processing Workflow

When an email reply is received:

### Step 1

Capture the inbound message.

Store:

- sender
- recipient
- subject
- body
- timestamp
- message ID
- email thread ID
- contact ID
- company ID
- sequence ID
- campaign ID
- previous outbound email
- full conversation history

### Step 2

Immediately identify whether the sender belongs to an active Sales Manager sequence.

### Step 3

If it is a genuine prospect reply, pause the active outbound sequence.

This is important.

Once a human replies, Sales Manager must not continue sending automated cold emails unless explicitly restarted.

### Step 4

Send the reply and relevant conversation history to the AI classification layer.

### Step 5

AI determines:

- classification
- sentiment
- buying intent
- objection
- requested action
- recommended next action
- response required
- urgency
- confidence

### Step 6

Apply automation rules.

### Step 7

Log the action taken.

---

# 8. AI Analysis Output

Every processed reply should generate a structured AI result.

Example:

```json
{
  "classification": "SEND_INFORMATION",
  "confidence": 96,
  "sentiment": "positive",
  "buying_intent": "medium",
  "summary": "Prospect is interested but wants more information before booking a call.",
  "requested_action": "Send product overview",
  "objection": null,
  "recommended_action": "Send relevant overview and follow up in 4 business days.",
  "requires_response": true,
  "requires_human_approval": false,
  "follow_up_days": 4
}
```

The system should use structured JSON responses internally rather than trying to parse free-form AI text.

---

# 9. Response Category Logic

## INTERESTED

Examples:

- "This looks interesting."
- "I'd like to know more."
- "Can you tell me more about this?"

Actions:

1. Pause sequence.
2. Mark prospect as Interested.
3. Increase lead engagement score.
4. Draft an appropriate response.
5. Offer the next logical CTA.
6. Schedule follow-up if prospect does not respond.

CTA may include:

- book a demo
- watch a short video
- take an audit
- review a product page
- receive more information

Do not automatically force every interested prospect into a meeting.

The AI should infer the appropriate next step.

---

# 10. SEND_INFORMATION

Examples:

- "Can you send me some information?"
- "Do you have a brochure?"
- "Send something over."

Actions:

1. Pause sequence.
2. Identify which SaaS business/campaign the prospect came from.
3. Look up approved Sales Manager content assets.
4. Select the most appropriate asset.
5. Draft/send reply.
6. Log content sent.
7. Schedule follow-up.

The system must not invent URLs or documents.

Only use content assets stored in Sales Manager.

---

# 11. BOOK_MEETING

Examples:

- "Happy to have a call."
- "Let's book something."
- "Can you send your calendar?"

Actions:

1. Pause sequence.
2. Mark high buying intent.
3. Select the relevant booking link for that SaaS business.
4. Send or draft response containing booking link.
5. Update prospect status.
6. Create follow-up reminder if meeting is not booked.

Booking links must be configurable per SaaS business.

---

# 12. PRICING_QUESTION

Examples:

- "How much does this cost?"
- "What are your prices?"
- "What's the monthly fee?"

Actions:

1. Pause sequence.
2. Retrieve approved pricing information for that product.
3. Draft a concise response.
4. Do not invent prices.
5. If pricing cannot be confidently answered, require approval.

Add a setting:

**Allow AI to automatically answer pricing questions**

Default:

**OFF**

---

# 13. PRODUCT_QUESTION

Examples:

- "Does it integrate with X?"
- "Can contractors accept jobs by SMS?"
- "Can customers access a portal?"

Actions:

1. Search the relevant product knowledge base.
2. Generate answer only from approved knowledge.
3. Show source/context internally.
4. If confidence is high, respond according to configured automation.
5. If information is unavailable, escalate rather than hallucinate.

---

# 14. OBJECTION

Examples:

- "We already have software."
- "We use Deputy."
- "We're happy with our current supplier."
- "This isn't a priority."

Actions:

1. Pause sequence.
2. Identify objection category.
3. Search approved objection-handling library.
4. Draft short response.
5. Record objection for analytics.
6. Recommend follow-up strategy.

Initial objection categories:

- Existing system
- Price
- Timing
- No need
- No budget
- Internal solution
- Competitor
- Implementation effort
- Security
- Integration
- Authority
- Other

Objections should feed into an objection analytics dashboard later.

---

# 15. NOT_NOW

Examples:

- "Try me next quarter."
- "Come back in September."
- "We're too busy right now."
- "Maybe in six months."

Actions:

1. Pause current sequence.
2. Extract date or approximate timeframe.
3. Create scheduled follow-up.
4. Mark prospect status as Nurture / Not Now.
5. Do not continue current sequence.

If no exact timeframe is given, AI should suggest a reasonable follow-up period but avoid excessive contact.

---

# 16. NOT_INTERESTED

Examples:

- "Not interested."
- "No thanks."
- "This isn't relevant."

Actions:

1. Stop active sequence.
2. Mark Not Interested.
3. Do not send an argumentative sales response.
4. Optionally send a brief acknowledgement if enabled.
5. Remove from active campaign.

Add setting:

**Send acknowledgement to Not Interested prospects**

Default:

**OFF**

---

# 17. WRONG_PERSON

Examples:

- "I don't handle this."
- "Wrong department."
- "Not my responsibility."

Actions:

1. Pause sequence.
2. Draft a short reply asking who the correct person is.
3. Do not mark company as Not Interested.
4. Mark contact as Wrong Person.
5. Keep company available for further prospecting.

---

# 18. REFERRAL

Examples:

- "Speak to Sarah."
- "John handles this."
- "You need our Operations Director."

Actions:

1. Pause sequence for original contact.
2. Extract referred person's:
   - name
   - role
   - email if included
   - company
3. Create a referral record.
4. Link referral to original contact.
5. Draft outreach referencing the introduction.

Example concept:

"Thanks Mark. I'll reach out to Sarah."

The AI should not automatically search external sources for missing details during Phase 1.

If email is not supplied, create a task for future lead enrichment.

---

# 19. UNSUBSCRIBE

Examples:

- "Remove me."
- "Stop emailing me."
- "Unsubscribe."
- "Please don't contact me again."

Actions must happen immediately.

1. Stop all active sequences for this contact.
2. Add contact to suppression list.
3. Prevent future campaign enrolment.
4. Mark Unsubscribed.
5. Do not send additional marketing messages.

This action should never require human approval.

---

# 20. OUT_OF_OFFICE

Detect:

- annual leave
- vacation
- sickness
- travel
- parental leave
- temporary absence

Attempt to identify return date.

Example:

"Back in the office on 14 September."

Actions:

1. Do not classify as genuine engagement.
2. Keep sequence paused.
3. Schedule restart/follow-up after return date.
4. Store return date.

Recommended follow-up:

1–2 business days after return.

If no return date is available, flag for later review or use a configurable default.

---

# 21. AUTOMATED_REPLY

Detect:

- support ticket acknowledgements
- generic mailbox responses
- spam challenge messages
- email gateway responses
- delivery system replies

Do not treat these as prospect engagement.

Log separately.

---

# 22. COMPLAINT

Examples:

- "You've emailed me too many times."
- "This is spam."
- "Stop harassing me."
- "I'm reporting this."

Actions:

1. Immediately stop sequence.
2. Suppress further automated outreach.
3. Mark complaint.
4. Send to Needs Attention.
5. Do not allow AI auto-response unless specifically enabled.

---

# 23. EXISTING_CUSTOMER

Detect when someone replies indicating they already use the product.

Actions:

1. Stop cold outreach.
2. Mark as Existing Customer.
3. Route away from prospecting.
4. Flag to user if customer records are inconsistent.

---

# 24. UNKNOWN

When the AI cannot confidently determine intent:

1. Pause sequence.
2. Add to Needs Attention.
3. Display:
   - original reply
   - AI summary
   - AI suggested response
   - confidence
4. User decides action.

---

# 25. Reply Drafting

The reply generator must understand:

- SaaS business
- brand
- campaign
- ICP
- value proposition
- original outbound email
- complete conversation
- approved product information
- approved resources
- preferred writing style

Replies should:

- be concise
- sound human
- use UK English unless business settings specify otherwise
- avoid unnecessary corporate language
- avoid AI clichés
- avoid excessive explanation
- respond directly to the prospect
- use the prospect's wording where useful
- never invent facts
- never invent product functionality
- never invent prices
- never invent links
- never create false urgency

---

# 26. Response Preview Screen

When approval is required, display:

## Prospect

Name  
Company  
Role

## Reply Received

Full email.

## AI Interpretation

**Classification:** Pricing Question  
**Confidence:** 88%  
**Sentiment:** Positive  
**Buying Intent:** Medium

## AI Summary

"Prospect is interested but wants pricing before agreeing to a demo."

## Recommended Action

"Answer pricing question and offer a short demo."

## Suggested Reply

Editable text box.

Buttons:

- Approve & Send
- Edit
- Send Later
- No Reply Required
- Mark Incorrect Classification

---

# 27. Human Feedback

When the user changes the AI classification, save the correction.

Example:

AI:

NOT_INTERESTED

User changes to:

NOT_NOW

Store:

- original AI classification
- user correction
- AI confidence
- final classification

This information should later be usable to improve the classifier.

---

# 28. Follow-Up Engine

Add a lightweight follow-up scheduler.

Each conversation may have:

- next follow-up date
- follow-up reason
- follow-up type
- follow-up status

Statuses:

- Scheduled
- Due
- Completed
- Cancelled

Example:

Prospect:

"Try me next month."

AI:

Schedule follow-up in approximately one month.

---

# 29. Follow-Up Logic

Before sending any scheduled follow-up, check:

1. Has prospect replied since scheduling?
2. Has prospect unsubscribed?
3. Has prospect become a customer?
4. Has another user manually contacted them?
5. Is another sequence active?
6. Has the prospect booked a meeting?

If YES to anything that makes the follow-up inappropriate:

Cancel or pause follow-up.

This prevents embarrassing duplicated communication.

---

# 30. Sequence Integration

Existing Sales Manager email sequences need a new status model.

Add:

- Active
- Paused – Reply Received
- Paused – AI Handling
- Paused – Human Review
- Completed
- Stopped
- Unsubscribed

When any legitimate reply arrives:

**Immediately pause sequence.**

Do not wait for AI processing to finish.

---

# 31. Contact Timeline

Add a chronological timeline to every contact.

Example:

**27 Aug – 09:30**  
Email 1 sent.

**27 Aug – 10:42**  
Prospect replied.

**27 Aug – 10:42**  
Sequence automatically paused.

**27 Aug – 10:43**  
AI classified reply as SEND_INFORMATION – 96%.

**27 Aug – 10:43**  
Product overview sent.

**Follow-up scheduled:** 2 September.

Every automated AI action must appear here.

---

# 32. AI Inbox Row Design

Each row should display:

- Contact name
- Company
- SaaS business
- Reply preview
- Classification
- Confidence
- Buying intent
- Time received
- AI action
- Status

Example:

**Sarah Collins | ABC Cleaning**

"Looks interesting. Can you send more details?"

INTERESTED  
94% confidence  
High Intent

AI Action:

**Reply awaiting approval**

---

# 33. Buying Intent

Add a simple buying intent classification:

- NONE
- LOW
- MEDIUM
- HIGH

Examples:

### HIGH

- asks for meeting
- asks for demo
- asks detailed pricing questions
- asks implementation questions

### MEDIUM

- asks for information
- asks general product questions
- engages positively

### LOW

- "maybe"
- vague interest
- no clear action

This is separate from reply classification.

---

# 34. Priority System

AI Inbox should prioritise:

### Priority 1

Meeting requests  
High buying intent  
Pricing questions  
Referrals  
Complaints

### Priority 2

Interested  
Product questions  
Objections

### Priority 3

Not Now  
Wrong Person  
Out of Office

### Priority 4

Not Interested  
Automated replies

---

# 35. SaaS Business Context

Sales Manager operates across multiple SaaS businesses.

Every conversation must therefore be linked to a:

**Business / Workspace**

Each workspace contains:

- business name
- website
- ICP
- value proposition
- product description
- pricing
- approved FAQs
- approved links
- meeting link
- assets
- objection responses
- tone of voice

AI must never mix information between businesses.

For example:

HeyTeam pricing must never be used in a CloudColo reply.

---

# 36. Knowledge Base

Create a lightweight knowledge section within each business.

Sections:

### Product

Features and functionality.

### Pricing

Approved pricing information.

### FAQs

Common questions.

### Objections

Approved responses.

### Links

Approved URLs.

### Assets

Videos  
PDFs  
Audit links  
Calculators  
Demo links  
Case studies

AI replies must pull factual product information from this approved business knowledge base.

---

# 37. Settings

Add:

# AI Reply Settings

Controls:

### Auto-process replies

ON / OFF

### Automatically pause sequence when reply received

Default:

ON

### Auto-send high-confidence replies

Default:

OFF initially

### Auto-handle Out of Office

Default:

ON

### Auto-handle Unsubscribe

Always ON

### Auto-handle Not Interested

Default:

ON

### Auto-answer Product Questions

Default:

OFF

### Auto-answer Pricing Questions

Default:

OFF

### Auto-send Meeting Link

Default:

OFF

### Minimum Confidence for Auto Send

Default:

95%

### Default Not Now Follow-Up

Default:

30 days

### Default OOO Follow-Up

Default:

2 business days after return

---

# 38. Audit Log

Every autonomous AI action must be recorded.

Store:

- timestamp
- contact
- conversation
- AI classification
- confidence
- action taken
- message generated
- whether sent automatically
- whether approved
- approving user
- any user edits
- resulting status

The audit log must be searchable.

---

# 39. Technical Architecture

Recommended service structure:

## Inbound Email Processor

Receives inbound reply events.

Responsibilities:

- validate webhook/event
- identify thread
- identify contact
- store inbound email
- pause sequence

## Reply Classification Service

Sends structured context to LLM.

Returns structured JSON.

## Action Engine

Uses rules + AI output to determine allowed action.

## Reply Generation Service

Creates response from approved context.

## Follow-Up Scheduler

Stores future follow-up actions.

## Audit Service

Records all decisions and actions.

Do not put all logic inside one large AI prompt.

Keep deterministic business rules outside the LLM wherever possible.

---

# 40. Important Engineering Principle

AI should perform:

**Interpretation**

Code should perform:

**Rules**

Example:

AI determines:

"This is an unsubscribe request."

Application code determines:

"Unsubscribe means stop campaigns and add to suppression list."

Do not ask the AI whether compliance rules should be followed.

---

# 41. Suggested Database Entities

Create or extend:

## inbound_messages

Fields:

- id
- contact_id
- company_id
- workspace_id
- campaign_id
- sequence_id
- thread_id
- external_message_id
- subject
- body_text
- body_html
- sender
- recipient
- received_at
- processed_at

## reply_analysis

- id
- inbound_message_id
- classification
- confidence
- sentiment
- buying_intent
- summary
- objection_type
- requested_action
- recommended_action
- requires_response
- requires_approval
- raw_ai_json
- created_at

## ai_reply_drafts

- id
- inbound_message_id
- body
- status
- generated_at
- approved_at
- sent_at
- edited_by_user

Statuses:

- Draft
- Awaiting Approval
- Approved
- Sent
- Cancelled

## follow_ups

- id
- contact_id
- thread_id
- workspace_id
- scheduled_at
- reason
- status
- created_by
- generated_message_id

## suppression_list

- id
- email
- reason
- source
- created_at

---

# 42. AI Classification Prompt Behaviour

The classifier should receive:

- business information
- prospect details
- original outbound email
- previous thread
- latest reply

The system instruction should make clear:

"You are analysing inbound B2B sales replies. Classify the prospect's actual intent rather than individual words. Do not infer buying intent that is unsupported. Return only valid JSON matching the supplied schema."

The classifier must distinguish between:

"I am interested."

and:

"I'm not interested."

Do not use crude keyword matching as the primary classification method.

---

# 43. Guardrails

AI must never:

- invent product capabilities
- invent pricing
- invent customer references
- invent case studies
- invent documents
- invent URLs
- fabricate availability
- make contractual commitments
- offer unauthorised discounts
- make legal statements
- override unsubscribe requests
- continue sequences after legitimate replies without explicit logic

---

# 44. Error Handling

If AI processing fails:

1. Keep sequence paused.
2. Do not send any automated response.
3. Move email into Needs Attention.
4. Display:

**AI processing failed – manual review required.**

If email provider integration fails:

Log error and retry safely.

Never risk duplicate messages.

---

# 45. Duplicate Protection

Before sending any AI response:

Check whether:

- response has already been sent
- another user sent an email
- webhook was duplicated
- the thread changed while AI was processing

Implement idempotency based on inbound message ID.

One inbound message must not generate multiple responses accidentally.

---

# 46. Phase 1 Scope

Build only:

- inbound reply detection
- reply storage
- AI classification
- sequence pausing
- AI Inbox
- reply drafting
- approval workflow
- unsubscribe handling
- OOO handling
- simple follow-up scheduling
- contact timeline
- audit log

Do NOT initially build:

- external lead enrichment
- LinkedIn automation
- voice calling
- full CRM
- proposal generation
- complex deal management
- advanced machine learning
- autonomous negotiation

Those belong in later phases.

---

# 47. User Experience Goal

The user should be able to open Sales Manager and immediately see:

# 6 Replies Need Attention

### Sarah – ABC Cleaning

**Interested**

"Can you send me some more information?"

Suggested action:

**Send HeyTeam overview**

[Review & Send]

### Mark – XYZ FM

**Referral**

"Speak to our Operations Director, Jane."

Suggested action:

**Create Jane as referral lead**

[Review]

### David – Acme Services

**Not Now**

"Try me again in October."

AI Action:

**Follow-up scheduled for 5 October**

No action required.

This screen should allow the user to manage responses in minutes rather than monitor multiple inboxes.

---

# 48. Dashboard Metrics

Add a simple Reply Intelligence section.

Show:

- Replies received
- Positive replies
- Response rate
- Interested prospects
- Meeting requests
- Referrals
- Objections
- Not interested
- Unsubscribes
- AI handled
- Human reviewed
- Average AI confidence

Filters:

- date
- business
- campaign
- sequence

---

# 49. Acceptance Criteria

The feature is complete when:

- [ ] Replies to Sales Manager outbound emails are detected.
- [ ] Replies are associated with the correct contact and campaign.
- [ ] Active sequences pause immediately on legitimate replies.
- [ ] AI classifies replies into the defined categories.
- [ ] Classification confidence is stored.
- [ ] Buying intent is calculated.
- [ ] AI generates a concise summary.
- [ ] AI recommends the next action.
- [ ] AI can generate an editable response draft.
- [ ] Approval-required replies appear in Needs Attention.
- [ ] Unsubscribe requests immediately suppress the contact.
- [ ] OOO replies can identify return dates.
- [ ] Not Now replies can create future follow-ups.
- [ ] AI cannot use information from another SaaS workspace.
- [ ] Product facts come from approved business knowledge.
- [ ] All AI activity appears on the contact timeline.
- [ ] Every AI action is captured in an audit log.
- [ ] Duplicate replies cannot result in duplicate outbound messages.
- [ ] Failure of AI processing cannot result in an unintended email being sent.

---

# 50. Recommended Build Order

Build in this exact order.

## Sprint 1

Inbound reply capture.

Contact/thread matching.

Sequence pausing.

Store inbound messages.

## Sprint 2

AI reply classification.

Structured JSON.

Confidence.

Buying intent.

AI summary.

## Sprint 3

AI Inbox interface.

Needs Attention.

AI Handled.

Classification filters.

## Sprint 4

AI reply drafting.

Review and approval.

Send response.

## Sprint 5

Unsubscribe logic.

Out of Office handling.

Not Now follow-ups.

## Sprint 6

Knowledge base integration.

Product questions.

Pricing questions.

Objection responses.

## Sprint 7

Automation settings.

High-confidence auto-send.

Audit logs.

Analytics.

---

# 51. Definition of Success

Do not measure success based on how many AI features exist.

Measure:

### Human intervention rate

What percentage of inbound sales replies require the user to manually deal with them?

Initial target:

**Less than 50%.**

Longer-term target:

**Less than 20%.**

The system should eventually mean:

**Sales Manager handles routine sales conversations automatically and only asks the user to intervene where human judgement genuinely adds value.**