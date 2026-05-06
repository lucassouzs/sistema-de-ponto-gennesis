# Plano de Implementação: Botão de Editar Funcionário

## Objetivo
Implementar um botão de editar funcionário na lista de funcionários que permita alterar todos os dados cadastrais do funcionário através de um modal de edição.

## Contexto Atual
- ✅ **Lista de funcionários**: Implementada em `EmployeeList.tsx` com cards visuais
- ✅ **Botão de deletar**: Já existe e funciona corretamente
- ✅ **Formulário de criação**: `CreateEmployeeForm.tsx` com todos os campos necessários
- ✅ **API de atualização**: `PUT /api/users/:id` já implementada no backend
- ✅ **Validações**: CPF, email, matrícula únicos já implementadas

## Implementação Proposta

### 1. Modificações no Frontend

#### 1.1 Adicionar Botão de Editar na Lista
**Arquivo**: `sistema-de-ponto-gennesis/apps/frontend/src/components/employee/EmployeeList.tsx`

- Adicionar botão de editar ao lado do botão de deletar
- Usar ícone `Edit` do Lucide React
- Posicionar na mesma área dos botões de ação

```tsx
// Adicionar junto com o botão de deletar
<button
  onClick={(e) => {
    e.stopPropagation();
    setEditingEmployee(employee);
  }}
  className="p-2.5 text-blue-600 hover:bg-blue-50 rounded-xl transition-all duration-200 hover:scale-105"
  title="Editar funcionário"
>
  <Edit className="w-4 h-4" />
</button>
```

#### 1.2 Criar Componente EditEmployeeForm
**Arquivo**: `sistema-de-ponto-gennesis/apps/frontend/src/components/employee/EditEmployeeForm.tsx`

- Reutilizar estrutura do `CreateEmployeeForm.tsx`
- Adaptar para modo de edição (pré-preencher campos)
- Remover campo de senha (não editável)
- Adicionar validações específicas para edição

**Campos Editáveis**:
- ✅ **Dados Pessoais**: Nome, Email, CPF
- ✅ **Dados Profissionais**: Departamento, Cargo, Data de Admissão
- ✅ **Dados Financeiros**: Salário, VA, VT
- ✅ **Dados Bancários**: Banco, Agência, Conta, PIX
- ✅ **Dados da Empresa**: Empresa, Contrato, Centro de Custo, Cliente
- ✅ **Configurações**: Modalidade, Adicionais (Periculosidade, Insalubridade)
- ✅ **Status**: Ativo/Inativo, Perfil de usuário

**Campos NÃO Editáveis**:
- ❌ **Senha**: Alteração separada via modal específico
- ❌ **ID do usuário**: Não pode ser alterado
- ❌ **Matrícula**: Não pode ser alterada (identificador único)

#### 1.3 Estados e Lógica
**Arquivo**: `sistema-de-ponto-gennesis/apps/frontend/src/components/employee/EmployeeList.tsx`

```tsx
// Adicionar estados
const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
const [showEditForm, setShowEditForm] = useState(false);

// Função para abrir modal de edição
const handleEditEmployee = (employee: Employee) => {
  setEditingEmployee(employee);
  setShowEditForm(true);
};

// Função para fechar modal
const handleCloseEditForm = () => {
  setEditingEmployee(null);
  setShowEditForm(false);
};
```

#### 1.4 Integração com API
**Arquivo**: `sistema-de-ponto-gennesis/apps/frontend/src/components/employee/EditEmployeeForm.tsx`

```tsx
// Mutation para atualizar funcionário
const updateEmployeeMutation = useMutation({
  mutationFn: async (data: UpdateEmployeeData) => {
    const response = await api.put(`/users/${employeeId}`, data);
    return response.data;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['employees'] });
    toast.success('Funcionário atualizado com sucesso!');
    onClose();
  },
  onError: (error: any) => {
    toast.error(error.response?.data?.message || 'Erro ao atualizar funcionário');
  }
});
```

### 2. Modificações no Backend

#### 2.1 Atualizar UserController
**Arquivo**: `sistema-de-ponto-gennesis/apps/backend/src/controllers/UserController.ts`

- ✅ **Já implementado**: Método `updateUser` existe e funciona
- ✅ **Validações**: CPF, email, matrícula únicos já implementadas
- ✅ **Transação**: Atualização de User e Employee em transação

**Melhorias necessárias**:
- Adicionar validação de campos obrigatórios
- Melhorar tratamento de erros
- Adicionar logs de auditoria

#### 2.2 Atualizar Rotas
**Arquivo**: `sistema-de-ponto-gennesis/apps/backend/src/routes/users.ts`

- ✅ **Já implementado**: `PUT /:id` com permissões corretas
- ✅ **Permissões**: ADMIN, DEPARTAMENTO_PESSOAL, GESTOR, DIRETOR

### 3. Interface do Usuário

#### 3.1 Layout do Modal de Edição
- **Título**: "Editar Funcionário"
- **Campos organizados em seções**:
  - 👤 **Dados Pessoais**
  - 💼 **Dados Profissionais** 
  - 💰 **Dados Financeiros**
  - 🏦 **Dados Bancários**
  - 🏢 **Dados da Empresa**
  - ⚙️ **Configurações**

