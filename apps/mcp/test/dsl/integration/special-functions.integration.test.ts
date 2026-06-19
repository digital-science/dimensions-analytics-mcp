/**
 * Integration tests for DSL Special Functions.
 * Tests similar_documents, classify, and extract_concepts against the real Dimensions API.
 * @module test/integration/special-functions.integration
 */

import { beforeAll, describe, expect, it } from "vitest";
import { DimensionsClient } from "../../../../src/dsl/index.js";

import { loadTestConfig } from "./test-config.js";

const config = loadTestConfig(); // was: process.env.DIMENSIONS_API_KEY
const TIMEOUT = 30_000;

describe.skipIf(!config)("Special Functions Integration", () => {
  let client: DimensionsClient;

  beforeAll(() => {
    client = new DimensionsClient({
      apiKey: config!.apiKey,
      ...(config!.baseUrl && { baseUrl: config!.baseUrl }),
      rateLimitPerMinute: 30,
    });
  });

  describe("similar_documents()", () => {
    it(
      "finds similar publications based on abstract text",
      async () => {
        // Sample abstract text for semantic matching
        const abstractText = `After spinal cord injury, macrophages infiltrate the lesion site
        and contribute to both tissue damage and repair processes. Understanding the
        mechanisms of macrophage polarization could lead to novel therapeutic strategies.`;

        const dsl = `search publications for similar_documents("${abstractText.replace(/"/g, '\\"').replace(/\n/g, " ")}")
        where year > 2015
        return publications[id+title+year] limit 5`;

        const response = await client.rawQuery(dsl);

        console.log("similar_documents response:", JSON.stringify(response, null, 2));

        expect(response).toBeDefined();
        // Check if publications array exists
        if ("publications" in response) {
          expect(Array.isArray(response.publications)).toBe(true);
          const pubs = response.publications as Array<{ id: string; title: string; year: number }>;
          expect(pubs.length).toBeGreaterThan(0);
          expect(pubs.length).toBeLessThanOrEqual(5);

          // Verify structure
          for (const pub of pubs) {
            expect(pub.id).toBeDefined();
            expect(pub.title).toBeDefined();
          }
        }
      },
      TIMEOUT,
    );

    it(
      "finds similar grants based on description text",
      async () => {
        const descriptionText = `Development of novel cancer immunotherapy approaches using
        checkpoint inhibitors and CAR-T cell engineering for solid tumors.`;

        const dsl = `search grants for similar_documents("${descriptionText.replace(/"/g, '\\"')}")
        where start_year >= 2020
        return grants[id+title+funder_org_name] limit 5`;

        const response = await client.rawQuery(dsl);

        console.log("similar_documents grants response:", JSON.stringify(response, null, 2));

        expect(response).toBeDefined();
        if ("grants" in response) {
          expect(Array.isArray(response.grants)).toBe(true);
        }
      },
      TIMEOUT,
    );
  });

  describe("complex()", () => {
    it(
      "finds publications using proximity search",
      async () => {
        const dsl = `search publications for complex("CRISPR gene editing", 5) return publications[id+title] limit 5`;

        const response = await client.rawQuery(dsl);

        expect(response).toBeDefined();
        if ("publications" in response) {
          expect(Array.isArray(response.publications)).toBe(true);
          const pubs = response.publications as Array<{ id: string; title: string }>;
          expect(pubs.length).toBeGreaterThan(0);
          expect(pubs.length).toBeLessThanOrEqual(5);

          for (const pub of pubs) {
            expect(pub.id).toBeDefined();
            expect(pub.title).toBeDefined();
          }
        }
      },
      TIMEOUT,
    );
  });

  describe("min_should_match()", () => {
    it(
      "finds publications matching minimum terms",
      async () => {
        const dsl = `search publications for min_should_match("quantum optical networking", 2) return publications[id+title] limit 5`;

        const response = await client.rawQuery(dsl);

        expect(response).toBeDefined();
        if ("publications" in response) {
          expect(Array.isArray(response.publications)).toBe(true);
          const pubs = response.publications as Array<{ id: string; title: string }>;
          expect(pubs.length).toBeLessThanOrEqual(5);
        }
      },
      TIMEOUT,
    );
  });

  describe("classify()", () => {
    it(
      "classifies text using FOR (Fields of Research) system",
      async () => {
        const dsl = `classify(
        title="Burnout and intentions to quit the nursing profession",
        abstract="BACKGROUND: Burnout is an occupational disease that affects healthcare workers. This study examines the relationship between burnout and turnover intentions among nurses.",
        system="FOR"
      )`;

        const response = await client.rawQuery(dsl);

        console.log("classify FOR response:", JSON.stringify(response, null, 2));

        expect(response).toBeDefined();
        // Expected structure: array of classification codes with scores
      },
      TIMEOUT,
    );

    it(
      "classifies text using SDG (Sustainable Development Goals) system",
      async () => {
        const dsl = `classify(
        title="Climate change impacts on coastal communities",
        abstract="This study examines the effects of rising sea levels and extreme weather events on vulnerable coastal populations in developing nations.",
        system="SDG"
      )`;

        const response = await client.rawQuery(dsl);

        console.log("classify SDG response:", JSON.stringify(response, null, 2));

        expect(response).toBeDefined();
      },
      TIMEOUT,
    );

    it(
      "classifies text using RCDC system",
      async () => {
        const dsl = `classify(
        title="Novel therapeutic targets for Alzheimer's disease",
        abstract="This research investigates the role of tau protein aggregation in neurodegeneration and identifies potential drug targets for treating Alzheimer's disease.",
        system="RCDC"
      )`;

        const response = await client.rawQuery(dsl);

        console.log("classify RCDC response:", JSON.stringify(response, null, 2));

        expect(response).toBeDefined();
      },
      TIMEOUT,
    );
  });

  describe("extract_concepts()", () => {
    it(
      "extracts concepts from abstract text",
      async () => {
        const abstractText = `After spinal cord injury, macrophages infiltrate the lesion site
        and contribute to both tissue damage and repair. M1 macrophages promote inflammation
        while M2 macrophages support tissue regeneration and axon regrowth.`;

        const dsl = `extract_concepts("${abstractText.replace(/"/g, '\\"').replace(/\n/g, " ")}")`;

        const response = await client.rawQuery(dsl);

        console.log("extract_concepts response:", JSON.stringify(response, null, 2));

        expect(response).toBeDefined();
        // Expected: array of concept strings
      },
      TIMEOUT,
    );

    it(
      "extracts concepts with scores",
      async () => {
        const abstractText = `Machine learning algorithms including neural networks and
        deep learning architectures are revolutionizing drug discovery and precision medicine.`;

        // Try without text= named parameter - just positional
        const dsl = `extract_concepts("${abstractText.replace(/"/g, '\\"').replace(/\n/g, " ")}", return_scores=true)`;

        const response = await client.rawQuery(dsl);

        console.log("extract_concepts with scores response:", JSON.stringify(response, null, 2));

        expect(response).toBeDefined();
        // Expected: array of concepts with relevance scores
      },
      TIMEOUT,
    );
  });
});
