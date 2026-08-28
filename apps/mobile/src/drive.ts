import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

const TOKEN_KEY='ceo-drive-provider-token';
const CAPTURED_KEY='ceo-drive-token-captured-at';
export const CEO_DRIVE_SCOPE='https://www.googleapis.com/auth/drive.readonly';

export function captureCeoDriveProviderToken(session: Session | null | undefined): boolean {
  const token=String(session?.provider_token||'').trim();
  if(!token)return false;
  sessionStorage.setItem(TOKEN_KEY,token);
  sessionStorage.setItem(CAPTURED_KEY,new Date().toISOString());
  return true;
}

export function ceoDriveProviderToken(): string { return sessionStorage.getItem(TOKEN_KEY)||''; }
export function ceoDriveTokenCapturedAt(): string { return sessionStorage.getItem(CAPTURED_KEY)||''; }
export function clearCeoDriveProviderToken(){ sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(CAPTURED_KEY); }

export async function connectCeoDrive(){
  const redirectTo=window.location.origin+'/?tab=drive';
  const { error }=await supabase.auth.linkIdentity({ provider:'google', options:{ redirectTo, scopes:CEO_DRIVE_SCOPE, queryParams:{ access_type:'offline', prompt:'consent', include_granted_scopes:'true' } } });
  if(error)throw error;
}
