/* Código comum às páginas. Tudo que é de uma manicure vem de config/site.config.js */
(function () {
  const CFG = window.SITE;
  const TZ = 'America/Sao_Paulo';
  const sb = window.supabase.createClient(CFG.supabase.url, CFG.supabase.anonKey);

  const $ = (id) => document.getElementById(id);
  const money = (n) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const digits = (s) => String(s || '').replace(/\D/g, '');
  const first = (n) => String(n || '').trim().split(' ')[0];

  // h('div', {class:'x', onclick: fn}, filho, 'texto') monta elementos sem innerHTML (evita injeção de texto)
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const k in attrs || {}) {
      const v = attrs[k];
      if (v === false || v == null) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().forEach((c) => { if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c)); });
    return el;
  }

  const fmt = (iso, o) => new Date(iso).toLocaleString('pt-BR', Object.assign({ timeZone: TZ }, o));
  const dayKey = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ });          // 2026-10-13
  const timeOf = (iso) => fmt(iso, { hour: '2-digit', minute: '2-digit' });                      // 11:30
  const when = (iso) => fmt(iso, { weekday: 'long', day: '2-digit', month: '2-digit' }) + ' às ' + timeOf(iso);

  const rules = () => CFG.regras;
  const depositPct = (svc, def) => (svc.deposit_pct == null ? def : Number(svc.deposit_pct));

  // Conteúdo editável pela dona (tabela site_content). Se falhar, o site usa o que está em config/.
  CFG.fotos = {};
  async function loadContent() {
    try {
      const { data } = await sb.from('site_content').select('data').eq('id', 1).single();
      const d = (data && data.data) || {};
      if (d.textos) CFG.textos = Object.assign({}, CFG.textos, d.textos);
      if (d.whatsapp) CFG.whatsapp = digitsOnly(d.whatsapp);
      if (d.instagram) CFG.instagram = String(d.instagram).replace(/^@/, '');
      if (Array.isArray(d.nailArt)) CFG.nailArt = d.nailArt;
      if (d.fotos) CFG.fotos = d.fotos;
      return d;
    } catch (e) { return {}; }
  }
  const digitsOnly = (s) => String(s || '').replace(/\D/g, '');
  const img = (key) => CFG.fotos[key] || ('config/' + key + (key === 'logo' ? '.png' : '.jpg'));

  function applyTheme() {
    const c = CFG.cores, r = document.documentElement.style;
    r.setProperty('--bg', c.bg); r.setProperty('--surface', c.surface); r.setProperty('--soft', c.soft);
    r.setProperty('--ink', c.ink); r.setProperty('--muted', c.muted); r.setProperty('--tan', c.tan);
    r.setProperty('--gold', c.gold); r.setProperty('--line', c.line);
    document.title = CFG.nome + ' · ' + CFG.subtitulo;
    document.querySelectorAll('[data-img]').forEach((i) => { i.src = img(i.dataset.img); });
    document.querySelectorAll('[data-nome]').forEach((e) => { e.textContent = CFG.nome; });
    document.querySelectorAll('[data-wa]').forEach((a) => { a.href = 'https://wa.me/' + CFG.whatsapp; });
    document.querySelectorAll('[data-wa-txt]').forEach((a) => { a.textContent = 'WhatsApp ' + waPretty(); });
    document.querySelectorAll('[data-ig]').forEach((a) => { a.href = 'https://instagram.com/' + CFG.instagram; a.textContent = '@' + CFG.instagram; });
  }
  function waPretty() {
    const d = CFG.whatsapp.replace(/^55/, '');
    return d.length === 11 ? '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7) : d;
  }
  // Copia um texto (funciona também em navegadores que bloqueiam a área de transferência)
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* tenta o jeito antigo */ }
    try {
      const t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select(); t.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy'); t.remove(); return ok;
    } catch (e) { return false; }
  }
  const waLink = (msg) => 'https://wa.me/' + CFG.whatsapp + '?text=' + encodeURIComponent(msg);

  async function loadServices() {
    const { data, error } = await sb.from('services').select('*').eq('active', true).order('sort');
    if (error) throw error;
    return data;
  }
  async function loadSettings() {
    const { data, error } = await sb.from('settings').select('*').single();
    if (error) throw error;
    return data;
  }

  // Mensagens amigáveis para erros das funções do banco
  function friendly(err) {
    const m = (err && err.message) || '';
    if (m.includes('slot_unavailable')) return 'Esse horário acabou de ser ocupado. Escolha outro.';
    if (m.includes('maintenance_not_allowed')) return 'A manutenção é só para quem já fez aplicação com a gente nos últimos dias. Se é a sua primeira vez, escolha uma aplicação, ou "Manutenção de outra profissional" se suas unhas são de outra profissional.';
    if (m.includes('too_late')) return 'Faltam menos de 24 horas, então não dá mais para remarcar sem perder o sinal.';
    if (m.includes('invalid_data')) return 'Confira seu nome e WhatsApp.';
    if (m.includes('not_found')) return 'Agendamento não encontrado ou já finalizado.';
    if (m.includes('forbidden')) return 'Sem permissão para esta ação.';
    return 'Algo deu errado. Tente de novo em instantes.';
  }

  window.App = { CFG, sb, $, h, money, digits, first, fmt, dayKey, timeOf, when, rules, depositPct,
    applyTheme, loadContent, img, waPretty, waLink, copy, loadServices, loadSettings, friendly };
})();
