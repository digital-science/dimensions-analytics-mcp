/**
 * Main DimensionsClient class for interacting with the Dimensions API.
 * Orchestrates authentication, rate limiting, and HTTP communication.
 * @module client
 */

import type {
  AuthProvider,
  Command,
  DimensionsClientConfig,
  DslResponse,
  QueryExecutorOptions,
  ResolvedDimensionsClientConfig,
} from "../client/index.js";
import {
  createAuthProvider,
  DimensionsClientConfigSchema,
  HttpClient,
  InternalDslClient,
  RateLimiter,
  ValidationError,
} from "../client/index.js";
import {
  ClassifyCommand,
  ExtractAffiliationsCommand,
  ExtractConceptsCommand,
  ExtractGrantsCommand,
} from "./commands/functions/index.js";
import { type EntityTypeMap, FluentQueryBuilder } from "./fluent-query-builder.js";
import { QueryBuilder } from "./query-builder.js";
import type { SchemaStore } from "./schema/index.js";
import type {
  ClinicalTrial,
  Dataset,
  Grant,
  Organization,
  Patent,
  PolicyDocument,
  Publication,
  Researcher,
} from "./types/entities.js";
import type {
  AffiliationInput,
  ClassificationSystem,
  ClassifyInput,
  ClassifyResponse,
  ExtractAffiliationsResponse,
  ExtractConceptsResponse,
  ExtractGrantsInput,
  ExtractGrantsResponse,
} from "./types/special-functions.js";

/**
 * Rate limit status information.
 */
export interface RateLimitInfo {
  /** Number of requests remaining in the current window */
  remaining: number;
  /** Time in milliseconds until the rate limit window resets */
  resetInMs: number;
}

/**
 * Client for interacting with the Dimensions Analytics API.
 * Handles authentication, rate limiting, and command execution.
 *
 * @example
 * ```typescript
 * const client = new DimensionsClient({ apiKey: "your-api-key" });
 *
 * const result = await client.send(
 *   client.rawQuery('search publications for "machine learning" return publications limit 10')
 * );
 * ```
 */
export class DimensionsClient {
  private readonly config: ResolvedDimensionsClientConfig;
  private readonly authProvider?: AuthProvider;
  private readonly httpClient?: HttpClient;
  private readonly internalClient?: InternalDslClient;
  private readonly rateLimiter: RateLimiter;
  private schemaStore?: SchemaStore;

  /**
   * Creates a new DimensionsClient instance.
   * @param config - Client configuration
   * @throws {ValidationError} If configuration is invalid
   */
  constructor(config: DimensionsClientConfig) {
    // Validate and apply defaults
    const parseResult = DimensionsClientConfigSchema.safeParse(config);
    if (!parseResult.success) {
      throw new ValidationError(`Invalid configuration: ${parseResult.error.message}`, {
        issues: parseResult.error.issues,
      });
    }
    this.config = parseResult.data;

    if (this.config.backend === "internal") {
      const internal = this.config.internal!;
      this.internalClient = new InternalDslClient({
        config: internal.service,
        userEmail: internal.userEmail,
        clientIp: internal.clientIp,
        timeout: this.config.timeout,
      });
      this.rateLimiter = new RateLimiter({
        maxRequests: 1000,
        windowMs: 60_000,
      });
      return;
    }

    this.authProvider = createAuthProvider({
      type: "jwt",
      apiKey: this.config.apiKey!,
      authUrl: `${this.config.baseUrl}/api/auth.json`,
      timeout: this.config.timeout,
    });

    this.rateLimiter = new RateLimiter({
      maxRequests: this.config.rateLimitPerMinute,
      windowMs: 60_000,
    });

    this.httpClient = new HttpClient({
      baseUrl: this.config.baseUrl,
      authProvider: this.authProvider,
      timeout: this.config.timeout,
      maxRetries: this.config.maxRetries,
      retryDelay: this.config.retryDelay,
      rateLimiter: this.rateLimiter,
    });
  }

