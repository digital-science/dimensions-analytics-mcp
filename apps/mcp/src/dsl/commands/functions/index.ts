/**
 * DSL special function commands for the Dimensions API.
 * Provides classify, extract_concepts, extract_affiliations, and extract_grants operations.
 * @module commands/functions
 */

export {
  ClassifyCommand,
  type ClassifyCommandInput,
  type ClassifyCommandParsedInput,
  ClassifyInputSchema,
} from "./ClassifyCommand.js";
export {
  ExtractAffiliationsCommand,
  type ExtractAffiliationsCommandInput,
  type ExtractAffiliationsCommandParsedInput,
  ExtractAffiliationsInputSchema,
} from "./ExtractAffiliationsCommand.js";
export {
  ExtractConceptsCommand,
  type ExtractConceptsCommandInput,
  type ExtractConceptsCommandParsedInput,
  ExtractConceptsInputSchema,
} from "./ExtractConceptsCommand.js";

export {
  ExtractGrantsCommand,
  type ExtractGrantsCommandInput,
  type ExtractGrantsCommandParsedInput,
  ExtractGrantsInputSchema,
} from "./ExtractGrantsCommand.js";
