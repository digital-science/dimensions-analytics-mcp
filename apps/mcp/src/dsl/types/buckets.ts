/**
 * Bucket types for Dimensions API facet results.
 * @module types/buckets
 */

/**
 * Base bucket with id and count (always present).
 */
export interface BaseBucket {
  readonly id: string | number;
  readonly count: number;
}

/**
 * Bucket with dynamic aggregation indicator properties from the API.
 */
export type BucketWithAggregations<
  TBucket extends BaseBucket = BaseBucket,
  TIndicators extends readonly string[] = readonly string[],
> = TBucket & {
  readonly [K in TIndicators[number]]?: number;
};
