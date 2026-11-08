/**
 * researcher_profile MCP tool — one-call researcher overview built from DSL queries only.
 * Aggregates publications, grants, clinical trials, patents, Fields of Research divisions,
 * funders, collaborating organizations, and co-authors, all scoped by `researchers.id`.
 * @module mcp/tools/researcher-profile
 */

import type { McpServer } from "@modelcontextprotocol/server";
import { ProtocolError, ProtocolErrorCode } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { DimensionsClient, StructuredEntityType } from "../../dsl/index.js";
import { parseEntityResponse, parseFacetResponse } from "../../dsl/index.js";
import { mergeIdentityFields } from "../identity-fields.js";
import { attachFacetProfileUrls, attachProfileUrls } from "../profile-urls.js";
import type { SchemaStore } from "../schema/index.js";
import { registerTrackedTool } from "../usage-tracking.js";
import { formatErrorResult, formatToolResult, READ_ONLY_API_ANNOTATIONS } from "../utils.js";

/** Fields of Research facet (ANZSRC 2020, the current classification). */
export const FIELDS_OF_RESEARCH_FACET = "category_for_2020";

/**
 * Bucket limit for the FoR facet. The API returns 2-digit divisions and 4-digit groups
 * in one flat list, so ask for enough buckets to keep every division after filtering.
 */
const FIELDS_OF_RESEARCH_LIMIT = 200;

/** Name prefix of a 2-digit FoR division, e.g. "31 Biological Sciences" (not "3101 ..."). */
const FOR_DIVISION_NAME = /^\d{2}(?!\d)/;

/** Researchers returned by a name search; the first is profiled, the rest are reported. */
const NAME_MATCH_LIMIT = 5;

/** A list section: entity, returned fields, and the sort field. */
interface ListSection {
  readonly key: "publications" | "grants" | "clinicalTrials" | "patents";
  readonly entity: StructuredEntityType;
  readonly fields: readonly string[];
  readonly sortBy: string;
  readonly limitArg: "publicationLimit" | "grantLimit" | "clinicalTrialLimit" | "patentLimit";
}

/** A facet section over the researcher's publications. */
interface FacetSection {
  readonly key: "fieldsOfResearch" | "funders" | "collaboratingOrgs";
  readonly facetField: string;
}

const FACET_SECTIONS: readonly FacetSection[] = [
  { key: "fieldsOfResearch", facetField: FIELDS_OF_RESEARCH_FACET },
  { key: "funders", facetField: "funders" },
  { key: "collaboratingOrgs", facetField: "research_orgs" },
];

/** Order of the sections in the returned profile. */
const PROFILE_KEY_ORDER = [
  "researcher",
  "otherMatches",
  "publications",
  "grants",
  "clinicalTrials",
  "patents",
  "fieldsOfResearch",
  "funders",
  "collaboratingOrgs",
  "coauthors",
] as const;

/**
 * Keeps only 2-digit FoR divisions. The API flattens divisions and 4-digit groups into one
 * bucket list; each division keeps its own reported count (groups are never summed into it).
 * @param buckets - category_for_2020 facet buckets
 * @returns Division buckets in their original order
 */
export function filterForDivisions<T extends Record<string, unknown>>(buckets: readonly T[]): T[] {
  return buckets.filter(
    (bucket) => typeof bucket.name === "string" && FOR_DIVISION_NAME.test(bucket.name),
  );
}

/**
 * Removes the profiled researcher from a co-author facet and trims it to `limit`.
 * @param buckets - researchers facet buckets
 * @param researcherId - Profiled researcher id
 * @param limit - Maximum co-authors to keep
 * @returns Co-author buckets
 */
export function excludeSelf<T extends Record<string, unknown>>(
  buckets: readonly T[],
  researcherId: string,
  limit: number,
): T[] {
  return buckets.filter((bucket) => bucket.id !== researcherId).slice(0, limit);
}

/**
 * Clinical trial sort field: DSL 2.16 deprecates `date` in favour of `start_date`.
 * Older instances only have `date`, so pick whichever the loaded schema has.
 * @param schemaStore - Loaded describe schema
 */
