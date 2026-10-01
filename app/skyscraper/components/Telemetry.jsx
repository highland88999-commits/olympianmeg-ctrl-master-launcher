'use client';
// TELEMETRY REMOVED (2026-10-01 /skyscraper port): the original component
// created a Supabase client for a FOREIGN project
// (amulgdbdvxpikpmldyoq.supabase.co) and upserted this visit into its
// `connected_repos` table on every mount -- phone-home. Per Merlin's standing
// rule (strip phone-home wherever it appears; same treatment as the Starblood
// port), this component is now inert: it renders null and makes zero network
// calls. The file is kept in place so the program's imports and structure
// stay exactly as Merlin built them. No foreign keys are wired anywhere.
export default function Telemetry() {
    return null;
}
