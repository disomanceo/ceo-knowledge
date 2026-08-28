import { describe, expect, it } from 'vitest';
import { isRemoteSafeTool, normalizeSearchTokens, REMOTE_SAFE_TOOLS } from '../src/index';

describe('shared contracts', () => {
  it('does not expose raw shell/process mutation tools remotely', () => {
    expect(REMOTE_SAFE_TOOLS).not.toContain('process.run' as never);
    expect(REMOTE_SAFE_TOOLS).not.toContain('shell.execute' as never);
    expect(isRemoteSafeTool('runtime.status')).toBe(true);
    expect(isRemoteSafeTool('knowledge.semantic_search')).toBe(true);
    expect(isRemoteSafeTool('knowledge.graph')).toBe(true);
    expect(isRemoteSafeTool('knowledge.sources')).toBe(true);
    expect(isRemoteSafeTool('knowledge.ingest_file')).toBe(false);
    expect(isRemoteSafeTool('process.run')).toBe(false);
  });

  it('normalizes and deduplicates search tokens', () => {
    expect(normalizeSearchTokens('Ceo   Ceo Knowledge, Runtime')).toEqual(['ceo','knowledge','runtime']);
  });
});
