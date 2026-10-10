/* Pagamento do sinal. O provedor é escolhido em config/site.config.js (pagamento.provedor):
   'teste'       botão de teste, sem dinheiro de verdade (só durante o desenvolvimento)
   'manual'      mostra a chave Pix e a dona confirma no painel
   'mercadopago' Pix automático: QR Code e copia-e-cola, confirmação sozinha */
(function () {
  const { CFG, sb, h, money, callFn, copy } = window.App;

  // Devolve o bloco de pagamento. onPaid() é chamado quando o horário fica confirmado.
  function render(info, onPaid) {
    const p = CFG.pagamento.provedor;
    if (p === 'teste') {
      return h('div', { class: 'copy' },
        h('small', {}, 'Modo de teste: nenhum dinheiro é cobrado.'),
        h('button', { class: 'btn', type: 'button', onclick: async (ev) => {
          ev.target.disabled = true;
          const { error } = await sb.rpc('dev_confirm_payment', { p_token: info.token });
          if (error) { ev.target.disabled = false; alert('Não foi possível confirmar o teste.'); return; }
          onPaid();
        } }, 'Simular pagamento do sinal'));
    }
    if (p === 'manual') {
      return h('div', { class: 'copy' },
        h('small', {}, 'Pix para ' + CFG.nome),
        h('code', {}, CFG.pagamento.chavePix || 'chave Pix ainda não cadastrada'),
        h('small', {}, 'Valor: ' + money(info.deposit) + '. Depois de pagar, a ' + CFG.nome.split(' ')[0] + ' confirma seu horário. Se quiser, avise no WhatsApp.'));
    }
    if (p === 'mercadopago') {
      const box = h('div', { class: 'copy' }, h('small', {}, 'Gerando o Pix...'));
      const load = async () => {
        box.replaceChildren(h('small', {}, 'Gerando o Pix...'));
        try {
          const d = await callFn('criar-pix', { token: info.token });
          const btn = h('button', { class: 'btn', type: 'button', onclick: async (ev) => {
            const ok = await copy(d.qr); ev.target.textContent = ok ? 'Código copiado!' : 'Selecione o código e copie';
          } }, 'Copiar código Pix');
          box.replaceChildren(
            d.qr_base64 ? h('img', { src: 'data:image/png;base64,' + d.qr_base64, alt: 'QR Code do Pix', width: 200, height: 200, style: 'align-self:center;border-radius:12px;background:#fff;padding:8px' }) : null,
            h('small', {}, 'Abra o app do seu banco, escolha Pix e leia o QR Code, ou use o Pix copia e cola:'),
            h('code', { style: 'word-break:break-all;user-select:all' }, d.qr), btn,
            h('small', {}, 'Assim que o pagamento cair, esta tela confirma sozinha. Não precisa enviar comprovante.'));
        } catch (e) {
          box.replaceChildren(h('small', {}, 'Não foi possível gerar o Pix agora.'),
            h('button', { class: 'btn', type: 'button', onclick: load }, 'Tentar de novo'));
        }
      };
      load();
      return box;
    }
    return h('div', { class: 'notice' }, 'O pagamento automático por Pix ainda não está ligado neste site.');
  }
  window.Pagamento = { render, automatico: () => CFG.pagamento.provedor !== 'manual' };
})();
