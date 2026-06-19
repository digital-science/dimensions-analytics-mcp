import { describe, expect, it } from "vitest";
import {
  AuthenticationError,
  assertNever,
  DimensionsError,
  isDimensionsError,
  isNotFoundError,
  isUnprocessableEntityError,
  NetworkError,
  NotFoundError,
  QuerySyntaxError,
  RateLimitError,
  ServerError,
  sanitizeErrorMessage,
  TimeoutError,
  UnprocessableEntityError,
  ValidationError,
} from "../../../src/client/errors.js";

describe("Error Classes", () => {
  describe("DimensionsError", () => {
    it("has name and message", () => {
      const error = new DimensionsError("test message");
      expect(error.name).toBe("DimensionsError");
      expect(error.message).toBe("test message");
      expect(error instanceof Error).toBe(true);
    });

    it("accepts optional statusCode", () => {
      const error = new DimensionsError("test", 500);
      expect(error.statusCode).toBe(500);
    });

    it("serializes to JSON", () => {
      const error = new DimensionsError("test", 400);
      expect(error.toJSON()).toEqual({
        name: "DimensionsError",
        message: "test",
        statusCode: 400,
      });
    });
  });

  describe("AuthenticationError", () => {
    it("has statusCode 401", () => {
      const error = new AuthenticationError("Invalid API key");
      expect(error.name).toBe("AuthenticationError");
      expect(error.statusCode).toBe(401);
    });

    it("uses default message", () => {
      const error = new AuthenticationError();
      expect(error.message).toBe("Authentication failed");
    });

    it("is instanceof DimensionsError", () => {
      const error = new AuthenticationError();
      expect(error instanceof DimensionsError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });
  });

  describe("RateLimitError", () => {
    it("has statusCode 429 and retryAfter", () => {
      const error = new RateLimitError("Too many requests", 60);
      expect(error.name).toBe("RateLimitError");
      expect(error.statusCode).toBe(429);
      expect(error.retryAfter).toBe(60);
    });

    it("uses default message", () => {
      const error = new RateLimitError();
      expect(error.message).toBe("Rate limit exceeded");
    });

    it("serializes client rate-limit info to JSON", () => {
      const error = new RateLimitError("test", 3, {
        remaining: 0,
        retryAfterMs: 2050,
      });
      expect(error.toJSON()).toEqual({
        name: "RateLimitError",
        message: "test",
        statusCode: 429,
        retryAfter: 3,
        clientRateLimit: {
          remaining: 0,
          retryAfterMs: 2050,
        },
      });
    });

    it("is instanceof DimensionsError", () => {
      const error = new RateLimitError();
      expect(error instanceof DimensionsError).toBe(true);
    });
  });

  describe("ValidationError", () => {
    it("has statusCode 400 and details", () => {
      const error = new ValidationError("Invalid input", { field: "query" });
      expect(error.name).toBe("ValidationError");
      expect(error.statusCode).toBe(400);
      expect(error.details).toEqual({ field: "query" });
    });

    it("serializes details to JSON", () => {
      const error = new ValidationError("Invalid input", { field: "query" });
      expect(error.toJSON()).toEqual({
        name: "ValidationError",
        message: "Invalid input",
        statusCode: 400,
        details: { field: "query" },
      });
    });

    it("is instanceof DimensionsError", () => {
      const error = new ValidationError("test");
      expect(error instanceof DimensionsError).toBe(true);
    });
  });

  describe("QuerySyntaxError", () => {
    it("has statusCode 400", () => {
      const error = new QuerySyntaxError("Invalid query syntax");
      expect(error.name).toBe("QuerySyntaxError");
      expect(error.statusCode).toBe(400);
    });

    it("is instanceof DimensionsError", () => {
      const error = new QuerySyntaxError("test");
      expect(error instanceof DimensionsError).toBe(true);
    });
  });

  describe("NetworkError", () => {
    it("has no statusCode", () => {
      const error = new NetworkError("Connection refused");
      expect(error.name).toBe("NetworkError");
      expect(error.statusCode).toBeUndefined();
    });

    it("uses default message", () => {
      const error = new NetworkError();
      expect(error.message).toBe("Network error");
    });

    it("is instanceof DimensionsError", () => {
      const error = new NetworkError();
      expect(error instanceof DimensionsError).toBe(true);
    });
  });

  describe("TimeoutError", () => {
    it("has no statusCode", () => {
      const error = new TimeoutError("Request timed out after 30s");
      expect(error.name).toBe("TimeoutError");
      expect(error.statusCode).toBeUndefined();
    });

    it("uses default message", () => {
      const error = new TimeoutError();
      expect(error.message).toBe("Request timeout");
    });

    it("is instanceof DimensionsError", () => {
      const error = new TimeoutError();
      expect(error instanceof DimensionsError).toBe(true);
    });
  });

  describe("ServerError", () => {
    it("has default statusCode 500", () => {
      const error = new ServerError();
      expect(error.name).toBe("ServerError");
      expect(error.statusCode).toBe(500);
      expect(error.message).toBe("Server error");
    });

    it("accepts custom statusCode", () => {
      const error = new ServerError("Bad Gateway", 502);
      expect(error.statusCode).toBe(502);
      expect(error.message).toBe("Bad Gateway");
    });

    it("is instanceof DimensionsError", () => {
      const error = new ServerError();
      expect(error instanceof DimensionsError).toBe(true);
    });

    it("accepts valid 5xx status codes", () => {
      expect(new ServerError("msg", 500).statusCode).toBe(500);
      expect(new ServerError("msg", 502).statusCode).toBe(502);
      expect(new ServerError("msg", 599).statusCode).toBe(599);
    });

    it("rejects non-5xx status codes", () => {
      expect(() => new ServerError("msg", 400)).toThrow(TypeError);
      expect(() => new ServerError("msg", 200)).toThrow(TypeError);
      expect(() => new ServerError("msg", 600)).toThrow(TypeError);
    });

    it("rejects non-integer status codes", () => {
      expect(() => new ServerError("msg", 500.5)).toThrow(TypeError);
    });
  });

  describe("NotFoundError", () => {
    it("has statusCode 404", () => {
      const error = new NotFoundError("Entity not found");
      expect(error.name).toBe("NotFoundError");
      expect(error.statusCode).toBe(404);
    });

    it("uses default message", () => {
      const error = new NotFoundError();
      expect(error.message).toBe("Resource not found");
    });

    it("is instanceof DimensionsError", () => {
      const error = new NotFoundError();
      expect(error instanceof DimensionsError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });
  });

  describe("UnprocessableEntityError", () => {
    it("has statusCode 422 and details", () => {
      const error = new UnprocessableEntityError("Invalid data", {
        field: "name",
      });
      expect(error.name).toBe("UnprocessableEntityError");
      expect(error.statusCode).toBe(422);
      expect(error.details).toEqual({ field: "name" });
    });

    it("serializes details to JSON", () => {
      const error = new UnprocessableEntityError("Invalid data", {
        field: "name",
      });
      expect(error.toJSON()).toEqual({
        name: "UnprocessableEntityError",
        message: "Invalid data",
        statusCode: 422,
        details: { field: "name" },
      });
    });

    it("works without details", () => {
      const error = new UnprocessableEntityError("Invalid data");
      expect(error.details).toBeUndefined();
      expect(error.toJSON()).toEqual({
        name: "UnprocessableEntityError",
        message: "Invalid data",
        statusCode: 422,
        details: undefined,
      });
    });

    it("is instanceof DimensionsError", () => {
      const error = new UnprocessableEntityError("test");
      expect(error instanceof DimensionsError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });
  });

  describe("Type Guards", () => {
    it("isDimensionsError returns true for DimensionsError", () => {
      expect(isDimensionsError(new DimensionsError("test"))).toBe(true);
      expect(isDimensionsError(new NotFoundError())).toBe(true);
      expect(isDimensionsError(new AuthenticationError())).toBe(true);
    });

    it("isDimensionsError returns false for non-DimensionsError", () => {
      expect(isDimensionsError(new Error("test"))).toBe(false);
      expect(isDimensionsError("not an error")).toBe(false);
      expect(isDimensionsError(null)).toBe(false);
      expect(isDimensionsError(undefined)).toBe(false);
    });

    it("isNotFoundError returns true only for NotFoundError", () => {
      expect(isNotFoundError(new NotFoundError())).toBe(true);
      expect(isNotFoundError(new DimensionsError("test", 404))).toBe(false);
      expect(isNotFoundError(new Error("test"))).toBe(false);
    });

    it("isUnprocessableEntityError returns true only for UnprocessableEntityError", () => {
      expect(isUnprocessableEntityError(new UnprocessableEntityError("test"))).toBe(true);
      expect(isUnprocessableEntityError(new DimensionsError("test", 422))).toBe(false);
      expect(isUnprocessableEntityError(new Error("test"))).toBe(false);
    });
  });

  describe("assertNever", () => {
    it("throws error with default message", () => {
      const value = "unexpected" as never;
      expect(() => {
        // @ts-expect-error - Testing runtime behavior with invalid type
        assertNever(value);
      }).toThrow('Unexpected value: "unexpected"');
    });

    it("throws error with custom message", () => {
      const value = 123 as never;
      expect(() => {
        // @ts-expect-error - Testing runtime behavior with invalid type
        assertNever(value, "Custom error message");
      }).toThrow("Custom error message");
    });

    it("handles objects in error message", () => {
      const value = { type: "unknown", data: 42 } as never;
      expect(() => {
        // @ts-expect-error - Testing runtime behavior with invalid type
        assertNever(value);
      }).toThrow('Unexpected value: {"type":"unknown","data":42}');
    });

    it("is used for exhaustive type checking in switches", () => {
      type Status = "success" | "error";

      function handleStatus(status: Status): string {
        switch (status) {
          case "success":
            return "OK";
          case "error":
            return "Failed";
          default:
            return assertNever(status, `Unhandled status: ${status}`);
        }
      }

      expect(handleStatus("success")).toBe("OK");
      expect(handleStatus("error")).toBe("Failed");

      // This would fail at compile time with proper typing
      // but we test runtime behavior
      const unknownStatus = "pending" as Status;
      expect(() => handleStatus(unknownStatus)).toThrow();
    });
  });

  describe("sanitizeErrorMessage", () => {
    it("returns .message for Error instances", () => {
      expect(sanitizeErrorMessage(new Error("something broke"))).toBe("something broke");
    });

    it("never includes stack trace", () => {
      const err = new Error("fail");
      err.stack = "Error: fail\n    at Object.<anonymous> (/app/src/index.ts:10:5)";
      const result = sanitizeErrorMessage(err);
      expect(result).not.toContain("at Object");
      expect(result).not.toContain("index.ts");
    });

    it('returns "Unknown error" for non-Error values', () => {
      expect(sanitizeErrorMessage("a string")).toBe("Unknown error");
      expect(sanitizeErrorMessage(42)).toBe("Unknown error");
      expect(sanitizeErrorMessage(null)).toBe("Unknown error");
      expect(sanitizeErrorMessage(undefined)).toBe("Unknown error");
      expect(sanitizeErrorMessage({ key: "val" })).toBe("Unknown error");
    });

    it("redacts password= patterns", () => {
      expect(sanitizeErrorMessage(new Error("password=secret123 in config"))).toBe(
        "[redacted] in config",
      );
    });

    it("redacts api_key= and apiKey: patterns", () => {
      expect(sanitizeErrorMessage(new Error("api_key=abc123"))).toBe("[redacted]");
      expect(sanitizeErrorMessage(new Error("apiKey: xyz789"))).toBe("[redacted]");
      expect(sanitizeErrorMessage(new Error("apikey=test"))).toBe("[redacted]");
    });

    it("redacts token= patterns", () => {
      expect(sanitizeErrorMessage(new Error("token=eyJhbGciOi"))).toBe("[redacted]");
    });

    it("redacts Bearer tokens", () => {
      expect(sanitizeErrorMessage(new Error("Authorization: Bearer eyJhbGciOiJIUz"))).toBe(
        "Authorization: Bearer [redacted]",
      );
    });

    it("redacts URL credentials", () => {
      const msg = sanitizeErrorMessage(
        new Error("Failed to connect to https://admin:p4ssw0rd@db.example.com:5432"),
      );
      expect(msg).not.toContain("p4ssw0rd");
      expect(msg).not.toContain("admin");
      expect(msg).toContain("[redacted]");
      expect(msg).toContain("db.example.com");
    });

    it("redacts secret= patterns", () => {
      expect(sanitizeErrorMessage(new Error("secret=mysecretvalue"))).toBe("[redacted]");
    });

    it("preserves messages without credentials", () => {
      expect(sanitizeErrorMessage(new Error("Connection refused"))).toBe("Connection refused");
    });

    it("handles empty Error message", () => {
      expect(sanitizeErrorMessage(new Error(""))).toBe("");
    });
  });
});
