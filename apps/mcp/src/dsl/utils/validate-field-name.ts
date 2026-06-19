import { ValidationError } from "../../client/index.js";

/** Regex for valid DSL field names: letters, digits, underscores, dots. */
const FIELD_NAME_RE = /^[a-z_][a-z0-9_.]*$/i;

/**
 * Validates a DSL field name to prevent injection via field interpolation.
 * Valid names start with a letter or underscore and contain only letters,
 * digits, underscores, and dots (for nested fields like `authors.first_name`).
 *
 * @param field - The field name to validate
 * @returns void
 * @throws {ValidationError} If the field name contains invalid characters
 */
export function validateFieldName(field: string): void {
  if (!FIELD_NAME_RE.test(field)) {
    throw new ValidationError(`Invalid field name: ${field}`);
  }
}
