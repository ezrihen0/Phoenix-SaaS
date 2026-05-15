# WizField Growth Center — `/marketing`
## Master Product Plan

> Current role: subordinate strategic planning context only. This file is not the active Growth Center implementation source of truth.

**Document status:** Historical strategic product plan
**Module:** `/marketing`  
**Product:** WizField / PhoenixOS SaaS  
**Canonical status:** Active Growth Center V1 product truth is governed by `docs/WizField_Growth_Center_Source_of_Truth.md` and `docs/WizField_Growth_Center_Closeout_and_Verification.md`. Any conflict is resolved in favor of those canonical docs and the global WizField SoT/closeout set.
**Core thesis:** **Marketing by Doing**  
**Primary business objective:** **Retention moat**  
**Secondary business objective:** **Lead generation and revenue lift**

---

# 1. Executive Decision

WizField should introduce a dedicated `/marketing` module as a formal product pillar.

This module must **not** be treated as a generic AI post generator. That would be weak, crowded, and strategically shallow.

The correct product definition is:

> **WizField Growth Center turns real business activity into consistent local marketing.**

A field-service owner already completes jobs, uploads photos, receives reviews, manages open calendar gaps, and closes estimates inside WizField. The Growth Center should harvest that operational activity and convert it into:

- ready-to-review social posts
- Google Business Profile updates
- local trust content
- seasonal campaigns
- review-driven reputation posts
- schedule-gap demand generation
- later-stage rules-based marketing autopilot

This creates a strong product moat because the marketing system becomes tied to the customer’s **live operational data**, not generic prompts.

---

# 2. Strategic Product Positioning

## 2.1 What `/marketing` is

`/marketing` is:

- a **Growth Center**
- a **retention engine**
- a **CRM-powered marketing intelligence layer**
- a **future paid module / plan expansion lever**
- a **marketing execution bridge** between daily field operations and local visibility

## 2.2 What `/marketing` is not

`/marketing` is **not**:

- a basic AI caption writer
- a Canva replacement
- a full ad buying platform
- a marketing agency simulator
- a random “post everywhere” gimmick
- a broad consumer social media suite

---

# 3. Product Thesis: “Marketing by Doing”

The module should be built around one defining idea:

> **The business owner does the work. WizField turns that work into marketing.**

Examples:

- A job is completed with photos  
  → WizField suggests a before/after showcase post.

- A five-star review is received  
  → WizField drafts a social proof post.

- The schedule is unusually open next week  
  → WizField proposes a local availability campaign.

- Multiple fireplace jobs were completed in one city  
  → WizField suggests a local authority post tied to that area.

- A seasonal service window approaches  
  → WizField generates a campaign calendar for that industry.

This is the module’s **secret sauce**.

Generic AI tools know how to write.  
WizField knows what actually happened in the business.

---

# 4. Strategic Business Objective

## 4.1 Primary objective: Retention moat

The Growth Center should increase customer dependency on WizField.

Once a business owner uses WizField not only to run operations, but also to maintain ongoing visibility, the product becomes far harder to leave.

If the user cancels, they do not just lose:

- jobs
- customers
- invoices
- calls
- scheduling

They also lose:

- brand voice configuration
- connected publishing channels
- scheduled posts
- campaign history
- marketing rules
- CRM-derived content opportunities
- a working machine that keeps their business visible

That makes `/marketing` a **retention asset**, not just a feature.

## 4.2 Secondary objective: Lead generation and revenue lift

The module should help users produce more:

- visibility
- trust
- response activity
- local search freshness
- social proof
- conversion opportunities

The messaging should be honest:

> WizField helps service businesses stay visible and act faster on marketing opportunities generated from their own operations.

---

# 5. Canonical Module Name

## Internal and product-facing name

### **WizField Growth Center**

## Route

```text
/marketing
```

---

# 6. Top-Level Product Architecture

```text
User Account
└── Active Organization / Workspace
    └── Growth Center
        ├── Overview
        ├── Opportunities
        ├── Create Content
        ├── Calendar
        ├── Campaigns
        ├── Channels
        ├── Automations
        ├── Analytics
        └── Settings
```

