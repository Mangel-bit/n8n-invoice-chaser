// Renders the Client inbox: every email the agent sent, and a box to reply as the client.
// A reply goes through the same reply reader a real email would.
const invoices = $('Get invoices for inbox').all().map((i) => i.json).filter((r) => r.invoice_no);
const mail = $('Get mailbox').all().map((i) => i.json).filter((m) => m.invoice_no);
const acts = $('Get activity for inbox').all().map((i) => i.json).filter((a) => a.invoice_no);
const q = ($('Inbox page').first().json.query) || {};

const STATUS = {
  unpaid: ['Chasing', 'chasing'], promised: ['Promised', 'promised'], check_payment: ['Check payment', 'check'],
  disputed: ['Disputed', 'disputed'], needs_you: ['Needs you', 'needs'], escalated: ['Call client', 'disputed'], paid: ['Paid', 'paid'],
};
const pill = (r) => { const [l, c] = STATUS[r?.status] || ['', 'chasing']; return l ? `<span class="pill ${c}"><i></i>${esc(l)}</span>` : ''; };
const when = (at) => `${fmtDate(String(at).slice(0, 10))} · ${String(at).slice(11, 16)}`;
const byTime = (a, b) => String(a.at).localeCompare(String(b.at));

// Conversations, newest first.
const threads = [...new Set(mail.map((m) => m.invoice_no))].map((no) => {
  const msgs = mail.filter((m) => m.invoice_no === no).sort(byTime);
  return { no, msgs, last: msgs[msgs.length - 1], inv: invoices.find((r) => r.invoice_no === no) };
}).sort((a, b) => String(b.last.at).localeCompare(String(a.last.at)));

const current = threads.find((t) => t.no === q.c) || threads[0];

// Is the agent still reading the newest client reply? The page checks this quietly in the background
// (script at the bottom), so there's no visible reload. Without JavaScript it falls back to a slow refresh.
let reading = false;
let insCount = 0;
if (current) {
  insCount = current.msgs.filter((m) => m.direction === 'in').length;
  const handled = acts.filter((a) => a.invoice_no === current.no && a.kind === 'reply').length;
  reading = insCount > handled;
}
const refresh = reading ? `<noscript><meta http-equiv="refresh" content="4"></noscript>` : '';

const list = threads.map((t) => {
  const who = t.inv ? t.inv.client_company : t.no;
  const last = t.last;
  const snippet = String(last.body || '').replace(/\s+/g, ' ').slice(0, 90);
  const from = last.direction === 'in' ? last.from_name : last.direction === 'owner' ? 'Sent to you' : 'You';
  return `<a class="thread ${current && t.no === current.no ? 'on' : ''}" href="/webhook/inbox?c=${esc(t.no)}">
    <div class="t-top"><b>${esc(who)}</b><time>${esc(fmtDate(String(last.at).slice(0, 10)))}</time></div>
    <div class="t-sub">${esc(String(last.subject).replace(/\s*\[INV-\d+\]/, ''))}</div>
    <div class="t-snip"><span>${esc(from)}:</span> ${esc(snippet)}</div>
    <div class="t-foot">${pill(t.inv)}<span class="mono">${esc(t.no)}</span></div>
  </a>`;
}).join('') || "<p class=\"empty\">No emails yet, so hit Run chaser now on the dashboard and the first reminders will land here.</p>";

