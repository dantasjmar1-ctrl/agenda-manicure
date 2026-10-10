/* Pagamento do sinal. O provedor é escolhido em config/site.config.js (pagamento.provedor):
   'teste'       botão de teste, sem dinheiro de verdade (só durante o desenvolvimento)
   'manual'      mostra a chave Pix e a dona confirma no painel
   'mercadopago' Pix automático (ainda não ligado) */
(function () {
  const { CFG, sb, h, money } = window.App;

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
    return h('div', { class: 'notice' }, 'O pagamento automático por Pix ainda não está ligado neste site.');
  }
  window.Pagamento = { render, automatico: () => CFG.pagamento.provedor === 'teste' };
})();
