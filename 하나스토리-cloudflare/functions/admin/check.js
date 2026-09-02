import { verifyAuth, json } from '../_shared/auth.js';

export async function onRequestGet({ request, env }) {
  const ok = await verifyAuth(request, env);
  return json({ ok });
}
