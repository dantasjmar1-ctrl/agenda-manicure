# Sistema de Agendamento

Sistema web desenvolvido para facilitar o agendamento online de serviços de manicure, permitindo que as clientes escolham serviços e horários disponíveis, realizem o pagamento do sinal via Pix e acompanhem seus agendamentos. A plataforma também conta com uma área administrativa para gerenciamento da agenda e das informações do site.

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white)
![Mercado Pago](https://img.shields.io/badge/Mercado_Pago-009EE3?style=for-the-badge&logo=mercadopago&logoColor=white)
![Cloudflare Pages](https://img.shields.io/badge/Cloudflare_Pages-F38020?style=for-the-badge&logo=cloudflarepages&logoColor=white)

---

## Apresentação do Projeto

O Sistema de Agendamento foi desenvolvido em equipe como projeto acadêmico, com foco na organização e digitalização do processo de agendamento de serviços de manicure.

A plataforma permite que as clientes consultem os serviços disponíveis, escolham uma data e um horário, preencham seus dados e realizem o pagamento do sinal via Pix. Após a confirmação do pagamento, o agendamento é confirmado pelo sistema.

A profissional conta com uma área administrativa para visualizar e gerenciar a agenda, configurar horários, atualizar serviços e valores e editar os textos e as imagens do site.

O sistema foi desenvolvido para atender à manicure Kailane Bonfim, com uma estrutura que pode ser adaptada a outras profissionais da área.

## Situação do Projeto

- **Status:** projeto acadêmico concluído.
- **Plataforma:** sistema web responsivo.
- **Pagamento:** integração com Mercado Pago para pagamento de sinal via Pix.

---

## Recursos do Sistema

### Agendamento de Serviços

- Consulta aos serviços disponíveis;
- Seleção de um ou mais serviços;
- Escolha de datas e horários disponíveis;
- Preenchimento dos dados da cliente;
- Reserva temporária do horário durante o processo de pagamento;
- Confirmação do agendamento após a identificação do pagamento;
- Acompanhamento do agendamento por meio de um link pessoal;
- Possibilidade de remarcação e cancelamento, conforme as regras do sistema.

### Pagamento do Sinal via Pix

- Geração de QR Code para pagamento;
- Verificação do status do pagamento;
- Confirmação do agendamento após a aprovação do pagamento;
- Tratamento de devoluções conforme as regras de negócio definidas para o sistema.

### Área de Gerenciamento

- Acesso da profissional por e-mail e senha;
- Visualização e gerenciamento da agenda;
- Abertura de horários extras;
- Bloqueio de dias e horários;
- Gerenciamento de serviços e valores;
- Consulta às informações das clientes;
- Edição dos textos e das imagens do site.

### Design e Usabilidade

- Layout responsivo para celulares e computadores;
- Navegação simples e organizada;
- Etapas de agendamento com orientações claras;
- Interface planejada para facilitar a realização do agendamento.

---

## Tecnologias e Ferramentas

### Front-end

- HTML5
- CSS3
- JavaScript

### Back-end e Funções de Servidor

- TypeScript
- Funções de servidor para integração com o Mercado Pago
- Webhooks para notificação e verificação dos pagamentos

### Banco de Dados e Autenticação

- Supabase
- PostgreSQL
- Serviço de autenticação do Supabase

### Integração de Pagamentos

- Mercado Pago
- Pix
- API de pagamentos

### Publicação

- Cloudflare Pages

---

## 📁 Organização dos Arquivos

As imagens das telas estão organizadas na pasta `Imagens` do repositório.

```text
SistemaDeAgendamento
├── Imagens
│   ├── Adicionais.png
│   ├── Agenda.png
│   ├── Serviços 1.png
│   ├── Serviços 2.png
│   ├── Sobre mim.png
│   └── Tela Inicial.png
└── README.md
```

## Demonstração das Telas

A seguir, são apresentadas algumas das principais telas do Sistema de Agendamento.

<table>
<tr>
<td align="center" width="50%">
<strong>Tela Inicial</strong><br><br>
<img src="Imagens/Tela%20Inicial.png" width="420" alt="Tela Inicial">
</td>
<td align="center" width="50%">
<strong>Sobre a Profissional</strong><br><br>
<img src="Imagens/Sobre%20mim.png" width="420" alt
