# Hackathon Product Note

## Problem

Preparing a CPGRAMS grievance can be difficult when a citizen does not know the correct department/category, what facts make the complaint actionable, whether a similar grievance already exists, or how to turn informal language into concise grievance text.

## Current experience

Citizens must translate a lived problem into administrative language and navigate routing choices. A wrong or unclear choice can add friction before redressal even begins.

## Solution

Smart CPGRAM Assistant is a pre-submission assistance layer. It guides a citizen from natural-language description through minimal clarification, controlled routing guidance, possible-related-history review, professional drafting, final editing, draft saving/copying, and an explicit handoff to CPGRAMS.

## What genuinely works

- Supabase signup/login/session/logout
- RLS-protected history and draft storage for registered users
- no-account judge demo
- structured AI routing, missing-information check, and grievance preparation
- candidate-scoped duplicate similarity with citizen control
- editable final review, clipboard copy, and explicit official-site handoff
- prototype acknowledgement and a forward-only simulated status lifecycle

## What is mocked

- CPGRAMS submission and government backend routing
- all Demo Mode grievance history
- official acceptance of suggested department/category
- any government-side status processing

The application does not claim that a saved draft has been lodged with CPGRAMS.

## Safety

- No live government API access, scraping, OTP interception, or government credentials
- No intentional real citizen PII in the privacy-safe synthetic demo dataset
- Sensitive identifiers and credentials are discouraged in the complaint UI and clarification prompt
- Supabase RLS limits registered users to their own stored records
- Authenticated duplicate candidates come only from that session’s RLS-returned history
- The official portal opens only after an explicit citizen action, with no automated submission

## Why Codex

**Built with Codex.** Codex performed the repository architecture/security review; implemented Supabase authentication, session handling, mode separation, authenticated history and saving; refactored the citizen journey; added structured backend assistance, safe duplicate comparison, validation and provider handling; and added tests, documentation, and deployment configuration. Runtime AI requests use OpenRouter-hosted models.
