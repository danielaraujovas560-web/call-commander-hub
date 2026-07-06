// Helpers for the "space in UI, dash in DB" rule.
// - If the user typed a name with spaces, we replace them with "-" before saving.
// - When rendering, we convert "-" back to spaces so the user sees a clean label.
// - If the user typed "-" or "_" explicitly, the round-trip still looks clean
//   (dashes become spaces on display). This is a deliberate normalization.

export function slugForBackend(input: string): string {
  const s = (input ?? "").trim();
  if (!s) return "";
  // Only touch when we detect spaces — leaves existing "-"/"_" names as-is.
  if (/\s/.test(s)) return s.replace(/\s+/g, "-");
  return s;
}

export function displayFromBackend(input: string | null | undefined): string {
  if (!input) return "";
  return String(input).replace(/-/g, " ");
}
