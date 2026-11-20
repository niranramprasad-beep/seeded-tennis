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

export const POLICY_EFFECTIVE_DATE = "2026-11-20";
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
      "If you tell us, we also store the month you were born (never the day) and when you plan to start college. If you are a parent and confirm your email with the link we send, we store when you confirmed it and which address you confirmed.",
      "If you are a player, you also give us tennis details so the product can do anything useful: your UTR, graduation year, grade, gender for team comparison, country, home area, GPA if you enter one, and a link to your UTR profile if you add one. Seeded never fetches anything from UTR — every rating here is one you typed in.",
      "As you use Seeded we store what you create: UTR check-ins, match results, tournaments you track, schools you save, coach-outreach notes and stages, daily check-ins, your training calendar, your recruiting checklist, and your settings. If your family uses the season budget, we store the budget and its expenses.",
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
      "If you are under 13, your account does nothing with tennis until a parent or guardian approves it: you cannot save a school, log a result, build a plan or track a tournament. That is enforced by the database on 21 tables, not by hiding buttons — and the account cannot be created at all without a birth year, so the check cannot be skipped by leaving it blank. You CAN still edit your own profile details and use Settings, including downloading or deleting everything we hold, because locking a child out of their own data while they wait would be the wrong way round.",
      "One correction to be exact about, because an earlier version of this page was not: the school catalogue at /schools is a public page. It is the same published information anyone can read without an account, it is not about you, and nothing you do there is saved until your account is approved. We previously said an under-13 account \u201ccannot see schools\u201d and that the database enforced it. The catalogue is static and no database row gates it, so that was wrong.",
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
    //
    // The budget sentence was a disclosure from 2026-11-15 until migration
    // 050 (2026-11-20): is_parent_member() admitted any approved
    // parent_accounts row regardless of role, so a sibling PLAYER could write
    // the budget — proved through real auth, not inferred. 050 makes it
    // role-aware (caller's own profiles.role = 'parent' AND approved), and the
    // disclosure was deleted in the same commit rather than reworded, per
    // docs/TODO.md. Attack-tested both ways on staging and production:
    // ~/seeded-evidence/review-ready/r4-rls/.
    //
    // The removal sentence below was FALSE when 036 first shipped it, for
    // exactly the users production already has. `remove_family_member()`
    // only deleted the `parent_accounts` row, and every one of production's
    // three links belongs to someone whose own `profiles.family_code` is the
    // same code (the pre-023 shape), so both my_family_code() and
    // shares_approved_family_with() still matched after removal. Found by an
    // independent review and reproduced on staging: the "removed" member
    // still read 2 profiles and 3 utr_entries rows. Migration **037** makes
    // the sentence true by clearing the profile column on removal too.
    //
    // The second sentence is the exact column list, because RLS cannot
    // narrow columns: 037 dropped the cross-user `profiles` policy and moved
    // the roster into `family_members()`, where the columns are enumerated.
    // Before that, one family member could read another's whole row — gpa,
    // birth year, billing ids. Say what is shared, not "the profile".
    source:
      "supabase/migrations/023_family_join_rpc.sql (is_family_member); supabase/migrations/036_family_membership_both_shapes.sql (shares_approved_family_with + six family read policies); supabase/migrations/037_revoke_on_removal_and_narrow_family_reads.sql (remove_family_member clears the profile code; family_members() column list; family_members_read dropped); season_budgets + budget_expenses write policies; supabase/migrations/050_budget_writes_parents_only.sql (is_parent_member: role = 'parent' AND approved); supabase/migrations/033_parent_notes_and_required_birth_year.sql (encouragement_notes_insert_parent); supabase/migrations/042_family_plan_lock.sql (family_plan_required); supabase/migrations/044_roster_respects_family_plan.sql (family_members() stats NULL without the Family plan); supabase/migrations/045_family_plan_one_family_and_caps.sql (one plan, the payer's home family; 4 players / 2 parents)",
    body: [
      "When the family is on the Family plan, a parent who has been approved into the family can see the player's UTR history, match results, tournaments, check-ins, saved schools and outreach progress. The one who pays can be a parent or the player, as long as this family is the paying account's own family: one Family plan covers one family, up to 4 players and 2 parents, and an account that also belongs to another family unlocks only its own. If the paying account is removed from the family, the family goes back to Free unless someone else in it pays. This works the same whether the parent created the account and the player joined with the code, or the other way round.",
      "Without the Family plan, members of a family see only the list below about each other, minus the five tennis and school details marked in it, and nobody can see or edit the season budget or read the family's notes (a parent can still read the notes they wrote). The database enforces this, not the screen. Nothing is deleted when a family stops paying; it all becomes visible again when someone whose own family it is upgrades.",
      "What one family member can see of another, from their profile, is this list, and only this list: name, email, whether they are a player or a parent, when they joined, whether they have finished setting up, their current UTR, grade, graduation year and gender, the schools they are tracking, and whether their account is waiting on a parent\u2019s permission. Those five details (current UTR, grade, graduation year, gender and tracked schools) are shown only while the family is on the Family plan. Not their GPA, not their birth year, and nothing about billing — those are visible only to the person themselves.",
      "That last item is an age signal, so we would rather name it than bury it: if a member is under 13 and still waiting for permission, the others in the family can see that they are waiting. They cannot see their birth year.",
      "Everyone in a family can see this about everyone else in it, not only parents about players. A sibling in the same family sees the same list.",
      "Approval is the opt-in, and it is the only one. Someone whose request is still waiting sees nothing at all, and the moment a member is removed from a family they can no longer see anything about anyone in it.",
      "Apart from their own account details and their own cost projections, a parent can write two things: the season budget and its expenses, and short notes to the player. Everything else is read-only — a parent cannot change a player's profile, log results for them, or send anything to a coach on their behalf. The parent_reports table is not written by anyone at all — no feature generates a row, and after migration 039 no signed-in account can insert one either. The weekly family report you can open is computed live from the player's logged data when you open it; it is not stored.",
      "Only an account marked as a parent can write the budget, its expenses or those notes. A sibling or another player in the family cannot, even once they are approved.",
      "Joining a family needs a code AND an approval from someone already in that family. A code on its own gets you nothing.",
      "Asking to join is itself visible, in one direction. While your request is waiting you see nothing of theirs — but they see your name, email and whether you are a player or a parent (and, if their family is on the Family plan, your current UTR, grade, graduation year, gender and tracked schools), so that they know who they are approving. If you type a code that belongs to a family you did not mean to ask, that is what they will have seen. You can withdraw a request, which deletes it.",
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
      "Settings → Privacy + data has two downloads for a player. \"Download everything\" is a JSON file of every row we store about your account. \"Download as a spreadsheet\" is a readable CSV of your schools, results, notes and outreach. A parent's account has only the first: it holds your profile, the notes you wrote, and — while your family is on the Family plan — your family's season budget with all of its expenses, whoever in the family entered them (every approved member can already see those) — your player's results are in their account, not yours.",
      "\"Delete account\" deletes your account and everything in it immediately, and it cannot be undone. Your profile, UTR history, results, check-ins, saved schools and outreach records all go, and so does your sign-in itself.",
      "If other people are still in your family, the family and their accounts stay. If you were the last one in it, the family is removed too, with its season budget.",
      "If you are a parent, deleting your account deletes the notes you wrote and the budget expenses you entered. Your player's account and everything in it are not touched.",
      "You do not need to ask us to do either of these, and you do not need a reason.",
    ],
  },
  {
    id: "cookies",
    title: "Cookies and analytics",
    source: "lib/supabase/client.ts persistSession; components/shared/google-analytics.tsx; components/shared/design-preference-sync.tsx + lib/db/settings.ts saveDesignPreference (theme saved to user_settings when signed in)",
    body: [
      "Signing in stores a session in your browser so you stay signed in. Clearing your browser data signs you out.",
      "Your theme and a few display preferences are stored in your browser. If you are signed in, your theme is also saved to your account so it follows you to another device — that is the only display preference that leaves your browser.",
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
