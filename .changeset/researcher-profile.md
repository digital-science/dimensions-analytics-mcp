---
"@digital-science-dsl/dimensions-analytics-mcp": minor
---

Add a `researcher_profile` tool that answers "tell me about this researcher" in one call. It takes a `researcherId`, `orcid`, or `name` and returns:

- the researcher's most recent publications, grants, clinical trials, and patents, with total counts;
- their Fields of Research divisions (2-digit ANZSRC 2020 `category_for_2020` codes, each with its own count; 4-digit groups are left out, not summed in);
- their top funders, collaborating organizations, and co-authors (excluding the researcher).

Every section is a DSL query scoped by `researchers.id`; nothing reads Solr. A name lookup profiles the best match and lists the other matches in `otherMatches`. If the co-author facet fails, the rest of the profile is still returned without `coauthors`. Clinical trials sort by `start_date` on DSL 2.16 and later, and by `date` on older instances (WEBAPPDEV-14093).