The module must be fully **organization-scoped** and must follow the same multi-workspace behavior as the rest of PhoenixOS:

- active organization drives all data
- org switching changes the entire marketing context
- channels belong to the organization, not globally to the user
- content, campaigns, rules, and settings are isolated by organization
- no cross-org visibility or leakage is acceptable

---

# 7. Route Map

```text
/marketing
/marketing/opportunities
/marketing/create
/marketing/calendar
/marketing/campaigns
/marketing/channels
/marketing/automations
/marketing/analytics
/marketing/settings
```

---

# 8. `/marketing` — Growth Center Dashboard

## 8.1 Purpose

The dashboard should function as a **marketing command center**, not a feed.

It should answer:

1. What marketing opportunities exist right now?
2. What content is waiting for approval?
3. What is scheduled?
4. Which channels are connected?
5. What should the owner do next?

---

## 8.2 Recommended dashboard structure

### Header

```text
Growth Center
Turn real business activity into marketing that keeps your brand visible and your pipeline warm.
```

### Summary cards

- Connected channels
- Drafts awaiting approval
- Scheduled posts this week
- Publishing failures requiring attention
- Opportunities detected
- Last published post
- Posting consistency this month

### Primary section: AI Opportunities

Examples:

```text
You completed 6 chimney inspection jobs this week.
Create a local trust post for Google Business Profile and Facebook?
```

```text
You received 3 new five-star reviews in the last 7 days.
Turn them into social proof posts?
```

```text
Next Tuesday has 4 open booking slots.
Create a local availability post?
```

### Quick actions

- Create post
- Build campaign
- Review drafts
- Connect channel
- Schedule this week

### Content pipeline preview

```text
Idea → Draft → Needs Approval → Scheduled → Published → Failed
```

---

# 9. `/marketing/opportunities` — CRM-Powered Opportunity Engine

## 9.1 Purpose

This page is the differentiator.

It identifies actionable marketing opportunities generated from actual CRM and operations data.

## 9.2 CRM inputs

### Jobs
- completed jobs
- job category
- service type
- service area / city
- public-safe job notes
- attached photos

### Reviews
- new five-star reviews
- reviews mentioning a specific service
- reviews mentioning professionalism, speed, trust, or cleanliness
- positive review streaks

### Calendar and dispatch
- upcoming low-utilization days
- slow weeks
- seasonal scheduling windows
- unfilled service areas

### Customer signals
- concentration of customers in a specific area
- returning customer patterns
- later-stage reactivation opportunities

### Revenue and service mix
- strongest service category this month
- premium service types worth spotlighting
- service categories with recent proof

---

## 9.3 Opportunity types

```text
Work Showcase
Before / After
Review Spotlight
Seasonal Reminder
Availability Push
Educational Tip
FAQ Post
Local SEO Post
Premium Service Spotlight
Service Area Authority Post
Promotion / Offer
Win-back Campaign — later phase
```

---

## 9.4 Opportunity lifecycle

```text
Detected
→ Suggested
→ Accepted
→ Draft Generated
→ Edited / Approved
→ Scheduled or Published
→ Archived with outcome
```

---

# 10. `/marketing/create` — Content Studio

## 10.1 Purpose

Create or refine marketing content manually or from a detected opportunity.

## 10.2 Core inputs

- platform selection
- content objective
- source of truth
- image selection
- city / service area
- target service
- tone
- CTA
- publish now or schedule

## 10.3 Platform tabs

Phase 1:

- Google Business Profile
- Facebook Page
- Instagram Business

Phase 2:

- Blog draft
- website article export / publishing integrations

Later:

- TikTok / short-form media workflows
- broader publishing handoff options where commercially justified

---

## 10.4 AI output structure

### Mode 1: Single-channel post

Example:
- “Create one Google Business Profile post from this completed chimney repair.”

### Mode 2: Multi-channel adaptation

The same source becomes platform-specific output:

- **Google Business Profile:** local, informative, service-oriented
- **Facebook:** community-friendly and trust-oriented
- **Instagram:** concise, visual, strong hook

### Mode 3: Post bundle

A generated bundle may include:

