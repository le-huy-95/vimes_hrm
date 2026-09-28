# Phase 1 Auth Email (Vimes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement OTP verify, password-reset OTP, and org-invite emails with Vimes branding via messaging templates + identity/core callers.

**Architecture:** identity owns OTP; core owns org invites; messaging owns Handlebars + SMTP/dev inbox; internal HTTP + `x-internal-token`.

**Tech Stack:** Express, TypeScript, Handlebars, nodemailer, argon2, jose, pg, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-28-phase1-auth-email-vimes-design.md`

---

### Task 1: messaging templates + typed email endpoints
### Task 2: DB migration org_invitations + users.token_version
### Task 3: identity-service register/verify/forgot/reset + AuthMailer
### Task 4: core-service org create/invite/accept + InviteMailer
### Task 5: Verify build/test; update README/.env.example

(Execute inline in this session per user request to implement.)
