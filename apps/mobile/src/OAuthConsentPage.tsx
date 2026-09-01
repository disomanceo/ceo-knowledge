import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Brain, CheckCircle2, LogIn, ShieldCheck, XCircle } from 'lucide-react';
import { supabase } from './supabase';

type AuthorizationDetails = {
  authorization_id: string;
  redirect_uri: string;
  scope: string;
  client: { id: string; name: string; uri?: string; logo_uri?: string };
  user: { id: string; email?: string };
};

type Props = {
  session: Session | null;
  onSessionReady: (session: Session | null) => void;
};

const scopeLabel = (scope: string) => {
  if (scope === 'email') return 'ยืนยันอีเมลของบัญชี Ceo เพื่อจับคู่กับเครื่อง';
  if (scope === 'profile') return 'ข้อมูลโปรไฟล์พื้นฐาน';
  if (scope === 'openid') return 'ยืนยันตัวตนของบัญชี Ceo';
  if (scope === 'offline_access') return 'อนุญาตให้แอปต่ออายุการเชื่อมต่อโดยไม่ต้องเข้าสู่ระบบใหม่ทุกครั้ง';
  return scope;
};

export default function OAuthConsentPage({ session, onSessionReady }: Props) {
  const authorizationId = useMemo(
    () => new URLSearchParams(window.location.search).get('authorization_id')?.trim() || '',
    [],
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [loading, setLoading] = useState(Boolean(session && authorizationId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function loadDetails() {
      if (!authorizationId) {
        if (!cancelled) {
          setError('ไม่พบ authorization_id กรุณาเริ่มเชื่อมต่อใหม่จากแอป');
          setLoading(false);
        }
        return;
      }
      if (!session) {
        if (!cancelled) setLoading(false);
        return;
      }
      if (!cancelled) {
        setLoading(true);
        setError('');
      }
      try {
        const result = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
        if (result.error) throw result.error;
        if (!result.data) throw new Error('ไม่พบรายละเอียดคำขอ OAuth');
        if ('redirect_url' in result.data && result.data.redirect_url) {
          window.location.assign(result.data.redirect_url);
          return;
        }
        if (!cancelled) setDetails(result.data as AuthorizationDetails);
      } catch (e: any) {
        if (!cancelled) {
          setDetails(null);
          setError(String(e?.message || e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadDetails();
    return () => { cancelled = true; };
  }, [authorizationId, session?.access_token]);

  async function login() {
    if (!authorizationId || !email.trim() || !password || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw result.error;
      onSessionReady(result.data.session);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function decide(approved: boolean) {
    if (!authorizationId || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = approved
        ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
        : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
      if (result.error) throw result.error;
      const redirectUrl = String(result.data?.redirect_url || '').trim();
      if (!redirectUrl) throw new Error('OAuth ไม่ได้ส่ง redirect_url กลับมา');
      window.location.assign(redirectUrl);
    } catch (e: any) {
      setError(String(e?.message || e));
      setBusy(false);
    }
  }

  if (!session) {
    return <main className="min-h-screen px-5 py-10 flex items-center justify-center">
      <section className="w-full max-w-md card p-6 oauth-card">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-[#f4c95d] text-black grid place-items-center"><Brain /></div>
          <div><h1 className="text-2xl font-bold">Connect App to Ceo</h1><p className="muted text-sm">OAuth 2.1 Authorization</p></div>
        </div>
        <div className="oauth-security-note mb-4"><ShieldCheck size={18}/><span>ใช้บัญชี Ceo เดียวกับข้อมูลและอุปกรณ์ที่ต้องการเข้าถึง</span></div>
        {!authorizationId && <div className="oauth-error mb-3">ไม่พบ authorization_id กรุณาเริ่มเชื่อมต่อใหม่จากแอป</div>}
        <div className="space-y-3">
          <input className="input" value={email} onChange={e=>setEmail(e.target.value)} placeholder="อีเมล Ceo" type="email" autoComplete="email" />
          <input className="input" value={password} onChange={e=>setPassword(e.target.value)} placeholder="รหัสผ่าน" type="password" autoComplete="current-password" onKeyDown={e=>e.key==='Enter'&&void login()} />
          {error && <div className="oauth-error">{error}</div>}
          <button className="btn btn-primary w-full flex items-center justify-center gap-2" disabled={busy||!authorizationId||!email.trim()||!password} onClick={()=>void login()}>
            <LogIn size={18}/>{busy?'กำลังเข้าสู่ระบบ…':'เข้าสู่ระบบและตรวจสอบสิทธิ์'}
          </button>
        </div>
      </section>
    </main>;
  }

  return <main className="min-h-screen px-5 py-10 flex items-center justify-center">
    <section className="w-full max-w-lg card p-6 oauth-card">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-[#f4c95d] text-black grid place-items-center"><Brain /></div>
        <div><h1 className="text-2xl font-bold">อนุญาตแอปเชื่อมต่อ Ceo</h1><p className="muted text-sm">Ceo Cloud / Remote MCP · OAuth 2.1 + PKCE</p></div>
      </div>
      {loading && <div className="oauth-loading">กำลังตรวจสอบคำขอ OAuth…</div>}
      {!loading && error && <div className="oauth-error mb-4">{error}</div>}
      {!loading && details && <>
        <div className="oauth-client mb-4">
          <div className="text-xs muted mb-1">แอปที่ขอเชื่อมต่อ</div>
          <div className="text-xl font-bold">{details.client.name || 'MCP Client'}</div>
          {details.client.uri && <div className="text-xs muted mt-1 break-all">{details.client.uri}</div>}
        </div>
        <div className="oauth-security-note mb-4"><ShieldCheck size={18}/><span>แอปที่ได้รับอนุญาตจะเรียกเฉพาะ Ceo Tools ตามสิทธิ์ของบัญชีนี้ และข้อมูลยังถูกจำกัดด้วย RLS / Security Guard</span></div>
        <div className="mb-5">
          <div className="font-semibold mb-2">สิทธิ์ที่ขอ</div>
          <div className="space-y-2">
            {details.scope.split(/\s+/).filter(Boolean).map(scope=><div key={scope} className="oauth-scope">
              <CheckCircle2 size={17}/><div><div className="font-medium">{scope}</div><div className="muted text-xs">{scopeLabel(scope)}</div></div>
            </div>)}
          </div>
        </div>
        <div className="text-xs muted card p-3 mb-5">
          บัญชี: {details.user.email || session.user.email || 'Ceo Account'}<br/>
          ปลายทางหลังอนุญาต: <span className="break-all">{details.redirect_uri}</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button className="btn flex items-center justify-center gap-2" disabled={busy} onClick={()=>void decide(false)}><XCircle size={18}/>{busy?'กำลังดำเนินการ…':'ไม่อนุญาต'}</button>
          <button className="btn btn-primary flex items-center justify-center gap-2" disabled={busy} onClick={()=>void decide(true)}><ShieldCheck size={18}/>{busy?'กำลังดำเนินการ…':'อนุญาต'}</button>
        </div>
      </>}
    </section>
  </main>;
}
