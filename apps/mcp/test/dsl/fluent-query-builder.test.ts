import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QueryExecutor } from "../../src/client/index.js";
import { FluentQueryBuilder } from "../../src/dsl/fluent-query-builder.js";
import type { Grant, Patent, Publication, Researcher } from "../../src/dsl/types/entities.js";

describe("FluentQueryBuilder", () => {
  let mockExecutor: QueryExecutor;
  let mockRawQuery: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockRawQuery = vi.fn();
    mockExecutor = {
      rawQuery: mockRawQuery,
    };
  });

  describe("publications", () => {
    let builder: FluentQueryBuilder<Publication, "publications">;

    beforeEach(() => {
      builder = new FluentQueryBuilder<Publication, "publications">(mockExecutor, "publications");
    });

    it("builds and executes a simple search query", async () => {
      mockRawQuery.mockResolvedValue({
        publications: [{ id: "pub1", title: "Test Publication" }],
        _stats: { total_count: 1 },
      });

      const result = await builder.for("machine learning").execute();

      expect(mockRawQuery).toHaveBeenCalledWith('search publications for "machine learning"');
      expect(result.data).toEqual([{ id: "pub1", title: "Test Publication" }]);
      expect(result.totalCount).toBe(1);
    });

    it("builds query with where clause", async () => {
      mockRawQuery.mockResolvedValue({
        publications: [],
        _stats: { total_count: 0 },
      });

      await builder.for("AI").where("year", ">=", 2020).where("type", "=", "article").execute();

      expect(mockRawQuery).toHaveBeenCalledWith(
        'search publications for "AI" where year >= 2020 and type = "article"',
      );
    });

    it("builds query with fields", async () => {
      mockRawQuery.mockResolvedValue({
        publications: [],
        _stats: { total_count: 0 },
      });

      await builder.for("test").fields(["id", "title", "doi"]).execute();

      expect(mockRawQuery).toHaveBeenCalledWith(
        'search publications for "test" return publications[id+title+doi]',
      );
    });

    it("builds query with sort, limit, and skip", async () => {
      mockRawQuery.mockResolvedValue({
        publications: [],
        _stats: { total_count: 0 },
      });

      await builder.for("test").sort("times_cited", "desc").limit(50).skip(100).execute();

      expect(mockRawQuery).toHaveBeenCalledWith(
        'search publications for "test" return publications sort by times_cited desc limit 50 skip 100',
      );
    });

    it("builds query with search index", async () => {
      mockRawQuery.mockResolvedValue({
        publications: [],
        _stats: { total_count: 0 },
      });

      await builder.in("title_abstract_only").for("CRISPR").execute();

      expect(mockRawQuery).toHaveBeenCalledWith(
        'search publications in title_abstract_only for "CRISPR"',
      );
    });

    it("builds query with boolean logic", async () => {
      mockRawQuery.mockResolvedValue({
        publications: [],
        _stats: { total_count: 0 },
      });

      await builder
        .for("research")
        .where("type", "=", "article")
        .or()
        .where("type", "=", "review")
        .execute();

      expect(mockRawQuery).toHaveBeenCalledWith(
        'search publications for "research" where type = "article" or type = "review"',
      );
    });

    it("builds query with explicit and() connector", async () => {
      mockRawQuery.mockResolvedValue({
        publications: [],
        _stats: { total_count: 0 },
      });

      await builder
        .for("test")
        .where("year", "=", 2020)
        .and()
        .where("type", "=", "article")
        .execute();

      expect(mockRawQuery).toHaveBeenCalledWith(
        'search publications for "test" where year = 2020 and type = "article"',
      );
    });

    it("builds query with not() connector", async () => {
      mockRawQuery.mockResolvedValue({
        publications: [],
        _stats: { total_count: 0 },
      });

      await builder
        .for("test")
        .where("type", "=", "article")
        .not()
        .where("year", "<", 2000)
        .execute();

      expect(mockRawQuery).toHaveBeenCalledWith(
        'search publications for "test" where type = "article" not year < 2000',
      );
    });

    it("builds query with parenthesized expressions", async () => {
      mockRawQuery.mockResolvedValue({
        publications: [],
        _stats: { total_count: 0 },
      });

      await builder
        .for("AI")
        .openGroup()
        .where("type", "=", "article")
        .or()
        .where("type", "=", "review")
        .closeGroup()
        .where("year", ">=", 2020)
        .execute();

      expect(mockRawQuery).toHaveBeenCalledWith(
        'search publications for "AI" where (type = "article" or type = "review") and year >= 2020',
      );
    });

    it("builds query with whereIn", async () => {
      mockRawQuery.mockResolvedValue({
        publications: [],
        _stats: { total_count: 0 },
      });

      await builder.for("test").whereIn("type", ["article", "review"]).execute();

      expect(mockRawQuery).toHaveBeenCalledWith(
        'search publications for "test" where type in ["article", "review"]',
      );
    });

    it("builds query with whereRange", async () => {
      mockRawQuery.mockResolvedValue({
        publications: [],
        _stats: { total_count: 0 },
      });

      await builder.for("test").whereRange("year", 2018, 2023).execute();

      expect(mockRawQuery).toHaveBeenCalledWith(
        'search publications for "test" where year in [2018:2023]',
      );
    });

    it("builds query with whereEmpty and whereNotEmpty", async () => {
      mockRawQuery.mockResolvedValue({
        publications: [],
        _stats: { total_count: 0 },
      });

      await builder.for("test").whereNotEmpty("doi").whereEmpty("pmid").execute();

      expect(mockRawQuery).toHaveBeenCalledWith(
        'search publications for "test" where doi is not empty and pmid is empty',
      );
    });

    it("builds query with forSimilar for similar-document lookup", async () => {
      mockRawQuery.mockResolvedValue({
        publications: [{ id: "pub1", title: "Similar Publication" }],
        _stats: { total_count: 5 },
      });

      const result = await builder
        .forSimilar("Machine learning for drug discovery and precision medicine")
        .where("year", ">", 2015)
        .limit(10)
        .execute();

      expect(mockRawQuery).toHaveBeenCalledWith(
        'search publications for similar_documents("Machine learning for drug discovery and precision medicine") where year > 2015 return publications limit 10',
      );
      expect(result.data).toEqual([{ id: "pub1", title: "Similar Publication" }]);
      expect(result.totalCount).toBe(5);
    });

    it("builds query with forSimilar escaping quotes and newlines", async () => {
      mockRawQuery.mockResolvedValue({
        publications: [],
        _stats: { total_count: 0 },
      });

      await builder.forSimilar('Text with "quotes"\nand newlines').execute();

      expect(mockRawQuery).toHaveBeenCalledWith(
        'search publications for similar_documents("Text with \\"quotes\\"\\nand newlines")',
      );
    });

    it("builds query with whereCount", async () => {
      mockRawQuery.mockResolvedValue({
        publications: [],
        _stats: { total_count: 0 },
      });

      await builder.for("collaboration").whereCount("researchers", ">", 5).execute();

      expect(mockRawQuery).toHaveBeenCalledWith(
        'search publications for "collaboration" where count(researchers) > 5',
      );
    });

    it("returns stats from response", async () => {
      mockRawQuery.mockResolvedValue({
        publications: [{ id: "pub1" }],
        _stats: { total_count: 1000 },
      });

      const result = await builder.for("test").limit(10).execute();

      expect(result.totalCount).toBe(1000);
      expect(result.data.length).toBe(1);
    });

    it("handles missing stats gracefully", async () => {
      mockRawQuery.mockResolvedValue({
        publications: [{ id: "pub1" }],
      });

      const result = await builder.for("test").execute();

      expect(result.totalCount).toBe(1);
      expect(result.data.length).toBe(1);
    });

    it("executes successfully without for()", async () => {
      mockRawQuery.mockResolvedValue({
        publications: [{ id: "pub1" }],
        _stats: { total_count: 100 },
      });

      const result = await builder.execute();

      expect(mockRawQuery).toHaveBeenCalledWith("search publications");
      expect(result.totalCount).toBe(100);
      expect(result.data.length).toBe(1);
    });

    it("propagates errors from rawQuery", async () => {
      mockRawQuery.mockRejectedValue(new Error("Network error"));

      await expect(builder.for("test").execute()).rejects.toThrow("Network error");
    });

    it("throws on unbalanced parentheses", async () => {
      await expect(
        builder.for("test").openGroup().where("year", "=", 2020).execute(),
      ).rejects.toThrow("Unbalanced parentheses");
    });
  });

  describe("grants", () => {
    let builder: FluentQueryBuilder<Grant, "grants">;

    beforeEach(() => {
      builder = new FluentQueryBuilder<Grant, "grants">(mockExecutor, "grants");
    });

    it("builds and executes a grants query", async () => {
      mockRawQuery.mockResolvedValue({
        grants: [{ id: "grant1", title: "Test Grant" }],
        _stats: { total_count: 1 },
      });

      const result = await builder
        .for("cancer research")
        .where("funding_usd", ">", 1000000)
        .execute();

      expect(mockRawQuery).toHaveBeenCalledWith(
        'search grants for "cancer research" where funding_usd > 1000000',
      );
      expect(result.data).toEqual([{ id: "grant1", title: "Test Grant" }]);
    });
  });

  describe("researchers", () => {
    let builder: FluentQueryBuilder<Researcher, "researchers">;

    beforeEach(() => {
      builder = new FluentQueryBuilder<Researcher, "researchers">(mockExecutor, "researchers");
    });

    it("builds and executes a researchers query", async () => {
      mockRawQuery.mockResolvedValue({
        researchers: [{ id: "res1", first_name: "John", last_name: "Smith" }],
        _stats: { total_count: 1 },
      });

      const result = await builder.for("smith").execute();

      expect(mockRawQuery).toHaveBeenCalledWith('search researchers for "smith"');
      expect(result.data).toEqual([{ id: "res1", first_name: "John", last_name: "Smith" }]);
    });
  });

  describe("patents", () => {
    let builder: FluentQueryBuilder<Patent, "patents">;

    beforeEach(() => {
      builder = new FluentQueryBuilder<Patent, "patents">(mockExecutor, "patents");
    });

    it("builds and executes a patents query", async () => {
      mockRawQuery.mockResolvedValue({
        patents: [{ id: "pat1", title: "Test Patent" }],
        _stats: { total_count: 1 },
      });

      const result = await builder.for("battery technology").where("year", ">=", 2020).execute();

      expect(mockRawQuery).toHaveBeenCalledWith(
        'search patents for "battery technology" where year >= 2020',
      );
      expect(result.data).toEqual([{ id: "pat1", title: "Test Patent" }]);
    });
  });

  describe("getDsl", () => {
    it("returns the DSL query without executing", () => {
      const builder = new FluentQueryBuilder<Publication, "publications">(
        mockExecutor,
        "publications",
      );

      const dsl = builder.for("machine learning").where("year", ">=", 2020).getDsl();

      expect(dsl).toBe('search publications for "machine learning" where year >= 2020');
      expect(mockRawQuery).not.toHaveBeenCalled();
    });
  });

  describe("complex queries", () => {
    it("builds a fully-featured query", async () => {
      const builder = new FluentQueryBuilder<Publication, "publications">(
        mockExecutor,
        "publications",
      );
      mockRawQuery.mockResolvedValue({
        publications: [],
        _stats: { total_count: 0 },
      });

      await builder
        .in("title_abstract_only")
        .for("deep learning")
        .openGroup()
        .where("type", "=", "article")
        .or()
        .where("type", "=", "review")
        .closeGroup()
        .where("year", ">=", 2020)
        .whereNotEmpty("doi")
        .whereCount("researchers", "<=", 10)
        .fields(["id", "title", "doi", "year", "authors"])
        .sort("times_cited", "desc")
        .limit(100)
        .skip(0)
        .execute();

      expect(mockRawQuery).toHaveBeenCalledWith(
        'search publications in title_abstract_only for "deep learning" ' +
          'where (type = "article" or type = "review") and year >= 2020 and doi is not empty and count(researchers) <= 10 ' +
          "return publications[id+title+doi+year+authors] sort by times_cited desc limit 100 skip 0",
      );
    });
  });

  describe("facet methods", () => {
    let builder: FluentQueryBuilder<Publication, "publications">;

    beforeEach(() => {
      builder = new FluentQueryBuilder<Publication, "publications">(mockExecutor, "publications");
    });

    it("builds query with simple facet", async () => {
      mockRawQuery.mockResolvedValue({
        publications: [],
        year: [
          { id: 2023, count: 100 },
          { id: 2022, count: 80 },
        ],
        _stats: { total_count: 0 },
      });

      const result = await builder.for("CRISPR").withFacet("year").executeWithFacets();

      expect(mockRawQuery).toHaveBeenCalledWith('search publications for "CRISPR" return year');
      expect(result.facets.year).toBeDefined();
      expect(result.facets.year.buckets).toHaveLength(2);
      expect(result.facets.year.buckets[0].id).toBe(2023);
      expect(result.facets.year.buckets[0].count).toBe(100);
    });

    it("builds query with facet limit", async () => {
      mockRawQuery.mockResolvedValue({
        funders: [{ id: "f1", name: "NIH", count: 50 }],
        _stats: { total_count: 0 },
      });

      await builder.for("CRISPR").withFacet("funders", { limit: 10 }).executeWithFacets();

      expect(mockRawQuery).toHaveBeenCalledWith(
        'search publications for "CRISPR" return funders limit 10',
      );
    });

    it("builds query with aggregated facet", async () => {
      mockRawQuery.mockResolvedValue({
        funders: [{ id: "f1", name: "NIH", count: 50, rcr_avg: 2.5 }],
        _stats: { total_count: 0 },
      });

      const result = await builder
        .for("CRISPR")
        .withAggregate("funders", ["rcr_avg"])
        .executeWithFacets();

      expect(mockRawQuery).toHaveBeenCalledWith(
        'search publications for "CRISPR" return funders aggregate rcr_avg',
      );
      expect(result.facets.funders.buckets[0]).toHaveProperty("rcr_avg", 2.5);
    });

    it("builds query with aggregated facet sort and limit", async () => {
      mockRawQuery.mockResolvedValue({
        funders: [],
        _stats: { total_count: 0 },
      });

      await builder
        .for("CRISPR")
        .withAggregate("funders", ["rcr_avg", "altmetric_median"], {
          sortBy: "rcr_avg",
          sortOrder: "desc",
          limit: 10,
        })
        .executeWithFacets();

      expect(mockRawQuery).toHaveBeenCalledWith(
        'search publications for "CRISPR" return funders aggregate rcr_avg, altmetric_median sort by rcr_avg desc limit 10',
      );
    });

    it("builds query with multiple facets", async () => {
      mockRawQuery.mockResolvedValue({
        year: [{ id: 2023, count: 100 }],
        funders: [{ id: "f1", name: "NIH", count: 50 }],
        _stats: { total_count: 0 },
      });

      const result = await builder
        .for("CRISPR")
        .withFacet("year")
        .withFacet("funders", { limit: 10 })
        .executeWithFacets();

      expect(mockRawQuery).toHaveBeenCalledWith(
        'search publications for "CRISPR" return year return funders limit 10',
      );
      expect(result.facets.year).toBeDefined();
      expect(result.facets.funders).toBeDefined();
    });

    it("combines entity return with facets", async () => {
      mockRawQuery.mockResolvedValue({
        publications: [{ id: "pub1", title: "Test" }],
        year: [{ id: 2023, count: 100 }],
        _stats: { total_count: 500 },
      });

      const result = await builder
        .for("CRISPR")
        .fields(["id", "title"])
        .limit(100)
        .withFacet("year")
        .executeWithFacets();

      expect(mockRawQuery).toHaveBeenCalledWith(
        'search publications for "CRISPR" return publications[id+title] limit 100 return year',
      );
      expect(result.entities).toBeDefined();
      expect(result.entities?.data).toHaveLength(1);
      expect(result.entities?.totalCount).toBe(500);
      expect(result.facets.year).toBeDefined();
    });

    it("returns raw response in _raw field", async () => {
      const rawResponse = {
        publications: [{ id: "pub1" }],
        year: [{ id: 2023, count: 100 }],
        _stats: { total_count: 1 },
      };
      mockRawQuery.mockResolvedValue(rawResponse);

      const result = await builder.for("CRISPR").withFacet("year").executeWithFacets();

      expect(result._raw).toEqual(rawResponse);
    });

    it("handles missing entity data", async () => {
      mockRawQuery.mockResolvedValue({
        year: [{ id: 2023, count: 100 }],
        _stats: { total_count: 0 },
      });

      const result = await builder.for("CRISPR").withFacet("year").executeWithFacets();

      expect(result.entities).toBeUndefined();
      expect(result.facets.year).toBeDefined();
    });

    it("getDsl returns query with facets without executing", () => {
      const dsl = builder
        .for("CRISPR")
        .withFacet("year")
        .withAggregate("funders", ["rcr_avg"], { limit: 10 })
        .getDsl();

      expect(dsl).toBe(
        'search publications for "CRISPR" return year return funders aggregate rcr_avg limit 10',
      );
      expect(mockRawQuery).not.toHaveBeenCalled();
    });
  });

  describe("grant facets", () => {
    let builder: FluentQueryBuilder<Grant, "grants">;

    beforeEach(() => {
      builder = new FluentQueryBuilder<Grant, "grants">(mockExecutor, "grants");
    });

    it("builds query with funding aggregation", async () => {
      mockRawQuery.mockResolvedValue({
        funders: [{ id: "f1", name: "NIH", count: 50, funding: 1000000 }],
        _stats: { total_count: 0 },
      });

      await builder
        .for("cancer")
        .withAggregate("funders", ["funding"], {
          sortBy: "funding",
          sortOrder: "desc",
          limit: 10,
        })
        .executeWithFacets();

      expect(mockRawQuery).toHaveBeenCalledWith(
        'search grants for "cancer" return funders aggregate funding sort by funding desc limit 10',
      );
    });

    it("builds query with start_year facet", async () => {
      mockRawQuery.mockResolvedValue({
        start_year: [{ id: 2023, count: 100 }],
        _stats: { total_count: 0 },
      });

      await builder.for("cancer").withFacet("start_year").executeWithFacets();

      expect(mockRawQuery).toHaveBeenCalledWith('search grants for "cancer" return start_year');
    });
  });

  describe("time-series return clauses", () => {
    let builder: FluentQueryBuilder<Publication, "publications">;

    beforeEach(() => {
      builder = new FluentQueryBuilder<Publication, "publications">(mockExecutor, "publications");
    });

    it("builds query with returnCitationsPerYear", async () => {
      mockRawQuery.mockResolvedValue({
        publications: [],
        _stats: { total_count: 0 },
        citations_per_year: [
          { year: 2020, count: 10 },
          { year: 2021, count: 15 },
        ],
      });

      await builder.for("CRISPR").returnCitationsPerYear(2010, 2023).execute();

      const actualCall = mockRawQuery.mock.calls[0][0] as string;
      // Check contains the time-series function syntax
      expect(actualCall).toContain('search publications for "CRISPR"');
      expect(actualCall).toContain("citations_per_year(2010, 2023)");
    });

    it("builds query with returnFundingPerYear with default currency", async () => {
      const grantBuilder = new FluentQueryBuilder<Grant, "grants">(mockExecutor, "grants");
      mockRawQuery.mockResolvedValue({
        grants: [],
        _stats: { total_count: 0 },
      });

      await grantBuilder.for("cancer").returnFundingPerYear(2015, 2023).execute();

      const actualCall = mockRawQuery.mock.calls[0][0] as string;
      expect(actualCall).toContain('search grants for "cancer"');
      expect(actualCall).toContain('funding_per_year(2015, 2023, "USD")');
    });

    it("builds query with returnFundingPerYear with EUR currency", async () => {
      const grantBuilder = new FluentQueryBuilder<Grant, "grants">(mockExecutor, "grants");
      mockRawQuery.mockResolvedValue({
        grants: [],
        _stats: { total_count: 0 },
      });

      await grantBuilder.for("cancer").returnFundingPerYear(2015, 2023, "EUR").execute();

      const actualCall = mockRawQuery.mock.calls[0][0] as string;
      expect(actualCall).toContain('search grants for "cancer"');
      expect(actualCall).toContain('funding_per_year(2015, 2023, "EUR")');
    });

    it("builds query with returnFundingPerYear with GBP currency", async () => {
      const grantBuilder = new FluentQueryBuilder<Grant, "grants">(mockExecutor, "grants");
      mockRawQuery.mockResolvedValue({
        grants: [],
        _stats: { total_count: 0 },
      });

      await grantBuilder.for("cancer").returnFundingPerYear(2015, 2023, "GBP").execute();

      const actualCall = mockRawQuery.mock.calls[0][0] as string;
      expect(actualCall).toContain('search grants for "cancer"');
      expect(actualCall).toContain('funding_per_year(2015, 2023, "GBP")');
    });
  });

  describe("unnest operations", () => {
    let builder: FluentQueryBuilder<Publication, "publications">;

    beforeEach(() => {
      builder = new FluentQueryBuilder<Publication, "publications">(mockExecutor, "publications");
    });

    it("builds query with fieldsWithUnnest", async () => {
      mockRawQuery.mockResolvedValue({
        publications: [],
        _stats: { total_count: 0 },
      });

      await builder
        .for("test")
        .fieldsWithUnnest(["id", "title"], ["researchers", "category_for"])
        .execute();

      expect(mockRawQuery).toHaveBeenCalledWith(
        'search publications for "test" return publications[id+title+unnest(researchers)+unnest(category_for)]',
      );
    });

    it("builds query with chained unnest method", async () => {
      mockRawQuery.mockResolvedValue({
        publications: [],
        _stats: { total_count: 0 },
      });

      await builder
        .for("test")
        .fields(["id", "title"])
        .unnest("researchers")
        .unnest("category_for")
        .execute();

      expect(mockRawQuery).toHaveBeenCalledWith(
        'search publications for "test" return publications[id+title+unnest(researchers)+unnest(category_for)]',
      );
    });

    it("builds query with single unnest field", async () => {
      mockRawQuery.mockResolvedValue({
        publications: [],
        _stats: { total_count: 0 },
      });

      await builder.for("collaboration").fieldsWithUnnest(["id"], ["researchers"]).execute();

      expect(mockRawQuery).toHaveBeenCalledWith(
        'search publications for "collaboration" return publications[id+unnest(researchers)]',
      );
    });
  });

  describe("builder branching isolation", () => {
    it("branching withFacet from same base does not corrupt either query", () => {
      const base = new FluentQueryBuilder<Publication, "publications">(
        mockExecutor,
        "publications",
      );
      base.for("test");

      const a = base.withFacet("year");
      const b = base.withFacet("funders");

      expect(a.getDsl()).toBe('search publications for "test" return year');
      expect(b.getDsl()).toBe('search publications for "test" return funders');
      // base should not have any facets
      expect(base.getDsl()).toBe('search publications for "test"');
    });

    it("branching withAggregate from same base does not corrupt either query", () => {
      const base = new FluentQueryBuilder<Publication, "publications">(
        mockExecutor,
        "publications",
      );
      base.for("test");

      const a = base.withAggregate("year", ["count"]);
      const b = base.withAggregate("funders", ["rcr_avg"]);

      expect(a.getDsl()).toBe('search publications for "test" return year aggregate count');
      expect(b.getDsl()).toBe('search publications for "test" return funders aggregate rcr_avg');
    });

    it("chaining withFacet on FluentQueryBuilderWithFacets does not mutate parent", () => {
      const base = new FluentQueryBuilder<Publication, "publications">(
        mockExecutor,
        "publications",
      );
      base.for("test");

      const withYear = base.withFacet("year");
      const withYearAndFunders = withYear.withFacet("funders");

      expect(withYear.getDsl()).toBe('search publications for "test" return year');
      expect(withYearAndFunders.getDsl()).toBe(
        'search publications for "test" return year return funders',
      );
    });
  });

  describe("sort, skip, limit chainability", () => {
    let builder: FluentQueryBuilder<Publication, "publications">;

    beforeEach(() => {
      builder = new FluentQueryBuilder<Publication, "publications">(mockExecutor, "publications");
    });

    it("chains sort correctly", async () => {
      mockRawQuery.mockResolvedValue({
        publications: [],
        _stats: { total_count: 0 },
      });

      await builder.for("test").sort("year", "asc").execute();

      expect(mockRawQuery).toHaveBeenCalledWith(
        'search publications for "test" return publications sort by year asc',
      );
    });

    it("chains skip correctly", async () => {
      mockRawQuery.mockResolvedValue({
        publications: [],
        _stats: { total_count: 0 },
      });

      await builder.for("test").skip(50).execute();

      expect(mockRawQuery).toHaveBeenCalledWith(
        'search publications for "test" return publications skip 50',
      );
    });

    it("chains limit correctly", async () => {
      mockRawQuery.mockResolvedValue({
        publications: [],
        _stats: { total_count: 0 },
      });

      await builder.for("test").limit(100).execute();

      expect(mockRawQuery).toHaveBeenCalledWith(
        'search publications for "test" return publications limit 100',
      );
    });

    it("builds query with forComplex for proximity search", async () => {
      mockRawQuery.mockResolvedValue({
        publications: [{ id: "pub1", title: "Quantum Networking" }],
        _stats: { total_count: 3 },
      });

      const result = await builder
        .forComplex("quantum networking", 3)
        .where("year", ">", 2020)
        .limit(10)
        .execute();

      expect(mockRawQuery).toHaveBeenCalledWith(
        'search publications for complex("quantum networking", 3) where year > 2020 return publications limit 10',
      );
      expect(result.data).toEqual([{ id: "pub1", title: "Quantum Networking" }]);
      expect(result.totalCount).toBe(3);
    });

    it("builds query with forMinShouldMatch", async () => {
      mockRawQuery.mockResolvedValue({
        publications: [{ id: "pub1", title: "Optical Networks" }],
        _stats: { total_count: 7 },
      });

      const result = await builder
        .forMinShouldMatch("quantum OR optical networking", 2)
        .limit(5)
        .execute();

      expect(mockRawQuery).toHaveBeenCalledWith(
        'search publications for min_should_match("quantum OR optical networking", 2) return publications limit 5',
      );
      expect(result.data).toEqual([{ id: "pub1", title: "Optical Networks" }]);
      expect(result.totalCount).toBe(7);
    });
  });
});
