import { handleApi } from './api';
import type { Env } from './supabase';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleApi(request, env);
  },
};
