# Plano de Implementação - Acréscimos Salariais

## Resumo
Este documento descreve a implementação da funcionalidade de acréscimos salariais para funcionários, permitindo adicionar valores extras de forma manual e controlada. A funcionalidade será integrada na tela de detalhes do funcionário (que já existe na lista de funcionários), com uma nova tabela no banco de dados para armazenar os acréscimos.

## 1. Estrutura de Dados

### 1.1 Nova Tabela no Banco de Dados
```sql
-- Tabela para armazenar acréscimos salariais
CREATE TABLE salary_adjustments (
  id VARCHAR(255) PRIMARY KEY,
  employee_id VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL, -- 'BONUS', 'OVERTIME', 'COMMISSION', 'OTHER'
  description VARCHAR(255) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  created_by VARCHAR(255) NOT NULL, -- ID do usuário que criou
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);
```

**Nota**: A tabela foi simplificada removendo os campos `month` e `year`, pois por enquanto os acréscimos não são específicos por período. Isso pode ser adicionado no futuro se necessário.

### 1.2 Tipos de Acréscimos
- **BONUS**: Bônus/Prêmio
- **OVERTIME**: Horas Extras
- **COMMISSION**: Comissão
- **OTHER**: Outros acréscimos

### 1.3 Modelo Prisma
```typescript
model SalaryAdjustment {
  id          String   @id @default(cuid())
  employeeId  String
  type        AdjustmentType
  description String
  amount      Decimal  @db.Decimal(10, 2)
  createdBy   String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  // Relacionamentos
  employee  Employee @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  creator   User     @relation(fields: [createdBy], references: [id], onDelete: Cascade)

  @@map("salary_adjustments")
}

enum AdjustmentType {
  BONUS
  OVERTIME
  COMMISSION
  OTHER
}
```

## 2. Backend Implementation

### 2.1 Service Layer
```typescript
// services/SalaryAdjustmentService.ts
export class SalaryAdjustmentService {
  // Criar acréscimo
  async createAdjustment(data: CreateAdjustmentData): Promise<SalaryAdjustment>
  
  // Listar acréscimos por funcionário
  async getAdjustmentsByEmployee(employeeId: string): Promise<SalaryAdjustment[]>
  
  // Atualizar acréscimo
  async updateAdjustment(id: string, data: UpdateAdjustmentData): Promise<SalaryAdjustment>
  
  // Deletar acréscimo
  async deleteAdjustment(id: string): Promise<void>
  
  // Calcular total de acréscimos por funcionário
  async getTotalAdjustments(employeeId: string): Promise<number>
}
```

### 2.2 Controller Layer
```typescript
// controllers/SalaryAdjustmentController.ts
export class SalaryAdjustmentController {
  // POST /api/salary-adjustments
  async createAdjustment(req: AuthRequest, res: Response, next: NextFunction)
  
  // GET /api/salary-adjustments/employee/:employeeId
  async getEmployeeAdjustments(req: AuthRequest, res: Response, next: NextFunction)
  
  // PUT /api/salary-adjustments/:id
  async updateAdjustment(req: AuthRequest, res: Response, next: NextFunction)
  
  // DELETE /api/salary-adjustments/:id
  async deleteAdjustment(req: AuthRequest, res: Response, next: NextFunction)
  
  // GET /api/salary-adjustments/:id
  async getAdjustmentById(req: AuthRequest, res: Response, next: NextFunction)
}
```

### 2.3 Rotas
```typescript
// routes/salaryAdjustments.ts
router.post('/', (req, res, next) => 
  salaryAdjustmentController.createAdjustment(req, res, next)
);

router.get('/employee/:employeeId', (req, res, next) => 
  salaryAdjustmentController.getEmployeeAdjustments(req, res, next)
);

router.get('/:id', (req, res, next) => 
  salaryAdjustmentController.getAdjustmentById(req, res, next)
);

router.put('/:id', (req, res, next) => 
  salaryAdjustmentController.updateAdjustment(req, res, next)
);

router.delete('/:id', (req, res, next) => 
  salaryAdjustmentController.deleteAdjustment(req, res, next)
);
```

## 3. Frontend Implementation

### 3.1 Integração na Tela de Detalhes do Funcionário
A funcionalidade será integrada na tela de detalhes do funcionário que já existe na lista de funcionários. Será adicionada uma nova seção para gerenciar acréscimos salariais.

