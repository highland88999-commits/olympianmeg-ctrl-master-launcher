// components/RenewalPlanBadge.jsx — the small "Part of the Renewal Plan"
// affordance rendered on each built renewal-plan module, deep-linking to its
// node on /renewal-plan. Deliberately quiet: no glow, no pop-up, no tracking.
export default function RenewalPlanBadge({ nodeId }) {
  return (
    <a
      href={`/renewal-plan#${nodeId}`}
      className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 min-h-[32px] rounded-full border border-teal-300/20 bg-teal-950/20 text-teal-200/80 text-[10px] font-bold tracking-[0.2em] uppercase hover:border-teal-300/50 hover:text-teal-100 transition-colors"
      aria-label="View this build on the Renewal Plan timeline"
    >
      <span aria-hidden="true">◈</span> Part of the Renewal Plan
    </a>
  );
}