let thread = '<p class="empty big">Pick a conversation on the left.</p>';
if (current) {
  const inv = current.inv || {};
  const replyNotes = acts.filter((a) => a.invoice_no === current.no && a.kind === 'reply').sort(byTime);
  let k = 0;
  const bubbles = current.msgs.map((m) => {
    if (m.direction === 'owner') {
      return `<div class="msg owner"><div class="meta"><b>Sent to you</b><time>${esc(when(m.at))}</time></div><div class="subj">${esc(m.subject)}</div><p>${esc(m.body)}</p></div>`;
    }
    const mine = m.direction === 'out';
    let chip = '';
    if (!mine) {
      const note = replyNotes[k++];
      chip = note ? `<div class="agent"><span>Agent</span>${esc(note.ai_note)}</div>` : (reading ? '<div class="agent thinking"><span>Agent</span>Reading this reply now…</div>' : '');
    }
    return `<div class="msg ${mine ? 'out' : 'in'}">
      <div class="meta"><b>${esc(mine ? `${CFG.ownerName} · ${CFG.business}` : m.from_name)}</b><span class="to">to ${esc(m.to_addr)}</span><time>${esc(when(m.at))}</time></div>
      <div class="subj">${esc(m.subject)}</div>
      <p>${esc(m.body)}</p>
    </div>${chip}`;
  }).join('');

  const lastSubject = [...current.msgs].reverse().find((m) => m.direction !== 'owner')?.subject || `Invoice ${current.no}`;
  const first = (inv.client_name || '').split(' ')[0] || 'the client';
  const samples = [
    "Sorry about that, we'll pay it this Friday.",
    'We already paid this last week, can you check on your side?',
    "Can you resend the invoice? I can't find it anywhere.",
    'The amount looks wrong, we agreed on less than this for the project.',
    'Is there any discount if we pay today?',
  ];
  thread = `
    <header class="th-head">
      <div><h1>${esc(inv.client_company || current.no)}</h1>
        <div class="muted">${esc(inv.client_name || '')}${inv.client_email ? ' · ' + esc(inv.client_email) : ''}</div></div>
      <div class="th-right"><span class="mono amt">${esc(money(inv.amount, inv.currency))}</span>${pill(inv)}<a class="link" href="/webhook/invoices">Dashboard</a></div>
    </header>
    ${inv.ai_note ? `<div class="note"><span class="tag">Agent</span>${esc(inv.ai_note)}</div>` : ''}
    ${reading ? '<div class="reading"><i></i>The agent is reading the reply and deciding what to do, this usually takes a few seconds</div>' : ''}
    <div class="msgs">${bubbles}</div>
    ${inv.status === 'paid' ? '<p class="empty">This invoice is paid, so the conversation is closed.</p>' : `
    <form class="composer" method="post" action="/webhook/inbox-reply">
      <div class="c-head">Reply as <b>${esc(inv.client_name || 'the client')}</b> from ${esc(inv.client_company || '')} <span class="muted">· try being ${esc(first)} and see what the agent does</span></div>
      <div class="chips">${samples.map((s, i) => `<button type="button" class="chip" data-t="${esc(s)}">${esc(s)}</button>`).join('')}</div>
      <input type="hidden" name="invoice_no" value="${esc(current.no)}">
      <input type="hidden" name="subject" value="${esc(lastSubject)}">
      <input type="hidden" name="from_name" value="${esc(inv.client_name || inv.client_company || 'Client')}">
      <input type="hidden" name="from_email" value="${esc(inv.client_email || '')}">
      <label for="reply-text" class="sr">Reply text</label>
      <textarea id="reply-text" name="text" required rows="4" placeholder="Write what ${esc(first)} would say…"></textarea>
      <div class="c-foot"><span class="muted small">This goes through the exact same steps a real email reply would</span><button class="btn" type="submit">Send as ${esc(first)}</button></div>
    </form>`}`;
}

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${refresh}
<title>Client inbox · ${esc(CFG.business)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap">
<style>
/* Layout: an email client. Conversations on the left, the thread and the client's reply box on the right. */
:root{--bg:#F3F4F6;--surface:#fff;--ink:#0E1525;--muted:#5F6779;--line:#E2E5EB;--soft:#F7F8FA;--money:#0B7A5C;
  --chasing:#3A5A8C;--chasing-soft:#E6EDF7;--promised:#A86A0F;--promised-soft:#FCF1DD;--check:#0B7486;--check-soft:#DFF2F5;
  --disputed:#C0392B;--disputed-soft:#FBE6E3;--needs:#6A4BD4;--needs-soft:#EEEAFD;--paid:#0B7A5C;--paid-soft:#E2F3EC;
  --sans:"Geist","Segoe UI",system-ui,sans-serif;--mono:"Geist Mono",ui-monospace,Consolas,monospace}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.55 var(--sans);-webkit-font-smoothing:antialiased}
