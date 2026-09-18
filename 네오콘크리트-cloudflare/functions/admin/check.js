import { json, isAdmin } from '../_shared/auth.js';

export async function onRequestGet({ request, env }) {
  return json({ ok: await isAdmin(request, env) });
}
