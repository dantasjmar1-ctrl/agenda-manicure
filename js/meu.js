(function () {
  const A = window.App;
  const { CFG, sb, $, h, money, first, when, friendly, waLink } = A;
  const params = new URLSearchParams(location.search);
  const token = params.get('t');
  const S = { b: null, names: {}, ask: null, result: null, settings: null };

  const leftText = (hrs) => hrs >= 48 ? Math.floor(hrs / 24) + ' dias' : hrs >= 24 ? '1 dia' : Math.max(1, Math.round(hrs)) + ' horas';
  const kv = (k, v) => h('div', { class: 'kv' }, h('span', {}, k), h('b', {}, v));
  const home = () => h('a', { class: 'btn', href: 'index.html#agendar' }, 'Agendar um horário');

  async function load() {
    const { data, error } = await sb.rpc('get_booking', { p_token: token || '' });
    if (error) throw error;
    S.b = data && data[0];
  }

  const LABEL = { pending: ['pendente', 'Aguardando Pix'], confirmed: ['confirmado', 'Confirmado'], cancelled: ['bloqueado', 'Cancelado'], refunded: ['bloqueado', 'Cancelado, sinal devolvido'], forfeited: ['bloqueado', 'Cancelado'], done: ['livre', 'Atendido'], no_show: ['bloqueado', 'Não compareceu'] };

  function render() {
    const box = $('box');
    if (S.result) {
      const r = S.result;
      box.replaceChildren(h('div', { class: 'meu' }, h('h2', {}, 'Horário cancelado'),
        h('p', { class: 'hint' }, 'O horário foi liberado.' + (r === 'refunded' ? ' O sinal de ' + money(S.b.deposit) + ' será devolvido a você por Pix.' : r === 'forfeited' ? ' O sinal de ' + money(S.b.deposit) + ' não é devolvido.' : '')),
        h('div', { class: 'actions', style: 'justify-content:flex-start' }, home())));
      return;
    }
    const b = S.b;
    if (!b) { box.replaceChildren(h('div', { class: 'meu' }, h('h2', {}, 'Agendamento não encontrado'), h('p', { class: 'hint' }, 'Confira se o link está completo. Se precisar, chame no WhatsApp.'), h('div', { class: 'actions', style: 'justify-content:flex-start' }, home()))); return; }

    const hrs = (new Date(b.starts_at) - Date.now()) / 3600000;
    const can = b.can_free_change, hs = S.settings.cancel_hours, dep = Number(b.deposit);
    const active = b.status === 'confirmed' || b.status === 'pending';
    const [cls, txt] = LABEL[b.status] || ['livre', b.status];
    const services = b.service_ids.map((i) => S.names[i] || i).join(' + ');
    const parts = [];
    if (params.get('ok') === 'remarcado') parts.push(h('div', { class: 'notice info' }, 'Horário remarcado. O sinal foi mantido.'));
    parts.push(h('div', { class: 'mh' }, h('h2', {}, 'Seu agendamento'), h('span', { class: 'pill ' + cls }, txt)),
      kv('Nome', b.client_name), kv('Dia e horário', when(b.starts_at)), kv('Serviços', services),
      kv('Valor estimado', money(b.total)), kv('Sinal', (b.status === 'pending' ? 'a pagar · ' : 'pago · ') + money(dep)), kv('Restante no dia', money(b.total - dep)));
    if (!active) { parts.push(h('div', { class: 'actions', style: 'justify-content:flex-start' }, home())); }
    else if (b.status === 'pending') {
      parts.push(h('div', { class: 'notice' }, 'O horário só confirma depois do pagamento do sinal. Se o tempo acabar, ele volta a ficar livre.'),
        h('div', { class: 'btns' }, h('button', { class: 'btn ghost danger', type: 'button', onclick: () => { S.ask = 'cancel'; render(); } }, 'Desistir deste horário')));
      if (S.ask === 'cancel') parts.push(askBox('Desistir deste horário?', 'Você ainda não pagou o sinal, então nada é cobrado.', 'Sim, desistir', false));
    } else {
      parts.push(can
        ? h('p', { class: 'hint' }, 'Faltam ' + leftText(hrs) + '. Remarcando até ' + hs + ' horas antes, o sinal de ' + money(dep) + ' passa para o novo horário. Cancelando, o sinal é devolvido por Pix.')
        : h('div', { class: 'notice' }, 'Faltam menos de ' + hs + ' horas (' + leftText(hrs) + '). Se remarcar agora, você perde o sinal de ' + money(dep) + ' e precisa pagar um novo sinal no novo horário. Se cancelar, o sinal também não é devolvido.'));
      if (S.ask === 'cancel') parts.push(askBox(can ? 'Cancelar este horário?' : 'Cancelar com menos de ' + hs + ' horas?',
        can ? 'O sinal de ' + money(dep) + ' será devolvido por Pix e o horário volta a ficar livre. Se preferir manter o sinal, use Remarcar.' : 'O sinal de ' + money(dep) + ' não é devolvido e o horário volta a ficar livre para outras clientes.',
        can ? 'Sim, cancelar e receber o sinal de volta' : 'Sim, cancelar e perder o sinal', false));
      else if (S.ask === 'resched') parts.push(askBox('Remarcar com menos de ' + hs + ' horas?', 'Você perde o sinal de ' + money(dep) + ' e paga um novo sinal no novo horário.', 'Sim, remarcar e pagar novo sinal', true));
      else parts.push(h('div', { class: 'btns' },
        h('button', { class: 'btn', type: 'button', onclick: () => { if (can) location.href = 'index.html?remarcar=' + encodeURIComponent(token); else { S.ask = 'resched'; render(); } } }, can ? 'Remarcar' : 'Remarcar e pagar novo sinal'),
        h('button', { class: 'btn ghost danger', type: 'button', onclick: () => { S.ask = 'cancel'; render(); } }, 'Cancelar horário'),
        h('a', { class: 'btn ghost', href: waLink('Oi! Sou ' + first(b.client_name) + ' e quero falar sobre meu horário de ' + when(b.starts_at) + '.'), target: '_blank', rel: 'noopener' }, 'Falar no WhatsApp')));
    }
    box.replaceChildren(h('div', { class: 'meu' }, parts));
  }

  function askBox(title, text, yes, thenBook) {
    const err = h('p', { class: 'err', hidden: true, role: 'alert' });
    return h('div', { class: 'ask' }, h('b', {}, title), h('span', { class: 'hint' }, text), err,
      h('div', { class: 'btns' },
        h('button', { class: 'btn small danger', type: 'button', onclick: async (ev) => {
          ev.target.disabled = true;
          const { data, error } = await sb.rpc('cancel_booking', { p_token: token });
          if (error) { err.hidden = false; err.textContent = friendly(error); ev.target.disabled = false; return; }
          if (thenBook) { location.href = 'index.html#agendar'; return; }
          S.result = data; render();
        } }, yes),
        h('button', { class: 'btn small ghost', type: 'button', onclick: () => { S.ask = null; render(); } }, 'Voltar')));
  }

  (async function init() {
    await A.loadContent(); A.applyTheme();
    try {
      const [svcs, st] = await Promise.all([sb.from('services').select('id,name'), A.loadSettings()]);
      (svcs.data || []).forEach((s) => { S.names[s.id] = s.name; });
      S.settings = st; await load();
    } catch (e) { $('box').replaceChildren(h('div', { class: 'meu' }, h('p', { class: 'hint' }, 'Não foi possível carregar agora. Tente de novo em instantes.'))); return; }
    render();
  })();
})();