  private async executeDslQuery(
    dsl: string,
    endpoint: string,
    options?: QueryExecutorOptions,
  ): Promise<DslResponse> {
    if (this.internalClient) {
      return this.internalClient.query(dsl, options);
    }
    const response = await this.httpClient!.query(dsl, endpoint, options);
    return response as DslResponse;
  }

  /**
   * Sends a command to the Dimensions API.
   * @param command - The command to execute
   * @returns The transformed response
   * @throws {ValidationError} If command input is invalid
   * @throws {AuthenticationError} If authentication fails
   * @throws {RateLimitError} If rate limit is exceeded
   * @throws {QuerySyntaxError} If query syntax is invalid
   * @throws {ServerError} If server error occurs
   * @throws {NetworkError} If network error occurs
   * @throws {TimeoutError} If request times out
   */
  async send<TInput, TOutput>(command: Command<TInput, TOutput>): Promise<TOutput> {
    // Build DSL query
    const dsl = command.resolveQuery?.() ?? "";
    const endpoint = command.resolveEndpoint();

    // Validate DSL before sending if enabled
    if (dsl && this.config.validateQueries) {
      this.assertValidDsl(dsl);
    }

    // Execute HTTP query (auth and rate limiting are handled by HttpClient)
    const response = await this.executeDslQuery(dsl, endpoint, undefined);

    // Transform response if command has a transformer
    if (command.transformResponse) {
      return command.transformResponse(response);
    }

    // Return raw response if no transformer
    return response as TOutput;
  }

  /**
   * Gets current rate limit status.
   * @returns Rate limit information
   */
  getRateLimitInfo(): RateLimitInfo {
    return {
      remaining: this.rateLimiter.getRemainingRequests(),
      resetInMs: this.rateLimiter.getTimeUntilNextSlot(),
    };
  }

  /**
   * Invalidates the cached authentication token.
   * Forces a new token to be fetched on the next request.
   */
  invalidateToken(): void {
    this.authProvider?.invalidate();
  }

  /**
   * Resets the rate limiter, clearing all recorded request timestamps.
   * Useful for testing or when starting a fresh session.
   */
  resetRateLimiter(): void {
    this.rateLimiter.reset();
  }

  /**
   * Executes a raw DSL query against the Dimensions API.
   * Use this for generic/dynamic queries not covered by specific commands.
   *
   * @param dsl - The DSL query string to execute
   * @param options - Optional signal and timeout overrides
   * @returns The raw API response
   * @throws {AuthenticationError} If authentication fails
   * @throws {RateLimitError} If rate limit is exceeded
   * @throws {QuerySyntaxError} If query syntax is invalid
   * @throws {ServerError} If server error occurs
   * @throws {NetworkError} If network error occurs
   * @throws {TimeoutError} If request times out
   *
   * @example
   * ```typescript
   * const response = await client.rawQuery(
   *   'search publications for "CRISPR" return publications[id+title] limit 10'
   * );
   * console.log(response.publications);
   * ```
   */
  async rawQuery(dsl: string, options?: QueryExecutorOptions): Promise<DslResponse> {
    // Validate DSL before sending if enabled
    if (this.config.validateQueries) {
      this.assertValidDsl(dsl);
    }

    // Execute HTTP query (auth and rate limiting are handled by HttpClient)
    const response = await this.executeDslQuery(dsl, "/api/dsl/v2", options);

    return response;
  }

  /**
   * Validates a DSL string and throws {@link ValidationError} if it is invalid.
   * @param dsl - The DSL query string to validate
   * @throws {ValidationError} If the DSL fails parsing or semantic validation
   */
  private assertValidDsl(_dsl: string): void {
    // Local parser validation removed; Dimensions API validates on execute.
  }

  /**
   * Attaches a loaded describe schema for QueryBuilder entity/index validation.
   * @param store - Schema from {@link loadSchema} or {@link getOrLoadSchema}
   */
  attachSchemaStore(store: SchemaStore): void {
    this.schemaStore = store;
  }

  /**
   * Creates a {@link QueryBuilder} validated against the attached schema when present.
   * @returns New query builder instance
   */
  createQueryBuilder(): QueryBuilder {
    return new QueryBuilder(this.schemaStore);
  }

  // #region Fluent API Entity Entry Points

