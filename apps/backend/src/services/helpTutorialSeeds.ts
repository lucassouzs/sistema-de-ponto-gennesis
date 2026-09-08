import type { HelpTutorialCreateInput } from './HelpTutorialService';

/** Tutoriais padrão por aba/módulo — inseridos se o slug ainda não existir. */
export const HELP_TUTORIAL_SEEDS: HelpTutorialCreateInput[] = [
  // ——— Geral ———
  {
    slug: 'navegar-no-sistema',
    title: 'Como navegar no sistema',
    summary:
      'Visão rápida do menu lateral, módulos liberados e atalhos (Drive, Tasks, Flow, chat).',
    setor: 'Geral',
    keywords: ['menu', 'sidebar', 'navegar', 'módulos', 'começar', 'abas'],
    href: '/ponto/home',
    steps: [
      {
        title: 'Use o menu lateral',
        body: 'Os módulos aparecem agrupados (Principal, Departamento Pessoal, Suprimentos, etc.). Só entram itens para os quais você tem permissão.',
      },
      {
        title: 'Atalhos do rodapé',
        body: 'Conversas, Tasks, Agenda, Flow e Meu Drive ficam nos atalhos inferiores (quando liberados para o seu perfil).',
      },
      {
        title: 'Central de Ajuda',
        body: 'Volte a esta Central sempre que precisar de um passo a passo. Use a busca no hub para achar tutoriais por palavra-chave ou nome da aba.',
      },
    ],
  },
  {
    slug: 'usar-painel-do-sistema',
    title: 'Usar o Painel do Sistema',
    summary: 'Como abrir o painel geral e acompanhar indicadores e acessos rápidos.',
    setor: 'Geral',
    keywords: ['painel', 'dashboard', 'home', 'visão geral'],
    href: '/ponto/painel-do-sistema',
    steps: [
      {
        title: 'Abra o Painel do Sistema',
        body: 'No menu Principal, clique em Painel do Sistema. A tela reúne atalhos e informações gerais conforme suas permissões.',
      },
      {
        title: 'Navegue pelos cards e indicadores',
        body: 'Use os cards e links para ir direto a módulos como aprovações, solicitações, frota ou chamados, sem precisar procurar no menu.',
      },
      {
        title: 'Volte pelo menu ou breadcrumb',
        body: 'O caminho no topo (Principal > …) e o menu lateral ajudam a retornar a qualquer aba liberada para você.',
      },
    ],
  },
  {
    slug: 'usar-aprovacoes',
    title: 'Usar Aprovações',
    summary: 'Como revisar e decidir pendências de RM, OC e outros fluxos na aba Aprovações.',
    setor: 'Geral',
    keywords: ['aprovações', 'aprovar', 'rejeitar', 'pendências', 'gestor'],
    href: '/ponto/aprovacoes',
    steps: [
      {
        title: 'Abra Aprovações',
        body: 'No menu Principal, acesse Aprovações. A tela lista o que espera sua decisão (compras, materiais, etc.), conforme o seu papel.',
      },
      {
        title: 'Filtre o que precisa de ação',
        body: 'Use abas ou filtros de status/tipo para focar só no que está pendente para você.',
      },
      {
        title: 'Abra o item e decida',
        body: 'Clique no registro, revise valores, anexos e histórico. Aprove, rejeite ou devolva para correção com o motivo quando solicitado.',
        hint: 'Se não aparecer nada, pode não haver pendência ou faltar permissão de aprovador naquele fluxo.',
      },
    ],
  },
  {
    slug: 'usar-fluig-processos',
    title: 'Usar Fluig - Processos',
    summary: 'Como acompanhar processos Fluig e localizar solicitações em andamento.',
    setor: 'Geral',
    keywords: ['fluig', 'processos', 'workflow', 'solicitações'],
    href: '/ponto/financeiro/gestao-solicitacoes',
    steps: [
      {
        title: 'Abra Fluig - Processos',
        body: 'No menu Principal, entre em Fluig - Processos. A lista mostra processos e solicitações ligadas ao fluxo Fluig.',
      },
      {
        title: 'Busque e filtre',
        body: 'Use busca e filtros por status ou período para achar o processo certo.',
      },
      {
        title: 'Abra o detalhe',
        body: 'Clique no item para ver etapas, responsáveis e documentos. Acompanhe até a conclusão ou encaminhe conforme a regra do fluxo.',
      },
    ],
  },
  {
    slug: 'usar-fluig-aprovacoes',
    title: 'Usar Fluig - Aprovações',
    summary: 'Como aprovar ou devolver tarefas do workflow Fluig.',
    setor: 'Geral',
    keywords: ['fluig', 'aprovação', 'workflow', 'tarefas'],
    href: '/ponto/fluig/aprovacoes-workflow',
    steps: [
      {
        title: 'Abra Fluig - Aprovações',
        body: 'No menu Principal, acesse Fluig - Aprovações. Aparecem as tarefas aguardando sua aprovação no workflow.',
      },
      {
        title: 'Revise a solicitação',
        body: 'Abra o item, confira dados, anexos e o histórico das etapas anteriores.',
      },
      {
        title: 'Aprove ou devolva',
        body: 'Registre a decisão. Em caso de devolução, informe o motivo para o solicitante corrigir e reenviar.',
      },
    ],
  },
  {
    slug: 'usar-aprovadores',
    title: 'Usar Aprovadores',
    summary: 'Como consultar ou configurar quem aprova em cada fluxo Fluig.',
    setor: 'Geral',
    keywords: ['aprovadores', 'fluig', 'matriz', 'alçada'],
    href: '/ponto/fluig/aprovadores',
    steps: [
      {
        title: 'Abra Aprovadores',
        body: 'No menu Principal, acesse Aprovadores. A tela mostra a matriz de quem aprova em cada tipo de processo.',
      },
      {
        title: 'Localize o fluxo',
        body: 'Filtre ou busque pelo processo/área. Confira os aprovadores cadastrados e a ordem das etapas.',
      },
      {
        title: 'Ajuste com permissão adequada',
        body: 'Quem tiver permissão de gestão pode incluir ou alterar aprovadores. Sem essa permissão, use a tela só para consulta.',
      },
    ],
  },
  {
    slug: 'usar-solicitacoes-internas',
    title: 'Usar Solicitações Internas',
    summary: 'Como abrir e acompanhar solicitações gerais (internas) no sistema.',
    setor: 'Administrativo',
    keywords: ['solicitações internas', 'solicitações gerais', 'pedido interno'],
    href: '/ponto/solicitacoes-gerais',
    steps: [
      {
        title: 'Abra Solicitações Internas',
        body: 'No menu Principal, entre em Solicitações Internas. Veja as suas solicitações e o status de cada uma.',
      },
      {
        title: 'Crie uma nova solicitação',
        body: 'Clique em nova solicitação, escolha o tipo/formulário, preencha os campos e anexe arquivos se necessário.',
      },
      {
        title: 'Acompanhe o andamento',
        body: 'Na lista, filtre por status. Abra o detalhe para ver comentários, aprovações e o resultado final.',
      },
    ],
  },
  {
    slug: 'usar-frota',
    title: 'Usar Frota (reserva de veículos)',
    summary: 'Como reservar um veículo e acompanhar suas reservas.',
    setor: 'Operacional',
    keywords: ['frota', 'veículo', 'reserva', 'carro'],
    href: '/ponto/reserva-veiculos',
    steps: [
      {
        title: 'Abra Frota',
        body: 'No menu Principal, acesse Frota. A tela lista veículos e reservas disponíveis conforme a política da empresa.',
      },
      {
        title: 'Monte a reserva',
        body: 'Informe data/hora de saída e retorno, veículo (se houver escolha) e o motivo. Confirme a disponibilidade antes de salvar.',
      },
      {
        title: 'Acompanhe e cancele se precisar',
        body: 'Veja suas reservas na lista. Se não for mais usar, cancele dentro do prazo permitido para liberar o veículo.',
      },
    ],
  },
  {
    slug: 'usar-abastecimento',
    title: 'Usar Abastecimento',
    summary: 'Como solicitar combustível e acompanhar o pedido.',
    setor: 'Operacional',
    keywords: ['abastecimento', 'combustível', 'frota', 'gasolina'],
    href: '/ponto/solicitar-combustivel',
    steps: [
      {
        title: 'Abra Abastecimento',
        body: 'No menu Principal, entre em Abastecimento. Ali ficam as solicitações de combustível.',
      },
      {
        title: 'Nova solicitação',
        body: 'Informe veículo, posto/tipo (quando aplicável), valor ou litros e justificativa. Anexe comprovante se a regra pedir.',
      },
      {
        title: 'Acompanhe a aprovação',
        body: 'Após enviar, acompanhe o status até a liberação ou a necessidade de correção.',
      },
    ],
  },
  {
    slug: 'usar-meus-chamados',
    title: 'Usar Meus Chamados',
    summary: 'Como abrir e acompanhar seus chamados de manutenção/OS.',
    setor: 'Engenharia',
    keywords: ['meus chamados', 'OS', 'manutenção', 'chamado'],
    href: '/ponto/meus-chamados',
    steps: [
      {
        title: 'Abra Meus Chamados',
        body: 'No menu Principal, acesse Meus Chamados. A lista mostra os chamados abertos por você ou sob sua responsabilidade.',
      },
      {
        title: 'Abra um novo chamado',
        body: 'Informe local/equipamento, descrição do problema e prioridade. Anexe fotos se ajudar o atendimento.',
      },
      {
        title: 'Acompanhe o status',
        body: 'Filtre por status (aberto, em andamento, concluído). Abra o detalhe para ver atualizações da equipe.',
      },
    ],
  },
  {
    slug: 'usar-entrega-da-logistica',
    title: 'Usar Entrega da Logística',
    summary: 'Como registrar e acompanhar entregas no fluxo de logística.',
    setor: 'Suprimentos',
    keywords: ['entrega', 'logística', 'recebimento', 'transporte'],
    href: '/ponto/entrega-logistica',
    steps: [
      {
        title: 'Abra Entrega da Logística',
        body: 'No menu Principal, acesse Entrega da Logística. A tela organiza entregas a registrar ou confirmar.',
      },
      {
        title: 'Registre ou selecione a entrega',
        body: 'Informe destino, materiais/volumes e dados do transporte. Confirme volumes e destinatário antes de salvar.',
      },
      {
        title: 'Atualize o status',
        body: 'Conforme a carga sai ou chega, atualize o andamento na própria tela para a engenharia/suprimentos acompanharem.',
      },
    ],
  },

  // ——— Departamento Pessoal ———
  {
    slug: 'cadastrar-funcionario',
    title: 'Cadastrar funcionário',
    summary:
      'Passo a passo para criar um novo funcionário em Funcionários e Externos, do formulário até a senha inicial.',
    setor: 'Departamento Pessoal',
    keywords: ['funcionário', 'cadastro', 'DP', 'novo colaborador', 'criar usuário'],
    href: '/ponto/funcionarios',
    steps: [
      {
        title: 'Abra Funcionários e Externos',
        body: 'No menu Departamento Pessoal, acesse Funcionários e Externos. É preciso ter permissão de criar funcionários.',
        hint: 'Se o botão de criar não aparecer, peça liberação da permissão no módulo Funcionários.',
      },
      {
        title: 'Inicie um novo cadastro',
        body: 'Clique em Criar Funcionário. O formulário abre em etapas: Dados Pessoais, Profissionais, Valores, Bancários e Horário.',
      },
      {
        title: 'Preencha e salve',
        body: 'Informe e-mail e CPF únicos, dados profissionais e horário. Na última etapa, salve. O colaborador entra com a senha inicial definida.',
        hint: 'No primeiro login, o sistema pode solicitar troca de senha.',
      },
    ],
  },
  {
    slug: 'usar-folha-de-pagamento',
    title: 'Usar Folha de Pagamento',
    summary: 'Como consultar a folha e os demonstrativos no módulo de DP.',
    setor: 'Departamento Pessoal',
    keywords: ['folha', 'pagamento', 'holerite', 'salário'],
    href: '/ponto/folha-pagamento',
    steps: [
      {
        title: 'Abra Folha de Pagamento',
        body: 'No menu Departamento Pessoal, acesse Folha de Pagamento.',
      },
      {
        title: 'Selecione competência e filtros',
        body: 'Escolha mês/ano e, se disponível, centro de custo ou colaborador para restringir a lista.',
      },
      {
        title: 'Consulte o detalhe',
        body: 'Abra o registro para ver proventos, descontos e totais. Exporte ou imprima se a tela oferecer a opção.',
      },
    ],
  },
  {
    slug: 'usar-ausencias',
    title: 'Usar Ausências (atestados)',
    summary: 'Como registrar e acompanhar atestados e ausências.',
    setor: 'Departamento Pessoal',
    keywords: ['ausência', 'atestado', 'falta', 'licença'],
    href: '/ponto/atestados',
    steps: [
      {
        title: 'Abra Ausências',
        body: 'No menu Departamento Pessoal, acesse Ausências. Veja os registros já enviados.',
      },
      {
        title: 'Envie um atestado',
        body: 'Informe período, tipo e anexe o documento. Confira datas antes de enviar.',
      },
      {
        title: 'Acompanhe a análise',
        body: 'O status muda após análise do DP. Em Gerenciar Ausências, quem tiver permissão valida ou devolve com motivo.',
      },
    ],
  },
  {
    slug: 'usar-alteracoes-de-ponto',
    title: 'Usar Alterações de Ponto',
    summary: 'Como solicitar ajuste de batida e acompanhar a aprovação.',
    setor: 'Departamento Pessoal',
    keywords: ['ponto', 'batida', 'ajuste', 'marcação'],
    href: '/ponto/solicitacoes',
    steps: [
      {
        title: 'Abra Alterações de Ponto',
        body: 'No menu Departamento Pessoal, acesse Alterações de Ponto.',
      },
      {
        title: 'Monte a solicitação',
        body: 'Informe data, horários corretos e justificativa. Anexe evidência se a política exigir.',
      },
      {
        title: 'Aguarde a decisão',
        body: 'Acompanhe o status. Gestores usam Gerenciar Alterações de Ponto para aprovar ou recusar.',
      },
    ],
  },
  {
    slug: 'atender-central-de-atendimentos',
    title: 'Atender na Central de Atendimentos',
    summary:
      'Como localizar conversas aguardando atendente, responder e encerrar o atendimento humano.',
    setor: 'Departamento Pessoal',
    keywords: ['whatsapp', 'atendente', 'central de atendimentos', 'conversa'],
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
        title: 'Responda e encerre',
        body: 'Selecione a conversa, responda no painel e encerre quando o caso estiver resolvido.',
      },
    ],
  },
  {
    slug: 'usar-ferias',
    title: 'Usar Férias',
    summary: 'Como solicitar férias e acompanhar a programação.',
    setor: 'Departamento Pessoal',
    keywords: ['férias', 'gozo', 'programação'],
    href: '/ponto/ferias',
    steps: [
      {
        title: 'Abra Férias',
        body: 'No menu Departamento Pessoal, acesse Férias.',
      },
      {
        title: 'Solicite o período',
        body: 'Informe início, fim e demais campos exigidos. Confira o saldo antes de enviar.',
      },
      {
        title: 'Acompanhe a aprovação',
        body: 'Gestores usam Gerenciar Férias para analisar. Você vê o status na própria lista.',
      },
    ],
  },
  {
    slug: 'usar-banco-de-horas',
    title: 'Usar Banco de Horas',
    summary: 'Como consultar saldo e movimentações do banco de horas.',
    setor: 'Departamento Pessoal',
    keywords: ['banco de horas', 'horas extras', 'saldo'],
    href: '/ponto/banco-horas',
    steps: [
      {
        title: 'Abra Banco de Horas',
        body: 'No menu Departamento Pessoal, acesse Banco de Horas.',
      },
      {
        title: 'Consulte o saldo',
        body: 'Veja o saldo atual e o histórico de créditos/débitos por período.',
      },
      {
        title: 'Esclareça divergências',
        body: 'Se algo não bater com o esperado, abra o detalhe do dia ou fale com o DP pelo canal interno.',
      },
    ],
  },

  // ——— Financeiro / Métricas ———
  {
    slug: 'usar-controle-financeiro',
    title: 'Usar Controle Financeiro',
    summary: 'Como lançar e consultar movimentações no controle financeiro.',
    setor: 'Financeiro',
    keywords: ['controle financeiro', 'lançamento', 'despesa', 'pagamento'],
    href: '/ponto/financeiro/controle-financeiro',
    steps: [
      {
        title: 'Abra Controle Financeiro',
        body: 'No menu Financeiro, acesse Controle Financeiro.',
      },
      {
        title: 'Filtre o período',
        body: 'Use filtros de data, centro de custo ou status para achar lançamentos.',
      },
      {
        title: 'Crie ou edite lançamentos',
        body: 'Com permissão, inclua novos lançamentos (valores, anexos, vínculo com OC quando houver) e salve.',
      },
    ],
  },
  {
    slug: 'usar-receitas',
    title: 'Usar Receitas',
    summary: 'Como acompanhar receitas e registros financeiros de entrada.',
    setor: 'Financeiro',
    keywords: ['receitas', 'entrada', 'financeiro'],
    href: '/ponto/financeiro/receitas',
    steps: [
      {
        title: 'Abra Receitas',
        body: 'No menu Financeiro, acesse Receitas.',
      },
      {
        title: 'Consulte e filtre',
        body: 'Filtre por período ou contrato/cliente. Abra o detalhe para ver valores e documentos.',
      },
      {
        title: 'Registre quando autorizado',
        body: 'Se sua permissão permitir inclusão, preencha os campos obrigatórios e salve o registro.',
      },
    ],
  },
  {
    slug: 'usar-pagamento-da-folha',
    title: 'Usar Pagamento da Folha',
    summary: 'Como acompanhar o fluxo de pagamento da folha no financeiro.',
    setor: 'Financeiro',
    keywords: ['pagamento da folha', 'folha', 'financeiro'],
    href: '/ponto/financeiro',
    steps: [
      {
        title: 'Abra Pagamento da Folha',
        body: 'No menu Financeiro, acesse Pagamento da Folha.',
      },
      {
        title: 'Selecione a competência',
        body: 'Escolha o mês/ano da folha a processar ou consultar.',
      },
      {
        title: 'Confira totais e status',
        body: 'Revise valores e andamento do pagamento. Só avance etapas se tiver alçada para isso.',
      },
    ],
  },
  {
    slug: 'usar-balanco-financeiro',
    title: 'Usar Balanço Financeiro',
    summary: 'Como analisar extrato e visão consolidada nas métricas financeiras.',
    setor: 'Financeiro',
    keywords: ['balanço', 'extrato', 'métricas', 'análise'],
    href: '/ponto/financeiro/analise-extrato',
    steps: [
      {
        title: 'Abra Balanço Financeiro',
        body: 'No menu Métricas, acesse Balanço Financeiro.',
      },
      {
        title: 'Defina o recorte',
        body: 'Escolha período e demais filtros para montar a visão do extrato/balanço.',
      },
      {
        title: 'Interprete os números',
        body: 'Use gráficos e tabelas para comparar entradas e saídas. Exporte se a tela oferecer.',
      },
    ],
  },
  {
    slug: 'usar-controle-de-nfs',
    title: "Usar Controle de NF's",
    summary: 'Como acompanhar notas fiscais no módulo de métricas/financeiro.',
    setor: 'Financeiro',
    keywords: ['NF', 'nota fiscal', 'controle de nfs'],
    href: '/ponto/financeiro/controle-nfs',
    steps: [
      {
        title: "Abra Controle de NF's",
        body: 'No menu Métricas, acesse Controle de NF’s.',
      },
      {
        title: 'Busque a nota',
        body: 'Filtre por número, fornecedor, período ou status.',
      },
      {
        title: 'Abra o detalhe',
        body: 'Confira valores, vínculos e anexos. Atualize o status conforme o processo da empresa.',
      },
    ],
  },

  // ——— Engenharia ———
  {
    slug: 'usar-central-de-chamados',
    title: 'Usar Central de Chamados',
    summary: 'Como gerenciar OS/chamados na Central de Chamados da engenharia.',
    setor: 'Engenharia',
    keywords: ['central de chamados', 'gestão OS', 'manutenção'],
    href: '/ponto/sistema-gestao-os',
    steps: [
      {
        title: 'Abra a Central de Chamados',
        body: 'No menu Engenharia, acesse Central de Chamados.',
      },
      {
        title: 'Filtre o quadro',
        body: 'Use status, contrato, prioridade ou responsável para achar o chamado.',
      },
      {
        title: 'Atualize o atendimento',
        body: 'Abra o detalhe, registre andamento, materiais ou conclusão conforme o fluxo da OS.',
      },
    ],
  },
  {
    slug: 'usar-contratos-engenharia',
    title: 'Usar Contratos (Engenharia)',
    summary: 'Como consultar contratos e dados vinculados à engenharia.',
    setor: 'Engenharia',
    keywords: ['contratos', 'engenharia', 'contrato'],
    href: '/ponto/contratos',
    steps: [
      {
        title: 'Abra Contratos',
        body: 'No menu Engenharia, acesse Contratos.',
      },
      {
        title: 'Localize o contrato',
        body: 'Busque por nome, número ou centro de custo/posto.',
      },
      {
        title: 'Consulte o detalhe',
        body: 'Abra o contrato para ver OS, medições, documentos e demais vínculos disponíveis.',
      },
    ],
  },
  {
    slug: 'usar-ordem-de-servico',
    title: 'Usar Ordem de Serviço (andamento)',
    summary: 'Como acompanhar o andamento das OS no módulo de engenharia.',
    setor: 'Engenharia',
    keywords: ['ordem de serviço', 'OS', 'andamento'],
    href: '/ponto/andamento-da-os',
    steps: [
      {
        title: 'Abra Ordem de Serviço',
        body: 'No menu Engenharia, acesse Ordem de Serviço (andamento da OS).',
      },
      {
        title: 'Filtre as OS',
        body: 'Use contrato, número ou status para encontrar a OS desejada.',
      },
      {
        title: 'Acompanhe etapas',
        body: 'Abra o detalhe para ver fases, pendências e documentos ligados à OS.',
      },
    ],
  },
  {
    slug: 'usar-fichas-de-demanda',
    title: 'Usar Fichas de Demanda',
    summary: 'Como acompanhar FDs e o fluxo de aprovação.',
    setor: 'Engenharia',
    keywords: ['ficha de demanda', 'FD', 'aprovação'],
    href: '/ponto/aprovacao-fds',
    steps: [
      {
        title: 'Abra Fichas de Demanda',
        body: 'No menu Engenharia, acesse Fichas de Demanda.',
      },
      {
        title: 'Revise a FD',
        body: 'Abra o item, confira escopo, anexos e valores.',
      },
      {
        title: 'Aprove ou devolva',
        body: 'Com permissão, aprove ou devolva para correção. Em Suprimentos, FDs aprovadas seguem o fluxo de compras.',
      },
    ],
  },
  {
    slug: 'usar-recebimento-de-entregas',
    title: 'Usar Recebimento de Entregas',
    summary: 'Como confirmar recebimento de materiais na engenharia.',
    setor: 'Engenharia',
    keywords: ['recebimento', 'entrega', 'materiais', 'conferência'],
    href: '/ponto/recebimento-entregas',
    steps: [
      {
        title: 'Abra Recebimento de Entregas',
        body: 'No menu Engenharia, acesse Recebimento de Entregas.',
      },
      {
        title: 'Localize a entrega',
        body: 'Filtre por OC, RM ou posto. Abra o item pendente de conferência.',
      },
      {
        title: 'Confira e registre',
        body: 'Valide quantidades e condições. Registre recebimento total ou parcial e informe divergências se houver.',
      },
    ],
  },

  // ——— Contratos e Licitações ———
  {
    slug: 'usar-espelho-da-nota-fiscal',
    title: 'Usar Espelho da Nota Fiscal',
    summary: 'Como consultar o espelho de NF no módulo de contratos e licitações.',
    setor: 'Contratos e Licitações',
    keywords: ['espelho NF', 'nota fiscal', 'licitações'],
    href: '/ponto/espelho-nf',
    steps: [
      {
        title: 'Abra Espelho da Nota Fiscal',
        body: 'No menu Contratos e Licitações, acesse Espelho da Nota Fiscal.',
      },
      {
        title: 'Busque a NF',
        body: 'Filtre por número, contrato ou período.',
      },
      {
        title: 'Consulte o espelho',
        body: 'Abra o registro para ver dados fiscais e documentos associados.',
      },
    ],
  },
  {
    slug: 'usar-licitacoes',
    title: 'Usar Licitações',
    summary: 'Como acompanhar processos licitatórios cadastrados no sistema.',
    setor: 'Contratos e Licitações',
    keywords: ['licitações', 'edital', 'pregão'],
    href: '/ponto/licitacoes',
    steps: [
      {
        title: 'Abra Licitações',
        body: 'No menu Contratos e Licitações, acesse Licitações.',
      },
      {
        title: 'Filtre o processo',
        body: 'Busque por número, órgão ou status.',
      },
      {
        title: 'Abra o detalhe',
        body: 'Consulte documentos, prazos e andamento. Atualize campos se tiver permissão de edição.',
      },
    ],
  },
  {
    slug: 'usar-pncp',
    title: 'Usar PNCP',
    summary: 'Como consultar informações do PNCP no sistema.',
    setor: 'Contratos e Licitações',
    keywords: ['PNCP', 'compras públicas', 'licitação'],
    href: '/ponto/licitacoes-pncp',
    steps: [
      {
        title: 'Abra PNCP',
        body: 'No menu Contratos e Licitações, acesse PNCP.',
      },
      {
        title: 'Pesquise o registro',
        body: 'Use filtros e busca para localizar o item publicado no PNCP.',
      },
      {
        title: 'Consulte os dados',
        body: 'Abra o detalhe para ver informações e vínculos disponíveis na tela.',
      },
    ],
  },
  {
    slug: 'usar-medicoes',
    title: 'Usar Medições',
    summary: 'Como importar e visualizar planilhas de medição de contratos.',
    setor: 'Contratos e Licitações',
    keywords: ['medição', 'planilha', 'contrato'],
    href: '/ponto/contratos/medicao',
    steps: [
      {
        title: 'Abra Medições',
        body: 'No menu Contratos e Licitações, acesse Medições.',
      },
      {
        title: 'Selecione o contrato',
        body: 'Escolha o contrato/período da medição que deseja ver ou importar.',
      },
      {
        title: 'Importe ou consulte',
        body: 'Com permissão, importe a planilha no formato aceito. Depois confira totais e linhas no detalhe.',
      },
    ],
  },

  // ——— Jurídico ———
  {
    slug: 'usar-processos-ativos',
    title: 'Usar Processos Ativos (Jurídico)',
    summary: 'Como consultar processos jurídicos em andamento.',
    setor: 'Jurídico',
    keywords: ['jurídico', 'processos', 'causa'],
    href: '/ponto/juridico/processos-ativos',
    steps: [
      {
        title: 'Abra Processos Ativos',
        body: 'No menu Jurídico, acesse Processos Ativos.',
      },
      {
        title: 'Filtre a carteira',
        body: 'Busque por número, parte ou status do processo.',
      },
      {
        title: 'Consulte o andamento',
        body: 'Abra o detalhe para ver movimentações, documentos e indicadores ligados ao caso.',
      },
    ],
  },
  {
    slug: 'usar-dashboard-processos',
    title: 'Usar Dashboard dos Processos',
    summary: 'Como ler indicadores de causas, sentenças e acordos.',
    setor: 'Jurídico',
    keywords: ['dashboard', 'jurídico', 'indicadores'],
    href: '/ponto/juridico/processos-ativos/dashboard',
    steps: [
      {
        title: 'Abra o Dashboard',
        body: 'No menu Jurídico, acesse Dashboards dos Processos.',
      },
      {
        title: 'Aplique filtros',
        body: 'Restrinja por período ou tipo para focar o indicador desejado.',
      },
      {
        title: 'Analise os gráficos',
        body: 'Use os painéis de causas, sentenças, recursos e acordos para acompanhar a carteira.',
      },
    ],
  },

  // ——— Suprimentos ———
  {
    slug: 'abrir-rm',
    title: 'Abrir uma RM',
    summary:
      'Como criar uma Nova Solicitação de Material, informar itens e enviar a RM para análise.',
    setor: 'Suprimentos',
    keywords: ['RM', 'requisição', 'materiais', 'solicitar materiais'],
    href: '/ponto/solicitar-materiais',
    steps: [
      {
        title: 'Abra Solicitar Materiais',
        body: 'Acesse a tela de Solicitar Materiais (RMs). Ali você vê suas solicitações e o status de cada uma.',
      },
      {
        title: 'Clique em Nova Solicitação',
        body: 'Abra o formulário, informe contrato/OS, prioridade e adicione os itens (material/serviço, quantidade, unidade).',
        hint: 'Revise descrições e valores antes de enviar — isso evita correção de RM depois.',
      },
      {
        title: 'Crie a solicitação',
        body: 'Clique em Criar Solicitação e acompanhe o status até aprovação, mapa de cotação e OC.',
      },
    ],
  },
  {
    slug: 'usar-requisicoes-de-materiais',
    title: 'Usar Requisições de Materiais (gerenciar)',
    summary: 'Como gerenciar RMs aprovadas, situação dos itens e vínculo com OCs.',
    setor: 'Suprimentos',
    keywords: ['gerenciar materiais', 'RM', 'aprovadas', 'OC'],
    href: '/ponto/gerenciar-materiais',
    steps: [
      {
        title: 'Abra Requisições de Materiais',
        body: 'No menu Suprimentos, acesse Requisições de Materiais.',
      },
      {
        title: 'Filtre por status',
        body: 'Use cards e filtros (aprovadas, aguardando OC, canceladas) para achar a RM.',
      },
      {
        title: 'Abra o detalhe',
        body: 'No modal, use as abas Resumo, Materiais, Ordens de compra, Documentos e Comentários para acompanhar o fluxo completo.',
      },
    ],
  },
  {
    slug: 'usar-mapa-de-cotacao',
    title: 'Usar Mapa de Cotação',
    summary: 'Como comparar fornecedores e gerar OC a partir do mapa.',
    setor: 'Suprimentos',
    keywords: ['mapa de cotação', 'cotação', 'fornecedor', 'vencedor'],
    href: '/ponto/mapa-cotacao',
    steps: [
      {
        title: 'Abra o Mapa de Cotação',
        body: 'No menu Suprimentos, acesse Mapa de Cotação.',
      },
      {
        title: 'Selecione a RM',
        body: 'Escolha uma RM aprovada com itens ainda sem OC. Inclua os fornecedores para comparar.',
      },
      {
        title: 'Lance preços e gere a OC',
        body: 'Informe valores por item/fornecedor, marque vencedores e gere a OC. Preencha pagamento e anexos no modal antes de confirmar.',
      },
    ],
  },
  {
    slug: 'usar-ordens-de-compra',
    title: 'Usar Ordens de Compra',
    summary: 'Como acompanhar as fases da OC, do rascunho ao pagamento.',
    setor: 'Suprimentos',
    keywords: ['OC', 'ordem de compra', 'fases', 'pagamento', 'boleto'],
    href: '/ponto/ordem-de-compra',
    steps: [
      {
        title: 'Abra Ordens de Compra',
        body: 'No menu Suprimentos, acesse Ordens de Compra. As abas no topo são as fases do fluxo (aprovações, boleto, pagamento, NF, etc.).',
      },
      {
        title: 'Entre na fase correta',
        body: 'Clique na aba da etapa em que a OC está (ex.: Pagamento). Use busca por OC, RM ou fornecedor.',
      },
      {
        title: 'Abra o detalhe da OC',
        body: 'No modal, veja Resumo, Materiais, Pagamento, Documentos e Comentários. Execute a ação da fase (aprovar, anexar boleto, lançar, etc.).',
      },
    ],
  },
  {
    slug: 'usar-estoque',
    title: 'Usar Estoque',
    summary:
      'Como registrar entradas e saídas vinculadas à OC, e quando usar o Ajuste de Estoque avulso.',
    setor: 'Suprimentos',
    keywords: [
      'estoque',
      'saldo',
      'entrada',
      'saída',
      'OC',
      'NF',
      'ficha de retirada',
      'ajuste',
    ],
    href: '/ponto/estoque',
    steps: [
      {
        title: 'Abra Estoque',
        body: 'No menu Suprimentos, acesse Estoque. Lá você consulta saldos e lança movimentações vinculadas a uma Ordem de Compra (OC).',
      },
      {
        title: 'Entrada (material chegou)',
        body: 'Clique em Nova Movimentação, escolha o contrato e a OC. Marque Entrada (total ou parcial) e informe as quantidades. Anexe a NF (obrigatória) e, se for o caso, os boletos. Ao confirmar, o saldo sobe e os documentos aparecem na OC.',
        hint: 'Se a entrada for parcial, o sistema gera ou atualiza um furo de estoque com o que ainda falta receber.',
      },
      {
        title: 'Saída (vai para a obra)',
        body: 'Na mesma OC, escolha Saída (total ou parcial), apenas do que já entrou e ainda não saiu. Gere a Ficha de Retirada, imprima e assine. Anexe a ficha assinada e confirme: o saldo diminui e a OC passa a mostrar que o material está na obra.',
      },
      {
        title: 'Ajuste de Estoque (avulso — sem OC)',
        body: 'Quando o material já está no saldo, mas a movimentação não é por aquela OC, use Ajuste de Estoque → Novo Ajuste. Escolha Entrada (sobe o saldo) ou Saída (baixa, se houver quantidade disponível), selecione o material e a quantidade, informe o centro de custo se precisar, adicione observações e clique em Registrar Ajuste.',
        hint: 'Estoque = entrada/saída pela OC. Ajuste de Estoque = correção ou retirada avulsa, sem vincular OC, NF ou ficha.',
      },
    ],
  },
  {
    slug: 'usar-controle-de-entregas',
    title: 'Usar Controle de Entregas',
    summary: 'Como acompanhar entregas de material e o recebimento pela engenharia.',
    setor: 'Suprimentos',
    keywords: ['controle de entregas', 'entrega', 'material'],
    href: '/ponto/controle-entregas',
    steps: [
      {
        title: 'Abra Controle de Entregas',
        body: 'No menu Suprimentos, acesse Controle de Entregas.',
      },
      {
        title: 'Filtre pendências',
        body: 'Separe o que aguarda envio, em trânsito ou já recebido.',
      },
      {
        title: 'Atualize o registro',
        body: 'Abra a entrega, confira itens e registre o andamento até o recebimento pela engenharia.',
      },
    ],
  },
  {
    slug: 'usar-furo-de-estoque',
    title: 'Usar Furo de Estoque',
    summary:
      'Como acompanhar o que faltou receber após entrada parcial na OC e encerrar a pendência.',
    setor: 'Suprimentos',
    keywords: [
      'furo de estoque',
      'parcial',
      'pendência',
      'entrada parcial',
      'OC',
      'recebimento',
    ],
    href: '/ponto/furo-estoque',
    steps: [
      {
        title: 'Quando nasce um furo',
        body: 'Ao registrar Entrada parcial no Estoque (recebeu menos do que a OC pediu), o sistema gera ou atualiza um furo com o material e a quantidade ainda em aberto.',
      },
      {
        title: 'Abra Furo de Estoque',
        body: 'No menu Suprimentos, acesse Furo de Estoque. Use os filtros (Aberto / Resolvido) e a busca para achar a OC, o material ou o contrato.',
      },
      {
        title: 'Identifique a pendência',
        body: 'Abra o registro para ver o que foi pedido, o que já entrou e o que ainda falta. Essa tela é o painel de acompanhamento do que faltou receber.',
      },
      {
        title: 'Trate e encerre',
        body: 'Quando o restante chegar, registre a Entrada da mesma OC em Estoque (o furo tende a zerar com o recebimento). Se a pendência foi tratada de outro jeito (acordo com fornecedor, ajuste manual etc.), abra o furo e use Encerrar como Resolvido.',
        hint: 'Entrada/saída pela OC ficam em Estoque. Correção avulsa sem OC fica em Ajuste de Estoque. O Furo serve para acompanhar e encerrar a pendência.',
      },
    ],
  },

  // ——— Segurança do Trabalho ———
  {
    slug: 'usar-seguranca-do-trabalho',
    title: 'Usar Segurança do Trabalho',
    summary: 'Como acessar rotinas e registros de SST no sistema.',
    setor: 'Segurança do Trabalho',
    keywords: ['SST', 'segurança', 'ASO', 'trabalho'],
    href: '/ponto/seguranca-do-trabalho',
    steps: [
      {
        title: 'Abra Segurança do Trabalho',
        body: 'No menu Departamento Pessoal (ou área de SST), acesse Segurança do Trabalho.',
      },
      {
        title: 'Localize o colaborador ou registro',
        body: 'Use busca e filtros para achar exames, treinamentos ou pendências.',
      },
      {
        title: 'Atualize ou consulte',
        body: 'Abra o detalhe para registrar ou acompanhar a situação de SST conforme sua permissão.',
      },
    ],
  },
];