```typescript
// Na tela de detalhes do funcionário existente
// Adicionar nova seção após os "Registros de Ponto"

// Seção de Acréscimos Salariais
<div className="bg-white rounded-lg border p-6 mb-6">
  <div className="flex items-center justify-between mb-4">
    <h3 className="text-lg font-semibold text-gray-900">Acréscimos Salariais</h3>
    <button
      onClick={() => setShowAddAdjustmentForm(true)}
      className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
    >
      <Plus className="w-4 h-4" />
      <span>Adicionar Acréscimo</span>
    </button>
  </div>
  
  {/* Lista de acréscimos existentes */}
        <AdjustmentsList 
          adjustments={adjustments}
          onEdit={setEditingAdjustment}
          onDelete={handleDeleteAdjustment}
        />
        
  {/* Formulário para adicionar acréscimo */}
  {showAddAdjustmentForm && (
          <AdjustmentForm 
            employeeId={employee.id}
            onSave={handleAddAdjustment}
      onCancel={() => setShowAddAdjustmentForm(false)}
          />
        )}
      </div>
```

### 3.2 Componentes Específicos

#### 3.2.1 Lista de Acréscimos
```typescript
// components/employee/AdjustmentsList.tsx
export function AdjustmentsList({ adjustments, onEdit, onDelete }: AdjustmentsListProps) {
  return (
    <div className="space-y-4">
      {adjustments.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
            <span className="text-2xl">💰</span>
          </div>
          <p className="text-lg font-medium text-gray-900 mb-2">Nenhum acréscimo adicionado</p>
          <p className="text-sm">Adicione acréscimos salariais para este funcionário.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {adjustments.map((adjustment) => (
            <div key={adjustment.id} className="bg-gray-50 p-4 rounded-lg border">
              <div className="flex items-center justify-between">
              <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getTypeColor(adjustment.type)}`}>
                    {getTypeLabel(adjustment.type)}
                  </span>
                  <span className="text-sm font-medium text-gray-900">{adjustment.description}</span>
                </div>
                  <p className="text-sm text-gray-500">
                  Adicionado em {formatDate(adjustment.createdAt)} por {adjustment.creator.name}
                </p>
              </div>
              
              <div className="flex items-center space-x-4">
                <span className="text-lg font-semibold text-green-600">
                    R$ {adjustment.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
                
                <div className="flex space-x-2">
                  <button
                    onClick={() => onEdit(adjustment)}
                      className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Editar acréscimo"
                  >
                      <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onDelete(adjustment.id)}
                      className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors"
                      title="Excluir acréscimo"
                  >
                      <Trash2 className="w-4 h-4" />
                  </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

#### 3.2.2 Formulário de Acréscimo
```typescript
// components/employee/AdjustmentForm.tsx
export function AdjustmentForm({ employeeId, adjustment, onSave, onCancel }: AdjustmentFormProps) {
  const [formData, setFormData] = useState({
    type: 'BONUS' as AdjustmentType,
    description: '',
    amount: ''
  });
  
  const adjustmentTypes = [
    { value: 'BONUS', label: 'Bônus/Prêmio' },
    { value: 'OVERTIME', label: 'Horas Extras' },
    { value: 'COMMISSION', label: 'Comissão' },
    { value: 'OTHER', label: 'Outros' }
  ];
  
  return (
    <div className="bg-white rounded-lg border p-6 mt-4">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        {adjustment ? 'Editar Acréscimo' : 'Adicionar Acréscimo'}
      </h3>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tipo de Acréscimo *
          </label>
          <select
            value={formData.type}
            onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value as AdjustmentType }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {adjustmentTypes.map(type => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Descrição *
          </label>
          <input
            type="text"
            value={formData.description}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            placeholder="Ex: Bônus de produtividade, Horas extras do projeto X..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Valor (R$) *
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={formData.amount}
            onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
            placeholder="0,00"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>
        
        <div className="flex justify-end space-x-3 pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            {adjustment ? 'Atualizar' : 'Adicionar'} Acréscimo
          </button>
        </div>
      </form>
    </div>
  );
}
```

### 3.3 Integração na Tela de Detalhes do Funcionário
A funcionalidade será integrada diretamente na tela de detalhes do funcionário que já existe. Será adicionada uma nova seção após os "Registros de Ponto" para gerenciar acréscimos salariais.

**Localização**: Na tela de detalhes do funcionário (que já existe na lista de funcionários)
**Posição**: Após a seção "Registros de Ponto"
**Funcionalidade**: Botão para adicionar acréscimos + lista de acréscimos existentes

## 4. Fluxo de Funcionamento

### 4.1 Adicionar Acréscimo
1. Usuário acessa a lista de funcionários
2. Clica em um funcionário para ver os detalhes
3. Na tela de detalhes, vê a seção "Acréscimos Salariais"
4. Clica em "Adicionar Acréscimo"
5. Formulário aparece com campos: Tipo, Descrição, Valor
6. Usuário preenche e salva
7. Acréscimo é adicionado à lista e salvo no banco de dados

