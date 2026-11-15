// The privacy policy and terms, as data.
//
// ===========================================================================
// REQUIRES LEGAL/ADULT REVIEW BEFORE LAUNCH.
// ===========================================================================
// This is a careful, verified description of what the software actually
// does. It is NOT legal advice and it has not been reviewed by a lawyer.
// Seeded's users are minors, which puts COPPA and state minor-privacy law in
// scope, and neither is something to take a confident guess at.
// docs/TODO.md lists what a lawyer has to check.
//
// WHY THIS IS A MODULE AND NOT TWO PAGES OF JSX.
// Every claim below was checked against the code or a migration, and the
// `source` field records where. That makes the policy auditable: when
// somebody changes deletion or adds a column, `lib/legal/policy.test.ts`
// fails if the thing the policy promises is no longer what the code does.
// A privacy policy that drifts from the product is the most expensive kind
// of stale copy there is.
//
// THE RULE FOR EDITING THIS FILE: do not add a sentence you have not
// checked. If you cannot name the file, migration or table that makes it
// true, it does not go in.

export const POLICY_EFFECTIVE_DATE = "2026-11-15";
export const POLICY_CONTACT_EMAIL = "support@seededtennis.com";

export interface PolicySection {
  id: string;
  title: string;
  /** Paragraphs, plain English, written for a 14-year-old and their parent. */
  body: string[];
  /** Where in the codebase this is true. Not rendered — it is the audit
   * trail, and the test reads it. */
  source: string;
}

