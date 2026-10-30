/*
 * The way from HomeDeck to GitHub: takes anonymous error reports and turns them into one issue per kind of error in a
 * private repo. The GitHub token stays here, never in the app. Runs on Cloudflare Workers, see relay/README.md.
 * It stores no addresses of senders and trusts nothing it gets: everything is checked and cleaned again.
 * Bindings: GITHUB_TOKEN (secret), GITHUB_REPO ("owner/name"), LIMITS (a KV namespace).
 */

const MAX_BODY = 4096;
const MAX_NEW_PER_DAY = 30; // new issues
const MAX_PER_DAY = 300; // reports in all
const MAX_PER_ERROR = 20; // reports of one error
const FIELD = /^[\w ./:<>(),'#=_+-]*$/;

const answer = (status, text = '') => new Response(text, { status, headers: { 'Content-Type': 'text/plain' } });

// Only the fields known here, in the form they should have; anything else means no.
export function check(r) {
  if (!r || typeof r !== 'object' || r.app !== 'homedeck') return null;
  if (!/^\d+\.\d+\.\d+$/.test(String(r.version))) return null;
  if (!/^[0-9a-f]{16}$/.test(String(r.fingerprint))) return null;
  if (r.source !== 'app' && r.source !== 'page') return null;
  if (typeof r.message !== 'string' || r.message.length > 300) return null;
  if (!Array.isArray(r.where) || r.where.length > 6 || !r.where.every((w) => typeof w === 'string' && /^[\w./-]{1,120}:\d+$/.test(w))) return null;
  if (!Number.isInteger(r.count) || r.count < 1) return null;
  const kinds = {};
  for (const [k, v] of Object.entries(r.kinds && typeof r.kinds === 'object' ? r.kinds : {}).slice(0, 40)) {
    if (/^[a-z_]{1,30}$/.test(k) && Number.isInteger(v)) kinds[k] = v;
  }
  const clean = r.message
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '<email>')
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, '<link>')
    .replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, '<ip>')
    .split('').map((c) => (FIELD.test(c) ? c : ' ')).join('')
    .replace(/@/g, ' ');
  return { version: r.version, homey: /^[\w.-]{1,30}$/.test(String(r.homey)) ? r.homey : 'unknown', source: r.source, fingerprint: r.fingerprint, message: clean, where: r.where, count: r.count, kinds };
}

function issueBody(r) {
  return [
    `**Version:** ${r.version}  `,
    `**Homey:** ${r.homey}  `,
    `**From:** ${r.source}`,
    '',
    '```text',
    r.message,
    '```',
    '',
    '**Where**',
    '```text',
    r.where.join('\n') || '(unknown)',
    '```',
    '',
    `**Devices by kind:** ${Object.entries(r.kinds).map(([k, v]) => `${k} ${v}`).join(', ') || '(none)'}`,
    '',
    `<!-- fingerprint ${r.fingerprint} -->`,
  ].join('\n');
}

async function github(env, method, path, body) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'homedeck-relay', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  return res.json();
}

// Counts per day, so a flood stops here instead of at GitHub.
async function bump(env, key, limit) {
  const day = new Date().toISOString().slice(0, 10);
  const name = `${day}:${key}`;
  const count = Number(await env.LIMITS.get(name)) || 0;
  if (count >= limit) return false;
  await env.LIMITS.put(name, String(count + 1), { expirationTtl: 2 * 86400 });
  return true;
}

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') return answer(405);
    const text = await request.text();
    if (text.length > MAX_BODY) return answer(413);
    let report = null;
    try { report = check(JSON.parse(text)); } catch (err) { report = null; }
    if (!report) return answer(400);
    if (!(await bump(env, 'all', MAX_PER_DAY)) || !(await bump(env, report.fingerprint, MAX_PER_ERROR))) return answer(429);

    try {
      const label = `fp-${report.fingerprint}`;
      const repo = env.GITHUB_REPO;
      const found = await github(env, 'GET', `/repos/${repo}/issues?state=open&labels=${label}&per_page=1`);
      if (found.length) {
        await github(env, 'POST', `/repos/${repo}/issues/${found[0].number}/comments`, { body: `Again: ${report.count}x on ${report.version}, Homey ${report.homey}.` });
        return answer(202);
      }
      if (!(await bump(env, 'new', MAX_NEW_PER_DAY))) return answer(429);
      await github(env, 'POST', `/repos/${repo}/issues`, { title: `[${report.version}] ${report.message.slice(0, 80) || 'Error'}`, body: issueBody(report), labels: ['automatic', label] });
      return answer(201);
    } catch (err) {
      return answer(502);
    }
  },
};
