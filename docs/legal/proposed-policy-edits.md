# PROPOSED — for the lawyer's review, not live

> **Status: PROPOSED. Not live.** Nothing in this file is shown to users.
> The live policy is `/privacy`, generated from `lib/legal/policy.ts`, and
> this branch does not change it. These are suggested replacements for the
> reviewer (an adult / lawyer, per the open P0-8 item) to accept, reword or
> reject. Each sentence below is true of the code on `fix/ga-privacy`
> **except** where the last section says a GA property setting is still
> needed (enhanced measurement); if the code changes before the policy
> does, re-check it.

Written 2026-11-21 alongside the Google Analytics privacy change
(`lib/ga-privacy.ts`, `components/shared/google-analytics.tsx`,
`lib/ga4-server.ts`, guard `lib/ga-privacy.test.ts`).

## Why a change is needed

The live "Who else touches your data" section says Google Analytics "is not
given your name, your email, or any of your tennis data." Until this change
that was **not true**: every page view sent the full query string, and the
homepage calculator keeps a player's UTR, GPA, graduation year and gender in
the query string (audit A-201). The code now matches the sentence; the
sentence should also say more precisely what Google does receive.

## Proposed wording — "Who else touches your data", Google Analytics line

Replace the current Google Analytics sentence with:

> Google Analytics counts page views so we know which pages get used. For
> each view it is given the page's address **without** anything after a `?`
> or `#` — for example `/schools`, never the numbers you typed into a
> calculator. It is not given your name, your email, your account id or any
> of your tennis data.
>
> Google Analytics does not run at all:
> - on sign-in pages under `/auth/`;
> - for an account that needed a parent's consent (a player we treat as
>   under 13), whether that consent is still waiting or has been given;
> - until the site knows whether you are signed in and, if you are, whether
>   your account needed a parent's consent;
> - for a signed-in account with no birth year on record;
> - in automated browsers, and in browsers we have marked as our own
>   testing devices.
>
> If you are signed out, your visits to public pages may be counted.

## Proposed wording — purchases

Add, after the Whop sentence:

> When a plan is bought, our server tells Google Analytics that a purchase
> happened, which plan it was and its price in US dollars. It does not say
> who bought it: no name, email, account id or membership id is sent.

## Proposed wording — "Cookies and analytics"

Replace the second sentence with:

> Your theme and a few display preferences are stored in your browser. When
> you sign out or delete your account, Seeded clears what it stored in your
> browser except your theme (including answers you typed before creating an
> account, which are kept only for that browser tab). If you are signed in, your theme is also saved
> to your account so it follows you to another device — that is the only
> display preference that leaves your browser.

The third sentence ("We do not use advertising cookies and we do not track
you across other sites") stays. The GA config now also sets
`allow_google_signals: false` and `allow_ad_personalization_signals: false`,
which supports it.

## Things the reviewer should know that code cannot settle

- **GA admin settings are outside the repo, and this one matters (HIGH).**
  GA4 "enhanced measurement" is switched on or off in the Google Analytics
  property, not in code. While it is on, its automatic events — page changes
  based on browser history, outbound clicks (which carry the clicked link as
  `link_url`, e.g. a player's UTR profile link), site search, form
  interactions, file downloads, video — can send the browser's full address,
  query string included. The homepage calculator still puts a player's
  answers (UTR, grad year, gender) in the `/onboarding?…` address, so with
  enhanced measurement on, those can still reach Google. The code sets
  path-only `page_location`/`page_referrer` before every page view, which
  only covers what gtag builds from those values; it does not close this.
  Required owner step before the proposed wording above is true: **GA Admin
  → Data streams → web stream → Enhanced measurement: turn it OFF entirely**,
  then confirm in DebugView that a calculator → /onboarding navigation sends
  no query. Separately, moving the calculator's answers out of the URL is an
  open code follow-up. Until both are confirmed, the policy should not claim
  more than "the page's address without anything after `?` or `#`" for the
  page views Seeded sends itself.
- **Accounts with no birth year on record** (created before birth year was
  collected) are not tracked by Google Analytics at all once signed in,
  because their age cannot be told.
- **Data retention in GA** is also a property setting (2 or 14 months). The
  policy should state whichever is chosen.
- **"Under 13"** is decided from birth year only (`<= 13` years, rounding
  toward asking a parent), the same rule as the consent gate. Accounts
  created before birth year was collected count as not needing consent.
- Vercel Analytics (separate from Google Analytics) is not changed by this
  work.