### 4.2 Editar Acréscimo
1. Usuário clica em "Editar" na linha do acréscimo
2. Formulário abre com dados preenchidos
3. Usuário modifica e salva
4. Lista é atualizada

### 4.3 Excluir Acréscimo
1. Usuário clica em "Excluir" na linha do acréscimo
2. Confirmação é solicitada
3. Acréscimo é removido da lista e do banco de dados

## 5. Validações e Regras de Negócio

### 5.1 Validações
- **Valor**: Deve ser maior que zero
- **Descrição**: Obrigatória, mínimo 3 caracteres
- **Tipo**: Deve ser um dos tipos válidos (BONUS, OVERTIME, COMMISSION, OTHER)
- **Duplicação**: Não permitir acréscimos duplicados (mesmo tipo, descrição e valor)

### 5.2 Permissões
- **Apenas ADMIN**: Pode adicionar, editar e excluir acréscimos
- **Auditoria**: Registrar quem criou/modificou cada acréscimo
- **Histórico**: Manter histórico de alterações

### 5.3 Regras de Negócio
- **Funcionário**: Acréscimos são vinculados a um funcionário específico
- **Data**: Acréscimos são criados com data atual
- **Flexibilidade**: Por enquanto, não há restrições de período ou valor

## 6. Considerações Técnicas

### 6.1 Performance
- **Cache**: Cache de acréscimos por funcionário
- **Paginação**: Para funcionários com muitos acréscimos
- **Índices**: Índices em (employeeId) e (createdBy)

### 6.2 Segurança
- **Validação**: Validação tanto no frontend quanto no backend
- **Sanitização**: Sanitizar inputs para prevenir XSS
- **Rate Limiting**: Limitar número de acréscimos por usuário

### 6.3 UX/UI
- **Feedback**: Mensagens de sucesso/erro claras
- **Loading**: Estados de carregamento durante operações
- **Responsivo**: Interface responsiva para diferentes tamanhos de tela
- **Acessibilidade**: Suporte a navegação por teclado e screen readers

## 7. Ordem de Implementação

### Fase 1: Backend
1. 🔄 Criar migration para tabela salary_adjustments
2. 🔄 Atualizar schema.prisma
3. 🔄 Implementar SalaryAdjustmentService
4. 🔄 Implementar SalaryAdjustmentController
5. 🔄 Criar rotas e middleware de autenticação

### Fase 2: Frontend - Componentes Base
1. 🔄 Criar tipos TypeScript
2. 🔄 Implementar AdjustmentsList
3. 🔄 Implementar AdjustmentForm

### Fase 3: Frontend - Integração
1. 🔄 Integrar na tela de detalhes do funcionário existente
2. 🔄 Implementar estados de loading e error
3. 🔄 Adicionar validações no frontend

### Fase 4: Testes e Refinamentos
1. 🔄 Testes unitários dos services
2. 🔄 Testes de integração das APIs
3. 🔄 Testes de interface do usuário
4. 🔄 Ajustes de performance e UX

## 8. Exemplo de Uso

### 8.1 Cenário: Adicionar Bônus de Produtividade
1. **Situação**: Funcionário João Silva teve excelente performance
2. **Ação**: Admin acessa lista de funcionários, clica no João para ver detalhes
3. **Processo**: 
   - Na tela de detalhes, vê a seção "Acréscimos Salariais"
   - Clica em "Adicionar Acréscimo"
   - Seleciona tipo "Bônus/Prêmio"
   - Digita "Bônus de produtividade - Projeto Alpha"
   - Insere valor "R$ 1.500,00"
   - Salva
4. **Resultado**: 
   - Acréscimo é salvo no banco de dados
   - Aparece na lista de acréscimos do funcionário
   - Registra quem criou e quando

### 8.2 Cenário: Adicionar Horas Extras
1. **Situação**: Funcionário trabalhou horas extras em um projeto urgente
2. **Ação**: Admin adiciona acréscimo do tipo "Horas Extras"
3. **Processo**:
   - Tipo: "Horas Extras"
   - Descrição: "Horas extras - Projeto Beta (20h)"
   - Valor: "R$ 800,00"
4. **Resultado**: Acréscimo aparece na lista com data de criação e responsável

## 9. Conclusão

Esta implementação permite um controle simples e direto dos acréscimos salariais, integrando-se perfeitamente na tela de detalhes do funcionário que já existe. O sistema é flexível e pode ser facilmente estendido no futuro para incluir novos tipos de acréscimos ou regras de negócio mais complexas.

A abordagem simplificada facilita a manutenção e permite que a funcionalidade seja implementada rapidamente, sem afetar outras partes do sistema. Os acréscimos são salvos no banco de dados e podem ser consultados posteriormente quando necessário.