- post copy
- short CTA
- hashtag suggestions
- suggested headline
- alt text suggestion
- recommended image order for a carousel
- later: suggested first comment or pinned comment

---

# 11. `/marketing/calendar` — Content Calendar

## 11.1 Purpose

Convert marketing from random effort into operational rhythm.

## 11.2 Views

- monthly view
- weekly view
- by channel
- by content status
- by campaign

## 11.3 Content states

```text
Idea
Draft
Needs Approval
Scheduled
Publishing
Published
Failed
Cancelled
```

## 11.4 Core actions

- drag to reschedule
- duplicate
- edit before publish
- review CRM source context
- inspect publish failure
- retry when safe
- archive

---

# 12. `/marketing/campaigns` — Campaign Builder

## 12.1 Purpose

Help businesses create planned marketing sequences, not just isolated posts.

## 12.2 Campaign categories

### Seasonal campaigns
- pre-winter fireplace inspection
- spring chimney maintenance
- HVAC tune-up window
- garage door seasonal service
- freeze-prevention reminders for plumbing

### Revenue campaigns
- push a specific high-margin service
- fill open schedule capacity
- support a premium service package
- drive estimate requests

### Trust campaigns
- review spotlight series
- completed work series
- “why customers choose us”
- technician professionalism

### Local authority campaigns
- city-specific service awareness
- neighborhood content
- seasonal issue education by geography

---

## 12.3 Campaign creation flow

```text
Choose objective
→ choose service or area
→ choose channels
→ choose campaign length
→ AI builds content map
→ owner edits or approves
→ schedule campaign into calendar
```

---

# 13. `/marketing/channels` — Publishing Integrations

## 13.1 Phase 1 channels

Must-have:

- Google Business Profile
- Facebook Page
- Instagram Business

## 13.2 Phase 2 / later channels

Potential future additions:

- WordPress
- Webflow
- native WizField article publishing
- TikTok workflows where the ROI and platform approval burden justify it

---

## 13.3 Channel card requirements

Each connected channel should show:

- connection state
- account or page name
- active organization owner
- authorization health
- last successful publish
- last failure
- reconnect requirement
- permissions status
- disconnect action

---

# 14. `/marketing/automations` — Autopilot Engine

## 14.1 Product principle

Automation must be **progressive**, not reckless.

Service business owners are sensitive to public reputation.  
The system should earn trust before automating high-visibility behavior.

## 14.2 Automation ladder

### Level 1 — Suggest only
```text
Trigger detected
→ Opportunity suggested
→ Owner decides
```

### Level 2 — Auto-draft
```text
Trigger detected
→ Draft created automatically
→ Owner approves or edits
```

### Level 3 — Scheduled rule
```text
Approved rule exists
→ Draft generated and scheduled automatically
→ Optional approval layer
```

### Level 4 — Low-risk autopilot
```text
Trusted rule exists
→ content is published automatically under owner-defined conditions
```

---

## 14.3 Example automation rules

### Completed job to draft
```text
When:
Job completed
AND public-safe photos exist
AND service type is eligible

Then:
Create a draft post for Google Business Profile and Facebook.
```

### Five-star review to social proof draft
```text
When:
A new review with rating = 5 is received

Then:
Create a review spotlight draft for social channels.
```

### Low schedule utilization prompt
```text
When:
Next 5 business days have booking utilization below threshold

Then:
Suggest an availability-focused local campaign.
```

### Seasonal campaign generator
```text
When:
Seasonal campaign date arrives
AND organization industry matches

Then:
Generate a campaign draft for owner review.
```

---

# 15. `/marketing/analytics` — Useful, Not Vanity

## 15.1 Purpose

Analytics should help the owner manage output and understand consistency, not drown them in shallow charts.

## 15.2 Initial analytics

- posts created this month
- posts published this month
- content approval rate
- content generated from CRM events
- posting gaps
- opportunities accepted vs ignored
- scheduled vs published ratio
- failure count by channel

## 15.3 Later analytics

Where platform access allows:

- reach
- engagement
- clicks
- profile actions
- call / website interaction trends
- lead attribution tie-ins where feasible

Analytics should be introduced after the publish engine is reliable.

---

