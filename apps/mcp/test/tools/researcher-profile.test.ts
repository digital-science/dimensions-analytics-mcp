/**
 * Tests for the researcher_profile MCP tool.
 * @module test/tools/researcher-profile
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  createSchemaStoreFromResponse,
  type DescribeSchemaResponse,
} from "../../src/mcp/schema/index.js";
import {
  excludeSelf,
  FIELDS_OF_RESEARCH_FACET,
  filterForDivisions,
  registerResearcherProfileTool,
} from "../../src/mcp/tools/researcher-profile.js";
import fixture from "../fixtures/describe-schema.json";
import { testSchemaStore } from "../helpers/schema-fixture.js";
import {
  callTool,
  createMockClient,
  createMockServer,
  parseToolResult,
} from "../helpers/tool-test-harness.js";

const RID = "ur.01147702313.96";

/** Schema defaults; the harness calls handlers directly, so zod defaults do not apply. */
const DEFAULTS = {
  publicationLimit: 20,
  grantLimit: 10,
  clinicalTrialLimit: 10,
  patentLimit: 10,
  facetLimit: 3,
};

const FOR_BUCKETS = [
  { id: "80002", name: "31 Biological Sciences", count: 495 },
  { id: "80034", name: "3101 Biochemistry and Cell Biology", count: 270 },
  { id: "80003", name: "32 Biomedical and Clinical Sciences", count: 109 },
  { id: "80050", name: "3207 Medical Microbiology", count: 31 },
];

const FACET_BUCKETS: Record<string, Array<Record<string, unknown>>> = {
  [FIELDS_OF_RESEARCH_FACET]: FOR_BUCKETS,
  funders: [{ id: "grid.413575.1", name: "Howard Hughes Medical Institute", count: 320 }],
  research_orgs: [{ id: "grid.47840.3f", name: "University of California, Berkeley", count: 486 }],
  researchers: [
    { id: RID, first_name: "Jennifer A", last_name: "Doudna", count: 604 },
    { id: "ur.a", first_name: "Marena I", last_name: "Trinidad", count: 41 },
    { id: "ur.b", first_name: "Samuel Henry", last_name: "Sternberg", count: 37 },
    { id: "ur.c", first_name: "Gavin J", last_name: "Knott", count: 37 },
  ],
};

const LIST_ENTITIES = ["publications", "grants", "clinical_trials", "patents"] as const;

type MockClient = ReturnType<typeof createMockClient>;

interface MockOptions {
  researchers?: Array<Record<string, unknown>>;
  failFacet?: string;
  failList?: (typeof LIST_ENTITIES)[number];
}

/** Answers rawQuery by DSL shape, so the concurrent call order does not matter. */
function mockApi(client: MockClient, opts: MockOptions = {}) {
  client.rawQuery.mockImplementation(async (dsl: string) => {
    if (dsl.startsWith("search researchers")) {
      return {
        researchers: opts.researchers ?? [
          { id: RID, first_name: "Jennifer A", last_name: "Doudna" },
        ],
        _stats: { total_count: (opts.researchers ?? [1]).length },
      };
    }
    const facet = /return (\w+) limit \d+$/.exec(dsl)?.[1];
    if (facet && facet in FACET_BUCKETS) {
      if (opts.failFacet === facet) throw new Error(`${facet} facet failed`);
      return { [facet]: FACET_BUCKETS[facet], _stats: { total_count: 604 } };
    }
    for (const entity of LIST_ENTITIES) {
      if (dsl.startsWith(`search ${entity}`)) {
        if (opts.failList === entity) throw new Error("API down");
        return { [entity]: [{ id: `${entity}.1`, title: "T" }], _stats: { total_count: 42 } };
      }
    }
    throw new Error(`Unexpected DSL: ${dsl}`);
  });
}

function dsls(client: MockClient): string[] {
  return client.rawQuery.mock.calls.map((call) => call[0] as string);
}

async function profileOf(
  handlers: ReturnType<typeof createMockServer>["handlers"],
  args: Record<string, unknown>,
) {
  const result = await callTool(handlers, "researcher_profile", { ...DEFAULTS, ...args });
  expect(result.isError).toBeFalsy();
  const data = parseToolResult(result);
  expect(data.found).toBe(true);
  return data.profile as Record<string, unknown>;
}