  /**
   * Creates a type-safe fluent query builder for the specified entity.
   * @param entity - The entity type key
   * @returns A FluentQueryBuilder typed to the entity
   */
  private createFluentBuilder<K extends keyof EntityTypeMap>(
    entity: K,
  ): FluentQueryBuilder<EntityTypeMap[K], K> {
    return new FluentQueryBuilder<EntityTypeMap[K], K>(this, entity, this.schemaStore);
  }

  /**
   * Creates a fluent query builder for publications.
   * @returns A FluentQueryBuilder configured for publications
   *
   * @example
   * ```typescript
   * const result = await client
   *   .publications()
   *   .for("machine learning")
   *   .where("year", ">=", 2020)
   *   .fields(["id", "title", "doi"])
   *   .execute();
   * ```
   */
  publications(): FluentQueryBuilder<Publication, "publications"> {
    return this.createFluentBuilder("publications");
  }

  /**
   * Creates a fluent query builder for grants.
   * @returns A FluentQueryBuilder configured for grants
   *
   * @example
   * ```typescript
   * const result = await client
   *   .grants()
   *   .for("cancer research")
   *   .where("funding_usd", ">", 1000000)
   *   .execute();
   * ```
   */
  grants(): FluentQueryBuilder<Grant, "grants"> {
    return this.createFluentBuilder("grants");
  }

  /**
   * Creates a fluent query builder for researchers.
   * @returns A FluentQueryBuilder configured for researchers
   *
   * @example
   * ```typescript
   * const result = await client
   *   .researchers()
   *   .for("smith")
   *   .whereNotEmpty("orcid_id")
   *   .execute();
   * ```
   */
  researchers(): FluentQueryBuilder<Researcher, "researchers"> {
    return this.createFluentBuilder("researchers");
  }

  /**
   * Creates a fluent query builder for patents.
   * @returns A FluentQueryBuilder configured for patents
   *
   * @example
   * ```typescript
   * const result = await client
   *   .patents()
   *   .for("battery technology")
   *   .where("year", ">=", 2020)
   *   .execute();
   * ```
   */
  patents(): FluentQueryBuilder<Patent, "patents"> {
    return this.createFluentBuilder("patents");
  }

  /**
   * Creates a fluent query builder for clinical trials.
   * @returns A FluentQueryBuilder configured for clinical_trials
   *
   * @example
   * ```typescript
   * const result = await client
   *   .clinicalTrials()
   *   .for("diabetes")
   *   .where("phase", "=", "Phase 3")
   *   .execute();
   * ```
   */
  clinicalTrials(): FluentQueryBuilder<ClinicalTrial, "clinical_trials"> {
    return this.createFluentBuilder("clinical_trials");
  }

  /**
   * Creates a fluent query builder for datasets.
   * @returns A FluentQueryBuilder configured for datasets
   *
   * @example
   * ```typescript
   * const result = await client
   *   .datasets()
   *   .for("genomics")
   *   .where("year", ">=", 2020)
   *   .execute();
   * ```
   */
  datasets(): FluentQueryBuilder<Dataset, "datasets"> {
    return this.createFluentBuilder("datasets");
  }

  /**
   * Creates a fluent query builder for policy documents.
   * @returns A FluentQueryBuilder configured for policy_documents
   *
   * @example
   * ```typescript
   * const result = await client
   *   .policyDocuments()
   *   .for("climate change")
   *   .execute();
   * ```
   */
  policyDocuments(): FluentQueryBuilder<PolicyDocument, "policy_documents"> {
    return this.createFluentBuilder("policy_documents");
  }

  /**
   * Creates a fluent query builder for organizations.
   * @returns A FluentQueryBuilder configured for organizations
   *
   * @example
   * ```typescript
   * const result = await client
   *   .organizations()
   *   .for("stanford")
   *   .execute();
   * ```
   */
  organizations(): FluentQueryBuilder<Organization, "organizations"> {
    return this.createFluentBuilder("organizations");
  }

  // #endregion

  // #region Special Function Methods

