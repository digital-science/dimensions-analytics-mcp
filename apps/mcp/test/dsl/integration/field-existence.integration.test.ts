/**
 * E2E integration tests that validate field existence against the live Dimensions API.
 * Uses rawQuery() to bypass typed command field enums — raw DSL is ground truth.
 *
 * @module test/integration/field-existence
 */

import { describe, expect, it } from "vitest";
import { DimensionsClient } from "../../../../src/dsl/client.js";
import { loadTestConfig, type TestConfig } from "./test-config.js";

const config = loadTestConfig();

function createClient(cfg: TestConfig): DimensionsClient {
  return new DimensionsClient({ apiKey: cfg.apiKey, baseUrl: cfg.baseUrl });
}

describe.skipIf(!config)("Publication field existence", () => {
  it("returns taxonomy categories", async () => {
    const client = createClient(config!);
    const result = await client.rawQuery(
      "search publications where times_cited > 50 return publications[category_rcdc+category_hra+category_bra+category_uoa+category_hrcs_rac+category_hrcs_hc+category_icrp_ct+category_icrp_cso+category_for_2020] limit 5",
    );
    expect(result).toBeDefined();
    expect(result.publications).toBeDefined();
  });

  it("returns journal_lists", async () => {
    const client = createClient(config!);
    const result = await client.rawQuery(
      "search publications where journal is not empty return publications[journal_lists] limit 5",
    );
    expect(result).toBeDefined();
    expect(result.publications).toBeDefined();
  });

  it("returns document_type and concepts_scores", async () => {
    const client = createClient(config!);
    const result = await client.rawQuery(
      "search publications where times_cited > 100 return publications[document_type+concepts_scores] limit 5",
    );
    expect(result).toBeDefined();
    const pubs = result.publications as Array<Record<string, unknown>>;
    expect(pubs.length).toBeGreaterThan(0);

    // Verify concepts_scores shape if present
    const withScores = pubs.find((p) => p.concepts_scores);
    if (withScores) {
      const scores = withScores.concepts_scores as Array<Record<string, unknown>>;
      expect(scores[0]).toHaveProperty("concept");
      expect(scores[0]).toHaveProperty("relevance");
    }
  });
});

describe.skipIf(!config)("Grant field existence", () => {
  it("returns taxonomy categories", async () => {
    const client = createClient(config!);
    const result = await client.rawQuery(
      "search grants where funding_usd > 0 return grants[category_sdg+category_rcdc+category_for_2020+category_hrcs_rac+category_hrcs_hc+category_hra+category_bra+category_uoa+category_icrp_ct+category_icrp_cso] limit 5",
    );
    expect(result).toBeDefined();
    expect(result.grants).toBeDefined();
  });

  it("returns currency fields", async () => {
    const client = createClient(config!);
    const result = await client.rawQuery(
      "search grants where funding_usd > 0 return grants[funding_aud+funding_cad+funding_chf+funding_gbp+funding_jpy+funding_nzd+funding_cny+funding_currency] limit 5",
    );
    expect(result).toBeDefined();
    expect(result.grants).toBeDefined();
  });

  it("returns Tier 1 fields", async () => {
    const client = createClient(config!);
    const result = await client.rawQuery(
      "search grants where funding_usd > 0 return grants[funding_schemes+active_status+keywords+concepts+concepts_scores] limit 5",
    );
    expect(result).toBeDefined();
    expect(result.grants).toBeDefined();
  });
});

describe.skipIf(!config)("ClinicalTrial field existence", () => {
  it("returns mesh_terms and study_type", async () => {
    const client = createClient(config!);
    const result = await client.rawQuery(
      "search clinical_trials return clinical_trials[mesh_terms+study_type] limit 5",
    );
    expect(result).toBeDefined();
    expect(result.clinical_trials).toBeDefined();
  });

  it("returns funders and interventions", async () => {
    const client = createClient(config!);
    const result = await client.rawQuery(
      "search clinical_trials return clinical_trials[funders+interventions] limit 5",
    );
    expect(result).toBeDefined();
    expect(result.clinical_trials).toBeDefined();
  });
});

describe.skipIf(!config)("Organization field existence", () => {
  it("returns hierarchy fields", async () => {
    const client = createClient(config!);
    const result = await client.rawQuery(
      'search organizations for "Massachusetts Institute of Technology" return organizations[ror_ids+ultimate_parent_id+external_ids_fundref+hierarchy_details] limit 5',
    );
    expect(result).toBeDefined();
    expect(result.organizations).toBeDefined();
  });

  it("returns city_name and country_name", async () => {
    const client = createClient(config!);
    const result = await client.rawQuery(
      'search organizations for "Massachusetts Institute of Technology" return organizations[city_name+country_name] limit 5',
    );
    expect(result).toBeDefined();
    const orgs = result.organizations as Array<Record<string, unknown>>;
    expect(orgs.length).toBeGreaterThan(0);
    // At least one should have city_name or country_name
    const withCity = orgs.find((o) => o.city_name);
    if (withCity) {
      expect(typeof withCity.city_name).toBe("string");
    }
  });
});

describe.skipIf(!config)("Researcher field existence", () => {
  it("returns current_research_org as structured object", async () => {
    const client = createClient(config!);
    const result = await client.rawQuery(
      "search researchers return researchers[current_research_org] limit 5",
    );
    expect(result).toBeDefined();
    const researchers = result.researchers as Array<Record<string, unknown>>;
    expect(researchers).toBeDefined();

    // Verify structured object shape if present
    const withOrg = researchers.find((r) => r.current_research_org);
    if (withOrg) {
      const org = withOrg.current_research_org as Record<string, unknown>;
      expect(org).toHaveProperty("name");
    }
  });
});
