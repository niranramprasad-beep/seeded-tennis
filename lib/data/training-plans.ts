import type { TrainingPlan } from "@/lib/types";

// Weekly training templates keyed by UTR band. A real backend would
// personalize these; here they scale realistically in volume and intensity
// from a developing junior (UTR 6, ~14h) to a college-ready player (UTR 12, ~26h).

export const trainingPlans: TrainingPlan[] = [
  {
    utrLevel: 6,
    label: "Developing — UTR 5-6",
    summary:
      "Building consistency and a repeatable weekly rhythm. Emphasis on technical reps and athletic base.",
    weeklyHours: 14,
    days: [
      {
        day: "Mon",
        activities: [
          {
            id: "u6-mon-1",
            type: "court",
            title: "Groundstroke consistency",
            hours: 1.5,
            intensity: "moderate",
            detail:
              "Cross-court rally targets, 10-ball consistency drills, depth control with cones.",
            focusAreas: ["forehand", "backhand"],
          },
        ],
      },
      {
        day: "Tue",
        activities: [
          {
            id: "u6-tue-1",
            type: "gym",
            title: "Foundational strength",
            hours: 1,
            intensity: "moderate",
            detail: "Bodyweight squats, lunges, core circuit, band work for shoulders.",
            focusAreas: ["fitness"],
          },
          {
            id: "u6-tue-2",
            type: "court",
            title: "Serve technique",
            hours: 1,
            intensity: "low",
            detail: "Toss consistency, trophy position, slow-motion serves to targets.",
            focusAreas: ["serve"],
          },
        ],
      },
      {
        day: "Wed",
        activities: [
          {
            id: "u6-wed-1",
            type: "court",
            title: "Live ball + footwork",
            hours: 1.5,
            intensity: "moderate",
            detail: "Split-step timing, recovery steps, point patterns from the baseline.",
            focusAreas: ["fitness", "forehand"],
          },
        ],
      },
      {
        day: "Thu",
        activities: [
          {
            id: "u6-thu-1",
            type: "mental",
            title: "Routine building",
            hours: 0.5,
            intensity: "low",
            detail: "Between-point routines, breathing reset, journaling one match goal.",
            focusAreas: ["mental"],
          },
          {
            id: "u6-thu-2",
            type: "court",
            title: "Volleys & transition",
            hours: 1,
            intensity: "moderate",
            detail: "Approach shots, first volley, overhead positioning.",
            focusAreas: ["forehand", "backhand"],
          },
        ],
      },
      {
        day: "Fri",
        activities: [
          {
            id: "u6-fri-1",
            type: "gym",
            title: "Speed & agility",
            hours: 1,
            intensity: "moderate",
            detail: "Ladder drills, short sprints, lateral shuffles.",
            focusAreas: ["fitness"],
          },
        ],
      },
      {
        day: "Sat",
        activities: [
          {
            id: "u6-sat-1",
            type: "match",
            title: "Practice match",
            hours: 1.5,
            intensity: "high",
            detail: "Best-of-three sets with a similar-level partner, score kept.",
            focusAreas: ["mental"],
          },
        ],
      },
      {
        day: "Sun",
        activities: [
          {
            id: "u6-sun-1",
            type: "recovery",
            title: "Mobility & rest",
            hours: 0.5,
            intensity: "low",
            detail: "Light stretching, foam rolling, full mental break from competition.",
            focusAreas: ["fitness"],
          },
        ],
      },
    ],
  },
  {
    utrLevel: 8,
    label: "Competitive — UTR 7-8",
    summary:
      "Sharpening weapons and match craft. Mix of high-intensity court time and structured strength.",
    weeklyHours: 18,
    days: [
      {
        day: "Mon",
        activities: [
          {
            id: "u8-mon-1",
            type: "court",
            title: "Pattern play",
            hours: 1.5,
            intensity: "high",
            detail: "Serve +1 patterns, forehand-to-open-court, controlled aggression drills.",
            focusAreas: ["forehand", "serve"],
          },
          {
            id: "u8-mon-2",
            type: "gym",
            title: "Lower-body strength",
            hours: 1,
            intensity: "moderate",
            detail: "Goblet squats, split squats, hip hinge, calf and ankle stability.",
            focusAreas: ["fitness"],
          },
        ],
      },
      {
        day: "Tue",
        activities: [
          {
            id: "u8-tue-1",
            type: "court",
            title: "Backhand development",
            hours: 1.5,
            intensity: "moderate",
            detail: "Down-the-line backhand, slice variation, high-ball handling.",
            focusAreas: ["backhand"],
          },
        ],
      },
      {
        day: "Wed",
        activities: [
          {
            id: "u8-wed-1",
            type: "court",
            title: "Serve & return blocks",
            hours: 1.5,
            intensity: "high",
            detail: "Spot serving under fatigue, return depth targets, second-serve attack.",
            focusAreas: ["serve"],
          },
          {
            id: "u8-wed-2",
            type: "mental",
            title: "Pressure simulation",
            hours: 0.5,
            intensity: "moderate",
            detail: "Play tiebreaks from 4-5 down, controlled breathing under scoreboard pressure.",
            focusAreas: ["mental"],
          },
        ],
      },
      {
        day: "Thu",
        activities: [
          {
            id: "u8-thu-1",
            type: "gym",
            title: "Power & core",
            hours: 1,
            intensity: "high",
            detail: "Med-ball rotational throws, plyometrics, anti-rotation core.",
            focusAreas: ["fitness"],
          },
          {
            id: "u8-thu-2",
            type: "court",
            title: "Live points",
            hours: 1,
            intensity: "high",
            detail: "Open-pattern points, defending and counterpunching.",
            focusAreas: ["forehand", "backhand"],
          },
        ],
      },
      {
        day: "Fri",
        activities: [
          {
            id: "u8-fri-1",
            type: "court",
            title: "Net game & doubles",
            hours: 1.5,
            intensity: "moderate",
            detail: "Poaching, first-volley depth, doubles positioning.",
            focusAreas: ["forehand"],
          },
        ],
      },
      {
        day: "Sat",
        activities: [
          {
            id: "u8-sat-1",
            type: "match",
            title: "Set play vs. higher level",
            hours: 2,
            intensity: "high",
            detail: "Two competitive sets against a UTR 9+ hitting partner.",
            focusAreas: ["mental", "fitness"],
          },
        ],
      },
      {
        day: "Sun",
        activities: [
          {
            id: "u8-sun-1",
            type: "recovery",
            title: "Active recovery",
            hours: 1,
            intensity: "low",
            detail: "Swim or easy bike, mobility flow, video review of week's points.",
            focusAreas: ["fitness", "mental"],
          },
        ],
      },
    ],
  },
  {
    utrLevel: 10,
    label: "High performance — UTR 9-10",
    summary:
      "Tour-style loading. Periodized strength, tactical depth, and frequent match reps.",
    weeklyHours: 22,
    days: [
      {
        day: "Mon",
        activities: [
          {
            id: "u10-mon-1",
            type: "court",
            title: "Tactical block",
            hours: 2,
            intensity: "high",
            detail: "Game-style point construction, weapon setup, opponent-specific patterns.",
            focusAreas: ["forehand", "backhand"],
          },
          {
            id: "u10-mon-2",
            type: "gym",
            title: "Strength — max effort",
            hours: 1,
            intensity: "high",
            detail: "Trap-bar deadlift, single-leg work, scapular stability.",
            focusAreas: ["fitness"],
          },
        ],
      },
      {
        day: "Tue",
        activities: [
          {
            id: "u10-tue-1",
            type: "court",
            title: "Serve mastery",
            hours: 1.5,
            intensity: "high",
            detail: "Placement under fatigue, kick depth, disguise and variation.",
            focusAreas: ["serve"],
          },
          {
            id: "u10-tue-2",
            type: "mental",
            title: "Performance psychology",
            hours: 0.5,
            intensity: "moderate",
            detail: "Visualization, momentum management, reset protocols with a coach.",
            focusAreas: ["mental"],
          },
        ],
      },
      {
        day: "Wed",
        activities: [
          {
            id: "u10-wed-1",
            type: "match",
            title: "Match simulation",
            hours: 2,
            intensity: "high",
            detail: "Full match with stat tracking, in-match tactical adjustments.",
            focusAreas: ["mental", "fitness"],
          },
        ],
      },
      {
        day: "Thu",
        activities: [
          {
            id: "u10-thu-1",
            type: "gym",
            title: "Power & speed",
            hours: 1,
            intensity: "high",
            detail: "Depth jumps, sprint mechanics, reactive change-of-direction.",
            focusAreas: ["fitness"],
          },
          {
            id: "u10-thu-2",
            type: "court",
            title: "Defense to offense",
            hours: 1.5,
            intensity: "high",
            detail: "Counterpunch reps, rolling from defense, redirecting pace.",
            focusAreas: ["backhand", "forehand"],
          },
        ],
      },
      {
        day: "Fri",
        activities: [
          {
            id: "u10-fri-1",
            type: "court",
            title: "Precision & targets",
            hours: 2,
            intensity: "moderate",
            detail: "Inside-out forehand targets, line-painting, short-ball finishing.",
            focusAreas: ["forehand"],
          },
        ],
      },
      {
        day: "Sat",
        activities: [
          {
            id: "u10-sat-1",
            type: "match",
            title: "Tournament-style match",
            hours: 2.5,
            intensity: "high",
            detail: "Best-of-three with warm-up routine and match-day nutrition plan.",
            focusAreas: ["mental", "fitness"],
          },
        ],
      },
      {
        day: "Sun",
        activities: [
          {
            id: "u10-sun-1",
            type: "recovery",
            title: "Regeneration",
            hours: 1.5,
            intensity: "low",
            detail: "Contrast therapy, soft-tissue work, full video debrief of the week.",
            focusAreas: ["fitness", "mental"],
          },
        ],
      },
    ],
  },
  {
    utrLevel: 12,
    label: "College-ready — UTR 11-12",
    summary:
      "Pro-development volume. Two-a-days, fine-tuned periodization, and elite recovery.",
    weeklyHours: 26,
    days: [
      {
        day: "Mon",
        activities: [
          {
            id: "u12-mon-1",
            type: "court",
            title: "AM: Weapon refinement",
            hours: 2,
            intensity: "high",
            detail: "First-strike tennis, forehand acceleration, controlled error rate under pace.",
            focusAreas: ["forehand", "serve"],
          },
          {
            id: "u12-mon-2",
            type: "gym",
            title: "PM: Max strength",
            hours: 1.5,
            intensity: "high",
            detail: "Periodized lifting block, posterior chain, rotational power.",
            focusAreas: ["fitness"],
          },
        ],
      },
      {
        day: "Tue",
        activities: [
          {
            id: "u12-tue-1",
            type: "court",
            title: "Tactical sparring",
            hours: 2.5,
            intensity: "high",
            detail: "Sparring vs. multiple styles, real-time tactical problem solving.",
            focusAreas: ["backhand", "forehand"],
          },
        ],
      },
      {
        day: "Wed",
        activities: [
          {
            id: "u12-wed-1",
            type: "match",
            title: "Competitive match",
            hours: 2.5,
            intensity: "high",
            detail: "Full match vs. college-level opponent, charted by coach.",
            focusAreas: ["mental", "fitness"],
          },
          {
            id: "u12-wed-2",
            type: "mental",
            title: "Mindset session",
            hours: 0.5,
            intensity: "moderate",
            detail: "Pre-match routine lock-in, adversity scripting, focus cues.",
            focusAreas: ["mental"],
          },
        ],
      },
      {
        day: "Thu",
        activities: [
          {
            id: "u12-thu-1",
            type: "court",
            title: "Serve + return mastery",
            hours: 2,
            intensity: "high",
            detail: "Hold/break simulation, return-position chess, second-serve aggression.",
            focusAreas: ["serve", "backhand"],
          },
          {
            id: "u12-thu-2",
            type: "gym",
            title: "Speed & plyometrics",
            hours: 1,
            intensity: "high",
            detail: "Explosive first-step, deceleration control, reactive agility.",
            focusAreas: ["fitness"],
          },
        ],
      },
      {
        day: "Fri",
        activities: [
          {
            id: "u12-fri-1",
            type: "court",
            title: "Precision under fatigue",
            hours: 2.5,
            intensity: "high",
            detail: "Target tennis at the end of long sessions, decision-making when tired.",
            focusAreas: ["forehand", "backhand"],
          },
        ],
      },
      {
        day: "Sat",
        activities: [
          {
            id: "u12-sat-1",
            type: "match",
            title: "Tournament play",
            hours: 3,
            intensity: "high",
            detail: "Live tournament or sanctioned match with full routine and recovery.",
            focusAreas: ["mental", "fitness"],
          },
        ],
      },
      {
        day: "Sun",
        activities: [
          {
            id: "u12-sun-1",
            type: "recovery",
            title: "Elite regeneration",
            hours: 2,
            intensity: "low",
            detail: "Mobility, massage, contrast therapy, performance-data review with team.",
            focusAreas: ["fitness", "mental"],
          },
        ],
      },
    ],
  },
];
