import { describe, expect, it } from 'vitest';
import { detailCheckWorkflowId, isStandaloneWorkflowId, quickCheckIdFromWorkflow, quickCheckWorkflowId, workflowIdForRequest } from './workflow';

const STANDALONE = 'detail-check:0b8e3f0e-5f0a-4c1e-9a55-2b6b0a3c9d11';

describe('detail-check workflow ids', () => {
  it('keys a detail check started from an Ersteinschätzung by its quick check', () => {
    expect(quickCheckWorkflowId(42)).toBe('quick-check:42');
    expect(detailCheckWorkflowId('42', null)).toBe('quick-check:42');
  });

  it('uses the standalone workflow id when there is no quick check', () => {
    expect(detailCheckWorkflowId(null, STANDALONE)).toBe(STANDALONE);
  });

  it('prefers the quick check when both are present, like the server does', () => {
    expect(detailCheckWorkflowId('42', STANDALONE)).toBe('quick-check:42');
  });

  it('has no workflow before the first save of a new detail check', () => {
    expect(detailCheckWorkflowId(null, null)).toBeNull();
    expect(detailCheckWorkflowId(null, '')).toBeNull();
  });

  it('reads the quick check back out of a quick-check workflow only', () => {
    expect(quickCheckIdFromWorkflow('quick-check:42')).toBe(42);
    expect(quickCheckIdFromWorkflow(STANDALONE)).toBeNull();
    expect(quickCheckIdFromWorkflow('quick-check:42; DROP TABLE document')).toBeNull();
  });

  describe('workflowIdForRequest (server side)', () => {
    const USER = '00000000-0000-4000-8000-000000000001';

    it('resolves a quick check, a standalone workflow and the draft', () => {
      expect(workflowIdForRequest(USER, '42', null)).toBe('quick-check:42');
      expect(workflowIdForRequest(USER, null, STANDALONE)).toBe(STANDALONE);
      expect(workflowIdForRequest(USER, null, 'detail-check:test-5-complete')).toBe('detail-check:test-5-complete');
      expect(workflowIdForRequest(USER, null, `user:${USER}:draft`)).toBe(`user:${USER}:draft`);
    });

    it('uses the draft only when no id was asked for at all', () => {
      expect(workflowIdForRequest(USER, null, null)).toBe(`user:${USER}:draft`);
    });

    it('rejects malformed ids instead of silently falling back to the draft', () => {
      expect(workflowIdForRequest(USER, null, 'detail-check:a b')).toBeNull();
      expect(workflowIdForRequest(USER, null, 'quick-check:42')).toBeNull();
      expect(workflowIdForRequest(USER, null, 'user:someone-else:draft')).toBeNull();
      expect(workflowIdForRequest(USER, 'abc', null)).toBeNull();
    });
  });

  it('recognises standalone ids — minted UUIDs and other safe ids alike', () => {
    expect(isStandaloneWorkflowId(STANDALONE)).toBe(true);
    // Seeded / imported detail checks don't carry a UUID and must still open.
    expect(isStandaloneWorkflowId('detail-check:test-5-complete')).toBe(true);
    expect(isStandaloneWorkflowId('quick-check:42')).toBe(false);
    expect(isStandaloneWorkflowId('detail-check:')).toBe(false);
    expect(isStandaloneWorkflowId('detail-check:a b')).toBe(false);
    expect(isStandaloneWorkflowId("detail-check:x';--")).toBe(false);
    expect(isStandaloneWorkflowId(`detail-check:${'a'.repeat(65)}`)).toBe(false);
  });
});
