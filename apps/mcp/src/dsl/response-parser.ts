/**
 * Response parser for Dimensions API facet results.
 * Transforms raw API responses into typed facet result structures.
 * @module response-parser
 */

import { z } from "zod";
import { ValidationError } from "../client/index.js";
import type { BaseBucket } from "./types/buckets.js";

/**
 * Schema for validating bucket objects in facet results.
 * Buckets must have an id (string or number) and a non-negative count.
 */
const BaseBucketSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    count: z.number().int().nonnegative(),
  })
  .passthrough();

/**
 * Schema for validating _stats object in API responses.
 */
const StatsSchema = z
  .object({
    total_count: z.number().int().nonnegative(),
  })
  .passthrough();

/**
 * Configuration for a facet field, including optional aggregation indicators.
 */
export interface FacetFieldConfig {
  /** Optional array of aggregation indicator names to validate */
  readonly indicators?: readonly string[];
}

/**
 * Parses entity data from a Dimensions API response.
 * Validates that the entity array is properly structured.
 * Falls back to data.length if _stats.total_count is not available.
 *
 * @template T - The entity type
 * @param response - Raw API response object
 * @param entityKey - The entity type key (e.g., "publications")
 * @returns Entity result with data array and totalCount
 * @throws {ValidationError} If entity data is not an array
 *
 * @example
 * ```typescript
 * const result = parseEntityResponse<Publication>(response, "publications");
 * console.log(result.data.length, result.totalCount);
 * ```
 */
export function parseEntityResponse<T>(
  response: Record<string, unknown>,
  entityKey: string,
): EntityResult<T> {
  const entityData = response[entityKey];

  // If entity key is missing, return empty result
  if (entityData === undefined) {
    return { data: [], totalCount: 0 };
  }

  // Validate entity data is an array
  if (!Array.isArray(entityData)) {
    throw new ValidationError(`Entity key "${entityKey}" must be an array`, {
      entityKey,
      actualType: typeof entityData,
    });
  }

  const entityArray = entityData as T[];

  // Try to get total_count from stats, fallback to data length
  const statsResult = StatsSchema.safeParse(response._stats);
  const totalCount = statsResult.success ? statsResult.data.total_count : entityArray.length;

  return {
    data: entityArray,
    totalCount,
  };
}

/**
 * Cache for bucket schemas keyed by sorted indicator combination.
 * Avoids rebuilding the same ZodObject on every transformResponse call.
 */
const bucketSchemaCache = new Map<string, z.ZodObject<z.ZodRawShape>>();

/**
 * Creates a bucket schema that validates both base fields and aggregation indicators.
 * Caches schemas by indicator combination to avoid repeated allocations.
 * @param indicators - Array of indicator names that must be present as numbers
 * @returns Zod schema for bucket validation
 */
function createBucketSchema(indicators?: readonly string[]) {
  if (!indicators || indicators.length === 0) {
    return BaseBucketSchema;
  }

  const cacheKey = [...indicators].sort().join(",");
  const cached = bucketSchemaCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Build a schema that requires each indicator to be a number
  const indicatorSchema: Record<string, z.ZodNumber> = {};
  for (const indicator of indicators) {
    indicatorSchema[indicator] = z.number();
  }

  const schema = BaseBucketSchema.extend(indicatorSchema);
  bucketSchemaCache.set(cacheKey, schema);
  return schema;
}

/**
 * Typed facet result with bucket array.
 * @template TBucket - The bucket type for this facet
 */
export interface TypedFacetResult<TBucket extends BaseBucket = BaseBucket> {
  readonly field: string;
  readonly buckets: readonly TBucket[];
}

/**
 * Entity data result with array and total count.
 * @template T - The entity type
 */
export interface EntityResult<T> {
  readonly data: readonly T[];
  readonly totalCount: number;
}

/**
 * Combined result for queries with facets and/or entities.
 * @template T - The entity type
 * @template TFacets - Record of facet field names to their typed results
 */
export interface FacetQueryResult<
  T,
  TFacets extends Record<string, TypedFacetResult> = Record<string, TypedFacetResult>,
> {
  readonly entities?: EntityResult<T>;
  readonly facets: TFacets;
  /** Raw API response. Optional to avoid doubling memory for large responses. */
  readonly _raw?: Record<string, unknown>;
}

