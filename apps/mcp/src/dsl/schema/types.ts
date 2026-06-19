/**
 * Types for Dimensions `describe` API responses.
 * @module schema/types
 */

/** Field metadata from `describe schema` / `describe source`. */
export type DescribeField = {
  readonly type: string;
  readonly description?: string;
  readonly long_description?: string;
  readonly is_entity?: boolean;
  readonly is_filter?: boolean;
  readonly is_facet?: boolean;
  readonly is_multivalue?: boolean;
};

/** Per-source schema slice from `describe schema`. */
export type SourceDescribe = {
  readonly fields: Readonly<Record<string, DescribeField>>;
  readonly fieldsets?: Readonly<Record<string, readonly string[]>>;
  readonly metrics?: readonly string[];
  readonly search_fields?: readonly string[];
};

/** Auxiliary entity schema from `describe schema`. */
export type EntityDescribe = {
  readonly fields: Readonly<Record<string, DescribeField>>;
};

/** Full response from `describe schema`. */
export type DescribeSchemaResponse = {
  readonly sources: Readonly<Record<string, SourceDescribe>>;
  readonly entities: Readonly<Record<string, EntityDescribe>>;
};

/** Response from `describe version`. */
export type DescribeVersionResponse = {
  readonly version?: string;
  readonly release?: string;
};
