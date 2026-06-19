/**
 * Resolves common funder acronyms and aliases to Dimensions funder_org_name values.
 * @module funder-org-names
 */

/** Case-insensitive acronym / alias → exact Dimensions funder_org_name */
const FUNDER_ORG_ALIASES: Readonly<Record<string, string>> = {
  nih: "National Institutes of Health",
  nci: "National Cancer Institute",
  nsf: "National Science Foundation",
  neh: "National Endowment for the Humanities",
  cdc: "Centers for Disease Control and Prevention",
  dod: "Department of Defense",
  usaid: "United States Agency for International Development",
  "national institutes of health": "National Institutes of Health",
  "national cancer institute": "National Cancer Institute",
  "national science foundation": "National Science Foundation",
};

/**
 * Resolves a funder organization name or acronym to the canonical Dimensions value.
 * Unknown names pass through unchanged.
 * @param input - Funder name or acronym from tool arguments
 * @returns Canonical Dimensions funder_org_name
 */
export function resolveFunderOrgName(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  return FUNDER_ORG_ALIASES[trimmed.toLowerCase()] ?? trimmed;
}
