// Tudo que muda de uma manicure para outra fica neste arquivo.
// Para alugar o site: copie o projeto, troque este arquivo e as imagens desta pasta.
window.SITE = {
  nome: 'Kailane Bonfim',
  subtitulo: 'Nail Designer',
  logo: 'config/logo.png',
  whatsapp: '5511940587377',  // só números, com DDI
  instagram: 'kailane.design',  // sem @
  endereco: '',

  textos: {
    titulo: 'Unhas resistentes, naturais, com praticidade e delicadeza.',
    sub: 'Nail designer há 4 anos, em um studio pensado para você se sentir em casa.',
    sobreTitulo: 'Para nos conhecermos um pouco',
    sobreFatos: ['Kailane, 22 anos', 'Nail designer há 4 anos'],
    sobre: [
      'Eu amo a área da beleza desde pequena. O studio é pensado no seu conforto: um ambiente de aconchego e acolhimento, feito para você se sentir em casa.',
      'Pronta para fazer uma unha perfeita em você.'
    ],
    formasPagamento: 'dinheiro, cartão (com acréscimo da maquininha) ou Pix.'
  },

  // Cartões do catálogo. Os preços vêm do banco (pelos ids dos serviços).
  catalogo: [
    { id: 'f1',    foto: 'f1',    antes: 'f1antes',  etiqueta: 'Depois',    nota: 'Unhas resistentes, naturais, com praticidade e delicadeza.', manutencao: ['man15', 'man15m'] },
    { id: 'gel',   foto: 'gel',   antes: 'gelantes', etiqueta: 'Depois',    nota: 'Acabamento profissional e longa duração, do jeito que você merece.', manutencao: ['gman15', 'gman15m'] },
    { id: 'fibra', foto: 'fibra', antes: null,       etiqueta: 'Resultado', nota: 'Resultado natural, destacando sua beleza com estilo.', manutencao: ['man15', 'man15m'] }
  ],
  nailArt: [
    ['Nail art decorada', 20], ['Relevo ou charms', 30], ['Babyboomer ou babycolor', 15], ['Encapsulada (o par)', 10]
  ],

  cores: {
    bg: '#F0E4D3', surface: '#FAF4EA', soft: '#E7D8C2',
    ink: '#3A2A1B', muted: '#6F5C47', tan: '#B98A5A', gold: '#84590F', line: '#DAC7AB'
  },

  regras: {
    prazoCancelamentoHoras: 24,   // acima disso: remarca/cancela sem perder o sinal
    reservaMinutos: 15,           // tempo que o horário fica segurado durante o pagamento
    sinalPadraoPercent: 30        // usado quando o serviço não define o próprio sinal
  },

  // sinalPercent: null = usa o padrão | 0 = sem sinal (confirma na hora) | número = % próprio
  servicos: [
    { id: 'f1',      nome: 'Alongamento molde F1',                         preco: 180, tipo: 'principal', sinalPercent: null },
    { id: 'fibra',   nome: 'Alongamento fibra de vidro',                   preco: 190, tipo: 'principal', sinalPercent: null },
    { id: 'gel',     nome: 'Banho de gel',                                 preco: 140, tipo: 'principal', sinalPercent: null },
    { id: 'man15',   nome: 'Manutenção de alongamento, até 15 dias',       preco: 110, tipo: 'principal', sinalPercent: null },
    { id: 'man15m',  nome: 'Manutenção de alongamento, mais de 15 dias',   preco: 130, tipo: 'principal', sinalPercent: null },
    { id: 'gman15',  nome: 'Manutenção de banho de gel, até 15 dias',      preco: 100, tipo: 'principal', sinalPercent: null },
    { id: 'gman15m', nome: 'Manutenção de banho de gel, mais de 15 dias',  preco: 120, tipo: 'principal', sinalPercent: null },
    { id: 'outra',   nome: 'Manutenção de outra profissional',             preco: 150, tipo: 'principal', sinalPercent: null },
    { id: 'esm',     nome: 'Esmaltação em gel',                            preco: 80,  tipo: 'extra',     sinalPercent: null },
    { id: 'bli',     nome: 'Blindagem',                                    preco: 90,  tipo: 'extra',     sinalPercent: null },
    { id: 'rep',     nome: 'Reposição avulsa (unidade)',                   preco: 15,  tipo: 'extra',     sinalPercent: null },
    { id: 'rem',     nome: 'Remoção',                                      preco: 45,  tipo: 'extra',     sinalPercent: null }
  ],

  // Preencher depois que o banco existir
  supabase: { url: 'https://qpoutnrzzthokiqyozgs.supabase.co', anonKey: 'sb_publishable_YuGh4kEPxX0ZWa4aafq6jA_gu-WNjm7' },
  // 'mercadopago' (automático) ou 'manual' (a dona confere o Pix). Ainda em aberto.
  // 'teste' = botão de teste, sem dinheiro (só para desenvolver). Trocar antes de a Kailane usar.
 pagamento: { provedor: 'mercadopago', chavePix: '' }
};
