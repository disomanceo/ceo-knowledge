import { describe, expect, it } from 'vitest';
import { assertRemoteTool, safeLimit, searchOr, sha256Hex } from '../src/security';


describe('gateway security', () => {
  it('allows only the bounded remote tool contract', () => {
    expect(() => assertRemoteTool('runtime.status')).not.toThrow();
    expect(() => assertRemoteTool('filesystem.read')).not.toThrow();
    expect(() => assertRemoteTool('process.run')).toThrow(/REMOTE_TOOL_NOT_ALLOWED/);
    expect(() => assertRemoteTool('shell.execute')).toThrow(/REMOTE_TOOL_NOT_ALLOWED/);
  });

  it('bounds list limits', () => {
    expect(safeLimit('500', 20, 100)).toBe(100);
    expect(safeLimit('-3', 20, 100)).toBe(1);
    expect(safeLimit('x', 20, 100)).toBe(20);
  });

  it('builds a tokenized PostgREST OR expression', () => {
    expect(searchOr(['title','content'], 'Knowledge Core Runtime')).toContain('title.ilike.*knowledge*');
    expect(searchOr(['title','content'], 'Knowledge Core Runtime')).toContain('content.ilike.*runtime*');
  });

  it('hashes pairing codes deterministically', async () => {
    const a = await sha256Hex('123456');
    const b = await sha256Hex('123456');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
