import { beforeEach, describe, expect, it } from "vitest";
import { ValidationError } from "../../src/client/index.js";
import { QueryBuilder } from "../../src/dsl/query-builder.js";

describe("QueryBuilder", () => {
  let builder: QueryBuilder;

  beforeEach(() => {
    builder = new QueryBuilder();
  });

  describe("simple search queries", () => {
    it("builds a simple search query for publications", () => {
      const query = builder.search("publications").for("machine learning").build();

      expect(query).toBe('search publications for "machine learning"');
    });

    it("builds a search query for grants", () => {
      const query = builder.search("grants").for("cancer research").build();

      expect(query).toBe('search grants for "cancer research"');
    });

    it("builds a search query for researchers", () => {
      const query = builder.search("researchers").for("smith").build();

      expect(query).toBe('search researchers for "smith"');
    });
  });

  describe("queries with specific fields", () => {
    it("returns specified fields", () => {
      const query = builder
        .search("publications")
        .for("covid")
        .fields(["id", "title", "doi", "year"])
        .build();

      // API requires fields separated by '+' not ','
      expect(query).toBe('search publications for "covid" return publications[id+title+doi+year]');
    });

    it("returns all fields with empty array", () => {
      const query = builder.search("publications").for("quantum").fields([]).build();

      expect(query).toBe('search publications for "quantum"');
    });
  });

  describe("queries with where clauses", () => {
    it("adds single where clause with equals", () => {
      const query = builder.search("publications").for("climate").where("year", "=", 2023).build();

      expect(query).toBe('search publications for "climate" where year = 2023');
    });

    it("adds single where clause with string value", () => {
      const query = builder.search("publications").for("AI").where("type", "=", "article").build();

      expect(query).toBe('search publications for "AI" where type = "article"');
    });

    it("adds multiple where clauses", () => {
      const query = builder
        .search("publications")
        .for("genetics")
        .where("year", ">=", 2020)
        .where("year", "<=", 2024)
        .build();

      expect(query).toBe('search publications for "genetics" where year >= 2020 and year <= 2024');
    });

    it("supports not equals operator", () => {
      const query = builder
        .search("publications")
        .for("physics")
        .where("type", "!=", "preprint")
        .build();

      expect(query).toBe('search publications for "physics" where type != "preprint"');
    });

    it("supports greater than operator", () => {
      const query = builder
        .search("publications")
        .for("biology")
        .where("times_cited", ">", 100)
        .build();

      expect(query).toBe('search publications for "biology" where times_cited > 100');
    });

    it("supports less than operator", () => {
      const query = builder
        .search("grants")
        .for("energy")
        .where("funding_usd", "<", 1000000)
        .build();

      expect(query).toBe('search grants for "energy" where funding_usd < 1000000');
    });
  });

  describe("queries with sort", () => {
    it("sorts ascending by default", () => {
      const query = builder.search("publications").for("neuroscience").sort("year").build();

      // API requires return clause before sort
      expect(query).toBe(
        'search publications for "neuroscience" return publications sort by year asc',
      );
    });

    it("sorts descending when specified", () => {
      const query = builder
        .search("publications")
        .for("chemistry")
        .sort("times_cited", "desc")
        .build();

      expect(query).toBe(
        'search publications for "chemistry" return publications sort by times_cited desc',
      );
    });
  });

  describe("queries with limit", () => {
    it("adds limit clause", () => {
      const query = builder.search("publications").for("math").limit(50).build();

      // API requires return clause before limit
      expect(query).toBe('search publications for "math" return publications limit 50');
    });
  });

  describe("queries with skip for pagination", () => {
    it("adds skip clause", () => {
      const query = builder.search("publications").for("astronomy").skip(100).build();

      // API requires return clause before skip
      expect(query).toBe('search publications for "astronomy" return publications skip 100');
    });

    it("combines skip and limit for pagination", () => {
      const query = builder.search("publications").for("ecology").skip(50).limit(25).build();

      // API requires limit before skip
      expect(query).toBe('search publications for "ecology" return publications limit 25 skip 50');
    });
  });

  describe("complex queries", () => {
    it("combines all clauses in correct order", () => {
      const query = builder
        .search("publications")
        .for("deep learning")
        .where("year", ">=", 2020)
        .where("type", "=", "article")
        .fields(["id", "title", "authors"])
        .sort("times_cited", "desc")
        .skip(0)
        .limit(100)
        .build();

      // API requires: fields with '+', limit before skip
      expect(query).toBe(
        'search publications for "deep learning" where year >= 2020 and type = "article" return publications[id+title+authors] sort by times_cited desc limit 100 skip 0',
      );
    });
  });

  describe("error cases", () => {
    it("throws when building without entity", () => {
      expect(() => builder.build()).toThrow("Entity type must be specified");
    });

    it.each([
      "publications",
      "grants",
      "researchers",
      "patents",
      "clinical_trials",
      "datasets",
      "policy_documents",
      "organizations",
    ] as const)("builds valid query without for() for %s", (entity) => {
      expect(builder.search(entity).build()).toBe(`search ${entity}`);
    });

    it.each([
      "publications",
      "grants",
      "researchers",
      "patents",
      "clinical_trials",
      "datasets",
      "policy_documents",
      "organizations",
    ] as const)("builds query without for() but with where clause for %s", (entity) => {
      expect(builder.search(entity).where("year", "=", 2024).build()).toBe(
        `search ${entity} where year = 2024`,
      );
    });

    // Note: "*" is NOT a wildcard in the Dimensions DSL — it is sent as a literal string.
    // To search all records, omit the for() call and use where() conditions instead.
    it("builds query with for('*') as literal", () => {
      expect(builder.search("publications").for("*").build()).toBe('search publications for "*"');
    });

    it("throws for invalid entity type", () => {
      expect(() => builder.search("invalid_entity" as never)).toThrow("Invalid entity type");
    });

    it("throws for invalid operator", () => {
      expect(() =>
        builder
          .search("publications")
          .for("test")
          .where("year", "like" as never, 2020),
      ).toThrow("Invalid operator");
    });

    it("throws for negative limit", () => {
      expect(() => builder.search("publications").for("test").limit(-1)).toThrow(
        "Limit must be non-negative",
      );
    });

    it("throws for negative skip", () => {
      expect(() => builder.search("publications").for("test").skip(-1)).toThrow(
        "Skip must be non-negative",
      );
    });

    it("throws when search index is set without search terms", () => {
      expect(() => builder.search("publications").in("title_abstract_only").build()).toThrow(
        "Search index requires search terms: call for() before in()",
      );
    });

    it("allows in() with for()", () => {
      expect(builder.search("publications").for("test").in("title_abstract_only").build()).toBe(
        'search publications in title_abstract_only for "test"',
      );
    });

    it("allows in() set to full_data without for()", () => {
      expect(builder.search("publications").in("full_data").build()).toBe("search publications");
    });
  });

  describe("reset functionality", () => {
    it("resets builder state", () => {
      builder.search("publications").for("initial query");

      builder.reset();

      expect(() => builder.build()).toThrow("Entity type must be specified");
    });

    it("allows building new query after reset", () => {
      builder.search("publications").for("first query");

      builder.reset();

      const query = builder.search("grants").for("new query").build();

      expect(query).toBe('search grants for "new query"');
    });
  });

  describe("entity types", () => {
    it.each([
      "publications",
      "grants",
      "researchers",
      "patents",
      "clinical_trials",
      "datasets",
      "policy_documents",
      "organizations",
    ] as const)("supports %s entity type", (entity) => {
      const query = builder.search(entity).for("test").build();
      expect(query).toBe(`search ${entity} for "test"`);
    });
  });

  describe("queries with extended operators", () => {
    it("supports partial match operator (~)", () => {
      const query = builder
        .search("grants")
        .for("cancer")
        .where("research_orgs.name", "~", "National Blood")
        .build();

      expect(query).toBe('search grants for "cancer" where research_orgs.name ~ "National Blood"');
    });

    it("supports lucene field search operator (@)", () => {
      const query = builder
        .search("publications")
        .for("medicine")
        .where("mesh_terms", "@", "(human OR animal)")
        .build();

      expect(query).toBe(
        'search publications for "medicine" where mesh_terms @ "(human OR animal)"',
      );
    });

    it("supports is empty operator", () => {
      const query = builder.search("researchers").for("smith").whereEmpty("orcid_id").build();

      expect(query).toBe('search researchers for "smith" where orcid_id is empty');
    });

    it("supports is not empty operator", () => {
      const query = builder.search("publications").for("covid").whereNotEmpty("doi").build();

      expect(query).toBe('search publications for "covid" where doi is not empty');
    });

    it("combines emptiness checks with other conditions", () => {
      const query = builder
        .search("publications")
        .for("CRISPR")
        .where("year", ">=", 2020)
        .whereNotEmpty("doi")
        .build();

      expect(query).toBe(
        'search publications for "CRISPR" where year >= 2020 and doi is not empty',
      );
    });
  });

  describe("queries with list and range filters", () => {
    it("supports list filter with strings", () => {
      const query = builder
        .search("publications")
        .for("research")
        .whereIn("type", ["article", "review", "preprint"])
        .build();

      expect(query).toBe(
        'search publications for "research" where type in ["article", "review", "preprint"]',
      );
    });

    it("supports list filter with numbers", () => {
      const query = builder
        .search("publications")
        .for("data")
        .whereIn("year", [2020, 2021, 2022])
        .build();

      expect(query).toBe('search publications for "data" where year in [2020, 2021, 2022]');
    });

    it("supports range filter with numbers", () => {
      const query = builder
        .search("publications")
        .for("climate")
        .whereRange("year", 2018, 2023)
        .build();

      expect(query).toBe('search publications for "climate" where year in [2018:2023]');
    });

    it("supports range filter with dates", () => {
      const query = builder
        .search("publications")
        .for("covid")
        .whereRange("date", "2020-01-01", "2020-12-31")
        .build();

      expect(query).toBe(
        'search publications for "covid" where date in ["2020-01-01":"2020-12-31"]',
      );
    });

    it("validates list filter max items", () => {
      const items = Array.from({ length: 401 }, (_, i) => `item${i}`);
      expect(() => builder.search("publications").for("test").whereIn("id", items)).toThrow(
        "List filter cannot exceed 400 items",
      );
    });

    it("validates list filter has at least one value", () => {
      expect(() => builder.search("publications").for("test").whereIn("type", [])).toThrow(
        "List filter must have at least one value",
      );
    });

    it("supports mixed string and number values in list filter", () => {
      const query = builder
        .search("publications")
        .for("test")
        .whereIn("field", ["string", 123, "another"])
        .build();

      expect(query).toBe(
        'search publications for "test" where field in ["string", 123, "another"]',
      );
    });

    it("validates range start is not greater than end for numbers", () => {
      expect(() =>
        builder.search("publications").for("test").whereRange("year", 2023, 2020),
      ).toThrow("Range start must not be greater than end");
    });

    it("allows string ranges without validation", () => {
      const query = builder
        .search("publications")
        .for("test")
        .whereRange("date", "2023-01-01", "2020-01-01")
        .build();

      // String ranges are not validated (dates may have different formats)
      expect(query).toBe(
        'search publications for "test" where date in ["2023-01-01":"2020-01-01"]',
      );
    });
  });

  describe("combined filter types", () => {
    it("combines all filter types in correct order", () => {
      const query = builder
        .search("publications")
        .for("AI research")
        .where("year", ">=", 2020)
        .where("title", "~", "neural")
        .where("mesh_terms", "@", "(human OR mouse)")
        .whereNotEmpty("doi")
        .whereIn("type", ["article", "review"])
        .whereRange("times_cited", 10, 100)
        .fields(["id", "title"])
        .build();

      expect(query).toBe(
        'search publications for "AI research" ' +
          'where year >= 2020 and title ~ "neural" and mesh_terms @ "(human OR mouse)" ' +
          'and doi is not empty and type in ["article", "review"] and times_cited in [10:100] ' +
          "return publications[id+title]",
      );
    });
  });

  describe("queries with search indexes", () => {
    it("searches in title_abstract_only index", () => {
      const query = builder
        .search("publications")
        .in("title_abstract_only")
        .for("CRISPR gene editing")
        .build();

      expect(query).toBe('search publications in title_abstract_only for "CRISPR gene editing"');
    });

    it("searches in authors index", () => {
      const query = builder.search("publications").in("authors").for("Jennifer A Doudna").build();

      expect(query).toBe('search publications in authors for "Jennifer A Doudna"');
    });

    it("searches in concepts index", () => {
      const query = builder.search("publications").in("concepts").for("machine learning").build();

      expect(query).toBe('search publications in concepts for "machine learning"');
    });

    it("combines index with where clauses", () => {
      const query = builder
        .search("publications")
        .in("title_only")
        .for("graphene")
        .where("year", ">=", 2020)
        .build();

      expect(query).toBe('search publications in title_only for "graphene" where year >= 2020');
    });

    it("validates search index", () => {
      expect(() =>
        builder
          .search("publications")
          .in("invalid_index" as never)
          .for("test"),
      ).toThrow("Invalid search index");
    });
  });

  describe("queries with boolean logic", () => {
    it("supports explicit AND connector", () => {
      const query = builder
        .search("publications")
        .for("research")
        .where("year", ">=", 2020)
        .and()
        .where("type", "=", "article")
        .build();

      expect(query).toBe(
        'search publications for "research" where year >= 2020 and type = "article"',
      );
    });

    it("explicit AND produces same result as implicit AND", () => {
      const explicitAnd = new QueryBuilder()
        .search("publications")
        .for("test")
        .where("year", "=", 2020)
        .and()
        .where("type", "=", "article")
        .build();

      const implicitAnd = new QueryBuilder()
        .search("publications")
        .for("test")
        .where("year", "=", 2020)
        .where("type", "=", "article")
        .build();

      expect(explicitAnd).toBe(implicitAnd);
    });

    it("supports OR conditions", () => {
      const query = builder
        .search("publications")
        .for("research")
        .where("type", "=", "article")
        .or()
        .where("type", "=", "review")
        .build();

      expect(query).toBe(
        'search publications for "research" where type = "article" or type = "review"',
      );
    });

    it("supports NOT conditions", () => {
      const query = builder
        .search("publications")
        .for("cancer")
        .where("year", ">=", 2020)
        .not()
        .where("open_access", "=", "closed")
        .build();

      expect(query).toBe(
        'search publications for "cancer" where year >= 2020 not open_access = "closed"',
      );
    });

    it("supports parenthesized expressions", () => {
      const query = builder
        .search("publications")
        .for("AI")
        .openGroup()
        .where("type", "=", "article")
        .or()
        .where("type", "=", "review")
        .closeGroup()
        .where("year", ">=", 2020)
        .build();

      expect(query).toBe(
        'search publications for "AI" where (type = "article" or type = "review") and year >= 2020',
      );
    });

    it("supports nested parentheses", () => {
      const query = builder
        .search("grants")
        .for("energy")
        .openGroup()
        .openGroup()
        .where("start_year", ">", 2020)
        .where("funding_usd", ">", 1000000)
        .closeGroup()
        .or()
        .where("funder_org_acronym", "=", "NIH")
        .closeGroup()
        .where("active_status", "=", "active")
        .build();

      expect(query).toBe(
        'search grants for "energy" where ((start_year > 2020 and funding_usd > 1000000) or funder_org_acronym = "NIH") and active_status = "active"',
      );
    });

    it("throws on unbalanced parentheses (unclosed)", () => {
      expect(() =>
        builder.search("publications").for("test").openGroup().where("year", "=", 2020).build(),
      ).toThrow("Unbalanced parentheses");
    });

    it("throws on unbalanced parentheses (extra close)", () => {
      expect(() =>
        builder.search("publications").for("test").where("year", "=", 2020).closeGroup(),
      ).toThrow("No group to close");
    });

    it("combines OR with whereIn", () => {
      const query = builder
        .search("publications")
        .for("data")
        .whereIn("type", ["article", "review"])
        .or()
        .where("year", ">", 2022)
        .build();

      expect(query).toBe(
        'search publications for "data" where type in ["article", "review"] or year > 2022',
      );
    });

    it("combines OR with whereNotEmpty", () => {
      const query = builder
        .search("publications")
        .for("research")
        .whereNotEmpty("doi")
        .or()
        .whereNotEmpty("pmid")
        .build();

      expect(query).toBe(
        'search publications for "research" where doi is not empty or pmid is not empty',
      );
    });

    it("supports deeply nested groups (3+ levels)", () => {
      const query = builder
        .search("publications")
        .for("complex query")
        .openGroup()
        .openGroup()
        .openGroup()
        .where("year", ">=", 2020)
        .or()
        .where("year", "<=", 2010)
        .closeGroup()
        .where("type", "=", "article")
        .closeGroup()
        .or()
        .where("times_cited", ">", 100)
        .closeGroup()
        .where("open_access", "=", "all")
        .build();

      expect(query).toBe(
        'search publications for "complex query" where (((year >= 2020 or year <= 2010) and type = "article") or times_cited > 100) and open_access = "all"',
      );
    });

    it("supports 4 levels of nesting with mixed operators", () => {
      const query = builder
        .search("grants")
        .for("research funding")
        .openGroup()
        .openGroup()
        .openGroup()
        .openGroup()
        .where("funding_usd", ">", 1000000)
        .closeGroup()
        .or()
        .where("funder_org_acronym", "=", "NIH")
        .closeGroup()
        .where("start_year", ">=", 2020)
        .closeGroup()
        .not()
        .where("active_status", "=", "closed")
        .closeGroup()
        .build();

      expect(query).toBe(
        'search grants for "research funding" where ((((funding_usd > 1000000) or funder_org_acronym = "NIH") and start_year >= 2020) not active_status = "closed")',
      );
    });
  });

  describe("queries with count function", () => {
    it("filters by count equals", () => {
      const query = builder
        .search("publications")
        .for("research")
        .whereCount("researchers", "=", 1)
        .build();

      expect(query).toBe('search publications for "research" where count(researchers) = 1');
    });

    it("filters by count greater than", () => {
      const query = builder
        .search("publications")
        .for("collaboration")
        .whereCount("research_org_countries", ">", 1)
        .build();

      expect(query).toBe(
        'search publications for "collaboration" where count(research_org_countries) > 1',
      );
    });

    it("filters for hyper-authorship", () => {
      const query = builder
        .search("publications")
        .for("physics")
        .whereCount("researchers", ">=", 25)
        .build();

      expect(query).toBe('search publications for "physics" where count(researchers) >= 25');
    });

    it("combines count with other conditions", () => {
      const query = builder
        .search("publications")
        .for("science")
        .where("year", ">=", 2020)
        .whereCount("researchers", ">", 5)
        .build();

      expect(query).toBe(
        'search publications for "science" where year >= 2020 and count(researchers) > 5',
      );
    });

    it("combines count with OR operator", () => {
      const query = builder
        .search("publications")
        .for("research")
        .whereCount("researchers", ">", 5)
        .or()
        .whereCount("research_org_countries", ">", 2)
        .build();

      expect(query).toBe(
        'search publications for "research" where count(researchers) > 5 or count(research_org_countries) > 2',
      );
    });

    it("combines count with NOT operator", () => {
      const query = builder
        .search("publications")
        .for("research")
        .whereCount("researchers", ">=", 1)
        .not()
        .whereCount("research_org_countries", "=", 1)
        .build();

      expect(query).toBe(
        'search publications for "research" where count(researchers) >= 1 not count(research_org_countries) = 1',
      );
    });

    it("combines count with parenthesized boolean expressions", () => {
      const query = builder
        .search("publications")
        .for("collaboration")
        .where("year", ">=", 2020)
        .openGroup()
        .whereCount("researchers", ">", 10)
        .or()
        .whereCount("research_org_countries", ">", 3)
        .closeGroup()
        .build();

      expect(query).toBe(
        'search publications for "collaboration" where year >= 2020 and (count(researchers) > 10 or count(research_org_countries) > 3)',
      );
    });
  });

  describe("facet return clauses", () => {
    it("generates basic facet return clause", () => {
      const query = builder.search("publications").for("CRISPR").returnFacet("year").build();

      expect(query).toBe('search publications for "CRISPR" return year');
    });

    it("generates facet return clause with limit", () => {
      const query = builder
        .search("publications")
        .for("CRISPR")
        .returnFacet("funders", { limit: 10 })
        .build();

      expect(query).toBe('search publications for "CRISPR" return funders limit 10');
    });

    it("generates multiple facet return clauses", () => {
      const query = builder
        .search("publications")
        .for("CRISPR")
        .returnFacet("year")
        .returnFacet("funders", { limit: 10 })
        .build();

      expect(query).toBe('search publications for "CRISPR" return year return funders limit 10');
    });

    it("generates aggregated facet return clause", () => {
      const query = builder
        .search("publications")
        .for("CRISPR")
        .returnAggregate("funders", ["rcr_avg"])
        .build();

      expect(query).toBe('search publications for "CRISPR" return funders aggregate rcr_avg');
    });

    it("generates aggregated facet with multiple indicators", () => {
      const query = builder
        .search("publications")
        .for("CRISPR")
        .returnAggregate("funders", ["rcr_avg", "altmetric_median"])
        .build();

      expect(query).toBe(
        'search publications for "CRISPR" return funders aggregate rcr_avg, altmetric_median',
      );
    });

    it("generates aggregated facet with sort", () => {
      const query = builder
        .search("publications")
        .for("CRISPR")
        .returnAggregate("funders", ["rcr_avg"], {
          sortBy: "rcr_avg",
          sortOrder: "desc",
        })
        .build();

      expect(query).toBe(
        'search publications for "CRISPR" return funders aggregate rcr_avg sort by rcr_avg desc',
      );
    });

    it("generates aggregated facet with sort by count", () => {
      const query = builder
        .search("publications")
        .for("CRISPR")
        .returnAggregate("funders", ["rcr_avg"], {
          sortBy: "count",
          sortOrder: "asc",
        })
        .build();

      expect(query).toBe(
        'search publications for "CRISPR" return funders aggregate rcr_avg sort by count asc',
      );
    });

    it("generates aggregated facet with limit", () => {
      const query = builder
        .search("publications")
        .for("CRISPR")
        .returnAggregate("funders", ["rcr_avg"], { limit: 10 })
        .build();

      expect(query).toBe(
        'search publications for "CRISPR" return funders aggregate rcr_avg limit 10',
      );
    });

    it("generates aggregated facet with all options", () => {
      const query = builder
        .search("publications")
        .for("CRISPR")
        .returnAggregate("funders", ["rcr_avg", "altmetric_median"], {
          sortBy: "rcr_avg",
          sortOrder: "desc",
          limit: 10,
        })
        .build();

      expect(query).toBe(
        'search publications for "CRISPR" return funders aggregate rcr_avg, altmetric_median sort by rcr_avg desc limit 10',
      );
    });

    it("combines entity return with facet return", () => {
      const query = builder
        .search("publications")
        .for("CRISPR")
        .fields(["id", "title"])
        .limit(100)
        .returnFacet("year")
        .build();

      expect(query).toBe(
        'search publications for "CRISPR" return publications[id+title] limit 100 return year',
      );
    });

    it("combines entity return with aggregated facet", () => {
      const query = builder
        .search("publications")
        .for("CRISPR")
        .where("year", ">=", 2020)
        .fields(["id", "title"])
        .returnAggregate("funders", ["rcr_avg"], {
          sortBy: "rcr_avg",
          limit: 10,
        })
        .build();

      expect(query).toBe(
        'search publications for "CRISPR" where year >= 2020 return publications[id+title] return funders aggregate rcr_avg sort by rcr_avg desc limit 10',
      );
    });

    it("generates grant facet with funding aggregation", () => {
      const query = builder
        .search("grants")
        .for("cancer")
        .returnAggregate("funders", ["funding"], {
          sortBy: "funding",
          sortOrder: "desc",
          limit: 10,
        })
        .build();

      expect(query).toBe(
        'search grants for "cancer" return funders aggregate funding sort by funding desc limit 10',
      );
    });

    it("resets facet clauses on reset", () => {
      builder.search("publications").for("test").returnFacet("year");

      builder.reset();

      expect(() => builder.build()).toThrow("Entity type must be specified");
    });
  });

  describe("queries with similar_documents()", () => {
    it("builds query with similar_documents function", () => {
      const query = builder
        .search("publications")
        .forSimilar("Machine learning for drug discovery")
        .build();

      expect(query).toBe(
        'search publications for similar_documents("Machine learning for drug discovery")',
      );
    });

    it("escapes quotes in similar text", () => {
      const query = builder.search("publications").forSimilar('Text with "quotes" inside').build();

      expect(query).toBe(
        'search publications for similar_documents("Text with \\"quotes\\" inside")',
      );
    });

    it("normalizes newlines in similar text", () => {
      const query = builder
        .search("publications")
        .forSimilar("Line one\nLine two\nLine three")
        .build();

      expect(query).toBe(
        'search publications for similar_documents("Line one\\nLine two\\nLine three")',
      );
    });

    it("combines similar_documents with where clause", () => {
      const query = builder
        .search("publications")
        .forSimilar("Spinal cord injury macrophage polarization")
        .where("year", ">", 2015)
        .build();

      expect(query).toBe(
        'search publications for similar_documents("Spinal cord injury macrophage polarization") where year > 2015',
      );
    });

    it("combines similar_documents with limit", () => {
      const query = builder
        .search("publications")
        .forSimilar("Cancer immunotherapy")
        .limit(10)
        .build();

      expect(query).toBe(
        'search publications for similar_documents("Cancer immunotherapy") return publications limit 10',
      );
    });

    it("combines similar_documents with fields", () => {
      const query = builder
        .search("publications")
        .forSimilar("Neural networks deep learning")
        .fields(["id", "title", "year"])
        .build();

      expect(query).toBe(
        'search publications for similar_documents("Neural networks deep learning") return publications[id+title+year]',
      );
    });

    it("works with grants entity", () => {
      const query = builder
        .search("grants")
        .forSimilar("Cancer immunotherapy research")
        .where("start_year", ">=", 2020)
        .limit(5)
        .build();

      expect(query).toBe(
        'search grants for similar_documents("Cancer immunotherapy research") where start_year >= 2020 return grants limit 5',
      );
    });

    it("resets similar text on reset", () => {
      builder.search("publications").forSimilar("test text");
      builder.reset();

      expect(() => builder.build()).toThrow("Entity type must be specified");
    });
  });

  describe("facet return validation", () => {
    it("throws ValidationError on empty field name", () => {
      expect(() => builder.search("publications").for("test").returnFacet("")).toThrow(
        ValidationError,
      );

      try {
        builder.search("publications").for("test").returnFacet("");
      } catch (e) {
        expect((e as ValidationError).message).toBe("Invalid field name: ");
      }
    });

    it("throws ValidationError on whitespace-only field name", () => {
      expect(() => builder.search("publications").for("test").returnFacet("   ")).toThrow(
        ValidationError,
      );
    });

    it("throws ValidationError on negative facet limit", () => {
      expect(() =>
        builder.search("publications").for("test").returnFacet("year", { limit: -1 }),
      ).toThrow(ValidationError);

      try {
        builder.search("publications").for("test").returnFacet("year", { limit: -1 });
      } catch (e) {
        expect((e as ValidationError).message).toBe("Facet limit must be non-negative");
        expect((e as ValidationError).details?.limit).toBe(-1);
      }
    });

    it("allows zero facet limit", () => {
      const query = builder
        .search("publications")
        .for("test")
        .returnFacet("year", { limit: 0 })
        .build();

      expect(query).toContain("return year limit 0");
    });

    it("throws ValidationError on empty field name for aggregate", () => {
      expect(() =>
        builder.search("publications").for("test").returnAggregate("", ["rcr_avg"]),
      ).toThrow(ValidationError);
    });

    it("throws ValidationError on whitespace-only field name for aggregate", () => {
      expect(() =>
        builder.search("publications").for("test").returnAggregate("  ", ["rcr_avg"]),
      ).toThrow(ValidationError);
    });

    it("throws ValidationError on empty indicators array", () => {
      expect(() =>
        builder.search("publications").for("test").returnAggregate("funders", []),
      ).toThrow(ValidationError);

      try {
        builder.search("publications").for("test").returnAggregate("funders", []);
      } catch (e) {
        expect((e as ValidationError).message).toBe("Aggregate must have at least one indicator");
        expect((e as ValidationError).details?.field).toBe("funders");
      }
    });

    it("throws ValidationError on negative aggregate limit", () => {
      expect(() =>
        builder
          .search("publications")
          .for("test")
          .returnAggregate("funders", ["rcr_avg"], { limit: -1 }),
      ).toThrow(ValidationError);
    });

    it("throws ValidationError on invalid sortBy value", () => {
      try {
        builder
          .search("publications")
          .for("test")
          .returnAggregate("funders", ["rcr_avg"], { sortBy: "invalid" });
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        expect((e as ValidationError).message).toContain("sortBy must be one of");
        expect((e as ValidationError).details?.sortBy).toBe("invalid");
        expect((e as ValidationError).details?.validSortTargets).toEqual(["rcr_avg", "count"]);
      }
    });

    it("throws ValidationError on empty indicator string", () => {
      expect(() =>
        builder.search("publications").for("test").returnAggregate("funders", [""]),
      ).toThrow(ValidationError);
    });

    it("throws ValidationError on whitespace-only indicator", () => {
      expect(() =>
        builder.search("publications").for("test").returnAggregate("funders", ["rcr_avg", "   "]),
      ).toThrow(ValidationError);
    });

    it("throws ValidationError on sortBy not matching any indicator", () => {
      expect(() =>
        builder
          .search("publications")
          .for("test")
          .returnAggregate("funders", ["rcr_avg", "altmetric_median"], {
            sortBy: "times_cited",
          }),
      ).toThrow(ValidationError);
    });

    it("allows sortBy count", () => {
      const query = builder
        .search("publications")
        .for("test")
        .returnAggregate("funders", ["rcr_avg"], { sortBy: "count" })
        .build();

      expect(query).toContain("sort by count");
    });

    it("allows sortBy matching an indicator", () => {
      const query = builder
        .search("publications")
        .for("test")
        .returnAggregate("funders", ["rcr_avg", "altmetric_median"], {
          sortBy: "altmetric_median",
        })
        .build();

      expect(query).toContain("sort by altmetric_median");
    });
  });

  describe("grouped returns", () => {
    it("generates correct DSL for grouped entity return", () => {
      const query = builder
        .search("publications")
        .for("test")
        .returnGrouped("docs", { fields: ["id", "title"] })
        .build();

      expect(query).toContain('return in "docs" publications[id+title]');
    });

    it("generates correct DSL for grouped facet return", () => {
      const query = builder
        .search("publications")
        .for("test")
        .fields(["id", "title"])
        .returnGroupedFacet("facets", "funders")
        .build();

      expect(query).toContain("return publications[id+title]");
      expect(query).toContain('return in "facets" funders');
    });

    it("generates correct DSL for grouped aggregated facet", () => {
      const query = builder
        .search("publications")
        .for("test")
        .returnGroupedAggregate("metrics", "funders", ["rcr_avg", "funding_usd"], {
          sortBy: "rcr_avg",
          sortOrder: "desc",
        })
        .build();

      expect(query).toContain(
        'return in "metrics" funders aggregate rcr_avg, funding_usd sort by rcr_avg desc',
      );
    });

    it("supports multiple grouped returns", () => {
      const query = builder
        .search("publications")
        .for("test")
        .returnGrouped("docs", { fields: ["id", "title"] })
        .returnGroupedFacet("years", "year", { limit: 10 })
        .returnGroupedAggregate("orgs", "research_orgs", ["rcr_avg"])
        .build();

      expect(query).toContain('return in "docs" publications[id+title]');
      expect(query).toContain('return in "years" year limit 10');
      expect(query).toContain('return in "orgs" research_orgs aggregate rcr_avg');
    });

    it("rejects empty group name", () => {
      expect(() => {
        builder
          .search("publications")
          .for("test")
          .returnGrouped("", { fields: ["id"] })
          .build();
      }).toThrow(ValidationError);
    });

    it("rejects whitespace-only group name", () => {
      expect(() => {
        builder
          .search("publications")
          .for("test")
          .returnGrouped("  ", { fields: ["id"] })
          .build();
      }).toThrow(ValidationError);
    });
  });

  describe("limit(0) with facets (facet-only queries)", () => {
    it("skips entity return when limit(0) with facets and no fields", () => {
      const query = builder
        .search("publications")
        .for("CRISPR")
        .limit(0)
        .returnFacet("year")
        .build();
      expect(query).toBe('search publications for "CRISPR" return year');
    });

    it("skips entity return when limit(0) with time-series", () => {
      const query = builder
        .search("publications")
        .for("CRISPR")
        .limit(0)
        .returnCitationsPerYear(2010, 2023)
        .build();
      expect(query).toBe('search publications for "CRISPR" return citations_per_year(2010, 2023)');
    });

    it("throws when limit(0) with fields", () => {
      expect(() =>
        builder
          .search("publications")
          .for("CRISPR")
          .fields(["id"])
          .limit(0)
          .returnFacet("year")
          .build(),
      ).toThrow(ValidationError);

      try {
        builder
          .search("publications")
          .for("CRISPR")
          .fields(["id"])
          .limit(0)
          .returnFacet("year")
          .build();
      } catch (e) {
        expect((e as ValidationError).message).toContain("limit(0) cannot be used with fields()");
      }
    });

    it("keeps entity return when limit > 0 with facets", () => {
      const query = builder
        .search("publications")
        .for("CRISPR")
        .limit(10)
        .returnFacet("year")
        .build();
      expect(query).toBe(
        'search publications for "CRISPR" return publications limit 10 return year',
      );
    });

    it("throws when limit(0) without facets", () => {
      expect(() => builder.search("publications").for("CRISPR").limit(0).build()).toThrow(
        ValidationError,
      );

      try {
        builder.search("publications").for("CRISPR").limit(0).build();
      } catch (e) {
        expect((e as ValidationError).message).toContain("limit(0) requires at least one facet");
      }
    });

    it("skips entity return when limit(0) with grouped returns", () => {
      const query = builder
        .search("publications")
        .for("CRISPR")
        .limit(0)
        .returnGroupedFacet("facets", "year")
        .build();
      expect(query).toBe('search publications for "CRISPR" return in "facets" year');
    });

    it("skips entity return when limit(0) with multiple facets", () => {
      const query = builder
        .search("publications")
        .for("CRISPR")
        .limit(0)
        .returnFacet("year")
        .returnFacet("funders", { limit: 10 })
        .build();
      expect(query).toBe('search publications for "CRISPR" return year return funders limit 10');
    });

    it("skips entity return AND skip when limit(0) with skip and facets", () => {
      const query = builder
        .search("publications")
        .for("CRISPR")
        .limit(0)
        .skip(10)
        .returnFacet("year")
        .build();
      // skip should also be suppressed since there's no entity return
      expect(query).toBe('search publications for "CRISPR" return year');
    });

    it("skips entity return AND sort when limit(0) with sort and facets", () => {
      const query = builder
        .search("publications")
        .for("CRISPR")
        .limit(0)
        .sort("year", "desc")
        .returnFacet("funders")
        .build();
      // sort should also be suppressed since there's no entity return
      expect(query).toBe('search publications for "CRISPR" return funders');
    });

    it("skips entity return AND all modifiers when limit(0) with sort+skip and facets", () => {
      const query = builder
        .search("publications")
        .for("CRISPR")
        .limit(0)
        .sort("times_cited", "desc")
        .skip(50)
        .returnFacet("year")
        .returnFacet("funders", { limit: 5 })
        .build();
      // All modifiers should be suppressed since there's no entity return
      expect(query).toBe('search publications for "CRISPR" return year return funders limit 5');
    });

    it("keeps entity return and skip when skip(0) without limit(0)", () => {
      const query = builder
        .search("publications")
        .for("CRISPR")
        .skip(0)
        .returnFacet("year")
        .build();
      // skip(0) alone should still trigger entity return (skip=0 is redundant but valid)
      expect(query).toBe('search publications for "CRISPR" return publications skip 0 return year');
    });

    it("keeps all modifiers when limit > 0 with facets", () => {
      const query = builder
        .search("publications")
        .for("CRISPR")
        .limit(10)
        .skip(5)
        .sort("year", "desc")
        .returnFacet("funders")
        .build();
      expect(query).toBe(
        'search publications for "CRISPR" return publications sort by year desc limit 10 skip 5 return funders',
      );
    });
  });

  describe("DSL injection prevention", () => {
    it("escapes injection payload in where() string value", () => {
      const query = builder
        .search("publications")
        .for("test")
        .where("doi", "=", 'test" return publications limit 9999 //')
        .build();

      expect(query).toBe(
        'search publications for "test" where doi = "test\\" return publications limit 9999 //"',
      );
    });

    it("escapes injection payload in for() search terms", () => {
      const query = builder
        .search("publications")
        .for('test" return publications limit 9999 //')
        .build();

      expect(query).toBe('search publications for "test\\" return publications limit 9999 //"');
    });

    it("escapes injection payload in whereIn() string values", () => {
      const query = builder
        .search("publications")
        .for("test")
        .whereIn("type", ['article" or 1=1 //', "review"])
        .build();

      expect(query).toBe(
        'search publications for "test" where type in ["article\\" or 1=1 //", "review"]',
      );
    });

    it("escapes injection payload in whereRange() string values", () => {
      const query = builder
        .search("publications")
        .for("test")
        .whereRange("date", '2020-01-01" or 1=1 //', "2020-12-31")
        .build();

      expect(query).toBe(
        'search publications for "test" where date in ["2020-01-01\\" or 1=1 //":"2020-12-31"]',
      );
    });

    it("escapes backslashes in where() to prevent escape bypass", () => {
      const query = builder
        .search("publications")
        .for("test")
        .where("doi", "=", 'test\\" return publications limit 9999 //')
        .build();

      expect(query).toContain('test\\\\\\"');
    });

    it("escapes newlines in for() search terms", () => {
      const query = builder.search("publications").for("line1\nline2").build();

      expect(query).toBe('search publications for "line1\\nline2"');
    });
  });

  describe("field name validation", () => {
    const injectionPayloads = [
      "year >= 2020 return publications limit 1 //",
      'year" return publications //',
      "field\nreturn publications",
      "field; DROP TABLE",
      "field name",
      "",
      "123field",
      "field--comment",
    ];

    for (const payload of injectionPayloads) {
      it(`rejects field name: ${JSON.stringify(payload)}`, () => {
        expect(() => builder.search("publications").where(payload, "=", "value")).toThrow(
          ValidationError,
        );
      });
    }

    const validFields = ["year", "times_cited", "authors.first_name", "FOR_first", "mesh_terms"];

    for (const field of validFields) {
      it(`accepts valid field name: ${field}`, () => {
        expect(() => builder.search("publications").where(field, "=", "test")).not.toThrow();
      });
    }

    it("validates field in whereEmpty()", () => {
      expect(() => builder.search("publications").whereEmpty("bad field")).toThrow(ValidationError);
    });

    it("validates field in whereNotEmpty()", () => {
      expect(() => builder.search("publications").whereNotEmpty("bad\nfield")).toThrow(
        ValidationError,
      );
    });

    it("validates field in whereIn()", () => {
      expect(() => builder.search("publications").whereIn("bad field", ["a"])).toThrow(
        ValidationError,
      );
    });

    it("validates field in whereRange()", () => {
      expect(() => builder.search("publications").whereRange("bad field", "1", "2")).toThrow(
        ValidationError,
      );
    });

    it("validates field in whereCount()", () => {
      expect(() => builder.search("publications").whereCount("bad field", ">", 5)).toThrow(
        ValidationError,
      );
    });

    it("validates field in sort()", () => {
      expect(() => builder.search("publications").sort("bad field")).toThrow(ValidationError);
    });

    it("validates field in fields()", () => {
      expect(() => builder.search("publications").fields(["id", "bad field"])).toThrow(
        ValidationError,
      );
    });

    it("validates field in fieldsWithUnnest() regular fields", () => {
      expect(() =>
        builder.search("publications").fieldsWithUnnest(["bad field"], ["researchers"]),
      ).toThrow(ValidationError);
    });

    it("validates field in fieldsWithUnnest() unnest fields", () => {
      expect(() => builder.search("publications").fieldsWithUnnest(["id"], ["bad field"])).toThrow(
        ValidationError,
      );
    });

    it("validates field in addUnnest()", () => {
      expect(() => builder.search("publications").addUnnest("bad field")).toThrow(ValidationError);
    });

    it("validates field in returnFacet()", () => {
      expect(() => builder.search("publications").returnFacet("bad field")).toThrow(
        ValidationError,
      );
    });

    it("validates field in returnAggregate()", () => {
      expect(() => builder.search("publications").returnAggregate("bad field", ["count"])).toThrow(
        ValidationError,
      );
    });

    it("validates fields in returnGrouped()", () => {
      expect(() =>
        builder.search("publications").returnGrouped("g", { fields: ["bad field"] }),
      ).toThrow(ValidationError);
    });

    it("validates sortField in returnGrouped()", () => {
      expect(() =>
        builder.search("publications").returnGrouped("g", { sortField: "bad field" }),
      ).toThrow(ValidationError);
    });

    it("validates field in returnGroupedFacet()", () => {
      expect(() => builder.search("publications").returnGroupedFacet("g", "bad field")).toThrow(
        ValidationError,
      );
    });

    it("validates field in returnGroupedAggregate()", () => {
      expect(() =>
        builder.search("publications").returnGroupedAggregate("g", "bad field", ["count"]),
      ).toThrow(ValidationError);
    });
  });

  describe("search text length with sanitization", () => {
    it("accepts text at limit after zero-width char stripping", () => {
      // 10000 real chars + 100 zero-width chars = 10100 raw length
      // After sanitization: 10000 chars — should pass
      const text = "a".repeat(10_000) + "\u200B".repeat(100);
      expect(() => new QueryBuilder().search("publications").for(text)).not.toThrow();
    });
  });

  describe("clone", () => {
    it("creates an independent copy with the same state", () => {
      builder.search("publications").for("test").where("year", ">=", 2020);
      const cloned = builder.clone();

      expect(cloned.build()).toBe(builder.build());
    });

    it("does not affect the original when the clone is mutated", () => {
      builder.search("publications").for("test");
      const cloned = builder.clone();
      cloned.where("year", ">=", 2020);

      expect(builder.build()).toBe('search publications for "test"');
      expect(cloned.build()).toBe('search publications for "test" where year >= 2020');
    });

    it("does not affect the clone when the original is mutated", () => {
      builder.search("publications").for("test");
      const cloned = builder.clone();
      builder.where("type", "=", "article");

      expect(cloned.build()).toBe('search publications for "test"');
      expect(builder.build()).toBe('search publications for "test" where type = "article"');
    });

    it("clones facet clauses independently", () => {
      builder.search("publications").for("test").returnFacet("year");
      const cloned = builder.clone();
      cloned.returnFacet("funders");

      expect(builder.build()).toBe('search publications for "test" return year');
      expect(cloned.build()).toBe('search publications for "test" return year return funders');
    });

    it("clones fields independently", () => {
      builder.search("publications").for("test").fields(["id", "title"]);
      const cloned = builder.clone();
      cloned.fields(["id", "title", "doi"]);

      expect(builder.build()).toBe('search publications for "test" return publications[id+title]');
      expect(cloned.build()).toBe(
        'search publications for "test" return publications[id+title+doi]',
      );
    });
  });

  describe("queries with complex()", () => {
    it("builds query with complex function", () => {
      const query = builder.search("publications").forComplex("quantum networking", 3).build();

      expect(query).toBe('search publications for complex("quantum networking", 3)');
    });

    it("escapes quotes in complex phrase", () => {
      const query = builder.search("publications").forComplex('phrase with "quotes"', 5).build();

      expect(query).toBe('search publications for complex("phrase with \\"quotes\\"", 5)');
    });

    it("combines complex with where clause", () => {
      const query = builder
        .search("publications")
        .forComplex("CRISPR gene editing", 5)
        .where("year", ">", 2020)
        .build();

      expect(query).toBe(
        'search publications for complex("CRISPR gene editing", 5) where year > 2020',
      );
    });

    it("combines complex with in index", () => {
      const query = builder
        .search("publications")
        .in("title_abstract_only")
        .forComplex("quantum networking", 3)
        .build();

      expect(query).toBe(
        'search publications in title_abstract_only for complex("quantum networking", 3)',
      );
    });

    it("combines complex with limit and fields", () => {
      const query = builder
        .search("publications")
        .forComplex("quantum networking", 3)
        .fields(["id", "title"])
        .limit(10)
        .build();

      expect(query).toBe(
        'search publications for complex("quantum networking", 3) return publications[id+title] limit 10',
      );
    });

    it("throws on maxDist < 1", () => {
      expect(() => builder.search("publications").forComplex("test", 0)).toThrow(ValidationError);
    });

    it("resets complex fields on reset", () => {
      builder.search("publications").forComplex("test", 3);
      builder.reset();

      expect(() => builder.build()).toThrow("Entity type must be specified");
    });
  });

  describe("queries with min_should_match()", () => {
    it("builds query with min_should_match function", () => {
      const query = builder
        .search("publications")
        .forMinShouldMatch("quantum OR optical networking", 2)
        .build();

      expect(query).toBe(
        'search publications for min_should_match("quantum OR optical networking", 2)',
      );
    });

    it("escapes quotes in min_should_match phrase", () => {
      const query = builder
        .search("publications")
        .forMinShouldMatch('phrase with "quotes"', 2)
        .build();

      expect(query).toBe('search publications for min_should_match("phrase with \\"quotes\\"", 2)');
    });

    it("combines min_should_match with where clause", () => {
      const query = builder
        .search("publications")
        .forMinShouldMatch("machine learning deep neural", 2)
        .where("year", ">=", 2020)
        .build();

      expect(query).toBe(
        'search publications for min_should_match("machine learning deep neural", 2) where year >= 2020',
      );
    });

    it("combines min_should_match with in index", () => {
      const query = builder
        .search("publications")
        .in("title_only")
        .forMinShouldMatch("quantum optical", 1)
        .build();

      expect(query).toBe(
        'search publications in title_only for min_should_match("quantum optical", 1)',
      );
    });

    it("combines min_should_match with limit", () => {
      const query = builder
        .search("publications")
        .forMinShouldMatch("quantum OR optical networking", 2)
        .limit(5)
        .build();

      expect(query).toBe(
        'search publications for min_should_match("quantum OR optical networking", 2) return publications limit 5',
      );
    });

    it("throws on min < 1", () => {
      expect(() => builder.search("publications").forMinShouldMatch("test", 0)).toThrow(
        ValidationError,
      );
    });

    it("resets min_should_match fields on reset", () => {
      builder.search("publications").forMinShouldMatch("test", 2);
      builder.reset();

      expect(() => builder.build()).toThrow("Entity type must be specified");
    });
  });

  describe("queries with full_data_exact index", () => {
    it("builds query with full_data_exact index", () => {
      const query = builder.search("publications").in("full_data_exact").for("BRCA1").build();

      expect(query).toBe('search publications in full_data_exact for "BRCA1"');
    });

    it("validates full_data_exact as a valid index", () => {
      expect(() => builder.search("publications").in("full_data_exact")).not.toThrow();
    });
  });
});
