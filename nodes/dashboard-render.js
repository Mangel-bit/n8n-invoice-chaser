// Renders the receivables dashboard as one HTML page (no scripts, forms post to n8n webhooks).
const rows = $('Get invoices for page').all().map((i) => i.json).filter((r) => r.invoice_no);
const acts = $('Get activity').all().map((i) => i.json).filter((a) => a.invoice_no);
const q = ($('Dashboard page').first().json.query) || {};

const STATUS = {
  unpaid:        { label: 'Chasing',        cls: 'chasing' },
  promised:      { label: 'Promised',       cls: 'promised' },
  check_payment: { label: 'Check payment',  cls: 'check' },
  disputed:      { label: 'Disputed',       cls: 'disputed' },
  needs_you:     { label: 'Needs you',      cls: 'needs' },
  escalated:     { label: 'Call client',    cls: 'disputed' },
  paid:          { label: 'Paid',           cls: 'paid' },
};
const ATTENTION = ['disputed', 'needs_you', 'check_payment', 'escalated'];
const ICON = { sent: '↗', reply: '↙', alert: '!', created: '+', paid: '✓' };

const open = rows.filter((r) => r.status !== 'paid');
const sum = (list) => list.reduce((s, r) => s + (Number(r.amount) || 0), 0);
const late = (r) => daysBetween(r.due_date, today);
const outstanding = sum(open);
const overdue = open.filter((r) => late(r) > 0);
const promisedSoon = open.filter((r) => r.status === 'promised' && isDate(r.promised_date) && r.promised_date <= addDays(today, 7));
const monthStart = today.slice(0, 8) + '01';
const collected = rows.filter((r) => r.status === 'paid' && (r.paid_date || '') >= monthStart);

const buckets = [
  { key: 'Not due yet', cls: 'b0', list: open.filter((r) => late(r) <= 0) },
  { key: '1–30 days', cls: 'b1', list: open.filter((r) => late(r) > 0 && late(r) <= 30) },
  { key: '31–60 days', cls: 'b2', list: open.filter((r) => late(r) > 30 && late(r) <= 60) },
  { key: '60+ days', cls: 'b3', list: open.filter((r) => late(r) > 60) },
].map((b) => ({ ...b, total: sum(b.list) }));

const dueText = (r) => {
  const d = late(r);
  if (r.status === 'paid') return `Paid ${fmtDate(r.paid_date)}`;
  if (d > 0) return `<span class="late">${d}d late</span> · due ${fmtDate(r.due_date)}`;
  if (d === 0) return 'Due today';
  return `Due in ${-d}d · ${fmtDate(r.due_date)}`;
};
const nextText = (r) => {
  if (r.status === 'unpaid') return isDate(r.next_action) ? `Reminder ${Number(r.reminders_sent || 0) + 1} ${r.next_action <= today ? 'goes out on next run' : 'on ' + fmtDate(r.next_action)}` : 'Scheduled';
  if (r.status === 'promised') return `Waiting · follow up ${fmtDate(r.next_action)} if unpaid`;
  if (r.status === 'paid') return 'Done';
  return 'Paused until you act';
};
const pill = (r) => {
  const s = STATUS[r.status] || { label: r.status, cls: 'chasing' };
  const extra = r.status === 'promised' && isDate(r.promised_date) ? ` · ${weekday(r.promised_date).slice(0, 3)} ${fmtDate(r.promised_date)}` : '';
  return `<span class="pill ${s.cls}"><i></i>${esc(s.label + extra)}</span>`;
};
const timeline = (inv) => {
  const list = acts.filter((a) => a.invoice_no === inv).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  if (!list.length) return '<p class="empty">Nothing happened on this one yet.</p>';
  return `<ol class="tl">${list.map((a) => `
    <li class="k-${esc(a.kind)}">
      <span class="dot">${ICON[a.kind] || '·'}</span>
      <div class="tl-body">
        <div class="tl-head"><b>${esc(a.title)}</b><time>${esc(fmtDate(String(a.at).slice(0, 10)))} · ${esc(String(a.at).slice(11, 16))}</time></div>
        ${a.body ? `<p class="msg">${esc(a.body)}</p>` : ''}
        ${a.ai_note ? `<p class="ai"><span>AI</span>${esc(a.ai_note)}</p>` : ''}
      </div>
    </li>`).join('')}</ol>`;
};
const paidForm = (r) => `<form method="post" action="/webhook/invoices-paid"><input type="hidden" name="invoice_no" value="${esc(r.invoice_no)}"><button class="btn small ghost" type="submit">Mark paid</button></form>`;

