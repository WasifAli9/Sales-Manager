---
name: Outbound email suppression
description: Delivery and opt-out rules for outbound sales emails.
---

Recipients opt out globally through opaque, per-email unsubscribe tokens. The token identifies the originating send without exposing the email address; the opt-out marks the lead suppressed, and every later outbound path must reject that lead.

**Why:** A single recipient may appear in multiple products, campaigns, or sequences. Global suppression is safer than relying on the originating product or a single campaign to honor their request.

**How to apply:** Keep the unsubscribe link and List-Unsubscribe headers mandatory on every outreach email. Cancel rows that are still scheduled when an opt-out is received. A pending row has already been claimed for provider submission and must retain an honest in-flight/sent/failed status rather than being misleadingly marked cancelled. Any new send path must check suppression before it queues or claims delivery.