#### 3.2 Botões de Ação
- **Cancelar**: Fecha o modal sem salvar
- **Salvar**: Atualiza os dados e fecha o modal
- **Loading**: Mostra spinner durante salvamento

#### 3.3 Validações Visuais
- **Campos obrigatórios**: Marcados com asterisco (*)
- **Erros**: Exibidos abaixo dos campos
- **Sucesso**: Toast de confirmação

### 4. Fluxo de Funcionamento

#### 4.1 Abertura do Modal
1. Usuário clica no botão "Editar" do funcionário
2. Modal abre com dados pré-preenchidos
3. Campos editáveis ficam habilitados
4. Campos não editáveis ficam desabilitados

#### 4.2 Edição dos Dados
1. Usuário modifica os campos desejados
2. Validações em tempo real
3. Erros são exibidos imediatamente
4. Botão "Salvar" fica habilitado quando válido

#### 4.3 Salvamento
1. Usuário clica em "Salvar"
2. Dados são enviados para API
3. Backend valida e atualiza banco
4. Frontend atualiza lista automaticamente
5. Modal fecha com confirmação

### 5. Validações Implementadas

#### 5.1 Validações de Frontend
- **Campos obrigatórios**: Nome, Email, CPF
- **Formato de email**: Validação de regex
- **CPF**: Validação de dígitos verificadores
- **Datas**: Formato correto e datas válidas
- **Valores monetários**: Formato numérico

#### 5.2 Validações de Backend
- **Unicidade**: Email, CPF únicos (matrícula não é validada pois não é editável)
- **Integridade**: Relacionamentos válidos
- **Permissões**: Apenas usuários autorizados
- **Transação**: Rollback em caso de erro

### 6. Arquivos que Serão Modificados

#### Frontend
- ✅ `EmployeeList.tsx` - Adicionar botão de editar
- 🆕 `EditEmployeeForm.tsx` - Novo componente de edição
- ✅ `types/index.ts` - Interfaces TypeScript (já existem)

#### Backend
- ✅ `UserController.ts` - Método updateUser (já existe)
- ✅ `routes/users.ts` - Rota PUT (já existe)
- 🔧 Melhorias opcionais em validações

### 7. Benefícios da Implementação

#### 7.1 Para Administradores
- **Eficiência**: Edição rápida sem recriar funcionário
- **Flexibilidade**: Alterar qualquer campo necessário
- **Auditoria**: Histórico de alterações mantido
- **Validação**: Prevenção de dados inconsistentes

#### 7.2 Para o Sistema
- **Consistência**: Dados sempre atualizados
- **Integridade**: Validações robustas
- **Performance**: Atualização em tempo real
- **UX**: Interface intuitiva e responsiva

### 8. Cenários de Teste

#### 8.1 Testes Funcionais
1. **Edição básica**: Alterar nome, email, cargo
2. **Validações**: Tentar salvar com dados inválidos
3. **Unicidade**: Tentar usar email/CPF já existente
4. **Permissões**: Testar com diferentes perfis de usuário
5. **Cancelamento**: Fechar modal sem salvar
6. **Matrícula**: Verificar que campo está desabilitado

#### 8.2 Testes de Interface
1. **Responsividade**: Modal em diferentes tamanhos de tela
2. **Acessibilidade**: Navegação por teclado
3. **Performance**: Carregamento rápido dos dados
4. **Feedback**: Mensagens de erro e sucesso

### 9. Cronograma de Implementação

#### Fase 1: Frontend (2-3 horas)
1. **Criar EditEmployeeForm.tsx** (1.5h)
2. **Adicionar botão na EmployeeList.tsx** (0.5h)
3. **Integrar com API** (0.5h)
4. **Testes básicos** (0.5h)

#### Fase 2: Melhorias (1 hora)
1. **Validações avançadas** (0.5h)
2. **Tratamento de erros** (0.25h)
3. **Testes finais** (0.25h)

### 10. Considerações Técnicas

#### 10.1 Reutilização de Código
- **Formulário**: Reutilizar estrutura do CreateEmployeeForm
- **Validações**: Usar mesmas funções de validação
- **Estilos**: Manter consistência visual

#### 10.2 Performance
- **Lazy Loading**: Carregar dados apenas quando necessário
- **Debounce**: Validações com delay para evitar spam
- **Cache**: Invalidação inteligente do React Query

#### 10.3 Segurança
- **Sanitização**: Limpar dados de entrada
- **Autorização**: Verificar permissões no backend
- **Auditoria**: Log de alterações importantes

## Conclusão

Esta implementação permitirá editar funcionários de forma eficiente e segura, mantendo a consistência dos dados e proporcionando uma excelente experiência do usuário. A reutilização do código existente torna a implementação rápida e confiável.

O botão de editar será posicionado estrategicamente na interface, permitindo acesso rápido às funcionalidades de edição sem poluir a interface principal.
