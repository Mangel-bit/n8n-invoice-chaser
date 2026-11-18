// Keeps only real client replies about an invoice and strips the quoted history.
// Our own reminders and acknowledgements are sent To a client (or a +alias in test mode),
// so anything not addressed to the main inbox is ignored. That prevents the agent replying to itself.
const mailbox = CFG.mailbox.toLowerCase();
const addr = (v) => {
  const s = typeof v === 'string' ? v : (v && (v.text || v.value?.[0]?.address)) || '';
  return (s.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) || []).map((x) => x.toLowerCase());
};
const nameOf = (v) => {
  const s = typeof v === 'string' ? v : (v && v.text) || '';
  const m = s.match(/^\s*"?([^"<]+?)"?\s*</);
  return m ? m[1].trim() : (addr(v)[0] || 'Client');
};
const htmlToText = (h) => String(h || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div)>/gi, '\n').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"');

const out = [];
for (const it of $input.all()) {
  const j = it.json || {};
  const subject = String(j.subject || '');
  if (!/^\s*(re|aw|sv|antw|rv)\s*:/i.test(subject)) continue;     // must be a reply
  const m = subject.match(/INV-\d+/i);
  if (!m) continue;
  const to = addr(j.to);
  if (to.length && !to.includes(mailbox)) continue;               // not sent to our main inbox

  let text = j.textPlain || j.text || htmlToText(j.textHtml || j.html);
  text = String(text).replace(/\r/g, '');
  text = text.split(/\n\s*On [^\n]{0,300}(\n[^\n]{0,300})?wrote:\s*\n/i)[0];        // Gmail / Apple quote header
  text = text.split(/\n-{2,}\s*Original Message\s*-{2,}/i)[0];
  text = text.split(/\nFrom: [^\n]+\nSent: /i)[0];                                  // Outlook
  text = text.split('\n').filter((l) => !/^\s*>/.test(l)).join('\n').trim().slice(0, 3000);
  if (!text) continue;

  out.push({ json: { invoice_no: m[0].toUpperCase(), from_name: nameOf(j.from), subject: subject.trim(), text, received: j.date || nowIso } });
}
return out;
