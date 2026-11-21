# FORM Gym interface

Today's workout remains the main workflow. The library supports planning; the notebook
supports writing. Groups add shared plans, leader reviews, chat and earned leaderboards.

Version 1.2 follows UI UX Pro Max's dark-mode and mobile interaction guidance,
with its contrast, touch, form hierarchy and motion rules.

## Visual rules

- Charcoal/graphite default, distinct working surfaces, warm white text and restrained gold accent.
- Use the 60/30/10 balance as a visual guide: background, surfaces, then meaningful accents.
- Each rank has its own color; its name and shield also identify it without relying on color.
- A light alternative uses the same semantic tokens, spacing and controls.
- DM Sans for body and controls; Barlow Condensed for titles, rank names and short numbers.
- 16px inputs/body, 14px support, 12px minimum captions and comfortable 48px controls.
- Four/eight-pixel spacing rhythm, 16px card corners and clear content groups.
- Vector rank shields show actual rank position. Graphic treatments support real data.
- Short press feedback at the pointer origin, staggered entrances and eased, interruptible transitions.
- Brief squash/stretch on rewards; no continuous decorative motion in the main workflow.
- Reduced motion removes animation; focus remains legible in both appearances.

## Structure

- Five destinations: Today, My week, Exercise library, Notes and Groups. Progress/account/settings in the header.
- Desktop horizontal navigation; mobile bottom navigation with five destinations.
- Today shows current rank, actual workout and Start/Resume, week schedule and totals.
- Progress separates overview, history and ranks. No invented athletic results.
- Notes reserves space for writing with categories, checklists, undo and honest save feedback.
- Library offers search, filters, favorites, animated form guides and red front/back muscle maps.
- Language comes first, followed by a username/character and personal training profile.
- Daily easy/medium/hard quests offer distinct rewards based on completed sets and reps.
- Premium stays in Settings; purchases are disabled.
- Groups has connection/create/join, then Chat, Training, Leaderboard and Members.
- Leaders assign an existing plan and review completed sessions.
- Members explicitly share workout summaries. Group points are capped per day.
- Both global and group boards display repetitions, rank and XP; no invented competitors.
- Local group creation stays available on mobile without a connection.
- Group state caches locally for offline viewing. Updates require a network connection.
- Personal age, measurements, conditions and free notes are excluded from sharing.

## Verification

Check 375px, tablet/desktop and landscape; translated labels; keyboard focus;
48px controls; large text; reduced motion; independent dark/light contrast.
Verify create/join, assignment application, shared progress, reviews, chat,
offline cache, authoritative roles and close/restart persistence.
