/**
 * Curated DSL examples for MCP resources (from public Dimensions DSL documentation patterns).
 * @module examples/dsl-examples
 */

/** URI template for per-source example resources. */
export const DSL_EXAMPLES_BY_SOURCE_URI = "dimensions://examples/{source}";

/** Example queries keyed by entity type. */
export const DSL_EXAMPLES_BY_ENTITY: Record<string, readonly string[]> = {
  publications: [
    'search publications for "machine learning" return publications[id+title+doi] limit 10',
    'search publications for "CRISPR" where year >= 2020 return publications[id+title+times_cited+year] sort by times_cited desc limit 25',
    'search publications in title_only for "gene therapy" return publications[basics] limit 10',
    "search publications return publications facet journal limit 20",
  ],
  grants: [
    'search grants for "cancer immunotherapy" return grants limit 10',
    'search grants where funder_org_name = "National Institutes of Health" return grants[basics] limit 10',
    "search grants return grants aggregate funding_usd",
  ],
  patents: [
    'search patents for "lithium battery" return patents limit 10',
    "search patents where year >= 2018 return patents[id+title] limit 20",
  ],
  clinical_trials: [
    'search clinical_trials for "diabetes" return clinical_trials limit 10',
    'search clinical_trials where phase = "Phase 3" return clinical_trials limit 10',
  ],
  datasets: ['search datasets for "climate model" return datasets limit 10'],
  policy_documents: [
    'search policy_documents for "renewable energy" return policy_documents limit 10',
  ],
  researchers: [
    'search researchers where last_name = "Smith" return researchers limit 10',
    "search researchers where total_publications > 100 return researchers limit 10",
  ],
  organizations: [
    'search organizations for "Stanford" return organizations limit 10',
    'search organizations where country = "United States" return organizations limit 10',
  ],
};

/** General DSL patterns (describe, functions, pagination). */
export const DSL_GENERAL_EXAMPLES = [
  "describe version",
  "describe schema",
  "describe source publications",
  'extract_concepts(text: "CRISPR gene editing enables precise DNA modification")',
  'classify(text: "Stem cell therapy for diabetes", system: "for")',
] as const;

/** Link to official DSL documentation. */
export const DSL_DOCUMENTATION_URL = "https://docs.dimensions.ai/dsl/";

/** Source names that have curated per-source example resources. */
export const DSL_EXAMPLE_SOURCE_NAMES = Object.keys(DSL_EXAMPLES_BY_ENTITY).sort();

/**
 * Returns curated DSL examples for a source, if defined.
 * @param source - Dimensions source name (e.g. `publications`)
 * @returns Example query strings or undefined
 */
export function getDslExamplesForSource(source: string): readonly string[] | undefined {
  return DSL_EXAMPLES_BY_ENTITY[source];
}
