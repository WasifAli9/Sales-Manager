---
name: Resend email engagement tracking
description: Rules for accepting Resend delivery and engagement webhook events without losing or double-counting campaign metrics.
---

Treat the provider event ID as the idempotency key and retain each signed event in an immutable audit log while exposing per-send summary fields for campaign reporting. Map events strictly through the Resend message ID, not recipient metadata.

**Why:** Email providers retry events and may deliver engagement events out of order; browser-facing open tracking is approximate, while click tracking is generally more reliable.

**How to apply:** Verify Resend's raw signed payload before parsing JSON. If a recent, signed event arrives before its message-ID mapping has been persisted, return a retryable failure for a short bounded window instead of acknowledging and losing it. Derive first/last engagement timestamps by event time, not arrival order.