.mono{font-family:var(--mono);font-variant-numeric:tabular-nums}.muted{color:var(--muted)}.small{font-size:12px}
.sr{position:absolute;left:-9999px}
.top{background:var(--ink);color:#fff}
.top .in{max-width:1240px;margin:0 auto;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.brand{display:flex;gap:12px;align-items:center}.mark{width:34px;height:34px;border-radius:9px;background:var(--money);display:grid;place-items:center;font-weight:700}
.brand b{display:block;font-size:15px}.brand small{color:#A9B1C3;font-size:12px}
.btn{border:0;border-radius:9px;padding:9px 16px;font:600 14px var(--sans);cursor:pointer;background:var(--ink);color:#fff;text-decoration:none;display:inline-flex}
.top .btn{background:#fff;color:var(--ink)}
.btn:focus-visible,.chip:focus-visible,textarea:focus-visible,.thread:focus-visible{outline:2px solid var(--chasing);outline-offset:2px}
.wrap{max-width:1240px;margin:18px auto 40px;padding:0 20px;display:grid;grid-template-columns:330px minmax(0,1fr);gap:16px}
.list,.pane{background:var(--surface);border:1px solid var(--line);border-radius:14px;overflow:hidden}
.list h2{margin:0;padding:14px 16px;font-size:13px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between}
.thread{display:block;padding:12px 16px;border-bottom:1px solid var(--line);color:inherit;text-decoration:none}
.thread:hover{background:var(--soft)}.thread.on{background:var(--chasing-soft);box-shadow:inset 3px 0 0 var(--chasing)}
.t-top{display:flex;justify-content:space-between;gap:8px}.t-top time{font:12px var(--mono);color:var(--muted)}
.t-sub{font-size:13px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.t-snip{font-size:12.5px;color:var(--muted);margin-top:2px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.t-snip span{color:var(--ink);font-weight:500}
.t-foot{display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:12px;color:var(--muted)}
.pill{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:2px 9px;font-size:12px;font-weight:600;white-space:nowrap}
.pill i{width:6px;height:6px;border-radius:50%;background:currentColor}
.pill.chasing{background:var(--chasing-soft);color:var(--chasing)}.pill.promised{background:var(--promised-soft);color:var(--promised)}
.pill.check{background:var(--check-soft);color:var(--check)}.pill.disputed{background:var(--disputed-soft);color:var(--disputed)}
.pill.needs{background:var(--needs-soft);color:var(--needs)}.pill.paid{background:var(--paid-soft);color:var(--paid)}
.pane{padding:18px 20px;display:grid;gap:14px;align-content:start}
.th-head{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start}
.th-head h1{margin:0;font-size:20px;letter-spacing:-.02em}
.th-right{display:flex;gap:10px;align-items:center}.amt{font-weight:600;font-size:15px}
.link{color:var(--chasing);font-size:13px}
.note,.reading{border:1px solid var(--line);border-radius:10px;padding:10px 12px;display:flex;gap:10px;align-items:flex-start;background:var(--soft)}
.tag,.agent span{font:600 10px var(--mono);letter-spacing:.08em;text-transform:uppercase;background:var(--ink);color:#fff;border-radius:5px;padding:2px 6px;flex:none;margin-top:2px}
.reading{background:var(--promised-soft);border-color:#F1D9AE;color:#6B4708;font-weight:500;align-items:center}
.reading i{width:14px;height:14px;border-radius:50%;border:2px solid currentColor;border-top-color:transparent;animation:spin .8s linear infinite;flex:none}
@keyframes spin{to{transform:rotate(360deg)}}
.msgs{display:grid;gap:10px}
.msg{border:1px solid var(--line);border-radius:12px;padding:12px 14px;max-width:88%;min-width:0}
.msg.out{justify-self:end;background:#F4F7FC;border-color:#D9E2F1}
.msg.in{justify-self:start;background:var(--surface)}
.msg.owner{justify-self:stretch;max-width:none;background:var(--needs-soft);border-color:#D9D0FA}
.meta{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;font-size:12.5px}
.meta time{margin-left:auto;font:12px var(--mono);color:var(--muted)}.meta .to{color:var(--muted)}
.subj{font-weight:600;margin-top:4px}
.msg p{margin:6px 0 0;white-space:pre-wrap;overflow-wrap:anywhere;color:#2B3345}
.agent{justify-self:start;display:flex;gap:8px;align-items:flex-start;font-size:13px;font-weight:500;max-width:88%;margin:-2px 0 4px 12px}
.agent.thinking{color:var(--promised)}
.composer{border:1px solid var(--line);border-radius:12px;padding:14px;display:grid;gap:10px;background:var(--soft)}
.c-head{font-size:13px}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{border:1px solid var(--line);background:var(--surface);border-radius:999px;padding:5px 11px;font:12.5px var(--sans);cursor:pointer;color:var(--ink)}
.chip:hover{border-color:var(--chasing);color:var(--chasing)}
textarea{width:100%;border:1px solid var(--line);border-radius:10px;padding:10px 12px;font:14px/1.5 var(--sans);resize:vertical;background:var(--surface);color:var(--ink)}
.c-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.empty{color:var(--muted);padding:14px 16px;margin:0}.empty.big{padding:40px;text-align:center}
.fresh{animation:fadeUp .45s ease both}
@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.flash{animation:flash 1.6s ease}
@keyframes flash{0%{background:#FFF4D6;border-color:#F1D9AE}100%{background:var(--soft);border-color:var(--line)}}
.dots:after{content:"";display:inline-block;width:1.2em;text-align:left;animation:dots 1.2s steps(4) infinite}
@keyframes dots{0%{content:""}25%{content:"."}50%{content:".."}75%{content:"..."}}
.composer.busy{opacity:.6}
@media (max-width:900px){.wrap{grid-template-columns:1fr}.msg,.agent{max-width:100%}}
@media (max-width:480px){.wrap{padding:0 16px}.pane{padding:14px}}
@media (prefers-reduced-motion:reduce){.reading i,.fresh,.flash,.dots:after{animation:none}}
</style></head>
<body>
<header class="top"><div class="in">
  <div class="brand"><div class="mark">${esc(CFG.business[0])}</div><div><b>Client inbox</b><small>Every email the agent sends lands here in demo mode, and you can answer as the client</small></div></div>
  <a class="btn" href="/webhook/invoices">Back to dashboard</a>
</div></header>
<main class="wrap">
  <section class="list"><h2>Conversations <span class="muted">${threads.length}</span></h2>${list}</section>
  <section class="pane" data-c="${esc(current ? current.no : '')}" data-ins="${insCount}" data-reading="${reading ? 1 : 0}">${thread}</section>
</main>
<script>
(function () {
  // Sending: the form posts normally, and n8n holds the request until the agent is done, then redirects once
  // to the updated conversation. While the browser waits, the reply and a "reading" note show right away.
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  document.querySelectorAll('.chip').forEach(function (c) {
    c.addEventListener('click', function () { var t = document.getElementById('reply-text'); if (t) { t.value = c.getAttribute('data-t'); t.focus(); } });
  });
  var form = document.querySelector('.composer');
  if (form) form.addEventListener('submit', function () {
    var area = form.querySelector('textarea'), text = area.value.trim(), who = form.querySelector('[name=from_name]').value;
    if (!text) return;
    var msgs = document.querySelector('.msgs');
    msgs.insertAdjacentHTML('beforeend',
      '<div class="msg in fresh"><div class="meta"><b>' + esc(who) + '</b><span class="to">just now</span></div><p>' + esc(text) + '</p></div>' +
      '<div class="agent thinking fresh"><span>Agent</span><em class="dots">Reading this reply and deciding what to do</em></div>');
    msgs.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Lock the form after the browser has read its values.
    setTimeout(function () { form.classList.add('busy'); form.querySelectorAll('button,textarea').forEach(function (el) { el.disabled = true; }); }, 0);
  });

  // Arriving back after a reply: slide in everything from the client's newest message onward.
  if (/[?&]new=1/.test(location.search)) {
    var items = Array.prototype.slice.call(document.querySelectorAll('.msgs > *')), from = 0;
    items.forEach(function (el, i) { if (el.classList.contains('in')) from = i; });
    for (var i = from; i < items.length; i++) { items[i].classList.add('fresh'); items[i].style.animationDelay = ((i - from) * 0.3) + 's'; }
    var note = document.querySelector('.note'); if (note) note.classList.add('flash');
    if (items[from]) items[from].scrollIntoView({ block: 'center' });
    if (history.replaceState) history.replaceState(null, '', location.pathname + location.search.replace(/[?&]new=1/, '').replace(/^&/, '?'));
  }
})();
</script>
</body></html>`;

return [{ json: { html } }];