const order = (r) => (ATTENTION.includes(r.status) ? 0 : r.status === 'unpaid' ? 1 : 2) * 100000 - late(r);
const ledger = open.slice().sort((a, b) => order(a) - order(b)).map((r) => `
  <details class="row ${ATTENTION.includes(r.status) ? 'flag' : ''}">
    <summary>
      <span class="inv mono">${esc(r.invoice_no)}</span>
      <span class="who"><b>${esc(r.client_company)}</b><small>${esc(r.client_name || '')}</small></span>
      <span class="amt mono">${esc(money(r.amount, r.currency))}</span>
      <span class="due">${dueText(r)}</span>
      <span class="st">${pill(r)}</span>
      <span class="next">${esc(nextText(r))}</span>
    </summary>
    <div class="detail">
      <div class="note"><span class="ai-tag">Agent</span>${esc(r.ai_note || 'Nothing to note yet.')}</div>
      <div class="detail-grid">
        <div>${timeline(r.invoice_no)}</div>
        <dl class="facts">
          <dt>Contact</dt><dd>${esc(r.client_name || '–')}<br><span class="mono small">${esc(r.client_email || '')}</span></dd>
          <dt>Issued</dt><dd>${esc(fmtDate(r.issue_date))}</dd>
          <dt>Reminders sent</dt><dd class="mono">${esc(r.reminders_sent || 0)}</dd>
          <dt>Invoice</dt><dd><a href="${esc(r.invoice_link || '#')}" target="_blank" rel="noopener">Open link</a></dd>
          <dd class="actions">${paidForm(r)}</dd>
        </dl>
      </div>
    </div>
  </details>`).join('') || "<p class=\"empty big\">Nothing outstanding, every invoice is paid and honestly that's the best screen to see.</p>";

const attention = open.filter((r) => ATTENTION.includes(r.status)).map((r) => `
  <article class="card ${STATUS[r.status]?.cls || ''}">
    <header>${pill(r)}<span class="mono">${esc(money(r.amount, r.currency))}</span></header>
    <h3>${esc(r.client_company)} <span class="mono muted">${esc(r.invoice_no)}</span></h3>
    <p>${esc(r.ai_note || '')}</p>
    ${r.status === 'check_payment' ? paidForm(r) : ''}
  </article>`).join('') || "<p class=\"empty\">Nothing needs you right now, I'm handling all of it.</p>";

const feed = acts.slice().sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 7).map((a) => {
  const r = rows.find((x) => x.invoice_no === a.invoice_no) || {};
  return `<li><span class="dot">${ICON[a.kind] || '·'}</span><div><b>${esc(r.client_company || a.invoice_no)}</b> ${esc(a.kind === 'reply' ? 'replied' : a.kind === 'sent' ? 'got a reminder' : a.kind === 'paid' ? 'paid' : a.kind === 'alert' ? 'was flagged for you' : 'was added')}<small>${esc(a.ai_note || a.title)}</small></div></li>`;
}).join('');

const paidList = rows.filter((r) => r.status === 'paid').sort((a, b) => String(b.paid_date).localeCompare(String(a.paid_date))).slice(0, 6)
  .map((r) => `<li><span class="mono">${esc(r.invoice_no)}</span><span>${esc(r.client_company)}</span><span class="mono">${esc(money(r.amount, r.currency))}</span><span class="muted">${esc(fmtDate(r.paid_date))}</span></li>`).join('');