/**
 * Options for parsing facet responses.
 */
export interface ParseFacetOptions {
  /**
   * Whether to include the raw API response in the result.
   * Set to false to avoid doubling memory usage for large responses.
   * @default true
   */
  readonly includeRaw?: boolean;
}

/**
 * Parses a Dimensions API response into typed facet results.
 * Extracts entity data and facet buckets from the response.
 *
 * @template T - The entity type
 * @template TFacets - Record of facet field names to their typed results
 * @param response - Raw API response object
 * @param entityKey - The entity type key (e.g., "publications")
 * @param facetFields - Array of facet field names or record of field configs
 * @param options - Optional parsing configuration
 * @returns Typed result with entities and facets
 *
 * @example
 * ```typescript
 * // Simple facets (field names only)
 * const result = parseFacetResponse<Publication>(
 *   response,
 *   "publications",
 *   ["year", "type"]
 * );
 *
 * // Aggregated facets (with indicator validation)
 * const result = parseFacetResponse<Publication>(
 *   response,
 *   "publications",
 *   {
 *     year: {},
 *     funders: { indicators: ["rcr_avg", "citations_avg"] }
 *   }
 * );
 *
 * // Exclude raw response to save memory
 * const result = parseFacetResponse<Publication>(
 *   response,
 *   "publications",
 *   ["year"],
 *   { includeRaw: false }
 * );
 * ```
 */
export function parseFacetResponse<
  T,
  TFacets extends Record<string, TypedFacetResult> = Record<string, TypedFacetResult>,
>(
  response: Record<string, unknown>,
  entityKey: string,
  facetFields: readonly string[] | Record<string, FacetFieldConfig>,
  options: ParseFacetOptions = {},
): FacetQueryResult<T, TFacets> {
  const { includeRaw = true } = options;
  const facets: Record<string, TypedFacetResult> = {};

  // Normalize facetFields to a record
  const facetConfigs: Record<string, FacetFieldConfig> = Array.isArray(facetFields)
    ? Object.fromEntries(facetFields.map((f) => [f, {}]))
    : facetFields;

  // Parse and validate entity data if present
  let entities: EntityResult<T> | undefined;
  if (response[entityKey] !== undefined) {
    if (!Array.isArray(response[entityKey])) {
      throw new ValidationError(`Entity key "${entityKey}" must be an array`, {
        entityKey,
        actualType: typeof response[entityKey],
      });
    }

    const entityArray = response[entityKey] as T[];
    if (entityArray.length > 0) {
      const statsResult = StatsSchema.safeParse(response._stats);
      if (!statsResult.success) {
        throw new ValidationError("API response missing _stats.total_count for entity results", {
          entityKey,
          statsErrors: statsResult.error.issues,
        });
      }
      entities = {
        data: entityArray,
        totalCount: statsResult.data.total_count,
      };
    } else {
      // Empty array - use 0 as totalCount
      entities = {
        data: entityArray,
        totalCount: 0,
      };
    }
  }

  // Parse and validate facet data
  for (const [field, config] of Object.entries(facetConfigs)) {
    const fieldData = response[field];

    if (fieldData === undefined) {
      throw new ValidationError(`Missing facet field "${field}" in API response`, {
        requestedFields: Object.keys(facetConfigs),
      });
    }

    if (!Array.isArray(fieldData)) {
      throw new ValidationError(`Facet field "${field}" must be an array`, {
        field,
        actualType: typeof fieldData,
      });
    }

    // Validate bucket structure (including indicators if specified)
    const bucketSchema = createBucketSchema(config.indicators);
    const parseResult = z.array(bucketSchema).safeParse(fieldData);
    if (!parseResult.success) {
      throw new ValidationError(`Invalid bucket data for facet "${field}"`, {
        field,
        indicators: config.indicators,
        errors: parseResult.error.issues,
      });
    }

    facets[field] = {
      field,
      buckets: parseResult.data as BaseBucket[],
    };
  }

  const result: FacetQueryResult<T, TFacets> = {
    entities,
    facets: facets as TFacets,
  };

  if (includeRaw) {
    return { ...result, _raw: response };
  }

  return result;
}
