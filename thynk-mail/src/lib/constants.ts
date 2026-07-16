// The original single-tenant setup used one hardcoded team. After the
// multi-project migration this id now belongs to the "Thynk Success"
// project (see migration-multi-project.sql) — kept here only for reference,
// no application code should import or use this anymore. Project scoping is
// now resolved per-request via src/lib/session.ts.
export const THYNK_SUCCESS_PROJECT_ID = '00000000-0000-0000-0000-000000000001';
