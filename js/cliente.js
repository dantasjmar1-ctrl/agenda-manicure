(function () {
  const A = window.App;
  const { CFG, sb, $, h, money, digits, first, when, timeOf, dayKey, friendly } = A;
  const S = { services: [], settings: null, slots: [], main: null, extra: new Set(), day: null, slot: null, step: 1, resched: null, poll: null, clock: null };

  const svc = (id) => S.services.find((x) => x.id === id);
  const mains = () => S.services.filter((x) => x.kind === 'principal');
  const extras = () => S.services.filter((x) => x.kind === 'extra');
  const chosen = () => [S.main, ...S.extra].filter(Boolean).map(svc).filter(Boolean);
  const total = () => chosen().reduce((t, x) => t + Number(x.price), 0);
  const deposit = () => chosen().reduce((t, x) => t + Math.round(Number(x.price) * A.depositPct(x, S.settings.default_deposit_pct) / 100), 0);
  const holdMin = () => S.settings.hold_minutes;
  const cancelH = () => S.settings.cancel_hours;
  const pct = () => Number(S.settings.default_deposit_pct);

  /* ---------- conteúdo fixo ---------- */
  function renderStatic() {
    const t = CFG.textos;
    $('heroTitulo').textContent = t.titulo; $('heroSub').textContent = t.sub;
    $('sobreTitulo').textContent = t.sobreTitulo;
    $('sobreFatos').replaceChildren(...t.sobreFatos.map((f) => h('span', {}, f)));
    $('sobreTxt').replaceChildren(...t.sobre.map((p) => h('p', {}, p)));
    $('formasPag').textContent = t.formasPagamento;
    $('tblArt').replaceChildren(h('h3', {}, 'Nail art'), h('ul', {}, CFG.nailArt.map(([n, p]) => h('li', {}, n + ' ', h('b', {}, money(p))))));
  }
  function renderCatalog() {
    const maint = (ids) => ids.map(svc).filter(Boolean);
    $('cards').replaceChildren(...CFG.catalogo.map((c) => {
      const s = svc(c.id); if (!s) return null;
      const m = maint(c.manutencao);
      const img = (cls, name, alt) => h('img', { class: cls, 'data-img': name, alt, src: A.img(name) });
      return h('article', { class: 'svc' },
        h('div', { class: 'ph' }, img('main', c.foto, s.name), c.antes ? img('before', c.antes, 'Antes') : null, h('span', { class: 'tag' }, c.etiqueta)),
        h('div', { class: 'bd' }, h('h3', {}, s.name), h('div', { class: 'price' }, money(s.price)), h('p', { class: 'note' }, c.nota),
          m.length ? h('div', { class: 'man' }, h('span', { class: 't' }, 'Manutenção'), m.map((x) => h('span', {}, x.name.replace(/^Manutenção de [^,]+, /, '') + ' ', h('b', {}, money(x.price))))) : null));
    }));
    const catIds = new Set(CFG.catalogo.flatMap((c) => [c.id, ...c.manutencao]));
    const rest = S.services.filter((x) => !catIds.has(x.id));
    $('tblExtra').replaceChildren(h('h3', {}, 'Procedimentos adicionais'), h('ul', {}, rest.map((x) => h('li', {}, x.name + ' ', h('b', {}, money(x.price))))));
  }

  // Desce a página sozinha até o próximo passo, para a cliente não precisar procurar
  function descer(el, bloco) {
    if (!el) return;
    const calmo = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(() => { try { el.scrollIntoView({ behavior: calmo ? 'auto' : 'smooth', block: bloco || 'start' }); } catch (e) { el.scrollIntoView(); } }, 120);
  }

  /* ---------- passo 1: serviços ---------- */
  function renderOpts() {
    const mk = (list, type, name, isSel, onSel) => list.map((o) => {
      const inp = h('input', { type, name, value: o.id });
      inp.checked = isSel(o.id);
      inp.addEventListener('change', () => { onSel(o.id, inp.checked); summary(); if (type === 'radio') descer($('extraList').closest('fieldset')); });
      return h('label', { class: 'opt' }, inp, h('span', {}, o.name), h('b', {}, money(o.price)));
    });
    const gated = mains().some((o) => o.needs_history);
    const dias = (S.settings && S.settings.maintenance_days) || 30;
    const list = mk(mains(), 'radio', 'main', (id) => S.main === id, (id) => { S.main = id; });
    if (gated) list.push(h('p', { class: 'hint' }, 'Manutenção é para quem já fez aplicação com a gente nos últimos ' + dias + ' dias. Cliente nova com unhas de outra profissional: escolha "Manutenção de outra profissional".'));
    $('mainList').replaceChildren(...list);
    $('extraList').replaceChildren(...mk(extras(), 'checkbox', 'extra', (id) => S.extra.has(id), (id, on) => { on ? S.extra.add(id) : S.extra.delete(id); }));
  }

  /* ---------- passo 2: dia e horário ---------- */
  const days = () => { const m = {}; S.slots.forEach((s) => { const k = dayKey(s.starts_at); m[k] = (m[k] || 0) + 1; }); return m; };
  function renderDays() {
    const keys = days(), ds = Object.keys(keys).sort(), box = $('days');
    if (!ds.length) { box.replaceChildren(); $('times').replaceChildren(); $('slotHint').textContent = 'Não há horários livres no momento. Chame no WhatsApp para combinar.'; return; }
    if (S.day && !keys[S.day]) { S.day = null; S.slot = null; }
    box.replaceChildren(...ds.map((d) => {
      const x = new Date(d + 'T12:00:00-03:00');
      return h('button', { type: 'button', class: 'day', 'aria-pressed': String(S.day === d), onclick: () => { S.day = d; S.slot = null; renderDays(); summary(); descer($('times'), 'center'); } },
        h('small', {}, x.toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'America/Sao_Paulo' }).replace('.', '')),
        h('strong', {}, d.slice(8, 10)),
        h('em', {}, x.toLocaleDateString('pt-BR', { month: 'short', timeZone: 'America/Sao_Paulo' }).replace('.', '')));
    }));
    renderTimes();
  }
  function renderTimes() {
    const box = $('times');
    if (!S.day) { box.replaceChildren(); $('slotHint').textContent = 'Escolha um dia para ver os horários.'; return; }
    const list = S.slots.filter((s) => dayKey(s.starts_at) === S.day);
    if (S.slot && !list.some((s) => s.id === S.slot.id)) S.slot = null;
    box.replaceChildren(...list.map((s) => h('button', { type: 'button', class: 'time', 'aria-pressed': String(!!S.slot && S.slot.id === s.id), onclick: () => { S.slot = s; renderTimes(); summary(); descer($('stepnav'), 'center'); } }, timeOf(s.starts_at))));
    $('slotHint').textContent = S.slot ? 'Horário escolhido: ' + when(S.slot.starts_at) + '.' : 'Escolha um horário.';
  }
  function renderNext() {
    const f = S.slots[0], n = $('next');
    if (!f) { n.hidden = true; return; }
    n.hidden = false; $('nextTxt').textContent = when(f.starts_at);
  }

  /* ---------- resumo e regras ---------- */
  function policyText() {
    const dep = deposit(), hs = cancelH();
    if (S.resched) return null;
    if (dep === 0 && S.main) return 'Este serviço não precisa de sinal: o horário fica confirmado assim que você enviar.';
    return h('span', {}, h('b', {}, 'Para confirmar seu horário, precisamos do sinal de ' + pct() + '% por Pix' + (S.main ? ' (' + money(dep) + ')' : '') + '.'),
      ' O horário só fica garantido depois do pagamento. Remarcando até ' + hs + ' horas antes, o sinal passa para o novo horário. Cancelando até ' + hs + ' horas antes, o sinal é devolvido por Pix, em até 24 horas. Com menos de ' + hs + ' horas, o sinal é perdido e, para remarcar, você paga um novo.');
  }
  function summary() {
    const first = chosen()[0];
    $('sumWhen').textContent = (first ? chosen().map((x) => x.name).join(' + ') : 'Escolha o serviço') + (S.slot ? ' · ' + when(S.slot.starts_at) : ' · escolha dia e horário');
    const t = $('sumTot'); t.textContent = money(total());
    t.append(h('small', {}, deposit() ? 'valor estimado · sinal: ' + money(deposit()) : 'valor estimado'));
    const p = policyText(); $('policy').replaceChildren(p || '');
    $('policy').hidden = S.step !== 3 || !p;
    const dep = deposit();
    $('send').textContent = !S.main ? 'Confirmar meu horário' : (dep ? 'Confirmar meu horário · Pix de ' + money(dep) : 'Confirmar meu horário');
    if (S.resched) $('send').textContent = 'Confirmar novo horário';
  }
  const showErr = (m) => { const e = $('err'); e.textContent = m || ''; e.hidden = !m; };

  /* ---------- passos ---------- */
  function setProg(n) { document.querySelectorAll('#prog li').forEach((li, i) => { li.className = i + 1 < n ? 'done' : (i + 1 === n ? 'on' : ''); }); }
  function goStep(n, quiet) {
    S.step = n;
    document.querySelectorAll('#form .step').forEach((e) => { e.hidden = +e.dataset.step !== n; });
    $('send').hidden = n !== 3; $('stepNext').hidden = n === 3; $('stepBack').hidden = n === 1;
    showErr(''); setProg(n); summary();
    if (!quiet) $('agendar').scrollIntoView({ block: 'start' });
  }
  function nextStep() {
    showErr('');
    if (S.step === 1 && !S.main) return showErr('Escolha o serviço para continuar.');
    if (S.step === 2 && !S.slot) return showErr('Escolha um dia e um horário para continuar.');
    goStep(S.step + 1);
  }

  /* ---------- envio ---------- */
  async function submit(ev) {
    ev.preventDefault(); showErr('');
    const nome = $('nome').value.trim(), zap = $('zap').value.trim();
    if (!S.main) return showErr('Escolha o serviço.');
    if (!S.slot) return showErr('Escolha um dia e um horário.');
    if (nome.length < 2) return showErr('Informe seu nome.');
    if (digits(zap).length < 10) return showErr('Informe um WhatsApp com DDD.');
    $('send').disabled = true;
    try {
      if (S.resched) {
        const { error } = await sb.rpc('reschedule_booking', { p_token: S.resched.token, p_new_slot: S.slot.id });
        if (error) throw error;
        location.href = 'meu.html?t=' + encodeURIComponent(S.resched.token) + '&ok=remarcado';
        return;
      }
      const ids = chosen().map((x) => x.id);
      const { data, error } = await sb.rpc('create_booking', { p_slot: S.slot.id, p_name: nome, p_phone: zap, p_services: ids, p_note: $('obs').value.trim() || null });
      if (error) throw error;
      const r = data[0];
      sessionStorageSafe(r.token);
      const info = { token: r.token, total: r.total, deposit: r.deposit, hold: r.hold_until, when: S.slot.starts_at, services: chosen().map((x) => x.name), nome };
      if (Number(r.deposit) === 0) return done(info);
      payStep(info);
    } catch (e) {
      showErr(friendly(e));
      if (String(e.message).includes('slot_unavailable')) { await loadSlots(); renderDays(); S.slot = null; goStep(2, true); showErr(friendly(e)); }
    } finally { $('send').disabled = false; }
  }
  function sessionStorageSafe(tok) { try { localStorage.setItem('ultimoAgendamento', tok); } catch (e) { /* sem armazenamento: tudo bem */ } }

  /* ---------- pagamento ---------- */
  function stopTimers() { clearInterval(S.poll); clearInterval(S.clock); }
  function payStep(info) {
    try { localStorage.setItem('pagando', info.token); } catch (e) { /* sem armazenamento */ }
    stopTimers(); setProg(4); $('form').hidden = true; $('reschedBanner').hidden = true;
    const b = $('doneBox'); b.hidden = false;
    const clock = h('b', { class: 'clock' }, '--:--');
    const hs = cancelH();
    const tick = () => {
      const left = Math.max(0, Math.round((new Date(info.hold) - Date.now()) / 1000));
      clock.textContent = String(Math.floor(left / 60)).padStart(2, '0') + ':' + String(left % 60).padStart(2, '0');
      if (left <= 0) { stopTimers(); expired(); }
    };
    const expired = () => { b.hidden = true; $('form').hidden = false; S.slot = null; loadSlots().then(() => { renderDays(); renderNext(); goStep(S.main ? 2 : 1, true); showErr('O tempo do pagamento acabou e o horário voltou a ficar livre. Escolha de novo.'); }); };
    b.replaceChildren(h('div', { class: 'pay' },
      h('h3', {}, 'Pague o sinal para garantir seu horário'),
      h('p', { class: 'hint' }, when(info.when) + ' · ' + info.services.join(' + ')),
      h('div', { class: 'amount' }, h('small', {}, 'Sinal por Pix'), h('b', {}, money(info.deposit)), h('small', {}, 'Restante: ' + money(info.total - info.deposit) + ', pago no dia do atendimento.')),
      h('div', { class: 'hold' }, 'Horário segurado por ', clock),
      Pagamento.render(info, () => done(info)),
      h('div', { class: 'rules' }, h('b', {}, 'Antes de pagar'),
        h('ul', {}, h('li', {}, 'O sinal garante o seu horário e é descontado do valor total.'),
          h('li', {}, 'Remarcando até ' + hs + ' horas antes, o sinal passa para o novo horário.'),
          h('li', {}, 'Cancelando até ' + hs + ' horas antes, o sinal é devolvido por Pix, em até 24 horas.'),
          h('li', {}, 'Com menos de ' + hs + ' horas, remarcar ou cancelar faz você perder o sinal. Para remarcar, você paga um novo.'))),
      h('div', { class: 'actions' }, h('button', { class: 'btn ghost', type: 'button', onclick: async () => {
        stopTimers(); await sb.rpc('cancel_booking', { p_token: info.token }); expired(); showErr('');
      } }, 'Voltar e escolher outro horário'))));
    tick(); S.clock = setInterval(tick, 1000);
    // confere a cada 5 s se o pagamento já foi confirmado (Pix automático ou confirmação da dona)
    S.poll = setInterval(async () => {
      const { data } = await sb.rpc('get_booking', { p_token: info.token });
      if (data && data[0] && data[0].status === 'confirmed') done(info);
    }, 5000);
    b.scrollIntoView({ block: 'start' });
  }
  function done(info) {
    try { localStorage.removeItem('pagando'); } catch (e) { /* sem armazenamento */ }
    stopTimers(); setProg(5); $('form').hidden = true; $('reschedBanner').hidden = true;
    const b = $('doneBox'); b.hidden = false;
    const ico = h('div', { class: 'ico' }); ico.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
    const link = location.origin.replace(/\/$/, '') + location.pathname.replace(/[^/]*$/, '') + 'meu.html?t=' + info.token;
    const hs = cancelH();
    b.replaceChildren(h('div', { class: 'done' }, ico,
      h('h3', {}, 'Horário confirmado, ' + first(info.nome) + '!'),
      h('p', {}, when(info.when) + (Number(info.deposit) ? '. Sinal de ' + money(info.deposit) + ' pago' : '') + '. O horário já está na agenda.'),
      h('div', { class: 'plink' }, h('small', {}, 'Seu link para ver, remarcar ou cancelar'), h('a', { href: link, class: 'plink-url' }, link),
        h('button', { class: 'btn small ghost', type: 'button', onclick: async (ev) => { const ok = await A.copy(link); ev.target.textContent = ok ? 'Link copiado!' : 'Toque no link acima e copie'; } }, 'Copiar link')),
      h('p', { class: 'hint' }, 'Salve este link ou tire um print. Remarcando até ' + hs + ' horas antes, o sinal passa para o novo horário. Cancelando até ' + hs + ' horas antes, o sinal é devolvido por Pix, em até 24 horas. Com menos de ' + hs + ' horas, o sinal é perdido e você paga outro para remarcar.'),
      h('div', { class: 'actions' }, h('a', { class: 'btn', href: 'meu.html?t=' + info.token }, 'Ver meu agendamento'),
        h('a', { class: 'btn ghost', href: A.waLink('Oi! Sou ' + first(info.nome) + ' e agendei para ' + when(info.when) + '. Meu link para acompanhar: ' + link), target: '_blank', rel: 'noopener' }, 'Avisar no WhatsApp'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => location.reload() }, 'Fazer outro agendamento'))));
    b.scrollIntoView({ block: 'center' });
  }

  /* ---------- remarcação (vem de meu.html?remarcar=TOKEN) ---------- */
  async function startResched(token) {
    const { data } = await sb.rpc('get_booking', { p_token: token });
    const b = data && data[0];
    if (!b || b.status !== 'confirmed' || !b.can_free_change) return;
    S.resched = { token, id: b.id };
    S.main = b.service_ids.find((i) => svc(i) && svc(i).kind === 'principal') || null;
    b.service_ids.forEach((i) => { if (svc(i) && svc(i).kind === 'extra') S.extra.add(i); });
    $('nome').value = b.client_name; $('nome').disabled = true;
    $('zap').value = '(já cadastrado)'; $('zap').disabled = true; $('obs').disabled = true;
    const rb = $('reschedBanner'); rb.hidden = false;
    rb.textContent = 'Remarcando o horário de ' + when(b.starts_at) + '. O sinal já pago passa para o novo horário, sem novo pagamento.';
    $('agendarSub').textContent = 'Escolha o novo dia e horário.';
    renderOpts(); goStep(2, true);
    document.querySelectorAll('#mainList input, #extraList input').forEach((i) => { i.disabled = true; });
    $('agendar').scrollIntoView();
  }

  // Quem recarrega ou fecha a página no meio do Pix volta para a mesma tela (ou para a confirmação, se já pagou)
  async function resume() {
    let tok = null; try { tok = localStorage.getItem('pagando'); } catch (e) { return; }
    if (!tok) return;
    const clear = () => { try { localStorage.removeItem('pagando'); } catch (e) { /* sem armazenamento */ } };
    const { data } = await sb.rpc('get_booking', { p_token: tok });
    const b = data && data[0];
    if (!b) return clear();
    const nm = (i) => (svc(i) && svc(i).name) || i;
    const info = { token: tok, total: b.total, deposit: b.deposit, hold: b.hold_until, when: b.starts_at, services: b.service_ids.map(nm), nome: b.client_name };
    if (b.status === 'confirmed') return done(info);
    if (b.status === 'pending' && b.hold_until && new Date(b.hold_until) > Date.now()) return payStep(info);
    clear();
  }

  async function loadSlots() {
    const { data, error } = await sb.rpc('public_slots');
    if (error) throw error;
    S.slots = data || [];
  }

  async function init() {
    A.loadCachedContent(); A.applyTheme(); renderStatic();            // aparece na hora, com o que já foi visto
    const pContent = A.loadContent();                                  // tudo abaixo busca ao mesmo tempo
    const pData = Promise.all([A.loadServices(), A.loadSettings()]);
    const pSlots = loadSlots();
    pData.catch(() => {}); pSlots.catch(() => {});
    await pContent; A.applyTheme(); renderStatic();
    const falhou = () => $('agendar').prepend(h('div', { class: 'notice' }, 'Não foi possível carregar a agenda agora. Tente de novo em instantes ou chame no WhatsApp.'));
    try { [S.services, S.settings] = await pData; } catch (e) { falhou(); return; }
    $('agendarSub').textContent = 'Escolha o serviço e um horário livre. Para garantir, você paga um sinal de ' + pct() + '% por Pix e o horário confirma na hora.';
    renderCatalog();
    try { await pSlots; } catch (e) { falhou(); return; }
    renderCatalog(); renderOpts(); renderDays(); renderNext();
    $('form').addEventListener('submit', submit);
    $('stepNext').addEventListener('click', nextStep);
    $('stepBack').addEventListener('click', () => goStep(Math.max(1, S.step - 1)));
    goStep(1, true);
    const rem = new URLSearchParams(location.search).get('remarcar');
    if (rem) await startResched(rem); else await resume();
  }
  init();
})();