const nextNo = 'INV-' + (Math.max(1000, ...rows.map((r) => Number(String(r.invoice_no).replace(/\D/g, '')) || 0)) + 1);
const banner = q.done === 'run' ? 'Done, I went through everything that was due and the new reminders and notes are below' : q.done === 'paid' ? 'Marked it paid, so the reminders for that one are stopped' : q.done === 'add' ? "Added it, and I'll take it from here" : q.done === 'reset' ? "Demo reset, everything's back to where it started" : q.done === 'reply' ? "Got the client's reply and I already handled it, the details are below" : '';
const maxBucket = Math.max(outstanding, 1);

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Receivables · ${esc(CFG.business)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap">
<style>
/* Layout: a modern ledger. Money in mono, status in colour, the agent's reasoning always one click away. */
:root{
  --bg:#F3F4F6;--surface:#fff;--ink:#0E1525;--muted:#5F6779;--line:#E2E5EB;--soft:#F7F8FA;
  --money:#0B7A5C;--money-soft:#E2F3EC;
  --chasing:#3A5A8C;--chasing-soft:#E6EDF7;--promised:#A86A0F;--promised-soft:#FCF1DD;
  --check:#0B7486;--check-soft:#DFF2F5;--disputed:#C0392B;--disputed-soft:#FBE6E3;
  --needs:#6A4BD4;--needs-soft:#EEEAFD;--paid:#0B7A5C;--paid-soft:#E2F3EC;
  --sans:"Geist","Segoe UI",system-ui,sans-serif;--mono:"Geist Mono",ui-monospace,Consolas,monospace;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.55 var(--sans);-webkit-font-smoothing:antialiased}
.wrap{max-width:1240px;margin:0 auto;padding:0 20px}
.mono{font-family:var(--mono);font-variant-numeric:tabular-nums}
.muted{color:var(--muted)}.small{font-size:12px}
a{color:var(--chasing)}
button,input{font:inherit}
.btn{border:0;border-radius:9px;padding:9px 14px;font-weight:600;cursor:pointer;background:var(--ink);color:#fff;display:inline-flex;align-items:center;gap:8px}
.btn.ghost{background:var(--surface);color:var(--ink);border:1px solid var(--line)}
.btn.small{padding:6px 11px;font-size:12.5px}
.btn:focus-visible,summary:focus-visible,input:focus-visible{outline:2px solid var(--chasing);outline-offset:2px}
/* top bar */
.top{background:var(--ink);color:#fff}
.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-top:14px;padding-bottom:14px;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:12px}
.mark{width:34px;height:34px;border-radius:9px;background:var(--money);display:grid;place-items:center;font-weight:700;font-size:16px}
.brand b{display:block;font-size:15px;letter-spacing:-.01em}
.brand small{color:#A9B1C3;font-size:12px}
.top-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.top .btn{background:#fff;color:var(--ink)}
.top .btn.ghost{background:transparent;color:#fff;border-color:#2C3650}
a.btn{text-decoration:none}
.test{font:500 11px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:#FFD38A;border:1px solid #6B5320;border-radius:999px;padding:4px 10px}
.live{display:inline-flex;align-items:center;gap:7px;font-size:12px;color:#A9B1C3}
.live i{width:7px;height:7px;border-radius:50%;background:#33D69F;box-shadow:0 0 0 3px rgba(51,214,159,.18)}
.banner{background:var(--money-soft);color:var(--money);border:1px solid #BFE3D3;border-radius:10px;padding:10px 14px;margin-top:18px;font-weight:500}
/* kpis */
.kpis{display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr;gap:12px;margin-top:22px}
.kpi{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px 18px}
.kpi label{display:block;font:500 11px var(--mono);letter-spacing:.09em;text-transform:uppercase;color:var(--muted)}
.kpi .v{font:600 26px/1.15 var(--mono);letter-spacing:-.03em;margin-top:8px;font-variant-numeric:tabular-nums}
.kpi.main .v{font-size:36px}
.kpi small{color:var(--muted)}
.kpi.red .v{color:var(--disputed)}.kpi.amber .v{color:var(--promised)}.kpi.green .v{color:var(--money)}
/* aging */
.aging{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin-top:12px}
.aging-head{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
.aging h2,.panel h2{font-size:13px;margin:0;font-weight:600}
.bar{display:flex;height:12px;border-radius:6px;overflow:hidden;background:var(--soft);margin:12px 0 10px}
.bar span{display:block;height:100%}
.b0{background:#9DB3D6}.b1{background:#E7B35A}.b2{background:#E0794F}.b3{background:#C0392B}
.legend{display:flex;gap:18px;flex-wrap:wrap;font-size:12.5px}
.legend span{display:inline-flex;align-items:center;gap:7px}
.legend i{width:9px;height:9px;border-radius:3px;display:inline-block}
.legend b{font-family:var(--mono);font-weight:500}
/* main grid */
.grid{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:16px;margin:16px 0 40px}
.panel{background:var(--surface);border:1px solid var(--line);border-radius:14px;overflow:hidden}
.panel>h2{padding:14px 18px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center}
.panel>h2 small{font-weight:400;color:var(--muted)}
.cols,.row summary{display:grid;grid-template-columns:86px minmax(150px,1.3fr) 100px 150px 170px minmax(140px,1fr);gap:12px;align-items:center}
.cols{padding:9px 18px;font:500 10.5px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--muted);background:var(--soft);border-bottom:1px solid var(--line)}
.row{border-bottom:1px solid var(--line)}
.row:last-child{border-bottom:0}
.row summary{padding:13px 18px;cursor:pointer;list-style:none}
.row summary::-webkit-details-marker{display:none}
.row summary:hover{background:var(--soft)}
.row[open] summary{background:var(--soft)}
.row.flag summary{box-shadow:inset 3px 0 0 var(--disputed)}
.who b{display:block;font-weight:600}.who small{color:var(--muted)}
.amt{text-align:right;font-weight:500}
.due,.next{color:var(--muted);font-size:12.5px}
.late{color:var(--disputed);font-weight:600}
.pill{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:3px 10px;font-size:12px;font-weight:600;white-space:nowrap}
.pill i{width:6px;height:6px;border-radius:50%;background:currentColor}
.pill.chasing{background:var(--chasing-soft);color:var(--chasing)}.pill.promised{background:var(--promised-soft);color:var(--promised)}
.pill.check{background:var(--check-soft);color:var(--check)}.pill.disputed{background:var(--disputed-soft);color:var(--disputed)}
.pill.needs{background:var(--needs-soft);color:var(--needs)}.pill.paid{background:var(--paid-soft);color:var(--paid)}
.detail{padding:4px 18px 18px;background:var(--soft)}
.note{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-bottom:14px;display:flex;gap:10px;align-items:flex-start}
.ai-tag,.ai span{font:600 10px var(--mono);letter-spacing:.08em;text-transform:uppercase;background:var(--ink);color:#fff;border-radius:5px;padding:2px 6px;flex:none;margin-top:2px}
.detail-grid{display:grid;grid-template-columns:minmax(0,1fr) 220px;gap:18px}
.tl{list-style:none;margin:0;padding:0;position:relative}
.tl:before{content:"";position:absolute;left:13px;top:6px;bottom:6px;width:1px;background:var(--line)}
.tl li{display:grid;grid-template-columns:28px minmax(0,1fr);gap:10px;margin-bottom:12px;position:relative}
.dot{width:27px;height:27px;border-radius:50%;display:grid;place-items:center;background:var(--surface);border:1px solid var(--line);font-size:13px;font-weight:700}
.k-reply .dot{background:var(--chasing-soft);color:var(--chasing);border-color:transparent}
.k-sent .dot{background:var(--surface);color:var(--muted)}
.k-alert .dot{background:var(--disputed-soft);color:var(--disputed);border-color:transparent}
.k-paid .dot{background:var(--paid-soft);color:var(--paid);border-color:transparent}
.tl-body{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:9px 12px;min-width:0}
.tl-head{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}
.tl-head time{font:12px var(--mono);color:var(--muted)}
.msg{white-space:pre-wrap;margin:6px 0 0;color:#2B3345;overflow-wrap:anywhere}
.ai{margin:8px 0 0;display:flex;gap:8px;align-items:flex-start;color:var(--ink);font-weight:500}
.facts{margin:0;display:grid;grid-template-columns:1fr;gap:2px;font-size:13px;align-content:start}
.facts dt{font:500 10.5px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-top:8px}
.facts dd{margin:0;overflow-wrap:anywhere}
.facts .actions{margin-top:14px}
.side{display:grid;gap:16px;align-content:start}
.cards{padding:12px;display:grid;gap:10px}
.card{border:1px solid var(--line);border-radius:12px;padding:12px 14px;background:var(--surface)}
.card header{display:flex;justify-content:space-between;align-items:center;gap:8px}
.card h3{font-size:14px;margin:8px 0 4px}
.card p{margin:0 0 10px;color:#2B3345;font-size:13px}
.card.disputed{border-color:#F1C4BD}.card.needs{border-color:#D9D0FA}.card.check{border-color:#BFE3EA}
.feed{list-style:none;margin:0;padding:12px 16px;display:grid;gap:12px}
.feed li{display:grid;grid-template-columns:27px 1fr;gap:10px;font-size:13px}
.feed small{display:block;color:var(--muted);font-size:12px;margin-top:1px}
.paidlist{list-style:none;margin:0;padding:6px 16px 12px}
.paidlist li{display:grid;grid-template-columns:72px 1fr auto auto;gap:10px;padding:7px 0;border-bottom:1px solid var(--line);font-size:13px}
.paidlist li:last-child{border:0}
.empty{color:var(--muted);padding:14px 18px;margin:0}.empty.big{padding:30px 18px;text-align:center}
.foot{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;color:var(--muted);font-size:12.5px;padding:0 2px 40px;margin-top:-20px}
/* add invoice */
.add{margin-top:16px;background:var(--surface);border:1px solid var(--line);border-radius:14px}
.add summary{padding:14px 18px;cursor:pointer;font-weight:600;list-style:none;display:flex;justify-content:space-between}
.add summary::-webkit-details-marker{display:none}
.add summary:after{content:"+";font-family:var(--mono);color:var(--muted)}
.add[open] summary:after{content:"–"}
.add form{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;padding:0 18px 18px}
.add label{display:grid;gap:5px;font-size:12px;color:var(--muted);font-weight:500}
.add input{border:1px solid var(--line);border-radius:8px;padding:9px 10px;color:var(--ink);background:var(--soft);width:100%}
.add .wide{grid-column:span 2}
.add .submit{display:flex;align-items:end}
@media (max-width:1100px){.grid{grid-template-columns:1fr}.cols{display:none}
  .row summary{grid-template-columns:1fr auto;grid-template-areas:"who amt" "inv st" "due next"}
  .who{grid-area:who}.amt{grid-area:amt}.inv{grid-area:inv;color:var(--muted)}.st{grid-area:st;justify-self:end}.due{grid-area:due}.next{grid-area:next;text-align:right}}
@media (max-width:760px){.kpis{grid-template-columns:1fr 1fr}.kpi.main{grid-column:span 2}.detail-grid{grid-template-columns:1fr}.add form{grid-template-columns:1fr 1fr}.add .wide{grid-column:span 2}}
@media (max-width:480px){.wrap{padding:0 16px}.add form{grid-template-columns:1fr}.add .wide{grid-column:auto}.row summary{grid-template-columns:1fr;grid-template-areas:"who" "amt" "st" "due" "next" "inv"}.amt,.next,.st{text-align:left;justify-self:start}}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
</style></head>
<body>
<header class="top"><div class="wrap">
  <div class="brand"><div class="mark">${esc(CFG.business[0])}</div><div><b>${esc(CFG.business)}</b><small>Receivables · run by your AI collections agent</small></div></div>
  <div class="top-actions">
    ${DEMO ? '<span class="test">Demo mode · no real emails go out</span>' : CFG.testMode ? '<span class="test">Test mode · emails go to you</span>' : ''}
    ${DEMO ? '<a class="btn ghost" href="/webhook/inbox">Client inbox</a>' : ''}
    <span class="live"><i></i>Agent on · checks every morning at 9 and reads replies as they come in</span>
    <form method="post" action="/webhook/invoices-run"><button class="btn" type="submit">Run chaser now</button></form>
  </div>
</div></header>

<main class="wrap">
  ${banner ? `<div class="banner">${esc(banner)}</div>` : ''}

  <section class="kpis">
    <div class="kpi main"><label>Outstanding</label><div class="v">${esc(money(outstanding))}</div><small>across ${open.length} open invoice${open.length === 1 ? '' : 's'}</small></div>
    <div class="kpi red"><label>Overdue</label><div class="v">${esc(money(sum(overdue)))}</div><small>${overdue.length} invoice${overdue.length === 1 ? '' : 's'} past due</small></div>
    <div class="kpi amber"><label>Promised · next 7 days</label><div class="v">${esc(money(sum(promisedSoon)))}</div><small>${promisedSoon.length} client${promisedSoon.length === 1 ? '' : 's'} gave a date</small></div>
    <div class="kpi green"><label>Collected this month</label><div class="v">${esc(money(sum(collected)))}</div><small>${collected.length} paid</small></div>
  </section>

  <section class="aging">
    <div class="aging-head"><h2>Aging</h2><span class="muted small">How long the money has been waiting</span></div>
    <div class="bar">${buckets.filter((b) => b.total > 0).map((b) => `<span class="${b.cls}" style="width:${(b.total / maxBucket * 100).toFixed(2)}%" title="${esc(b.key)}"></span>`).join('')}</div>
    <div class="legend">${buckets.map((b) => `<span><i class="${b.cls}"></i>${esc(b.key)} <b>${esc(money(b.total))}</b></span>`).join('')}</div>
  </section>

  <details class="add">
    <summary>Add an invoice</summary>
    <form method="post" action="/webhook/invoices-add">
      <label>Invoice no.<input id="f-no" name="invoice_no" value="${esc(nextNo)}"></label>
      <label class="wide">Client company<input id="f-co" name="client_company" required placeholder="Acme Dental Group"></label>
      <label>Amount (${esc(CFG.currency)})<input id="f-amt" name="amount" required inputmode="decimal" placeholder="1200"></label>
      <label>Contact name<input id="f-name" name="client_name" placeholder="Rachel Kim"></label>
      <label>Contact email<input id="f-email" name="client_email" type="email" required placeholder="ap@acme.com"></label>
      <label>Due date<input id="f-due" name="due_date" type="date" required value="${esc(addDays(today, 14))}"></label>
      <label>Invoice link<input id="f-link" name="invoice_link" placeholder="Optional"></label>
      <div class="submit"><button class="btn" type="submit">Add and start chasing</button></div>
    </form>
  </details>

  <div class="grid">
    <section class="panel">
      <h2>Open invoices <small>Open any row to see the whole conversation and why the agent did what it did</small></h2>
      <div class="cols"><span>Invoice</span><span>Client</span><span style="text-align:right">Amount</span><span>Due</span><span>Status</span><span>Next step</span></div>
      ${ledger}
    </section>
    <aside class="side">
      <section class="panel"><h2>Needs you <small>${open.filter((r) => ATTENTION.includes(r.status)).length}</small></h2><div class="cards">${attention}</div></section>
      <section class="panel"><h2>Agent activity</h2><ul class="feed">${feed || '<li class="empty">Nothing yet.</li>'}</ul></section>
      ${paidList ? `<section class="panel"><h2>Recently paid</h2><ul class="paidlist">${paidList}</ul></section>` : ''}
    </aside>
  </div>
  ${CFG.testMode ? `<footer class="foot"><span>${DEMO ? "Demo mode, so every email stays in the Client inbox and nothing reaches a real client" : 'Test mode, so nothing reaches a real client'}</span><form method="post" action="/webhook/invoice-chaser-reset"><button class="btn small ghost" type="submit">Reset demo data</button></form></footer>` : ''}
</main>
</body></html>`;

return [{ json: { html } }];
