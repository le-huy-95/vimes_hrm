# Auth UI Port Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Port VIMES auth screens as UI-only flows with go_router stub navigation (no API/Bloc).

**Architecture:** Pure StatefulWidget pages + shared auth widgets; `GoRouter` for `/login`, `/register`, `/forgot-password`, `/verify-otp`, `/reset-password`. Submit actions validate forms then navigate or show snackbar.

**Tech Stack:** Flutter, go_router, pinput, flutter_svg, existing ColorSkin/TypoSkin/AppButton.

---

### Task 1: Widgets + AppHeader
- Create auth widgets, AppLogo, slim AppHeader (no notification bell)
- Create router + 5 pages + wire app
- Verify analyze/test

(Details in approved spec: `docs/superpowers/specs/2026-09-28-auth-ui-port-design.md`)