# 16. `/marketing/settings` — Brand and Growth Brain

## 16.1 Purpose

This area acts as the **marketing brain** for each organization.

## 16.2 Marketing Profile fields

### Business identity
- business type
- target customer
- core services
- primary service areas
- unique selling points

### Brand voice
- professional
- warm
- premium
- direct
- educational
- local/community tone

### Publishing preferences
- preferred CTA
- phone number inclusion
- booking link inclusion
- avoid discount language by default
- avoid exact pricing unless enabled
- preferred post length

### Safety and compliance settings
- no unsupported claims
- no certification language unless configured
- no warranty promises unless configured
- no legal or insurance claims unless approved
- restricted terms list

### Default CTA library
- Call now
- Request estimate
- Book inspection
- Send a message
- Learn more

---

# 17. Event-to-Marketing Conversion Map

| Business Event | Marketing Output |
|---|---|
| Job completed | Work showcase |
| Job completed with photos | Before / after post |
| Five-star review received | Review spotlight |
| Slow upcoming schedule | Availability push |
| Seasonal date reached | Seasonal campaign |
| Several jobs in one service category | Expertise post |
| Premium service sold | Premium service spotlight |
| Activity spike in one city | Local authority post |
| New service added | New service announcement |

This map is central to the module.

---

# 18. Multi-Organization Rules

The Growth Center must be fully aligned with PhoenixOS multi-tenant truth.

## 18.1 Required rules

- every marketing record is organization-owned
- every channel connection is organization-owned
- every campaign is organization-owned
- every AI opportunity is organization-owned
- every automation rule is organization-owned
- every publish attempt is organization-owned
- every query is scoped to the active organization
- no tenant content may bleed into another tenant

## 18.2 Workspace switching behavior

When the user switches organization:

- marketing dashboard changes
- channels change
- brand profile changes
- campaigns change
- calendar changes
- automations change
- analytics change

The active organization context must govern the full marketing surface.

---

# 19. Data Model Direction

This is a product-level model, not a final schema contract.

```text
MarketingProfile
ConnectedMarketingChannel
MarketingOpportunity
MarketingContentDraft
MarketingPost
MarketingPostVariant
MarketingCampaign
MarketingCampaignItem
MarketingAutomationRule
MarketingPublishingJob
MarketingPublishAttempt
MarketingAnalyticsSnapshot
```

## 19.1 Ownership rule

Every table or document above must include:

```text
organization_id
```

unless a future platform-level admin construct is explicitly designed and audited.

---

# 20. Monetization Architecture

## 20.1 Commercial principle

`/marketing` should be a **paid value driver**, not a throwaway free toy.

## 20.2 Recommended packaging direction

### Starter
- teaser / limited preview
- no full publishing access
- optional small taste of generated suggestions

### Pro
- marketing center access
- limited channel connections
- manual content generation
- basic scheduling
- limited AI capacity

### Business
- full multi-channel publishing
- CRM-driven opportunity engine
- campaign builder
- stronger scheduling
- higher AI capacity
- review and job-driven draft flows

### Growth Autopilot Add-on
- advanced automation rules
- schedule-gap marketing
- event-driven draft creation
- selective auto-publish
- deeper growth intelligence

---

## 20.3 Commercial design requirement

The billing architecture should be able to support:

```text
Included by plan
+ usage limits
+ optional paid add-on
```

The highest-retention behaviors should **not** be given away too cheaply.

---

# 21. Launch Surface: “Coming Soon” Strategy

## 21.1 Decision

The Growth Center should appear in the launch surface as a **strategic teaser**, not as a fake finished feature.

## 21.2 Recommended dashboard / sidebar teaser

```text
Growth Center
Coming Soon
Turn completed jobs, reviews, and open schedule gaps into ready-to-publish marketing.
```

CTA:

```text
Join Early Access
```

or:

```text
Notify Me
```

## 21.3 Why this is useful

- strengthens product vision
- increases perceived roadmap depth
- signals that WizField is built for business growth, not just admin work
- creates early demand data
- helps support sales conversations

## 21.4 Important boundary

Do **not** overpromise availability or capability before the module is committed to an execution cycle.

---