describe("researcher_profile", () => {
  let handlers: ReturnType<typeof createMockServer>["handlers"];
  let client: MockClient;

  beforeEach(() => {
    const mock = createMockServer();
    handlers = mock.handlers;
    client = createMockClient();
    registerResearcherProfileTool(mock.server as never, client as never, testSchemaStore());
  });

  describe("researcher lookup", () => {
    it("requires an identifier", async () => {
      await expect(callTool(handlers, "researcher_profile", DEFAULTS)).rejects.toThrow(
        "Must provide at least one of: researcherId, orcid, or name",
      );
      expect(client.rawQuery).not.toHaveBeenCalled();
    });

    it("looks up by researcherId", async () => {
      mockApi(client);
      await profileOf(handlers, { researcherId: RID });
      expect(dsls(client)[0]).toMatch(/^search researchers where id = "ur\.01147702313\.96"/);
      expect(dsls(client)[0]).toContain("limit 1");
    });

    it("looks up by orcid", async () => {
      mockApi(client);
      await profileOf(handlers, { orcid: "0000-0001-9161-999X" });
      expect(dsls(client)[0]).toContain('where orcid_id = "0000-0001-9161-999X"');
    });

    it("prefers researcherId over orcid and name", async () => {
      mockApi(client);
      await profileOf(handlers, { researcherId: RID, orcid: "0000-0001-9161-999X", name: "X" });
      expect(dsls(client)[0]).toContain(`where id = "${RID}"`);
    });

    it("looks up by name and reports the other matches", async () => {
      mockApi(client, {
        researchers: [
          { id: RID, first_name: "Jennifer A", last_name: "Doudna", research_orgs: [] },
          { id: "ur.other", first_name: "Jennifer", last_name: "Doudna", research_orgs: [] },
        ],
      });
      const profile = await profileOf(handlers, { name: "Jennifer Doudna" });
      expect(dsls(client)[0]).toContain('search researchers for "Jennifer Doudna"');
      expect(dsls(client)[0]).toContain("limit 5");
      expect((profile.researcher as Record<string, unknown>).id).toBe(RID);
      expect(profile.otherMatches).toEqual([
        {
          id: "ur.other",
          first_name: "Jennifer",
          last_name: "Doudna",
          profile_url: "https://app.dimensions.ai/details/entities/publication/author/ur.other",
        },
      ]);
      // Every scoped query uses the best match
      for (const dsl of dsls(client).slice(1)) {
        expect(dsl).toContain(`where researchers.id = "${RID}"`);
      }
    });

    it("escapes the name in DSL", async () => {
      mockApi(client, { researchers: [] });
      await callTool(handlers, "researcher_profile", { ...DEFAULTS, name: 'O"Malley' });
      expect(dsls(client)[0]).toContain('O\\"Malley');
    });

    it("returns found: false with a name message", async () => {
      mockApi(client, { researchers: [] });
      const data = parseToolResult(
        await callTool(handlers, "researcher_profile", { ...DEFAULTS, name: "Nobody" }),
      );
      expect(data).toEqual({ found: false, message: "No researcher found matching: Nobody" });
      expect(client.rawQuery).toHaveBeenCalledTimes(1);
    });

    it("returns found: false with an identifier message", async () => {
      mockApi(client, { researchers: [] });
      const data = parseToolResult(
        await callTool(handlers, "researcher_profile", {
          ...DEFAULTS,
          orcid: "0000-0000-0000-0000",
        }),
      );
      expect(data).toEqual({
        found: false,
        message: "No researcher found with the provided identifier",
      });
    });

    it("errors when the researcher record has no id", async () => {
      mockApi(client, { researchers: [{ first_name: "No", last_name: "Id" }] });
      const result = await callTool(handlers, "researcher_profile", { ...DEFAULTS, name: "No Id" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("without a valid id");
    });
  });

  describe("aggregation", () => {
    it("returns every section", async () => {
      mockApi(client);
      const profile = await profileOf(handlers, { researcherId: RID });

      expect(Object.keys(profile).sort()).toEqual([
        "clinicalTrials",
        "coauthors",
        "collaboratingOrgs",
        "fieldsOfResearch",
        "funders",
        "grants",
        "patents",
        "publications",
        "researcher",
      ]);
      expect(profile.researcher).toMatchObject({
        id: RID,
        profile_url: `https://app.dimensions.ai/details/entities/publication/author/${RID}`,
      });
      expect(profile.patents).toEqual({
        totalCount: 42,
        returnedCount: 1,
        items: [
          {
            id: "patents.1",
            title: "T",
            profile_url: "https://app.dimensions.ai/details/patent/patents.1",
          },
        ],
      });
      expect(profile.funders).toEqual(FACET_BUCKETS.funders);
      expect(profile.collaboratingOrgs).toEqual([
        {
          ...FACET_BUCKETS.research_orgs[0],
          profile_url: "https://app.dimensions.ai/details/organization/grid.47840.3f",
        },
      ]);
    });

    it("scopes every query to researchers.id with the requested limits", async () => {
      mockApi(client);
      await profileOf(handlers, {
        researcherId: RID,
        publicationLimit: 7,
        grantLimit: 6,
        clinicalTrialLimit: 5,
        patentLimit: 4,
      });
      const scoped = dsls(client).slice(1);
      expect(scoped).toHaveLength(8);
      for (const dsl of scoped) {
        expect(dsl).toContain(`where researchers.id = "${RID}"`);
      }
      const byEntity = (entity: string) =>
        scoped.find((d) => d.startsWith(`search ${entity} `) && d.includes(`return ${entity}[`));
      expect(byEntity("publications")).toMatch(/sort by year desc limit 7$/);
      expect(byEntity("grants")).toMatch(/sort by start_year desc limit 6$/);
      expect(byEntity("clinical_trials")).toMatch(/sort by date desc limit 5$/);
      expect(byEntity("patents")).toMatch(/sort by year desc limit 4$/);
      expect(scoped).toContainEqual(expect.stringMatching(/return funders limit 3$/));
      expect(scoped).toContainEqual(expect.stringMatching(/return research_orgs limit 3$/));
      expect(scoped).toContainEqual(
        expect.stringMatching(new RegExp(`return ${FIELDS_OF_RESEARCH_FACET} limit 200$`)),
      );
    });

    it("keeps only 2-digit FoR divisions with their own counts", async () => {
      mockApi(client);
      const profile = await profileOf(handlers, { researcherId: RID });
      expect(profile.fieldsOfResearch).toEqual([
        { id: "80002", name: "31 Biological Sciences", count: 495 },
        { id: "80003", name: "32 Biomedical and Clinical Sciences", count: 109 },
      ]);
    });

    it("excludes the researcher from co-authors and keeps facetLimit entries", async () => {
      mockApi(client);
      const profile = await profileOf(handlers, { researcherId: RID });
      const coauthors = profile.coauthors as Array<Record<string, unknown>>;
      expect(coauthors.map((c) => c.id)).toEqual(["ur.a", "ur.b", "ur.c"]);
      expect(coauthors[0].profile_url).toBe(
        "https://app.dimensions.ai/details/entities/publication/author/ur.a",
      );
      // One extra bucket covers the researcher's own entry
      expect(dsls(client)).toContainEqual(expect.stringMatching(/return researchers limit 4$/));
    });

    it("omits co-authors when that facet fails", async () => {
      mockApi(client, { failFacet: "researchers" });
      const profile = await profileOf(handlers, { researcherId: RID });
      expect(profile).not.toHaveProperty("coauthors");
      expect(profile.publications).toBeDefined();
      expect(profile.fieldsOfResearch).toBeDefined();
    });

    it("returns an error when another section fails", async () => {
      mockApi(client, { failList: "patents" });
      const result = await callTool(handlers, "researcher_profile", {
        ...DEFAULTS,
        researcherId: RID,
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("API down");
    });

    it("returns an error when a required facet fails", async () => {
      mockApi(client, { failFacet: "funders" });
      const result = await callTool(handlers, "researcher_profile", {
        ...DEFAULTS,
        researcherId: RID,
      });
      expect(result.isError).toBe(true);
    });

    it("sorts clinical trials by start_date when the schema has it", async () => {
      const schema = structuredClone(fixture) as unknown as DescribeSchemaResponse & {
        sources: Record<string, { fields: Record<string, unknown> }>;
      };
      schema.sources.clinical_trials.fields.start_date = {
        ...(schema.sources.clinical_trials.fields.date as object),
      };
      const mock = createMockServer();
      registerResearcherProfileTool(
        mock.server as never,
        client as never,
        createSchemaStoreFromResponse(schema, "2.16.0"),
      );
      mockApi(client);
      await profileOf(mock.handlers, { researcherId: RID });
      const trials = dsls(client).find((d) => d.startsWith("search clinical_trials"));
      expect(trials).toContain("return clinical_trials[id+title+phase+start_date]");
      expect(trials).toMatch(/sort by start_date desc/);
    });
  });
});

describe("filterForDivisions", () => {
  it("keeps names that start with exactly two digits", () => {
    expect(
      filterForDivisions([
        { name: "46 Information and Computing Sciences" },
        { name: "4602 Artificial Intelligence" },
        { name: "4 Single digit" },
        { name: "Unnumbered" },
        { id: "no-name" },
      ]),
    ).toEqual([{ name: "46 Information and Computing Sciences" }]);
  });
});

describe("excludeSelf", () => {
  it("drops the researcher and trims to the limit", () => {
    expect(excludeSelf([{ id: "a" }, { id: "self" }, { id: "b" }, { id: "c" }], "self", 2)).toEqual(
      [{ id: "a" }, { id: "b" }],
    );
  });
});
