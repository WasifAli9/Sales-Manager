# Build a Reusable Branded Email Template System with Smart Design Logic

I want you to build a professional reusable email template system into the application.

The objective is to allow me to create beautifully designed HTML email templates for each business/brand I work on, save those templates permanently, and then apply a selected template to one email, multiple emails, or an entire email sequence.

However, do not assume that the most visually designed email is always the best option.

For cold outbound, especially early in a sequence, emails should often look personal and minimally designed because heavily branded emails can immediately feel like marketing automation and may reduce trust, replies and deliverability.

The system therefore needs to support both professional templates and intelligent template recommendations based on the type and stage of the campaign.

Do not hard-code individual email designs into the application. Build this as a reusable template and brand system.

---

# 1. Core Architectural Principle

Keep these four concepts separate:

## BRAND
Colours, logo, fonts, visual identity and business information.

## TEMPLATE
Layout and visual presentation.

## CONTENT
Subject line, preview text, body copy, CTA and personalisation.

## CAMPAIGN DESIGN STRATEGY
Rules determining when a plain, lightly branded or richer design is most appropriate.

Do not merge these into one hard-coded HTML field.

This separation is essential because:

- The same content may need different designs
- The same design may be reused across hundreds of emails
- Different stages of a sequence may benefit from different levels of branding
- Cold outbound should not automatically look like a marketing newsletter

---

# 2. Business / Brand Profiles

Allow each business or project to have its own email brand profile.

Store:

- Business name
- Logo
- Website URL
- Primary brand colour
- Secondary brand colour
- Accent colour
- Background colour
- Text colour
- Preferred font stack
- Button style
- Button colour
- Border radius
- Footer information
- Company address
- Social links
- Unsubscribe wording
- Default CTA styling
- Industry
- Product/service
- Primary target audience
- Brand personality

Where possible, automatically use the branding already stored against the business.

The email template should inherit these settings rather than requiring colours and logos to be recreated manually every time.

---

# 3. Email Template Library

Create a section called:

**Email Templates**

Templates must be stored in the database and reusable.

Each template should contain:

- Template name
- Business/brand
- Template category
- Design intensity
- Thumbnail/preview
- HTML structure
- Styling
- Header configuration
- Footer configuration
- CTA configuration
- Date created
- Last updated
- Active/inactive status

Template categories should include:

- Cold Outreach
- Follow-Up
- Newsletter
- Educational
- Promotional
- Product Update
- Case Study
- Event
- Re-engagement
- Welcome / Onboarding
- Plain / Personal
- Custom

---

# 4. Design Intensity Levels

Every email template should have a design classification.

Use four levels:

## Level 1 – Personal / Plain

Should resemble an email written manually in Gmail or Outlook.

Characteristics:

- No hero banner
- No large logo
- No graphics
- Minimal HTML
- Natural signature
- Standard email typography
- Text links rather than large CTA buttons where appropriate

Best for:

- Cold outreach
- First contact
- Direct follow-ups
- Founder-to-founder messages
- Executive outreach
- Referral requests

---

## Level 2 – Lightly Branded

Feels personal but introduces subtle brand credibility.

Characteristics:

- Small logo or branded signature
- Subtle brand colours
- Minimal styling
- Optional understated CTA
- No heavy graphics

Best for:

- Later cold outreach emails
- Follow-ups after engagement
- Sending useful resources
- Demo follow-ups
- Light lead nurture

---

## Level 3 – Branded

Clearly branded but still professional and restrained.

Characteristics:

- Professional header
- Brand colours
- Strong hierarchy
- CTA button
- Optional imagery
- Branded footer

Best for:

- Case studies
- Educational content
- Lead nurturing
- Customer communications
- Product benefits
- Event invitations

---

## Level 4 – Rich Marketing

Most visually designed.

Characteristics:

- Hero sections
- Multiple content blocks
- Imagery
- Statistics
- Testimonials
- Multiple CTAs
- Structured marketing layout

Best for:

- Newsletters
- Product announcements
- Reports
- Launch campaigns
- Events
- Existing customers

Do not recommend Level 4 for initial cold outreach.

---

# 5. Smart Sequence Design Strategy

Build logic that can recommend the appropriate design intensity based on:

- Campaign objective
- Email sequence position
- Relationship with recipient
- Whether recipient has engaged
- Email content type
- Business
- Industry
- Audience
- CTA

The user should always retain control.

AI recommendations should never silently change the design.

---

# 6. Cold Outreach Sequence Logic

For cold email sequences, use a progressive design strategy.

Default recommendation:

### Emails 1–3
Use:

