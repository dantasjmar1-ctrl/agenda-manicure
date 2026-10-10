(function () {
  const A = window.App;
  const { CFG, sb, $, h, money, digits, first, when, timeOf, dayKey, friendly } = A;
  const S = { user: null, tab: 'proximos', slots: [], bookings: [], services: [], msg: null, askCancel: null };

  const STATUS = { free: 'livre', held: 'pendente', booked: 'confirmado', blocked: 'bloqueado' };
  const BLABEL = { pending: 'aguardando Pix', confirmed: 'confirmado' };
  const svcName = (id) => (S.services.find((s) => s.id === id) || {}).name || id;

  async function run(promise, okMsg) {
    const { error } = await promise;
    S.msg = error ? { k: 'warn', t: friendly(error) } : (okMsg ? { k: 'info', t: okMsg } : null);
    await reload();
  }

  async function reload() {
    const [sl, bk, sv] = await Promise.all([
      sb.from('slots').select('*').gt('starts_at', new Date(Date.now() - 3600e3).toISOString()).order('starts_at'),
      sb.from('bookings').select('*, slots(starts_at)').in('status', ['pending', 'confirmed']),
      sb.from('services').select('*').order('sort')
    ]);
    S.slots = sl.data || []; S.services = sv.data || [];
    S.bookings = (bk.data || []).map((b) => Object.assign(b, { starts_at: b.slots.starts_at })).sort((a, b) => a.starts_at < b.starts_at ? -1 : 1);
    render();
  }

  /* ---------- login ---------- */
  function renderLogin(msg) {
    const em = h('input', { id: 'pEmail', type: 'email', autocomplete: 'username', placeholder: 'seu e-mail' });
    const pw = h('input', { id: 'pPass', type: 'password', autocomplete: 'current-password', placeholder: 'sua senha' });
    const er = h('p', { class: 'err', role: 'alert', hidden: !msg }, msg || '');
    const go = async (ev) => {
      ev.preventDefault();
      if (!em.value.trim() || !pw.value) { er.hidden = false; er.textContent = 'Informe e-mail e senha.'; return; }
      const { error } = await sb.auth.signInWithPassword({ email: em.value.trim(), password: pw.value });
      if (error) { er.hidden = false; er.textContent = 'E-mail ou senha incorretos.'; return; }
      start();
    };
    $('box').replaceChildren(h('div', { class: 'login' },
      h('img', { 'data-img': 'logo', alt: 'Logo', src: 'config/logo.png' }), h('h2', {}, 'Painel'),
      h('p', { class: 'hint' }, 'Acesso só para a dona do studio.'),
      h('form', { novalidate: true, onsubmit: go },
        h('div', { class: 'f' }, h('label', { for: 'pEmail' }, 'E-mail'), em),
        h('div', { class: 'f' }, h('label', { for: 'pPass' }, 'Senha'), pw), er,
        h('button', { class: 'btn', type: 'submit' }, 'Entrar'))));
  }

  /* ---------- telas ---------- */
  const tabBtn = (id, l, n) => h('button', { type: 'button', class: 'tab', role: 'tab', 'aria-selected': String(S.tab === id), onclick: () => { S.tab = id; S.msg = null; S.askCancel = null; render(); } }, l, n ? h('span', { class: 'n' }, String(n)) : null);
  const act = (label, fn, cls) => h('button', { type: 'button', class: 'btn small ' + (cls || 'ghost'), onclick: fn }, label);

  function render() {
    const hs = 24;
    const head = [h('div', { class: 'mh' }, h('h2', {}, 'Agenda'), h('button', { type: 'button', class: 'linkbtn', onclick: async () => { await sb.auth.signOut(); renderLogin(); } }, 'Sair')),
      h('p', { class: 'hint' }, 'Conectada como ' + S.user.email + '.'),
      h('div', { class: 'tabs', role: 'tablist' }, tabBtn('proximos', 'Próximos atendimentos', S.bookings.length), tabBtn('agenda', 'Horários'), tabBtn('servicos', 'Serviços'))];
    if (S.msg) head.push(h('div', { class: 'notice' + (S.msg.k === 'info' ? ' info' : '') }, S.msg.t));
    const body = S.tab === 'proximos' ? tabProximos() : S.tab === 'agenda' ? tabAgenda() : tabServicos();
    $('box').replaceChildren(h('div', { class: 'panel' }, head, body));
  }

  function tabProximos() {
    if (!S.bookings.length) return h('div', { class: 'empty' }, 'Nenhum atendimento agendado.');
    return h('div', { class: 'list' }, S.bookings.map((r) => {
      const pend = r.status === 'pending';
      const asking = S.askCancel === r.id;
      return h('div', { class: 'req' },
        h('div', { class: 'h' }, h('b', {}, r.client_name), h('span', { class: 'w' }, when(r.starts_at))),
        h('ul', {}, r.service_ids.map((s) => h('li', {}, svcName(s)))),
        h('div', { class: 'note' }, h('span', { class: 'pill ' + (pend ? 'pendente' : 'confirmado') }, BLABEL[r.status]), ' Total ' + money(r.total) + ' · sinal ' + money(r.deposit) + (pend ? ' (a pagar)' : ' pago') + ' · falta ' + money(r.total - r.deposit) + ' · ' + r.client_phone + (r.note ? ' · "' + r.note + '"' : '')),
        asking ? h('div', { class: 'ask' }, h('b', {}, 'O que fazer com o sinal de ' + money(r.deposit) + '?'),
          h('div', { class: 'btns' },
            !pend ? act('Cancelar e devolver o sinal', () => run(sb.rpc('owner_cancel_booking', { p_booking: r.id, p_refund: true }), 'Horário cancelado. Lembre de devolver o sinal por Pix.'), 'danger') : null,
            !pend ? act('Cancelar e ficar com o sinal', () => run(sb.rpc('owner_cancel_booking', { p_booking: r.id, p_refund: false }), 'Horário cancelado. O sinal ficou com você.'), 'danger') : act('Cancelar', () => run(sb.rpc('owner_cancel_booking', { p_booking: r.id, p_refund: false }), 'Horário liberado.'), 'danger'),
            act('Voltar', () => { S.askCancel = null; render(); })))
          : h('div', { class: 'btns' },
            pend ? act('Confirmar Pix recebido', () => run(sb.rpc('owner_confirm_booking', { p_booking: r.id }), 'Horário confirmado.'), '') : null,
            h('a', { class: 'btn small ghost', href: 'https://wa.me/55' + digits(r.client_phone) + '?text=' + encodeURIComponent('Oi, ' + first(r.client_name) + '! Aqui é a ' + first(CFG.nome) + ', sobre seu horário de ' + when(r.starts_at) + '.'), target: '_blank', rel: 'noopener' }, 'Chamar no WhatsApp'),
            act('Cancelar horário', () => { S.askCancel = r.id; render(); }, 'danger')));
    }));
  }

  function tabAgenda() {
    const d = h('input', { id: 'addD', type: 'date', min: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) });
    const t = h('input', { id: 'addT', type: 'time', step: '900' });
    const add = h('div', { class: 'addrow' }, h('div', { class: 'f' }, h('label', { for: 'addD' }, 'Dia'), d), h('div', { class: 'f' }, h('label', { for: 'addT' }, 'Horário'), t),
      act('Liberar horário', () => {
        if (!d.value || !t.value) return;
        run(sb.from('slots').insert({ starts_at: d.value + 'T' + t.value + ':00-03:00' }), 'Horário liberado.');
      }, ''));
    const byDay = {}; S.slots.filter((s) => new Date(s.starts_at) > new Date()).forEach((s) => { (byDay[dayKey(s.starts_at)] = byDay[dayKey(s.starts_at)] || []).push(s); });
    const bySlot = {}; S.bookings.forEach((b) => { bySlot[b.slot_id] = b; });
    return h('div', {}, add, Object.keys(byDay).sort().map((day) => h('div', { class: 'dayblock' },
      h('h4', {}, new Date(day + 'T12:00:00-03:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', timeZone: 'America/Sao_Paulo' })),
      byDay[day].map((s) => {
        const b = bySlot[s.id], btns = [];
        if (s.status === 'free') btns.push(act('Bloquear', () => run(sb.from('slots').update({ status: 'blocked' }).eq('id', s.id))), act('Remover', () => run(sb.from('slots').delete().eq('id', s.id)), 'danger'));
        else if (s.status === 'blocked') btns.push(act('Liberar', () => run(sb.from('slots').update({ status: 'free' }).eq('id', s.id))));
        else btns.push(act('Ver atendimento', () => { S.tab = 'proximos'; render(); }));
        return h('div', { class: 'slot' }, h('span', { class: 'tm' }, timeOf(s.starts_at)), h('span', { class: 'pill ' + STATUS[s.status] }, s.status === 'held' ? 'aguardando Pix' : STATUS[s.status]),
          h('span', { class: 'who' }, b ? b.client_name + ' · ' + b.service_ids.map(svcName).join(', ') : ''), h('div', { class: 'btns' }, btns));
      }))));
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

  async function start() {
    const { data } = await sb.auth.getSession();
    if (!data.session) return renderLogin();
    S.user = data.session.user;
    const owner = await sb.rpc('is_owner');
    if (owner.error || owner.data !== true) { await sb.auth.signOut(); return renderLogin('Este e-mail não tem acesso ao painel.'); }
    await reload();
  }
  A.applyTheme();
  start();
})();