export const PRIVACY_SECTIONS: PolicySection[] = [
  {
    id: "what-we-collect",
    title: "What we collect, and why",
    source: "lib/db/database.types.ts profiles columns; lib/db/account-export.ts",
    body: [
      "When you make an account we store your name, email address, the year you were born, whether you are a player or a parent, and your family code. The birth year is there for one reason: to know whether you are under 13, because under-13 accounts need a parent's permission before they work.",
      "If you are a player, you also give us tennis details so the product can do anything useful: your UTR, graduation year, grade, gender for team comparison, country, home area, GPA if you enter one, and a link to your UTR profile if you add one. Seeded never fetches anything from UTR — every rating here is one you typed in.",
      "As you use Seeded we store what you create: UTR check-ins, match results, tournaments you track, schools you save, coach-outreach notes and stages, daily check-ins, training plans, your recruiting checklist, and your settings. If your family uses the season budget, we store the budget and its expenses.",
      "We do not collect your location, your contacts, your photos, or anything from your device beyond what your browser sends with an ordinary web request.",
    ],
  },
  {
    id: "minors",
    title: "If you are under 18",
    source:
      "supabase/migrations/030_under13_parent_consent.sql; supabase/migrations/027_narrow_profile_reads_and_rpc_grants.sql; supabase/migrations/033_parent_notes_and_required_birth_year.sql (birth year required)",
    body: [
      "Most people using Seeded are between 13 and 18. Nothing you put in Seeded is visible to other users — there is no public profile, no directory, no search for other players, and no way for a signed-in stranger to look you up. The only people who can see your information are the members of your own family who you or another approved member have approved.",
      "If you are under 13, your account is created but does nothing at all until a parent or guardian approves it. You cannot see schools, save anything, or build a plan before then. That is enforced by the database, not by hiding buttons — and the account cannot be created at all without a birth year, so the check cannot be skipped by leaving it blank.",
      "Seeded cannot verify that anyone is an adult or that they are your parent. When someone approves an under-13 account, they are stating it. We record who approved it and when.",
    ],
  },
  {
    id: "parents",
    title: "What parents can and cannot do",
    // Checked against pg_policies on 2026-11-15, not against intent. An
    // earlier draft of this section said parents are "read-only everywhere
    // except the season budget" — copied from CLAUDE.md's own wording, and
    // wrong: encouragement_notes_insert_parent lets an approved member write
    // a note. Naming the two writes is the honest version.
    //
    // The first sentence below was TRUE OF INTENT AND FALSE OF THE CODE
    // until migration 036 (2026-11-15). A joiner's profiles.family_code is
    // deliberately NULL, and both family_members_read and
    // utr_entries_select_family required it to be non-null — so in the
    // ordinary flow (a parent creates the account, the player joins with the
    // code) the parent could read none of it. It DENIED access rather than
    // granting it, so nothing was ever exposed; the policy simply promised
    // more than the database did. 036 makes it true, and the sentence is now
    // attack-tested in both directions (stranger, pending, other family,
    // removed member) rather than asserted.
    source:
      "supabase/migrations/023_family_join_rpc.sql (is_family_member); supabase/migrations/036_family_membership_both_shapes.sql (shares_approved_family_with + the seven family read policies); season_budgets + budget_expenses write policies; supabase/migrations/033_parent_notes_and_required_birth_year.sql (encouragement_notes_insert_parent)",
    body: [
      "A parent who has been approved into a family can see the player's profile, UTR history, match results, tournaments, saved schools and outreach progress. This works the same whether the parent created the account and the player joined with the code, or the other way round.",
      "Approval is the opt-in, and it is the only one. Someone whose request is still waiting sees nothing at all, and the moment a member is removed from a family they can no longer see anything about anyone in it.",
      "A parent can write two things: the season budget and its expenses, and short notes to the player. Everything else is read-only — a parent cannot change a player's profile, log results for them, or send anything to a coach on their behalf.",
      "Only an account marked as a parent can write those notes. A sibling or another player in the family cannot, even once they are approved.",
      "Joining a family needs a code AND an approval from someone already in that family. A code on its own gets you nothing.",
    ],
  },
  {
    id: "processors",
    title: "Who else touches your data",
    source: "lib/supabase/*, Vercel deployment, lib/whop.ts, components/shared/google-analytics.tsx, lib/auth.ts signInWithGoogle",
    body: [
      "Supabase stores the database and runs sign-in. Your account and everything in it lives there.",
      "Vercel hosts and serves the site, and its analytics count page views.",
      "Whop handles payment if you buy a plan. Seeded never sees or stores your card details — Whop tells us only that a membership is active and which plan it is on.",
      "Google Analytics counts page views so we know which pages get used. It is not given your name, your email, or any of your tennis data.",
      "Google is involved only if you choose \"Continue with Google\" to sign in. In that case Google tells us your email address and name.",
      "That is the whole list. Seeded does not sell data, does not share it with schools or coaches, and runs no advertising.",
    ],
  },
  {
    id: "coach-email",
    title: "Coach emails",
    source: "lib/db/schools.ts buildCoachEmail; Gmail compose-link only",
    body: [
      "Seeded drafts coach emails from results you have logged, and opens them in your own email program. Seeded does not send them, does not have access to your inbox, and never emails a coach on your behalf.",
      "You type the recipient. Seeded does not supply coach addresses.",
    ],
  },
  {
    id: "keeping",
    title: "How long we keep it",
    source: "migration 029_real_account_deletion.sql delete_my_account()",
    body: [
      "We keep your data while your account exists. There is no automatic expiry.",
      "When you delete your account, it is deleted straight away — not queued, not scheduled, not kept for 30 days. See below.",
    ],
  },
  {
    id: "export-delete",
    title: "Getting your data out, and deleting it",
    source: "app/api/account/export/route.ts; app/api/account/deletion/route.ts; delete_my_account()",
    body: [
      "Settings → Privacy + data has two downloads. \"Download everything\" is a JSON file of every row we store about your account. \"Download as a spreadsheet\" is a readable CSV of your schools, results, notes and outreach.",
      "\"Delete account\" deletes your account and everything in it immediately, and it cannot be undone. Your profile, UTR history, results, check-ins, saved schools and outreach records all go, and so does your sign-in itself.",
      "If other people are still in your family, the family and their accounts stay. If you were the last one in it, the family is removed too.",
      "You do not need to ask us to do either of these, and you do not need a reason.",
    ],
  },
  {
    id: "cookies",
    title: "Cookies and analytics",
    source: "lib/supabase/client.ts persistSession; components/shared/google-analytics.tsx",
    body: [
      "Signing in stores a session in your browser so you stay signed in. Clearing your browser data signs you out.",
      "Your theme and a few display preferences are stored in your browser and never leave it.",
      "Google Analytics and Vercel Analytics set their own cookies to count visits. We do not use advertising cookies and we do not track you across other sites.",
    ],
  },
  {
    id: "security",
    title: "How your data is protected",
    source:
      "supabase/migrations/022_lock_privileged_profile_columns.sql; supabase/migrations/028_api_rate_limits.sql; supabase/migrations/032_block_family_code_on_profile_insert.sql; next.config.mjs security headers",
    body: [
      "Every table enforces who can read and write each row inside the database itself, not just in the app. A page that forgot to check something still cannot return another person's data.",
      "The fields that decide what you have paid for and which family you belong to cannot be changed from a browser at all.",
      "No system is perfect, and we would rather say that than claim otherwise. If you find a problem, email us at the address below.",
    ],
  },
  {
    id: "changes",
    title: "Changes to this policy",
    source: "POLICY_EFFECTIVE_DATE",
    body: [
      "If this policy changes, the date at the top changes with it. We will not quietly broaden what we collect.",
    ],
  },
  {
    id: "contact",
    title: "Contact",
    source: "POLICY_CONTACT_EMAIL",
    body: [
      `Questions, a data request, or a security problem: ${POLICY_CONTACT_EMAIL}. A parent or guardian can write to us about their child's account from the same address.`,
    ],
  },
];

/** The sentence shown next to the signup consent checkbox and on the parent
 * consent card. One string so both say the same thing. */
export const SIGNUP_CONSENT_NOTE =
  "By creating an account you agree to the Terms and the Privacy policy.";

export const PARENT_CONSENT_POLICY_NOTE =
  "Approving means you agree, as this player's parent or guardian, to Seeded storing their information as described in the Privacy policy.";