**Personal / Plain**

The objective is to create the impression of a genuine one-to-one email rather than a marketing campaign.

---

### Emails 4–8

Recommend either:

**Personal / Plain**

or:

**Lightly Branded**

depending on the content.

If the message is simply a follow-up, keep it personal/plain.

If the email introduces a resource, audit, video, guide or useful tool, lightly branded may be appropriate.

---

### Educational Emails

If an email contains:

- Useful insights
- Checklists
- Guides
- Audits
- Benchmarking
- Industry advice

recommend:

**Lightly Branded** or **Branded**

---

### Case Study Emails

Recommend:

**Branded**

because the purpose is credibility and proof.

---

### Resource Emails

If sending:

- PDF
- Whitepaper
- Video
- Calculator
- Audit
- Checklist
- Research report

recommend:

**Lightly Branded** or **Branded**

---

### Direct Follow-Ups

If the email says things such as:

- Did you see this?
- Worth a conversation?
- Is this relevant?
- Who is the right person?
- Happy to leave this here

recommend:

**Personal / Plain**

---

# 7. Design Should Change Within a Sequence

Do not force every email in a sequence to have exactly the same design.

Support two modes:

## Uniform Sequence Design

Apply one template across every email.

Example:

All emails use:

**Minimal B2B**

---

## Smart Sequence Design

Allow different email types within the same sequence.

Example:

Email 1  
Personal / Plain

Email 2  
Personal / Plain

Email 3  
Personal / Plain

Email 4  
Lightly Branded Resource

Email 5  
Personal Follow-Up

Email 6  
Branded Case Study

Email 7  
Personal Follow-Up

Email 8  
Educational Insight

Email 9  
Personal Follow-Up

This should still remain easy to manage.

---

# 8. Add "Smart Design" to Sequences

Inside the sequence editor add:

**Email Design Strategy**

Options:

- One Template for Entire Sequence
- Smart Design
- Custom Per Email

If the user selects:

**Smart Design**

analyse every email and recommend an appropriate template.

Display something like:

Email 1  
Recommended: Personal Outreach

Email 2  
Recommended: Personal Outreach

Email 3  
Recommended: Personal Outreach

Email 4  
Recommended: Resource – Light Branding

Email 5  
Recommended: Personal Follow-Up

Email 6  
Recommended: Case Study

Allow:

**Apply All Recommendations**

but also allow individual recommendations to be overridden.

---

# 9. Apply Template to Entire Sequence

Within the email sequence editor, add:

**Email Design / Template**

Allow me to select a stored template.

Then provide:

**Apply to Entire Sequence**

When selected, every email within that sequence should use the same visual template while retaining its own:

- Subject line
- Preview text
- Email body
- CTA
- Personalisation
- Send timing

Do NOT duplicate the email body across the sequence.

The design and the content must remain separate.

---

# 10. Sequence-Level Template Inheritance

Build the architecture so that a sequence can reference a template rather than copying the complete template HTML into every email.

For example:

Sequence  
→ template_id  
→ individual emails  
→ individual email content

Also support:

Sequence  
→ design_strategy  
→ recommended template per email  
→ individual override

If I update the master template, provide the option:

**Update sequences using this template**

Before applying this change, clearly show which sequences will be affected.

Also support:

- Sequence uses master template
- Individual email overrides master template

If an individual email has an override, clearly display:

**Custom Design**

and provide:

**Revert to Sequence Template**

---

# 11. Professional Design

The templates should look like professionally designed B2B marketing emails, not generic system-generated HTML.

Design should be:

- Modern
- Premium
- Clean
- Minimal
- Mobile responsive
- Easy to scan
- Appropriate for B2B audiences
- Consistent with the selected business branding

Use good spacing, typography and hierarchy.

Avoid excessively complicated email designs.

Emails must work correctly across major email clients including:

- Gmail
- Outlook
- Apple Mail
- iPhone
- Android

Use email-safe HTML and inline CSS where required.

Do not rely on CSS features that have poor email-client support.

---

# 12. Template Structure

Templates should support reusable content blocks including:

## Header
- Logo
- Optional headline
- Optional banner

## Email Body

This is where the unique email copy is inserted.

Create a placeholder such as:

{{EMAIL_BODY}}

The template must wrap around the email copy rather than replacing it.

## Optional Content Blocks

Allow templates to support:

- Headline
- Subheadline
- Hero image
- Body copy
- Callout box
- Bullet section
- Quote/testimonial
- Statistics
- Image
- Video thumbnail
- CTA button
- Secondary CTA
- Divider
- Signature

## Footer

