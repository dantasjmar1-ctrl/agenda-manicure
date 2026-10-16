(function () {
  const A = window.App;
  const { CFG, sb, $, h, money, digits, first, when, timeOf, dayKey, friendly } = A;
  const S = { known: [], closed: new Set(), content: {}, saving: false, user: null, tab: 'agenda', day: null, month: null, calOpen: false, slots: [], bookings: [], services: [], msg: null, askCancel: null };

  const STATUS = { free: 'livre', held: 'pendente', booked: 'confirmado', blocked: 'bloqueado' };
  const BLABEL = { pending: 'aguardando Pix', confirmed: 'confirmado' };
  const svcName = (id) => (S.services.find((s) => s.id === id) || {}).name || id;

  async function run(promise, okMsg) {
    const { error } = await promise;
    S.msg = error ? { k: 'warn', t: friendly(error) } : (okMsg ? { k: 'info', t: okMsg } : null);
    await reload();
  }

  // cancela e devolve o sinal; com Mercado Pago a devolução é automática
  async function cancelRefund(r) {
    const auto = CFG.pagamento.provedor === 'mercadopago';
    const { error } = await sb.rpc('owner_cancel_booking', { p_booking: r.id, p_refund: true });
    if (error) { S.msg = { k: 'warn', t: friendly(error) }; return reload(); }
    if (!auto) { S.msg = { k: 'info', t: 'Horário cancelado. Lembre de devolver o sinal por Pix.' }; return reload(); }
    try {
      const { data } = await sb.auth.getSession();
      await window.App.callFn('devolver-sinal', { booking_id: r.id }, data.session.access_token);
      S.msg = { k: 'info', t: 'Horário cancelado e sinal devolvido por Pix.' };
    } catch (e) {
      S.msg = { k: 'warn', t: 'Horário cancelado, mas a devolução automática falhou. Devolva o sinal pelo app do Mercado Pago.' };
    }
    await reload();
  }

  async function reload() {
    await sb.rpc('ensure_slots');
    const [sl, bk, sv, cd, kc] = await Promise.all([
      sb.from('slots').select('*').gte('starts_at', new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) + 'T00:00:00-03:00').toISOString()).order('starts_at'),
      sb.from('bookings').select('*, slots(starts_at)').in('status', ['pending', 'confirmed']),
      sb.from('services').select('*').order('sort'),
      sb.from('closed_days').select('day'),
      sb.from('known_clients').select('*').order('name')
    ]);
    S.known = ((kc && kc.data) || []);
    S.closed = new Set(((cd && cd.data) || []).map((r) => r.day));
    S.slots = sl.data || []; S.services = sv.data || [];
    const ct = await sb.from('site_content').select('data').eq('id', 1).single();
    S.content = (ct.data && ct.data.data) || {};
    S.bookings = (bk.data || []).map((b) => Object.assign(b, { starts_at: b.slots.starts_at })).sort((a, b) => a.starts_at < b.starts_at ? -1 : 1);
    render();
  }

  /* ---------- login ---------- */
  function renderLogin(msg) {
    const em = h('input', { id: 'pEmail', type: 'email', autocomplete: 'username', placeholder: 'seu e-mail' });
    const pw = h('input', { id: 'pPass', type: 'password', autocomplete: 'current-password', placeholder: 'sua senha' });
    const er = h('p', { class: 'err', role: 'alert', hidden: !msg }, msg || '');
    const ICON = {
      show: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
      hide: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M3 3l18 18"/></svg>'
    };
    const eye = h('button', { type: 'button', class: 'eye', 'aria-label': 'Mostrar senha', 'aria-pressed': 'false', onclick: () => {
      const show = pw.type === 'password';
      pw.type = show ? 'text' : 'password';
      eye.innerHTML = show ? ICON.hide : ICON.show;
      eye.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
      eye.setAttribute('aria-pressed', String(show));
    } });
    eye.innerHTML = ICON.show;
    const go = async (ev) => {
      ev.preventDefault();
      if (!em.value.trim() || !pw.value) { er.hidden = false; er.textContent = 'Informe e-mail e senha.'; return; }
      const { error } = await sb.auth.signInWithPassword({ email: em.value.trim(), password: pw.value });
      if (error) { er.hidden = false; er.textContent = 'E-mail ou senha incorretos.'; return; }
      start();
    };
    $('box').replaceChildren(h('div', { class: 'login' },
      h('img', { 'data-img': 'logo', alt: 'Logo', src: 'Imagens/logo.png' }), h('h2', {}, 'Painel'),
      h('p', { class: 'hint' }, 'Acesso só para a dona do studio.'),
      h('form', { novalidate: true, onsubmit: go },
        h('div', { class: 'f' }, h('label', { for: 'pEmail' }, 'E-mail'), em),
        h('div', { class: 'f' }, h('label', { for: 'pPass' }, 'Senha'),
          h('div', { class: 'pwrap' }, pw, eye)), er,
        h('button', { class: 'btn', type: 'submit' }, 'Entrar'),
        h('button', { class: 'linkbtn', type: 'button', onclick: forgot }, 'Esqueci minha senha'))));
  }

  async function forgot() {
    const em = $('pEmail'), er = document.querySelector('.login .err');
    const say = (t) => { er.hidden = false; er.textContent = t; };
    if (!em.value.trim()) { say('Digite seu e-mail acima e toque de novo em "Esqueci minha senha".'); return; }
    const { error } = await sb.auth.resetPasswordForEmail(em.value.trim().toLowerCase(), { redirectTo: location.origin + location.pathname });
    if (error) { say('Não foi possível enviar agora. Tente de novo em alguns minutos.'); return; }
    say('Se esse e-mail tiver acesso, enviamos um link para criar uma nova senha. Olhe também o spam.');
  }

  function renderNewPass() {
    const a = h('input', { id: 'nPass', type: 'password', autocomplete: 'new-password', placeholder: 'nova senha (mínimo 8 caracteres)' });
    const b = h('input', { id: 'nPass2', type: 'password', autocomplete: 'new-password', placeholder: 'repita a nova senha' });
    const er = h('p', { class: 'err', role: 'alert', hidden: true });
    const go = async (ev) => {
      ev.preventDefault();
      er.hidden = false;
      if (a.value.length < 8) { er.textContent = 'Use pelo menos 8 caracteres.'; return; }
      if (a.value !== b.value) { er.textContent = 'As senhas não são iguais.'; return; }
      const { error } = await sb.auth.updateUser({ password: a.value });
      if (error) { er.textContent = 'Não foi possível trocar a senha. Peça um novo link.'; return; }
      S.recovering = false;
      history.replaceState(null, '', location.pathname);
      start();
    };
    $('box').replaceChildren(h('div', { class: 'login' }, h('h2', {}, 'Nova senha'),
      h('p', { class: 'hint' }, 'Crie a nova senha de acesso ao painel.'),
      h('form', { novalidate: true, onsubmit: go },
        h('div', { class: 'f' }, h('label', { for: 'nPass' }, 'Nova senha'), a),
        h('div', { class: 'f' }, h('label', { for: 'nPass2' }, 'Repita a senha'), b), er,
        h('button', { class: 'btn', type: 'submit' }, 'Salvar nova senha'))));
  }

  /* ---------- telas ---------- */
  const tabBtn = (id, l, n) => h('button', { type: 'button', class: 'tab', role: 'tab', 'aria-selected': String(S.tab === id), onclick: () => { S.tab = id; S.msg = null; S.askCancel = null; render(); } }, l, n ? h('span', { class: 'n' }, String(n)) : null);
  const act = (label, fn, cls) => h('button', { type: 'button', class: 'btn small ' + (cls || 'ghost'), onclick: fn }, label);

  function render() {
    const hs = 24;
    const head = [h('div', { class: 'mh' }, h('h2', {}, 'Agenda'), h('button', { type: 'button', class: 'linkbtn', onclick: async () => { await sb.auth.signOut(); renderLogin(); } }, 'Sair')),
      h('p', { class: 'hint' }, 'Conectada como ' + S.user.email + '.'),
      h('div', { class: 'tabs', role: 'tablist' }, tabBtn('agenda', 'Agenda', S.bookings.filter((b) => b.status === 'pending').length), tabBtn('clientes', 'Clientes'), tabBtn('rotina', 'Viagens e folgas'), tabBtn('servicos', 'Serviços'), tabBtn('site', 'Site e fotos'))];
    if (S.msg) head.push(h('div', { class: 'notice' + (S.msg.k === 'info' ? ' info' : '') }, S.msg.t));
    const body = S.tab === 'agenda' ? tabAgenda() : S.tab === 'clientes' ? tabClientes() : S.tab === 'rotina' ? tabRotina() : S.tab === 'servicos' ? tabServicos() : tabSite();
    $('box').replaceChildren(h('div', { class: 'panel' }, head, body));
  }

  const TZ = 'America/Sao_Paulo';
  const todayKey = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
  const addDays = (key, n) => { const d = new Date(key + 'T12:00:00-03:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA', { timeZone: TZ }); };
  const longDay = (key) => new Date(key + 'T12:00:00-03:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', timeZone: TZ });
  const dayRange = (key) => ({ a: new Date(key + 'T00:00:00-03:00').toISOString(), b: new Date(key + 'T23:59:59-03:00').toISOString() });

  const daysBetween = (a, b) => { const out = []; for (let k = a, n = 0; k <= b && n < 400; k = addDays(k, 1), n++) out.push(k); return out; };
  async function closeDays(from, to, okMsg) {
    const days = daysBetween(from, to), a = dayRange(from).a, z = dayRange(to).b;
    const ins = await sb.from('closed_days').upsert(days.map((day) => ({ day })), { onConflict: 'day', ignoreDuplicates: true });
    if (ins.error) { S.msg = { k: 'warn', t: friendly(ins.error) }; return reload(); }
    const up = await sb.from('slots').update({ status: 'blocked' }).eq('status', 'free').gte('starts_at', a).lte('starts_at', z);
    const kept = await sb.from('slots').select('id', { count: 'exact', head: true }).in('status', ['booked', 'held']).gte('starts_at', a).lte('starts_at', z);
    S.msg = up.error ? { k: 'warn', t: friendly(up.error) } : { k: kept.count ? 'warn' : 'info', t: okMsg + (kept.count ? ' Atenção: ' + kept.count + ' horário(s) já têm cliente e continuam ativos. Cancele na aba Agenda.' : '') };
    await reload();
  }
  async function openDays(from, to, okMsg) {
    const del = await sb.from('closed_days').delete().gte('day', from).lte('day', to);
    const up = await sb.from('slots').update({ status: 'free' }).eq('status', 'blocked').gte('starts_at', dayRange(from).a).lte('starts_at', dayRange(to).b);
    const err = del.error || up.error;
    S.msg = err ? { k: 'warn', t: friendly(err) } : { k: 'info', t: okMsg };
    await reload();
  }

  function reqCard(r) {
      const pend = r.status === 'pending';
      const asking = S.askCancel === r.id;
      return h('div', { class: 'req' },
        h('div', { class: 'h' }, h('b', {}, r.client_name), h('span', { class: 'w' }, when(r.starts_at))),
        h('ul', {}, r.service_ids.map((s) => h('li', {}, svcName(s)))),
        h('div', { class: 'note' }, h('span', { class: 'pill ' + (pend ? 'pendente' : 'confirmado') }, BLABEL[r.status]), ' Total ' + money(r.total) + (Number(r.deposit) > 0 ? ' · sinal ' + money(r.deposit) + (pend ? ' (a pagar)' : ' pago') + ' · falta ' + money(r.total - r.deposit) : ' · sem sinal, pagar no atendimento') + ' · ' + r.client_phone + (r.note ? ' · "' + r.note + '"' : '')),
        asking ? h('div', { class: 'ask' }, h('b', {}, 'O que fazer com o sinal de ' + money(r.deposit) + '?'),
          h('div', { class: 'btns' },
            !pend ? act('Cancelar e devolver o sinal', () => cancelRefund(r), 'danger') : null,
            !pend ? act('Cancelar e ficar com o sinal', () => run(sb.rpc('owner_cancel_booking', { p_booking: r.id, p_refund: false }), 'Horário cancelado. O sinal ficou com você.'), 'danger') : act('Cancelar', () => run(sb.rpc('owner_cancel_booking', { p_booking: r.id, p_refund: false }), 'Horário liberado.'), 'danger'),
            act('Voltar', () => { S.askCancel = null; render(); })))
          : h('div', { class: 'btns' },
            pend ? act('Confirmar Pix recebido', () => run(sb.rpc('owner_confirm_booking', { p_booking: r.id }), 'Horário confirmado.'), '') : null,
            h('a', { class: 'btn small ghost', href: 'https://wa.me/55' + digits(r.client_phone) + '?text=' + encodeURIComponent('Oi, ' + first(r.client_name) + '! Aqui é a ' + first(CFG.nome) + ', sobre seu horário de ' + when(r.starts_at) + '.'), target: '_blank', rel: 'noopener' }, 'Chamar no WhatsApp'),
            act('Cancelar horário', () => { if (Number(r.deposit) > 0) { S.askCancel = r.id; render(); } else if (confirm('Cancelar este horário?')) run(sb.rpc('owner_cancel_booking', { p_booking: r.id, p_refund: false }), 'Horário cancelado.'); }, 'danger')));
  }

  function tabAgenda() {
    const hoje = todayKey();
    if (!S.day) S.day = hoje;
    const bySlot = {}; S.bookings.forEach((b) => { bySlot[b.slot_id] = b; });
    const nav = h('div', { class: 'daynav' },
      act('‹', () => { S.day = addDays(S.day, -1); S.month = S.day.slice(0, 7); render(); }, 'ghost'),
      h('div', { class: 'dn-title' }, h('b', {}, S.day === hoje ? 'Hoje' : longDay(S.day)), S.day === hoje ? h('span', {}, longDay(S.day)) : null),
      act('›', () => { S.day = addDays(S.day, 1); S.month = S.day.slice(0, 7); render(); }, 'ghost'),
      S.day !== hoje ? act('Voltar para hoje', () => { S.day = hoje; S.month = hoje.slice(0, 7); render(); }, '') : null,
      act(S.calOpen ? 'Fechar calendário' : 'Ver calendário', () => { S.calOpen = !S.calOpen; if (S.calOpen) S.month = S.day.slice(0, 7); render(); }, 'ghost'));

    const parts = [nav];
    if (S.calOpen) parts.push(calendar(hoje, bySlot));

    const pend = S.bookings.filter((b) => b.status === 'pending');
    if (pend.length) parts.push(h('p', { class: 'hint' }, pend.length + ' agendamento(s) aguardando o Pix. Eles aparecem nos dias marcados.'));

    const slots = S.slots.filter((x) => dayKey(x.starts_at) === S.day);
    const { a, b: z } = dayRange(S.day);
    const d = h('input', { id: 'addT', type: 'time', step: '300' });
    const closedDay = S.closed.has(S.day);
    parts.push(h('div', { class: 'addrow' },
      h('div', { class: 'f' }, h('label', { for: 'addT' }, 'Liberar um horário neste dia'), d),
      act('Liberar horário', () => { if (!d.value) return; run(sb.from('slots').insert({ starts_at: S.day + 'T' + d.value + ':00-03:00' }), 'Horário liberado.'); }, ''),
      closedDay ? act('Reabrir o dia', () => openDays(S.day, S.day, 'Dia reaberto.'), '') : act('Fechar o dia todo', () => closeDays(S.day, S.day, 'Dia fechado.'), 'danger')));
    if (closedDay) parts.push(h('div', { class: 'notice info' }, 'Este dia está fechado. As clientes não veem horários nele.'));

    if (!slots.length) parts.push(h('div', { class: 'empty' }, closedDay ? 'Dia fechado.' : 'Nenhum horário neste dia.'));
    else parts.push(h('div', { class: 'list' }, slots.map((x) => {
      const bk = bySlot[x.id];
      if (bk) return reqCard(bk);
      const btns = [];
      if (x.status === 'free') btns.push(act('Bloquear', () => run(sb.from('slots').update({ status: 'blocked' }).eq('id', x.id))));
      else if (x.status === 'blocked') btns.push(act('Liberar', () => run(sb.from('slots').update({ status: 'free' }).eq('id', x.id))));
      return h('div', { class: 'slot' }, h('span', { class: 'tm' }, timeOf(x.starts_at)), h('span', { class: 'pill ' + STATUS[x.status] }, x.status === 'held' ? 'aguardando Pix' : STATUS[x.status]), h('span', { class: 'who' }, ''), h('div', { class: 'btns' }, btns));
    })));
    return h('div', {}, parts);
  }

  function calendar(hoje, bySlot) {
    const [Y, M] = S.month.split('-').map(Number);
    const first = new Date(Y, M - 1, 1, 12).getDay(), total = new Date(Y, M, 0).getDate();
    const stat = {};
    S.slots.forEach((x) => { const k = dayKey(x.starts_at); if (k.slice(0, 7) !== S.month) return; const o = stat[k] = stat[k] || { ag: 0, free: 0, blocked: 0 }; if (x.status === 'free') o.free++; else if (x.status === 'blocked') o.blocked++; else o.ag++; });
    const move = (n) => { const d = new Date(Y, M - 1 + n, 1, 12); S.month = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); render(); };
    const cells = [];
    ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'].forEach((w) => cells.push(h('div', { class: 'cal-w' }, w)));
    for (let i = 0; i < first; i++) cells.push(h('div', { class: 'cal-e' }));
    for (let n = 1; n <= total; n++) {
      const key = S.month + '-' + String(n).padStart(2, '0'), o = stat[key];
      const cls = 'cal-d' + (key === hoje ? ' today' : '') + (key === S.day ? ' sel' : '') + (key < hoje ? ' past' : '') + (S.closed.has(key) ? ' closed' : '');
      cells.push(h('button', { type: 'button', class: cls, onclick: () => { S.day = key; S.calOpen = false; render(); } },
        h('span', { class: 'cn' }, String(n)),
        o && o.ag ? h('span', { class: 'cd ag' }, o.ag + ' ag.') : null,
        o && o.free && !S.closed.has(key) ? h('span', { class: 'cd lv' }, o.free + ' livre' + (o.free > 1 ? 's' : '')) : null,
        S.closed.has(key) ? h('span', { class: 'cd bl' }, 'fechado') : (o && !o.free && !o.ag && o.blocked ? h('span', { class: 'cd bl' }, 'fechado') : null)));
    }
    return h('div', { class: 'cal' }, h('div', { class: 'cal-h' }, act('‹', () => move(-1), 'ghost'),
      h('b', {}, new Date(Y, M - 1, 1, 12).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })), act('›', () => move(1), 'ghost')),
      h('div', { class: 'cal-g' }, cells),
      h('p', { class: 'hint' }, 'ag. = atendimentos marcados. Toque em um dia para ver os detalhes.'));
  }

  function tabClientes() {
    const hoje = todayKey();
    const nome = h('input', { id: 'kName', placeholder: 'Nome da cliente', autocomplete: 'off' });
    const zap = h('input', { id: 'kZap', type: 'tel', inputmode: 'tel', placeholder: '(11) 99999-8888', autocomplete: 'off' });
    const data = h('input', { id: 'kDate', type: 'date', max: hoje });
    const tipo = h('select', { id: 'kFam' }, h('option', { value: '' }, 'Não sei / vários'), h('option', { value: 'alongamento' }, 'Alongamento'), h('option', { value: 'gel' }, 'Banho de gel'));
    const form = h('div', { class: 'box' }, h('h4', {}, 'Cadastrar cliente'),
      h('p', { class: 'hint' }, 'Para clientes de antes do site, ou quem trocou de número. Sem data da última visita: ela fica liberada para manutenção sempre. Com a data e o tipo: o site confere os 15 dias e o tipo certo, como faz com as clientes do site.'),
      h('div', { class: 'addrow' }, h('div', { class: 'f grow' }, h('label', { for: 'kName' }, 'Nome'), nome), h('div', { class: 'f grow' }, h('label', { for: 'kZap' }, 'WhatsApp com DDD'), zap)),
      h('div', { class: 'addrow' }, h('div', { class: 'f grow' }, h('label', { for: 'kDate' }, 'Última visita (opcional)'), data), h('div', { class: 'f grow' }, h('label', { for: 'kFam' }, 'Tipo da última visita'), tipo),
        act('Cadastrar', async () => {
          const d = digits(zap.value).slice(-11);
          if (nome.value.trim().length < 2 || d.length < 10) { S.msg = { k: 'warn', t: 'Informe o nome e o WhatsApp com DDD.' }; return render(); }
          const row = { phone: d, name: nome.value.trim(), last_visit: data.value || null, family: data.value && tipo.value ? tipo.value : null };
          const { error } = await sb.from('known_clients').upsert(row, { onConflict: 'phone' });
          S.msg = error ? { k: 'warn', t: friendly(error) } : { k: 'info', t: 'Cliente cadastrada.' };
          await reload();
        }, '')));
    const fmtZap = (d) => { d = String(d).slice(-11); return d.length === 11 ? '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7) : d; };
    const fmtDay = (k) => k ? new Date(k + 'T12:00:00-03:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ }) : '';
    const mine = S.known.length ? S.known.map((k) => h('div', { class: 'slot' }, h('span', { class: 'who' }, h('b', {}, k.name), ' · ' + fmtZap(k.phone), h('br'), h('small', { class: 'hint' }, k.last_visit ? 'Última visita em ' + fmtDay(k.last_visit) + (k.family ? ' · ' + k.family : '') : 'Liberada para manutenção sempre')),
      h('div', { class: 'btns' }, act('Remover', () => { if (confirm('Remover ' + k.name + ' da lista?')) run(sb.from('known_clients').delete().eq('phone', k.phone), 'Cliente removida.'); }, 'danger'))))
      : [h('div', { class: 'empty' }, 'Nenhuma cliente cadastrada por você.')];
    const by = {};
    S.bookings.forEach((b) => { const k = digits(b.client_phone).slice(-11); const o = by[k] = by[k] || { name: b.client_name, phone: k, n: 0, last: null }; o.n++; const d = dayKey(b.starts_at); if (new Date(b.starts_at) < new Date() && (!o.last || d > o.last)) o.last = d; });
    const site = Object.values(by).sort((a, b) => a.name.localeCompare(b.name));
    return h('div', {}, form, h('h4', { class: 'sub' }, 'Cadastradas por você'), h('div', { class: 'list' }, mine),
      h('h4', { class: 'sub' }, 'Clientes que agendaram pelo site'), site.length ? h('div', { class: 'list' }, site.map((c) => h('div', { class: 'slot' }, h('span', { class: 'who' }, h('b', {}, c.name), ' · ' + fmtZap(c.phone), h('br'), h('small', { class: 'hint' }, c.n + ' agendamento(s)' + (c.last ? ' · última visita ' + fmtDay(c.last) : '')))))) : h('div', { class: 'empty' }, 'Ainda não há agendamentos.'));
  }

  function tabRotina() {
    const hoje = todayKey();
    const f1 = h('input', { id: 'clA', type: 'date', min: hoje }), f2 = h('input', { id: 'clB', type: 'date', min: hoje });
    const range = () => ({ a: new Date(f1.value + 'T00:00:00-03:00').toISOString(), b: new Date(f2.value + 'T23:59:59-03:00').toISOString() });
    const close = h('div', { class: 'box' }, h('h4', {}, 'Fechar dias (viagem, folga)'),
      h('p', { class: 'hint' }, 'Escolha o primeiro e o último dia. Esses dias ficam fechados e somem do site (mesmo que ainda não tenha horário gerado neles). Atendimentos já marcados não são mexidos: cancele na aba Agenda.'),
      h('div', { class: 'addrow' }, h('div', { class: 'f' }, h('label', { for: 'clA' }, 'De'), f1), h('div', { class: 'f' }, h('label', { for: 'clB' }, 'Até'), f2),
        act('Fechar período', () => {
          if (!f1.value || !f2.value || f2.value < f1.value) { S.msg = { k: 'warn', t: 'Escolha o primeiro e o último dia.' }; return render(); }
          return closeDays(f1.value, f2.value, 'Período fechado.');
        }, 'danger'),
        act('Reabrir período', () => {
          if (!f1.value || !f2.value || f2.value < f1.value) { S.msg = { k: 'warn', t: 'Escolha o primeiro e o último dia.' }; return render(); }
          return openDays(f1.value, f2.value, 'Período reaberto.');
        }, '')));
    return h('div', {}, close);
  }

  function tabServicos() {
    const row = (s) => {
      const name = h('input', { value: s.name, 'aria-label': 'Nome' });
      const price = h('input', { value: s.price, type: 'number', min: '0', step: '1', inputmode: 'decimal', 'aria-label': 'Preço' });
      const dep = h('input', { value: s.deposit_pct == null ? '' : s.deposit_pct, type: 'number', min: '0', max: '100', placeholder: 'padrão', 'aria-label': 'Sinal em %' });
      const active = h('input', { type: 'checkbox' }); active.checked = s.active;
      return h('div', { class: 'svcrow' }, h('div', { class: 'f' }, h('label', {}, s.kind === 'extra' ? 'Adicional' : 'Serviço'), name),
        h('div', { class: 'f' }, h('label', {}, 'Preço (R$)'), price), h('div', { class: 'f' }, h('label', {}, 'Sinal (%)'), dep),
        h('label', { class: 'chk' }, active, ' Ativo'),
        act('Salvar', () => run(sb.from('services').update({ name: name.value.trim(), price: Number(price.value), deposit_pct: dep.value === '' ? null : Number(dep.value), active: active.checked }).eq('id', s.id), 'Serviço salvo.'), ''));
    };
    const nn = h('input', { id: 'nName', placeholder: 'Nome do serviço' }), np = h('input', { id: 'nPrice', type: 'number', min: '0', placeholder: '0' });
    const nk = h('select', { id: 'nKind' }, h('option', { value: 'principal' }, 'Serviço principal'), h('option', { value: 'extra' }, 'Adicional'));
    const slug = (x) => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) + '-' + Math.random().toString(36).slice(2, 5);
    return h('div', { class: 'list' }, h('p', { class: 'hint' }, 'Deixe o sinal em branco para usar o padrão. Coloque 0 para um serviço sem sinal. Desmarque "Ativo" para esconder do site sem apagar.'),
      S.services.map(row),
      h('div', { class: 'svcrow new' }, h('div', { class: 'f' }, h('label', { for: 'nName' }, 'Novo serviço'), nn), h('div', { class: 'f' }, h('label', { for: 'nPrice' }, 'Preço (R$)'), np), h('div', { class: 'f' }, h('label', { for: 'nKind' }, 'Tipo'), nk),
        act('Adicionar', () => { if (nn.value.trim().length < 2 || np.value === '') return; run(sb.from('services').insert({ id: slug(nn.value), name: nn.value.trim(), price: Number(np.value), kind: nk.value, sort: S.services.length }), 'Serviço adicionado.'); }, '')));
  }


  /* ---------- aba Site e fotos ---------- */
  const FOTOS = [
    ['logo', 'Logo (fundo transparente, PNG)'], ['about', 'Foto "Sobre mim"'], ['studio', 'Foto do studio'],
    ['nails1', 'Galeria: unhas'], ['hands', 'Galeria: atendimento'],
    ['f1', 'Alongamento molde F1'], ['f1antes', 'F1: foto do antes'], ['gel', 'Banho de gel'],
    ['gelantes', 'Banho de gel: antes'], ['fibra', 'Fibra de vidro']
  ];

  async function saveContent(patch, okMsg) {
    const data = Object.assign({}, S.content, patch);
    const { error } = await sb.from('site_content').update({ data, updated_at: new Date().toISOString() }).eq('id', 1);
    S.msg = error ? { k: 'warn', t: 'Não foi possível salvar. Tente de novo.' } : { k: 'info', t: okMsg || 'Salvo. Já está no site.' };
    if (!error) S.content = data;
    render();
  }

  // Reduz a foto antes de enviar (celular tira fotos enormes) e mantém PNG para o logo
  function shrink(file, key) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), im = new Image();
      im.onload = () => {
        const max = key === 'logo' ? 900 : 1600, k = Math.min(1, max / Math.max(im.width, im.height));
        const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        const png = key === 'logo';
        c.toBlob((b) => { URL.revokeObjectURL(url); b ? resolve({ blob: b, ext: png ? 'png' : 'jpg', type: png ? 'image/png' : 'image/jpeg' }) : reject(new Error('img')); }, png ? 'image/png' : 'image/jpeg', 0.85);
      };
      im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('img')); };
      im.src = url;
    });
  }

  async function sendPhoto(key, file) {
    try {
      const { blob, ext, type } = await shrink(file, key);
      const path = key + '-' + Date.now() + '.' + ext;
      const up = await sb.storage.from('fotos').upload(path, blob, { contentType: type, upsert: false });
      if (up.error) throw up.error;
      const url = sb.storage.from('fotos').getPublicUrl(path).data.publicUrl;
      await saveContent({ fotos: Object.assign({}, S.content.fotos, { [key]: url }) }, 'Foto trocada. Já está no site.');
    } catch (e) { S.msg = { k: 'warn', t: 'Não foi possível enviar a foto. Use uma imagem JPG ou PNG.' }; render(); }
  }

  function tabSite() {
    const t = Object.assign({}, CFG.textos, S.content.textos || {});
    const wa = S.content.whatsapp || CFG.whatsapp, ig = S.content.instagram || CFG.instagram;
    const nail = Array.isArray(S.content.nailArt) ? S.content.nailArt : CFG.nailArt;
    const field = (label, el) => h('div', { class: 'f' }, h('label', {}, label), el);

    const inWa = h('input', { value: wa, inputmode: 'numeric', placeholder: '5511999999999' });
    const inIg = h('input', { value: ig, placeholder: 'seu.instagram' });
    const contatos = h('div', { class: 'card-edit' }, h('h3', {}, 'Contatos'),
      h('p', { class: 'hint' }, 'WhatsApp com 55 e o DDD, só números. Instagram sem o @.'),
      h('div', { class: 'svcrow two' }, field('WhatsApp', inWa), field('Instagram', inIg)),
      act('Salvar contatos', () => saveContent({ whatsapp: digits(inWa.value), instagram: inIg.value.trim().replace(/^@/, '') }), ''));

    const tTitulo = h('textarea', { rows: '2' }, t.titulo), tSub = h('textarea', { rows: '2' }, t.sub);
    const tSobreT = h('input', { value: t.sobreTitulo });
    const tFatos = h('textarea', { rows: '3' }, t.sobreFatos.join('\n'));
    const tSobre = h('textarea', { rows: '6' }, t.sobre.join('\n\n'));
    const tPag = h('input', { value: t.formasPagamento });
    const textos = h('div', { class: 'card-edit' }, h('h3', {}, 'Textos do site'),
      field('Frase principal (topo da página)', tTitulo), field('Frase de apoio', tSub), field('Título do "Sobre mim"', tSobreT),
      field('Destaques do "Sobre mim" (um por linha)', tFatos), field('Texto do "Sobre mim" (separe parágrafos com uma linha em branco)', tSobre),
      field('Formas de pagamento (aparece no rodapé)', tPag),
      act('Salvar textos', () => saveContent({ textos: {
        titulo: tTitulo.value.trim(), sub: tSub.value.trim(), sobreTitulo: tSobreT.value.trim(),
        sobreFatos: tFatos.value.split('\n').map((x) => x.trim()).filter(Boolean),
        sobre: tSobre.value.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean), formasPagamento: tPag.value.trim() } }), ''));

    const rows = nail.map((r) => [h('input', { value: r[0], 'aria-label': 'Nome' }), h('input', { value: r[1], type: 'number', min: '0', 'aria-label': 'Preço' })]);
    const nailBox = h('div', { class: 'card-edit' }, h('h3', {}, 'Tabela de nail art'),
      rows.map(([n, p], i) => h('div', { class: 'svcrow two' }, field('Nome', n), field('Preço (R$)', p),
        act('Remover', () => saveContent({ nailArt: nail.filter((_, j) => j !== i) }, 'Item removido.'), 'danger'))),
      h('div', { class: 'btns' },
        act('Adicionar item', () => saveContent({ nailArt: [...nail, ['Novo item', 0]] }, 'Item adicionado. Edite o nome e o preço e salve.'), ''),
        act('Salvar tabela', () => saveContent({ nailArt: rows.map(([n, p]) => [n.value.trim(), Number(p.value)]).filter((r) => r[0]) }), '')));

    const fotos = h('div', { class: 'card-edit' }, h('h3', {}, 'Fotos'),
      h('p', { class: 'hint' }, 'Escolha uma foto do celular ou do computador. Ela é reduzida sozinha e entra no site na hora.'),
      h('div', { class: 'photos' }, FOTOS.map(([key, label]) => {
        const file = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: (e) => { if (e.target.files[0]) sendPhoto(key, e.target.files[0]); } });
        return h('div', { class: 'photo' }, h('img', { src: A.img(key), alt: label }), h('b', {}, label),
          act('Trocar foto', () => file.click(), ''), file);
      })));

    return h('div', { class: 'list' }, contatos, textos, nailBox, fotos);
  }

  async function start() {
    if (S.recovering) return renderNewPass();
    const { data } = await sb.auth.getSession();
    if (!data.session) return renderLogin();
    S.user = data.session.user;
    const owner = await sb.rpc('is_owner');
    if (owner.error || owner.data !== true) { await sb.auth.signOut(); return renderLogin('Este e-mail não tem acesso ao painel.'); }
    await reload();
  }
  S.recovering = /type=recovery/.test(location.hash);
  sb.auth.onAuthStateChange((ev) => { if (ev === 'PASSWORD_RECOVERY') { S.recovering = true; renderNewPass(); } });
  (async () => { await A.loadContent(); A.applyTheme(); start(); })();
})();
