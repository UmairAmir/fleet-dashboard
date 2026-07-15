// The `address` field is free-text reverse-geocoded output, not a structured
// city field, and it's inconsistent: Karachi mostly appears as the literal
// word "Karachi", but some roads/motorways come back in Urdu script (e.g.
// "کراچی - حیدرآباد موٹروے" for the Karachi-Hyderabad Motorway). Lahore-area
// addresses use the "LHR" abbreviation rather than the word "Lahore" (never
// observed the literal word "Lahore" in real data). Each city therefore needs
// multiple match patterns; tune these if new address formats show up.
const CITY_PATTERNS: Record<"karachi" | "lahore", RegExp[]> = {
  karachi: [/karachi/i, /کراچی/],
  lahore: [/lahore/i, /\blhr\b/i],
};

export function matchesCity(address: string | null | undefined, city: "karachi" | "lahore"): boolean {
  if (!address) return false;
  return CITY_PATTERNS[city].some((pattern) => pattern.test(address));
}