Include:

- Company name
- Company address
- Website
- Unsubscribe link
- Privacy link
- Optional social links

---

# 13. Dynamic Variables

Support dynamic variables throughout the templates.

Examples:

{{FIRST_NAME}}  
{{LAST_NAME}}  
{{FULL_NAME}}  
{{COMPANY_NAME}}  
{{JOB_TITLE}}  
{{SENDER_NAME}}  
{{SENDER_COMPANY}}  
{{WEBSITE}}  
{{EMAIL_BODY}}  
{{CTA_TEXT}}  
{{CTA_URL}}  
{{UNSUBSCRIBE_URL}}

The system should preserve any existing sequence personalisation variables.

Do not break existing merge tags or email personalisation functionality.

---

# 14. Template Preview

Add desktop and mobile previews.

I should be able to see:

**Desktop | Mobile**

before applying or saving a template.

Use realistic sample data for merge fields in previews.

For example:

{{FIRST_NAME}} → James  
{{COMPANY_NAME}} → ABC Facilities

---

# 15. Email Editor

Inside the email editor, separate:

## Content

- Subject
- Preview text
- Email body
- CTA
- Personalisation

from:

## Design

- Template
- Design intensity
- Brand
- Layout
- Header
- Footer
- Button style

I do not want users editing raw HTML unless they explicitly choose an advanced HTML editing mode.

---

# 16. Sequence Controls

At the sequence level add:

**Design**

Strategy:

[ Smart Design ▼ ]

Template:

[ Select Template ▼ ]

Brand:

[ Select Business ▼ ]

Actions:

- Analyse Sequence Design
- Apply Recommendations
- Preview Sequence Design
- Apply Template to Entire Sequence
- Change Template
- Remove Template

If changing the template, ask:

**Apply this design to all emails in this sequence?**

Options:

- Apply to all emails
- Only apply to emails without custom designs
- Cancel

---

# 17. Starter Template Library

Create an initial professional template library containing approximately 10 templates:

1. Personal Outreach
2. Personal Follow-Up
3. Minimal B2B
4. Executive Follow-Up
5. Lightly Branded Resource
6. Modern Branded
7. Educational Insight
8. Case Study
9. Product Announcement
10. Newsletter

These should use the selected company's brand profile.

Do not create ten completely different visual identities.

They should feel like variations within the same brand system.

---

# 18. AI Template Generation

Add:

**Generate Template with AI**

The AI should analyse the selected business including:

- Business name
- Website
- Logo
- Colours
- Product/service
- Target audience
- Industry
- Campaign objective

It should then recommend and generate an appropriate email design.

Examples:

A B2B SaaS product should receive a clean software/SaaS design.

A commercial cleaning company should receive a professional facilities-services design.

A colocation/data-centre company should receive a sophisticated technology/infrastructure design.

Do not use the same generic template for every industry.

---

# 19. AI Sequence Analysis

Add:

**Analyse Email Sequence**

The AI should review:

- Email number
- Subject
- Body
- CTA
- Campaign objective
- Sequence stage

and classify the email as something such as:

- Cold Introduction
- Follow-Up
- Educational
- Resource
- Case Study
- Social Proof
- Product
- Commercial Offer
- Break-Up Email

It should then recommend:

- Design intensity
- Template
- CTA treatment
- Whether branding should be visible

For example:

**Email 1**  
Type: Cold Introduction  
Recommended Design: Personal / Plain  
Reason: Preserve one-to-one feel.

**Email 5**  
Type: Educational Resource  
Recommended Design: Lightly Branded  
Reason: Branding adds credibility to the resource without making the email feel promotional.

**Email 8**  
Type: Case Study  
Recommended Design: Branded  
Reason: Structured proof and statistics benefit from stronger presentation.

The user should be able to accept or override recommendations.

---

# 20. Deliverability Rules

Email design must prioritise deliverability.

Do not create templates that rely heavily on:

- Huge images
- Excessive graphics
- Too many buttons
- Complex HTML
- JavaScript
- Forms
- Video embeds

Include a text/html MIME version and plain-text fallback if supported by the existing sending architecture.

Cold outreach templates should contain considerably less HTML than newsletter templates.

Do not sacrifice deliverability for visual appearance.

---

# 21. Smart Warning System

Add helpful warnings.

Examples:

If the user chooses a Rich Marketing template for Email 1 of a cold outreach campaign:

**This email is the first contact in a cold outreach sequence. A Personal or Lightly Branded design may generate more replies and feel less automated.**

Buttons:

**Use Personal Design**

**Keep Current Design**

This should be guidance, not a restriction.