function clinicalTrialDateField(schemaStore: SchemaStore): string {
  const fields = schemaStore.getSource("clinical_trials")?.fields ?? {};
  return Object.hasOwn(fields, "start_date") ? "start_date" : "date";
}

/**
 * Registers the researcher_profile tool with the MCP server.
 * @param server - MCP server instance
 * @param client - Dimensions client instance
 * @param schemaStore - Loaded describe schema
 */
export function registerResearcherProfileTool(
  server: McpServer,
  client: DimensionsClient,
  schemaStore: SchemaStore,
): void {
  const trialDate = clinicalTrialDateField(schemaStore);
  const listSections: readonly ListSection[] = [
    {
      key: "publications",
      entity: "publications",
      fields: ["id", "title", "doi", "year", "times_cited", "journal", "type"],
      sortBy: "year",
      limitArg: "publicationLimit",
    },
    {
      key: "grants",
      entity: "grants",
      fields: ["id", "title", "funding_usd", "funder_org_name", "start_year"],
      sortBy: "start_year",
      limitArg: "grantLimit",
    },
    {
      key: "clinicalTrials",
      entity: "clinical_trials",
      fields: ["id", "title", "phase", trialDate],
      sortBy: trialDate,
      limitArg: "clinicalTrialLimit",
    },
    {
      key: "patents",
      entity: "patents",
      fields: ["id", "title", "year", "assignee_names"],
      sortBy: "year",
      limitArg: "patentLimit",
    },
  ];

  const listLimit = (label: string, fallback: number) =>
    z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(fallback)
      .describe(`Max ${label} to return (default ${fallback}, max 100)`);

  const sectionSchema = z
    .object({
      totalCount: z.number(),
      returnedCount: z.number(),
      items: z.array(z.record(z.string(), z.unknown())),
    })
    .optional();
  const bucketsSchema = z.array(z.record(z.string(), z.unknown())).optional();

  registerTrackedTool(
    server,
    "researcher_profile",
    {
      title: "Researcher profile",
      description:
        "One-call overview of a researcher: recent publications, grants, clinical trials, and " +
        "patents (with total counts), Fields of Research divisions (ANZSRC 2020), top funders, " +
        "top collaborating organizations, and top co-authors. Identify the researcher by " +
        "researcherId, orcid, or name (name picks the best match and lists the others in " +
        "otherMatches — pass researcherId to choose one).",
      inputSchema: z.object({
        researcherId: z
          .string()
          .min(1)
          .optional()
          .describe("Dimensions researcher ID (e.g. 'ur.01147702313.96')"),
        orcid: z
          .string()
          .min(1)
          .optional()
          .describe("ORCID identifier (e.g. '0000-0001-9161-999X')"),
        name: z.string().min(1).optional().describe("Researcher name (e.g. 'Jennifer Doudna')"),
        publicationLimit: listLimit("publications", 20),
        grantLimit: listLimit("grants", 10),
        clinicalTrialLimit: listLimit("clinical trials", 10),
        patentLimit: listLimit("patents", 10),
        facetLimit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(10)
          .describe("Max funders, collaborating organizations, and co-authors (default 10)"),
      }),
      outputSchema: z.object({
        found: z.boolean().describe("Whether a researcher was found"),
        message: z.string().optional().describe("Message when not found"),
        profile: z
          .object({
            researcher: z.record(z.string(), z.unknown()),
            otherMatches: bucketsSchema.describe("Other researchers matching the name"),
            publications: sectionSchema,
            grants: sectionSchema,
            clinicalTrials: sectionSchema,
            patents: sectionSchema,
            fieldsOfResearch: bucketsSchema.describe("2-digit FoR divisions with counts"),
            funders: bucketsSchema.describe("Top funders of the researcher's publications"),
            collaboratingOrgs: bucketsSchema.describe("Top organizations on their publications"),
            coauthors: bucketsSchema.describe(
              "Top co-authors by shared publications (absent if the facet failed)",
            ),
          })
          .optional()
          .describe("Aggregated researcher profile"),
      }),
      annotations: READ_ONLY_API_ANNOTATIONS,
    },
    async (args) => {
      if (!args.researcherId && !args.orcid && !args.name) {
        throw new ProtocolError(
          ProtocolErrorCode.InvalidParams,
          "Must provide at least one of: researcherId, orcid, or name",
        );
      }
      try {
        // Step 1: resolve the researcher
        const lookup = client.createQueryBuilder().search("researchers");
        if (args.researcherId) {
          lookup.where("id", "=", args.researcherId).limit(1);
        } else if (args.orcid) {
          lookup.where("orcid_id", "=", args.orcid).limit(1);
        } else {
          lookup.for(args.name as string).limit(NAME_MATCH_LIMIT);
        }
        lookup.fields(mergeIdentityFields("researchers"));
        const lookupResponse = (await client.rawQuery(lookup.build())) as Record<string, unknown>;
        const matches = attachProfileUrls(
          "researchers",
          parseEntityResponse<Record<string, unknown>>(lookupResponse, "researchers").data,
        );

        const [researcher, ...others] = matches;
        if (!researcher) {
          return formatToolResult({
            found: false,
            message: args.name
              ? `No researcher found matching: ${args.name}`
              : "No researcher found with the provided identifier",
          });
        }
        if (typeof researcher.id !== "string") {
          throw new Error("API returned a researcher record without a valid id field");
        }
        const researcherId = researcher.id;

        const profile: Record<string, unknown> = { researcher };
        if (others.length > 0) {
          profile.otherMatches = others.map(({ id, first_name, last_name, profile_url }) => ({
            id,
            first_name,
            last_name,
            profile_url,
          }));
        }

        const scoped = (entity: StructuredEntityType) =>
          client.createQueryBuilder().search(entity).where("researchers.id", "=", researcherId);

        const facet = async (facetField: string, limit: number) => {
          const dsl = scoped("publications").returnFacet(facetField, { limit }).build();
          const response = (await client.rawQuery(dsl)) as Record<string, unknown>;
          const parsed = parseFacetResponse(
            response,
            "publications",
            { [facetField]: {} },
            { includeRaw: false },
          );
          return attachFacetProfileUrls(facetField, parsed.facets[facetField]?.buckets ?? []);
        };

        // Step 2: fan out — lists and facets run concurrently
        await Promise.all([
          ...listSections.map(async (section) => {
            const dsl = scoped(section.entity)
              .fields([...section.fields])
              .sort(section.sortBy, "desc")
              .limit(args[section.limitArg])
              .build();
            const response = (await client.rawQuery(dsl)) as Record<string, unknown>;
            const parsed = parseEntityResponse<Record<string, unknown>>(response, section.entity);
            const items = attachProfileUrls(section.entity, parsed.data);
            profile[section.key] = {
              totalCount: parsed.totalCount,
              returnedCount: items.length,
              items,
            };
          }),
          ...FACET_SECTIONS.map(async (section) => {
            const limit =
              section.key === "fieldsOfResearch" ? FIELDS_OF_RESEARCH_LIMIT : args.facetLimit;
            const buckets = await facet(section.facetField, limit);
            profile[section.key] =
              section.key === "fieldsOfResearch" ? filterForDivisions(buckets) : buckets;
          }),
          (async () => {
            // Co-authors are optional: a failure leaves the rest of the profile intact.
            try {
              // +1 because the researcher is always their own top co-author bucket.
              const buckets = await facet("researchers", args.facetLimit + 1);
              profile.coauthors = excludeSelf(buckets, researcherId, args.facetLimit);
            } catch {
              // coauthors stays absent
            }
          })(),
        ]);

        // Sections finish in any order; emit them in a stable order.
        const ordered = Object.fromEntries(
          PROFILE_KEY_ORDER.filter((key) => profile[key] !== undefined).map((key) => [
            key,
            profile[key],
          ]),
        );
        return formatToolResult({ found: true, profile: ordered });
      } catch (error) {
        return formatErrorResult(error);
      }
    },
  );
}
