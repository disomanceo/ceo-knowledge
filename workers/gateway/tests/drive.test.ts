import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CeoDriveFile } from '@ceo-knowledge/shared';
import { ceoDriveConfig, ceoDriveFiles, ceoDriveImport, ceoDrivePreview, chunkCeoDriveText, driveImportMode, driveProviderToken } from '../src/drive';

describe('Ceo Drive V1', () => {
  afterEach(()=>vi.unstubAllGlobals());

  it('classifies supported and runtime-required Drive file types', () => {
    expect(driveImportMode('application/vnd.google-apps.folder')).toBe('folder');
    expect(driveImportMode('application/vnd.google-apps.document')).toBe('cloud-text');
    expect(driveImportMode('application/vnd.google-apps.spreadsheet')).toBe('cloud-text');
    expect(driveImportMode('application/vnd.google-apps.presentation')).toBe('cloud-text');
    expect(driveImportMode('text/markdown')).toBe('cloud-text');
    expect(driveImportMode('application/pdf')).toBe('runtime-required');
    expect(driveImportMode('image/png')).toBe('unsupported');
  });

  it('requires an ephemeral provider token header', () => {
    expect(() => driveProviderToken(new Request('https://example.test'))).toThrow(/DRIVE_CONNECT_REQUIRED/);
    expect(() => driveProviderToken(new Request('https://example.test',{headers:{'x-ceo-drive-token':'short'}}))).toThrow(/DRIVE_TOKEN_INVALID/);
    expect(driveProviderToken(new Request('https://example.test',{headers:{'x-ceo-drive-token':'token-abcdefghijklmnopqrstuvwxyz'}}))).toBe('token-abcdefghijklmnopqrstuvwxyz');
  });

  it('reports whether Supabase Google OAuth provider is enabled', async () => {
    const env:any={SUPABASE_URL:'https://project.supabase.co',SUPABASE_ANON_KEY:'public'};
    const yes=await ceoDriveConfig(env,async()=>new Response(JSON.stringify({external:{google:true}}),{status:200}) as any);
    const no=await ceoDriveConfig(env,async()=>new Response(JSON.stringify({external:{google:false}}),{status:200}) as any);
    expect(yes.enabled).toBe(true);
    expect(yes.tokenPersistence).toBe('browser-session-only');
    expect(no.enabled).toBe(false);
  });

  it('lists Drive files and normalizes import modes', async () => {
    const mockFetch=async(url:any)=>{
      expect(String(url)).toContain('/drive/v3/files?');
      return new Response(JSON.stringify({files:[
        {id:'folder123',name:'Folder',mimeType:'application/vnd.google-apps.folder',capabilities:{canDownload:true}},
        {id:'doc12345',name:'Doc',mimeType:'application/vnd.google-apps.document',modifiedTime:'2026-08-28T00:00:00Z',capabilities:{canDownload:true}},
        {id:'pdf12345',name:'PDF',mimeType:'application/pdf',size:'2048',capabilities:{canDownload:true}},
      ],nextPageToken:'next'}),{status:200,headers:{'content-type':'application/json'}}) as any;
    };
    const result=await ceoDriveFiles('token-abcdefghijklmnopqrstuvwxyz',{q:'Doc',pageSize:20},mockFetch as any);
    expect(result.nextPageToken).toBe('next');
    expect(result.files.map((file:CeoDriveFile)=>file.importMode)).toEqual(['folder','cloud-text','runtime-required']);
    expect(result.files[2]?.size).toBe(2048);
  });

  it('exports Google Docs as Markdown for preview', async () => {
    const calls:string[]=[];
    const mockFetch=async(url:any)=>{
      calls.push(String(url));
      if(calls.length===1)return new Response(JSON.stringify({id:'doc12345',name:'Policy',mimeType:'application/vnd.google-apps.document',webViewLink:'https://docs.google.com/document/d/doc12345',capabilities:{canDownload:true}}),{status:200,headers:{'content-type':'application/json'}}) as any;
      return new Response('# Policy\n\nKeep source files controlled.',{status:200,headers:{'content-type':'text/markdown'}}) as any;
    };
    const preview=await ceoDrivePreview('token-abcdefghijklmnopqrstuvwxyz','doc12345',mockFetch as any);
    expect(preview.importable).toBe(true);
    expect(preview.exportMimeType).toBe('text/markdown');
    expect(preview.content).toContain('Keep source files controlled');
    expect(calls[1]).toContain('/export?mimeType=text%2Fmarkdown');
  });

  it('does not pretend PDF can be parsed by the Worker', async () => {
    const mockFetch=async()=>new Response(JSON.stringify({id:'pdf12345',name:'Report.pdf',mimeType:'application/pdf',capabilities:{canDownload:true}}),{status:200,headers:{'content-type':'application/json'}}) as any;
    const preview=await ceoDrivePreview('token-abcdefghijklmnopqrstuvwxyz','pdf12345',mockFetch as any);
    expect(preview.importable).toBe(false);
    expect(preview.reason).toBe('RUNTIME_IMPORT_REQUIRED');
  });

  it('imports supported Drive text through source, ingest, knowledge and chunk records without service-role storage', async () => {
    const env:any={SUPABASE_URL:'https://project.supabase.co',SUPABASE_ANON_KEY:'public'};
    let chunkCounter=0;
    const supabaseCalls:Array<{url:string;method:string;body:any}>=[];
    vi.stubGlobal('fetch',async(input:any,init:any={})=>{
      const url=String(input);const method=String(init?.method||'GET').toUpperCase();let body:any=null;try{body=init?.body?JSON.parse(String(init.body)):null}catch{}
      supabaseCalls.push({url,method,body});
      if(url.includes('/rest/v1/sources?')&&method==='GET')return new Response('[]',{status:200});
      if(url.endsWith('/rest/v1/sources?select=*')&&method==='POST')return new Response(JSON.stringify([{id:'source-1',...body}]),{status:201});
      if(url.endsWith('/rest/v1/ingest_runs?select=*')&&method==='POST')return new Response(JSON.stringify([{id:'run-1',...body}]),{status:201});
      if(url.includes('/rest/v1/knowledge_entries?')&&method==='POST')return new Response(JSON.stringify([{id:'knowledge-1',...body}]),{status:201});
      if(url.includes('/rest/v1/knowledge_chunks?')&&method==='POST'){chunkCounter+=1;return new Response(JSON.stringify([{id:'chunk-'+chunkCounter,...body}]),{status:201});}
      if(url.includes('/rest/v1/knowledge_chunks?')&&method==='PATCH')return new Response('[]',{status:200});
      if(url.includes('/rest/v1/ingest_runs?')&&method==='PATCH')return new Response(JSON.stringify([{id:'run-1',...body}]),{status:200});
      throw new Error('unexpected Supabase request '+method+' '+url);
    });
    const driveFetch=async(url:any)=>{
      const target=String(url);
      if(target.includes('/files/doc12345?'))return new Response(JSON.stringify({id:'doc12345',name:'School Plan',mimeType:'application/vnd.google-apps.document',modifiedTime:'2026-08-28T00:00:00Z',webViewLink:'https://docs.google.com/document/d/doc12345',capabilities:{canDownload:true}}),{status:200});
      if(target.includes('/files/doc12345/export?'))return new Response('# School Plan\n\nCeo Drive import test content. '.repeat(120),{status:200});
      throw new Error('unexpected Google request '+target);
    };
    const result=await ceoDriveImport(env,'user-jwt','token-abcdefghijklmnopqrstuvwxyz','doc12345',driveFetch as any);
    expect(result.sourceId).toBe('source-1');
    expect(result.knowledgeId).toBe('knowledge-1');
    expect(result.ingestRunId).toBe('run-1');
    expect(result.chunks).toBeGreaterThan(1);
    expect(chunkCounter).toBe(result.chunks);
    const sourcePost=supabaseCalls.find(call=>call.method==='POST'&&call.url.endsWith('/rest/v1/sources?select=*'));
    expect(sourcePost?.body.external_provider).toBe('ceo-drive-google');
    expect(sourcePost?.body.external_id).toBe('doc12345');
    expect(supabaseCalls.some(call=>call.method==='POST'&&call.url.includes('/knowledge_entries?'))).toBe(true);
    expect(supabaseCalls.some(call=>call.method==='PATCH'&&call.url.includes('/ingest_runs?')&&call.body?.status==='completed')).toBe(true);
  });

  it('chunks bounded text deterministically for cloud import', () => {
    const text=('alpha '.repeat(700)+'\n\n'+'beta '.repeat(700)).trim();
    const chunks=chunkCeoDriveText(text,1200,120);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every(chunk=>chunk.length<=1200)).toBe(true);
    expect(new Set(chunks).size).toBe(chunks.length);
  });
});