---

# 22. Image Handling

Images must:

- Be properly hosted
- Have alt text
- Have configurable links
- Be responsive
- Have appropriate dimensions
- Not dramatically increase email size

Do not embed large base64 images into the email HTML.

---

# 23. Database Architecture

Review the existing database/schema before implementation.

Create an appropriate relational structure rather than storing everything as duplicated HTML.

Potential entities could include:

- businesses
- email_brand_profiles
- email_templates
- email_template_versions
- email_sequences
- sequence_emails
- email_design_recommendations

Potential relationships:

business  
→ email_brand_profile  
→ email_templates

email_sequence  
→ business_id  
→ design_strategy  
→ default_template_id

sequence_email  
→ sequence_id  
→ content  
→ recommended_template_id  
→ optional_template_override_id

Adapt this to the existing architecture rather than unnecessarily duplicating existing tables.

---

# 24. Versioning

Templates should support basic version history.

If a template is edited after being used by active sequences, do not silently break those sequences.

Store template versions or otherwise ensure previously sent/scheduled emails remain reproducible.

---

# 25. Existing Sequences

Do not break any existing sequences or email sending functionality.

Existing emails should continue to work without a template.

After deployment, I should be able to open an existing sequence and choose:

**Apply Email Template**

or:

**Analyse Sequence Design**

without having to recreate the sequence.

---

# 26. Ideal User Workflow

The workflow should be:

**Select Business**

→ **Create Sequence**

→ **Write Emails**

→ **Analyse Sequence**

→ **Receive Design Recommendations**

→ **Apply Recommendations**

→ **Preview**

→ **Send**

The user should also be able to bypass recommendations and select one template for the entire sequence.

---

# 27. Important Outbound Principle

Build the application around this principle:

**Cold emails should look like emails. Marketing emails can look like marketing emails.**

Do not equate professional design with more graphics.

For a cold prospect, professionalism may mean:

- Excellent typography
- Good spacing
- Clean signature
- Subtle branding
- Natural links
- No obvious marketing layout

For a warm lead or existing customer, stronger visual branding may be appropriate.

The application should understand this distinction.

---

# 28. Suggested Default Cold Outreach Pattern

For a typical long-term outbound sequence, recommend a pattern such as:

Emails 1–3  
**Personal / Plain**

Emails 4–5  
**Personal or Lightly Branded**

Email 6  
**Branded Case Study / Proof**

Email 7  
**Personal Follow-Up**

Email 8  
**Educational Insight**

Email 9  
**Personal Follow-Up**

Email 10  
**Resource / Tool**

Email 11  
**Personal Follow-Up**

Email 12  
**Case Study / Proof**

Then continue alternating value-driven branded emails with personal-style follow-ups.

Do not mechanically apply this pattern.

The AI should examine the actual content and objective of each email.

---

# 29. Long Sequences

The system must work properly for sequences containing dozens of emails.

For example, a 52-email annual nurture sequence should not require manually designing 52 individual emails.

The user should be able to define a strategy such as:

- Follow-ups → Personal
- Educational emails → Educational Template
- Case studies → Case Study Template
- Videos → Resource Template
- Offers → Branded
- Break-up emails → Personal

Then allow the system to automatically map the appropriate template across the sequence.

---

# 30. Bulk Rules

Add an advanced option:

**Template Rules**

Example:

IF email_type = "follow_up"  
THEN template = "Personal Follow-Up"

IF email_type = "case_study"  
THEN template = "Case Study"

IF email_type = "educational"  
THEN template = "Educational Insight"

IF email_type = "resource"  
THEN template = "Lightly Branded Resource"

IF email_type = "newsletter"  
THEN template = "Newsletter"

This allows hundreds of emails to be styled consistently without manually editing each one.

---

# Before Coding

First inspect the existing:

- Database schema
- Email sequence implementation
- Email editor
- Email sending service
- Personalisation/merge tag system
- Business/project model
- Existing branding functionality
- Existing AI functionality

Then determine the least disruptive architecture for adding this functionality.

Reuse existing components and design patterns wherever possible.

Do not rebuild functionality that already exists.

After analysing the codebase, implement the complete feature end-to-end including:

1. Database changes
2. Backend/API
3. Template rendering engine
4. Template management UI
5. Brand profiles
6. Sequence-level template selection
7. Smart Design strategy
8. AI sequence classification
9. Email-level overrides
10. Responsive previews
11. Starter templates
12. Template rules
13. Brand inheritance
14. Deliverability safeguards
15. Testing

Ensure the implementation is production-ready and not merely a visual prototype.