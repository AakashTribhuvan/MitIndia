# MUDRA Development Blueprint v1.1

## 1. Document control

| Field | Value |
|---|---|
| Blueprint version | 1.1 |
| Created | 2026-10-16 |
| Status | **Draft, pending review** |
| Based on | v1.0 (2026-10-15), which stays unchanged |
| Change | adds the **SignLine product track** (the web app redesign) next to the recognition milestones |

v1.0 Sections 2-10 still apply unless this file says otherwise. Versioning rules: v1.0 Section 1.

**Change history**

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-10-15 | First blueprint: definition of MUDRA v1.0, milestones M0-M6 |
| 1.1 | 2026-10-16 | Product name SignLine; product track P1-P4; status of M1 and M2 updated |

## 2. What changed since v1.0

- The owner asked for the web app to become **SignLine**: a branded product with a User and an Admin workspace,
  Game Mode, learning library, progress, accessibility settings and legal pages. The owner chose a **demo
  sign-in** (no real accounts) for now.
- The recognition milestones (M0-M6) and the definition of v1.0 (v1.0 Section 2.1) are **unchanged**: a polished
  interface does not count as recognition progress.

## 3. Product track (alongside M1-M5)

| Milestone | Goal | Status (2026-10-16) | Done when |
|---|---|---|---|
| P1 Brand and shell | tokens, logo, loader, navigation, demo sign-in, role workspaces | built, checked in screenshots (desktop + mobile) | owner approves the look |
| P2 Learning product | Home, Learning library, Game Mode (70 lessons, local XP / streak / badges), Progress, Settings | built; 7 unit tests | an ISL signer has reviewed the lesson tips and the lesson order |
| P3 Admin and records | overview, users (this browser), content, records, reports, game rules: real data only | built (read-only except deleting recordings) | owner confirms what admins must be able to change |
| P4 Real accounts | server-side users, hashed passwords, roles enforced on the server, audit log, leaderboard, editable content and rules | **not started** (owner chose demo sign-in) | security review passed; no admin can be self-registered |

Rules for the product track:
- Never show invented numbers, users or results; every value is real or labelled (Live / Demo / Not available /
  Coming soon).
- Never present the demo sign-in as security; never run the demo Admin area on an untrusted network.
- Quizzes may only test recognising shown examples until the model is validated on new signers (v1.0 M5).
- Legal pages stay "draft" until the owner fills in the `[…]` items and approves them.

## 4. Recognition status update

- **M1 (laptop webcam):** camera picker, resolution, error and black / frozen feed states and browser diagnostics
  are built. Measured on the laptop (ACER HD User Facing camera): tracking varied from 3 to 22 fps between
  sessions (likely other tabs running hand tracking). Acceptance (≥ 15 fps sustained for 5 minutes) **not yet met**.
- **M2 (live segmentation):** personal examples for known words and fragment joining are built. First live success
  on 2026-10-15: the user's own COMPUTER recognised. Acceptance (labelled live recordings, ≥ 90% cut as one
  segment) **not yet measured**.
- Next: a labelled live test of several words with only one SignLine tab open.
