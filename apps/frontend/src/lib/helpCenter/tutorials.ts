import type { HelpTutorial } from './types';

export const HELP_TUTORIALS: readonly HelpTutorial[] = [
  {
    slug: 'cadastrar-funcionario',
    categorySlug: 'departamento-pessoal',
    title: 'Cadastrar funcionário',
    summary:
      'Passo a passo para criar um novo funcionário em Funcionários e Externos, do formulário até a senha inicial.',
    keywords: [
      'funcionário',
      'cadastro',
      'DP',
      'novo colaborador',
      'criar usuário',
      'atendente',
    ],
    href: '/ponto/funcionarios',
    steps: [
      {
        title: 'Abra Funcionários e Externos',
        body: 'No menu lateral, em Departamento Pessoal, acesse Funcionários e Externos. É preciso ter permissão de criar funcionários (ou ser administrador / equipe de DP).',
        hint: 'Se o botão de criar não aparecer, peça liberação da permissão Criar no módulo Funcionários.',
      },
      {
        title: 'Inicie um novo cadastro',
        body: 'Clique em Criar Funcionário (ou equivalente na barra da lista). O formulário abre em etapas: Dados Pessoais, Dados Profissionais, Valores e Adicionais, Dados Bancários e Horário de Trabalho.',
      },
      {
        title: 'Preencha os Dados Pessoais',
        body: 'Informe nome, e-mail, CPF e senha inicial de acesso. O e-mail e o CPF precisam ser únicos no sistema. Avance para a próxima etapa quando os campos obrigatórios estiverem válidos.',
      },
      {
        title: 'Complete Dados Profissionais',
        body: 'Preencha matrícula (quando aplicável), setor, cargo, datas de admissão e nascimento, centro de custo e demais campos profissionais exigidos pela empresa.',
      },
      {
        title: 'Valores, bancários e horário',
        body: 'Nas etapas seguintes, informe salário/adicionais (se couber), dados bancários ou PIX e o horário de trabalho. Use Voltar se precisar corrigir uma etapa anterior.',
      },
      {
        title: 'Salve e valide o acesso',
        body: 'Na última etapa, confirme e salve. O colaborador poderá entrar com o e-mail e a senha definidos. Ajuste permissões de módulos depois, se necessário, no cadastro ou na matriz de acessos.',
        hint: 'No primeiro login, o sistema pode solicitar troca de senha.',
      },
    ],
  },
  {
    slug: 'abrir-rm',
    categorySlug: 'compras-e-materiais',
    title: 'Abrir uma RM',
    summary:
      'Como criar uma Nova Solicitação de Material, informar itens e enviar a RM para análise.',
    keywords: ['RM', 'requisição', 'materiais', 'compras', 'solicitar materiais', 'OC'],
    href: '/ponto/solicitar-materiais',
    steps: [
      {
        title: 'Abra Solicitar Materiais',
        body: 'No menu, acesse a tela de Solicitar Materiais (RMs). Ali você vê suas solicitações e o status de cada uma.',
      },
      {
        title: 'Clique em Nova Solicitação',
        body: 'Use o botão Nova Solicitação para abrir o formulário Nova Solicitação de Material.',
      },
      {
        title: 'Preencha cabeçalho e itens',
        body: 'Informe obra/centro de custo, prioridade e demais dados do cabeçalho. Adicione os itens (material, quantidade, unidade) e anexos se precisar.',
        hint: 'Revise preços unitários e descrições antes de enviar — isso evita correção de RM depois.',
      },
      {
        title: 'Crie a solicitação',
        body: 'Clique em Criar Solicitação. Acompanhe o status na lista (análise, correção, aprovação, OC etc.) até a conclusão do fluxo.',
      },
    ],
  },
  {
    slug: 'atender-central-de-atendimentos',
    categorySlug: 'central-de-atendimentos',
    title: 'Atender na Central de Atendimentos',
    summary:
      'Como localizar conversas aguardando atendente, responder e encerrar o atendimento humano.',
    keywords: [
      'whatsapp',
      'atendente',
      'central de atendimentos',
      'conversa',
      'atestado',
      'humano',
    ],
    href: '/ponto/conversas-whatsapp',
    steps: [
      {
        title: 'Abra a Central de Atendimentos',
        body: 'No menu Departamento Pessoal, acesse Central de Atendimentos. A tela lista conversas que pediram atendimento humano.',
      },
      {
        title: 'Filtre por etapa',
        body: 'Use as abas Aguardando atendente, Em atendimento e Encerradas para focar no que precisa de ação.',
      },
      {
        title: 'Selecione a conversa e responda',
        body: 'Escolha um item da lista à esquerda. Leia o histórico e envie a resposta no painel da conversa. A conversa passa a Em atendimento enquanto você acompanha.',
      },
      {
        title: 'Encerre quando concluir',
        body: 'Quando o caso estiver resolvido, encerre a conversa. Ela aparece em Encerradas para consulta posterior.',
        hint: 'Quem não tiver permissão no módulo não verá a Central — peça acesso ao administrador ou ao DP.',
      },
    ],
  },
  {
    slug: 'navegar-no-sistema',
    categorySlug: 'primeiros-passos',
    title: 'Como navegar no sistema',
    summary:
      'Visão rápida do menu lateral, módulos liberados e atalhos (Drive, Tasks, Flow, chat).',
    keywords: ['menu', 'sidebar', 'navegar', 'módulos', 'começar'],
    href: '/ponto/home',
    steps: [
      {
        title: 'Use o menu lateral',
        body: 'Os módulos aparecem agrupados (Principal, Departamento Pessoal, Compras, etc.). Só entram itens para os quais você tem permissão.',
      },
      {
        title: 'Atalhos do rodapé',
        body: 'Conversas, Tasks, Agenda, Flow e Meu Drive ficam nos atalhos inferiores (quando liberados para o seu perfil).',
      },
      {
        title: 'Central de Ajuda',
        body: 'Volte a esta Central sempre que precisar de um passo a passo. Use a busca no hub para achar tutoriais por palavra-chave.',
      },
    ],
  },
] as const;
