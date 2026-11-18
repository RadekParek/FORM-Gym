# FORM Gym interface

Today's workout remains the main workflow. Groups add shared plans, leader reviews,
chat and an earned leaderboard.

This release follows UI UX Pro Max's energetic block layout and dark-mode guidance,
with its contrast, touch, form hierarchy and motion rules.

## Visual rules

- Charcoal default (#111713), distinct working surfaces, warm white text and mint accent.
- A light alternative uses the same semantic tokens, spacing and controls.
- DM Sans for body and controls; Barlow Condensed for titles, rank names and short numbers.
- 16px inputs/body, 14px support, 12px minimum captions and comfortable 48px controls.
- Four/eight-pixel spacing rhythm, 16px card corners and clear content groups.
- Vector rank shields show actual rank position. Graphic treatments support real data.
- Short press feedback, 280ms page entry and one brief burst on an earned rank upgrade.
- Reduced motion removes animation; focus remains legible in both appearances.

## Structure

- Five destinations: Today, My week, Notes, Progress and Groups. Settings in the header.
- Desktop horizontal navigation; mobile bottom navigation with five destinations.
- Today shows current rank, actual workout and Start/Resume, week schedule and totals.
- Progress separates overview, history and ranks. No invented athletic results.
- Notes reserves space for writing. Premium stays in Settings; purchases are disabled.
- Groups has connection/create/join, then Chat, Training, Leaderboard and Members.
- Leaders assign an existing plan and review completed sessions.
- Members explicitly share workout summaries. Group points are capped per day.
- Group state caches locally for offline viewing. Updates require a network connection.
- Personal age, measurements, conditions and free notes are excluded from sharing.

## Verification

Check 375px, tablet/desktop and landscape; translated labels; keyboard focus;
48px controls; large text; reduced motion; independent dark/light contrast.
Verify create/join, assignment application, shared progress, reviews, chat,
offline cache, authoritative roles and close/restart persistence.
