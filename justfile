set positional-arguments

default:
    @just --list

build:
    pnpm run build

test:
    pnpm exec tsc --build
    pnpm run test

coverage:
    pnpm run test:coverage

integration-test:
    pnpm exec vitest run --config vitest.integration.config.ts

mcp-smoke *args:
    node --import tsx apps/mcp/test/integration/run.ts {{args}}

hosted-smoke *args:
    node --import tsx apps/mcp/test/integration/hosted-run.ts {{args}}

test-watch:
    pnpm run test:watch

typecheck:
    pnpm run typecheck

lint:
    pnpm run lint

lint-fix:
    pnpm run lint:fix

format:
    pnpm run format

ci: typecheck lint test

clean:
    rm -rf apps/*/dist dist

rebuild: clean build