# 22. Recommended Build Roadmap

## Phase 0 — Launch teaser
- show Coming Soon presence
- add early-access CTA
- no channel integrations
- no marketing logic
- no heavy backend work

## Phase 1 — Marketing foundation
- real `/marketing` shell
- marketing profile per organization
- empty states
- page structure
- opportunity data architecture foundation
- channels page structure

## Phase 2 — Content Studio
- manual post creation
- AI content generation
- platform-specific variants
- draft save/edit
- basic content calendar

## Phase 3 — Publishing integrations
- Google Business Profile
- Facebook Page
- Instagram Business
- authorization flows
- publish now
- schedule publish
- reconnect and failure handling

## Phase 4 — CRM intelligence layer
- opportunities from jobs
- opportunities from reviews
- opportunities from photos
- opportunities from schedule gaps
- recommended next marketing action

## Phase 5 — Campaign Builder
- seasonal campaigns
- revenue campaigns
- trust campaigns
- local authority campaigns
- campaign calendar generation

## Phase 6 — Automation and Autopilot
- rule builder
- trigger processing
- auto-draft
- scheduled rules
- selective auto-publish

## Phase 7 — Analytics and optimization
- consistency metrics
- channel-level operating visibility
- publish outcomes
- opportunity-to-publish conversion
- platform performance metrics where supported

---

# 23. Explicit Out-of-Scope Items for Early Phases

Do **not** include these in the initial module scope:

- Google Ads management
- Facebook Ads bidding
- media design editor
- generic Canva competitor behavior
- full blogging CMS in phase 1
- email marketing campaigns
- SMS blast marketing
- direct TikTok-first product scope
- “publish everything everywhere” without channel-specific adaptation

These are future candidates, not launch requirements.

---

# 24. Core UX Principle

The owner should feel:

> “I am not starting from a blank page. WizField already understands what is worth marketing.”

Every core screen should reduce thinking load:

- suggest the right content
- connect it to real business context
- provide ready-to-edit output
- publish or schedule in as few steps as possible

---

# 25. Acceptance Criteria for the Full Growth Center

The module can be considered strategically complete when it can:

1. detect a marketing opportunity from CRM activity  
2. convert it into a high-quality draft  
3. adapt it by platform  
4. let the owner approve or edit  
5. schedule or publish it  
6. preserve all marketing history per organization  
7. support campaign-level planning  
8. support controlled automation rules  
9. remain fully tenant-safe and workspace-aware  
10. create enough dependency to materially improve retention

---

# 26. Product Messaging

## Internal one-line definition

> **WizField Growth Center converts daily field operations into ongoing local marketing.**

## Customer-facing positioning draft

> **Turn completed jobs, customer reviews, and open schedule gaps into ready-to-publish marketing — directly from the system you already use to run your business.**

## Stronger website messaging angle

> **Run the work. Get paid. Stay visible.**

---

# 27. Product Role Inside WizField

WizField can now be described through three compounding operating layers:

```text
1. Run the business
2. Get paid
3. Stay visible and generate demand
```

The Growth Center owns the third layer.

---

# 28. Recommended Product Decision

## Decision

The `/marketing` module should be added to the official WizField roadmap as:

```text
WizField Growth Center
Retention Engine + CRM-Powered Marketing Intelligence
```

## Build timing

- **Add to product roadmap now**
- **Tease in launch surface if desired**
- **Do not open full execution before core launch activation priorities are finished**

---

# 29. Final Verdict

This module is strategically strong.

It is not a clone of another person’s “AI content posting tool.”  
It is a better, more defensible product adaptation:

> **A marketing layer that only WizField can build because it is connected to the business operating system itself.**

If executed correctly, `/marketing` can become one of the strongest reasons a business keeps paying for WizField month after month.

---

# 30. Suggested Next Artifact

After this Master Plan, the next recommended document is:

```text
WizField_Marketing_Growth_Center_Execution_Prompt_PLAN_MODE.md
```

Purpose:

- convert this strategy into an execution prompt for the coding agent
- frame the correct work mode
- preserve a strict before-coding gate
- define what is planned now versus what remains roadmap
- prevent scope creep during implementation
