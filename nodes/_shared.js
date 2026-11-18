// Shared helpers, added to the top of every Code node by build.js. CFG comes from config.json.
const today = (typeof $now !== 'undefined' && $now && $now.toISODate) ? $now.toISODate() : new Date().toISOString().slice(0, 10);
const nowIso = new Date().toISOString();
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const toUTC = (s) => { const [y, m, d] = String(s).split('-').map(Number); return Date.UTC(y, m - 1, d); };
const addDays = (s, n) => new Date(toUTC(s) + n * 86400000).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((toUTC(b) - toUTC(a)) / 86400000); // b - a
const weekday = (s) => DAYS[new Date(toUTC(s)).getUTCDay()];
const fmtDate = (s) => (isDate(s) ? `${MONTHS[Number(s.slice(5, 7)) - 1]} ${Number(s.slice(8, 10))}` : '');
const money = (n, cur) => {
  const v = Number(n) || 0;
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur || CFG.currency, maximumFractionDigits: 0 }).format(v); }
  catch { return '$' + Math.round(v).toLocaleString('en-US'); }
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slug = (s) => String(s || 'client').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20) || 'client';
// emailMode "demo": nothing leaves the machine, emails land in the Mailbox table, so real addresses are shown.
// emailMode "real" + testMode: every client email goes to a plus-address of your own inbox (you+acmedental@gmail.com).
const DEMO = CFG.emailMode === 'demo';
const recipient = (email, company) => {
  if (DEMO || !CFG.testMode) return email;
  const [user, domain] = CFG.mailbox.split('@');
  return `${user}+${slug(company)}@${domain}`;
};
const tag = (inv) => `[${inv}]`;

// The owner's own voice, carried into English. Every prompt that writes text includes this.
const VOICE = `Write in ${CFG.ownerName}'s own voice, in English. This is how he writes:
- Connected, the way he talks: one flowing thought where each sentence comes out of the one before, joined with "and", "but", "so", "because", "even if". Not a string of short separate sentences, and not many full stops.
- Natural order: the situation, then the reason, then how he feels about it, then the ask.
- Warm and direct: a quick human check-in at the start ("Hey Rachel, hope you're doing well"), plain everyday words, polite softeners like "if that's okay", "sorry to chase you on this", "honestly".
- Fair: he admits the other side before his point ("I totally get that things get busy, but...").
- He softens instead of accusing: "it might have slipped through", "maybe it got buried in the inbox".
- He says the feeling plainly when it matters: "I'd really appreciate it", "I really need this sorted".
- He ends with an open question or an offer to help, never a polished one-liner ("and if anything's holding it up just tell me and I'll sort it out with you").
- Words like "really", "honestly", "totally" show up now and then, never all together and not in every message.
- Never: bookish or corporate words (kindly, per my last email, please be advised, valued, leverage), em dashes, exclamation marks, emoji, or a wise-sounding closing line.`;
