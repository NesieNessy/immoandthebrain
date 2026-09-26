import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// There is no middleware in this app: every API route is responsible for its own
// auth check by calling `requireUserId` from '@/lib/server/auth'. If a new route
// handler forgets that call, nothing else stops it from leaking data — this test
// is the only safety net, so it must fail loudly when a handler is unprotected.

const API_DIR = fileURLToPath(new URL('.', import.meta.url));

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

// Files that intentionally do not call requireUserId, each with a documented reason.
const ALLOWLIST: Record<string, string> = {
  'address/postal-code/route.ts':
    'proxies the public openplzapi.org postal-code lookup; returns no data of this application and touches no database.',
  'reference/city-price-split/route.ts':
    'reads the shared reference table city_purchase_price_split (generic building/land split percentages); contains no user data.',
};

function findRouteFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findRouteFiles(fullPath));
    } else if (entry.isFile() && entry.name === 'route.ts') {
      results.push(fullPath);
    }
  }
  return results;
}

function toPosixRelative(absolutePath: string): string {
  return relative(API_DIR, absolutePath).split(sep).join('/');
}

// Pure helper: given a route.ts source string, returns the list of exported HTTP
// handler names that don't call requireUserId(. Kept pure and exported-shape-only
// so its detection logic can be unit-tested directly against synthetic sources.
function handlersWithoutAuth(source: string): string[] {
  // Find the start of every exported handler, in source order, then check the auth
  // call within the slice belonging to that handler only (up to the next handler,
  // or end of file). A file-wide substring check would wrongly pass an unprotected
  // handler that merely sits next to a protected one in the same file.
  const starts: { method: (typeof HTTP_METHODS)[number]; index: number }[] = [];
  for (const method of HTTP_METHODS) {
    const handlerPattern = new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b`, 'g');
    for (const match of source.matchAll(handlerPattern)) {
      starts.push({ method, index: match.index ?? 0 });
    }
  }
  starts.sort((a, b) => a.index - b.index);

  const missing: string[] = [];
  for (let i = 0; i < starts.length; i += 1) {
    const start = starts[i];
    const end = i + 1 < starts.length ? starts[i + 1].index : source.length;
    const body = source.slice(start.index, end);
    // requireUserId *returns* its 401 instead of throwing it, so calling it is
    // not enough — the handler must also return that response. TypeScript
    // can't catch a forgotten guard: the unchecked Response would just be
    // passed into the SQL parameters as the user id.
    if (!body.includes('requireUserId(') || !/instanceof Response\) return \w+;/.test(body)) {
      missing.push(start.method);
    }
  }
  return missing;
}

const routeFiles = findRouteFiles(API_DIR);

describe('API route auth coverage', () => {
  it('discovers a sane number of route files (guards against a broken directory walk)', () => {
    expect(routeFiles.length).toBeGreaterThanOrEqual(25);
  });

  it('every exported HTTP handler calls requireUserId, unless explicitly allowlisted', () => {
    const violations: string[] = [];

    for (const filePath of routeFiles) {
      const relativePath = toPosixRelative(filePath);
      if (relativePath in ALLOWLIST) continue;

      const source = readFileSync(filePath, 'utf-8');
      const missing = handlersWithoutAuth(source);
      for (const method of missing) {
        violations.push(`${relativePath}: ${method} does not call requireUserId(`);
      }
    }

    expect(violations, `Unauthenticated route handlers found:\n${violations.join('\n')}`).toEqual(
      [],
    );
  });

  it('keeps the allowlist honest: every entry must still exist and still lack requireUserId', () => {
    const stale: string[] = [];

    for (const relativePath of Object.keys(ALLOWLIST)) {
      const fullPath = join(API_DIR, relativePath);
      let source: string;
      try {
        source = readFileSync(fullPath, 'utf-8');
      } catch {
        stale.push(`${relativePath}: file no longer exists, remove it from the allowlist`);
        continue;
      }

      const missing = handlersWithoutAuth(source);
      if (missing.length === 0) {
        stale.push(
          `${relativePath}: now calls requireUserId( for all handlers, remove it from the allowlist`,
        );
      }
    }

    expect(stale, `Stale allowlist entries:\n${stale.join('\n')}`).toEqual([]);
  });

  describe('handlersWithoutAuth (unit tests on synthetic sources)', () => {
    it('finds no violations when the handler calls requireUserId and returns its error response', () => {
      const source = `
        export async function GET(request: Request) {
          const userId = await requireUserId(request);
          if (userId instanceof Response) return userId;
          return Response.json({ userId });
        }
      `;
      expect(handlersWithoutAuth(source)).toEqual([]);
    });

    it('flags a handler that calls requireUserId but ignores its 401 response', () => {
      const source = `
        export async function GET(request: Request) {
          const userId = await requireUserId(request);
          return Response.json({ userId });
        }
      `;
      expect(handlersWithoutAuth(source)).toEqual(['GET']);
    });

    it('flags a handler that never calls requireUserId', () => {
      const source = `
        export async function DELETE(request: Request) {
          return new Response(null, { status: 204 });
        }
      `;
      expect(handlersWithoutAuth(source)).toEqual(['DELETE']);
    });

    it('flags only the uncovered handler when one of two is protected', () => {
      const source = `
        export async function GET(request: Request) {
          const userId = await requireUserId(request);
          if (userId instanceof Response) return userId;
          return Response.json({ userId });
        }

        export async function POST(request: Request) {
          return new Response(null, { status: 201 });
        }
      `;
      expect(handlersWithoutAuth(source)).toEqual(['POST']);
    });
  });
});