  /**
   * Classifies text using a specified Dimensions classification system.
   * Supports FOR, SDG, RCDC, and other research classification taxonomies.
   *
   * @template S - The classification system type
   * @param options - Classification options including title, abstract, and system
   * @returns Classification codes with their names
   * @throws {ValidationError} If input validation fails
   * @throws {AuthenticationError} If authentication fails
   * @throws {QuerySyntaxError} If query syntax is invalid
   *
   * @example
   * ```typescript
   * const result = await client.classify({
   *   title: "Burnout and intentions to quit the nursing profession",
   *   abstract: "BACKGROUND: Burnout is an occupational disease...",
   *   system: "FOR"
   * });
   * console.log(result.FOR); // [{ id: "1117", name: "Public Health..." }]
   * ```
   */
  async classify<S extends ClassificationSystem>(
    options: ClassifyInput & { system: S },
  ): Promise<ClassifyResponse<S>> {
    return this.send(new ClassifyCommand<S>(options));
  }

  /**
   * Extracts concepts from text using Dimensions natural language processing.
   *
   * @template WithScores - Whether to include relevance scores
   * @param text - Text to extract concepts from
   * @param options - Optional settings including returnScores
   * @returns Array of concepts, optionally with relevance scores
   * @throws {ValidationError} If input validation fails
   * @throws {AuthenticationError} If authentication fails
   * @throws {QuerySyntaxError} If query syntax is invalid
   *
   * @example
   * ```typescript
   * // Simple extraction
   * const concepts = await client.extractConcepts(
   *   "Machine learning algorithms for drug discovery"
   * );
   * console.log(concepts.extracted_concepts); // ["machine learning", "drug discovery", ...]
   *
   * // With relevance scores
   * const conceptsWithScores = await client.extractConcepts(
   *   "Machine learning algorithms for drug discovery",
   *   { returnScores: true }
   * );
   * console.log(conceptsWithScores.extracted_concepts);
   * // [{ concept: "machine learning", relevance: 0.95 }, ...]
   * ```
   */
  async extractConcepts<WithScores extends boolean = false>(
    text: string,
    options?: { returnScores?: WithScores },
  ): Promise<ExtractConceptsResponse<WithScores>> {
    return this.send(
      new ExtractConceptsCommand<WithScores>({
        text,
        returnScores: (options?.returnScores ?? false) as WithScores,
      }),
    );
  }

  /**
   * Extracts and resolves organization affiliations using Dimensions entity resolution.
   * Takes freetext or structured affiliation data and returns matched organizations.
   *
   * @param affiliations - Array of affiliation inputs to resolve
   * @returns Array of resolved organization matches with confidence scores
   * @throws {ValidationError} If input validation fails
   * @throws {AuthenticationError} If authentication fails
   * @throws {QuerySyntaxError} If query syntax is invalid
   *
   * @example
   * ```typescript
   * const result = await client.extractAffiliations([
   *   { affiliation: "University of Oxford, UK" },
   *   { name: "Stanford", city: "Stanford", country: "USA" }
   * ]);
   * console.log(result.extracted_affiliations);
   * // [{ id: "grid.4991.5", name: "University of Oxford", score: 0.95 }, ...]
   * ```
   */
  async extractAffiliations(
    affiliations: readonly AffiliationInput[],
  ): Promise<ExtractAffiliationsResponse> {
    return this.send(new ExtractAffiliationsCommand({ affiliations }));
  }

  /**
   * Resolves a grant number to a Dimensions grant ID.
   * Takes a grant number and optional funder information to find the matching grant.
   *
   * @param options - Grant lookup parameters
   * @returns Resolved grant ID, or null if no match found
   * @throws {ValidationError} If input validation fails
   * @throws {AuthenticationError} If authentication fails
   * @throws {QuerySyntaxError} If query syntax is invalid
   *
   * @example
   * ```typescript
   * const result = await client.extractGrants({
   *   grantNumber: "R01HL117329",
   *   fundref: "100000050"
   * });
   * console.log(result.grant_id);
   * // "grant.2544064"
   * ```
   */
  async extractGrants(options: ExtractGrantsInput): Promise<ExtractGrantsResponse> {
    return this.send(new ExtractGrantsCommand(options));
  }

  // #endregion
}
