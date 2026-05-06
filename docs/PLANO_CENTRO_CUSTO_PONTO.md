# Plano de Implementação: Centro de Custo no Registro de Ponto (Backend Only)

## Objetivo
Adicionar uma coluna "Centro de Custo" nos registros de ponto dos funcionários, preenchida automaticamente com base no centro de custo cadastrado no perfil do funcionário. **Este campo será salvo apenas no banco de dados e não aparecerá na interface do usuário.**

## Contexto Atual
- O campo `costCenter` já existe na tabela `Employee` no banco de dados
- Os registros de ponto são armazenados na tabela `TimeRecord`
- Atualmente não há relação direta entre o centro de custo do funcionário e o registro de ponto
- **IMPORTANTE**: O centro de custo não será exibido para o funcionário, apenas salvo internamente

## Implementação Proposta

### 1. Modificações no Banco de Dados

#### Tabela TimeRecord
- Adicionar campo `costCenter` do tipo `String?`
- Este campo será preenchido automaticamente quando o funcionário bater ponto
- Valor será copiado do campo `costCenter` da tabela `Employee`
- **Campo será apenas para controle interno, não exibido no frontend**

```sql
ALTER TABLE "TimeRecord" ADD COLUMN "costCenter" TEXT;
```

### 2. Modificações no Backend

#### TimeRecordService.ts
- Modificar método `createTimeRecord` para incluir o centro de custo
- Buscar o centro de custo do funcionário antes de criar o registro
- Incluir o centro de custo no objeto de criação do registro
- **Centro de custo será salvo automaticamente, sem intervenção do usuário**

#### TimeRecordController.ts
- Atualizar método de criação de registro para incluir centro de custo
- Garantir que o centro de custo seja sempre preenchido automaticamente

### 3. Modificações no Frontend

#### ⚠️ IMPORTANTE: Sem Alterações na Interface do Usuário
- **NÃO** adicionar coluna "Centro de Custo" na tabela de pontos do funcionário
- **NÃO** exibir centro de custo no componente PunchCard
- **NÃO** mostrar centro de custo nos detalhes do ponto para funcionários
- Interface do funcionário permanece inalterada

#### Apenas para Administradores (Opcional)
- Relatórios administrativos podem incluir centro de custo
- Dashboard administrativo pode mostrar estatísticas por centro de custo
- **Mas isso é separado da interface do funcionário**

### 4. Fluxo de Funcionamento

1. **Funcionário bate ponto:**
   - Sistema busca o centro de custo do funcionário na tabela `Employee`
   - Cria registro na tabela `TimeRecord` incluindo o centro de custo
   - **Funcionário não vê essa informação na tela**

2. **Visualização do ponto pelo funcionário:**
   - Interface permanece igual, sem mostrar centro de custo
   - Funcionário vê apenas: data, hora, tipo de registro, foto (se houver)

3. **Relatórios administrativos (opcional):**
   - Administradores podem acessar centro de custo nos relatórios
   - Filtros e análises por centro de custo disponíveis apenas para admin

### 5. Benefícios

- **Rastreabilidade Interna**: Cada ponto fica associado ao centro de custo do momento
- **Relatórios Administrativos**: Facilita análise de custos por centro (apenas para admin)
- **Auditoria**: Histórico completo de qual centro de custo estava ativo
- **Transparência para Funcionário**: Interface limpa, sem informações desnecessárias
- **Controle Interno**: Empresa tem controle total sobre centros de custo sem confundir funcionários

### 6. Considerações Importantes

#### Cenários Especiais
- **Mudança de Centro de Custo**: Pontos antigos mantêm o centro de custo original
- **Funcionário sem Centro de Custo**: Campo pode ficar nulo ou usar valor padrão
- **Backup de Dados**: Centro de custo fica "congelado" no momento do ponto

#### Validações
- Verificar se funcionário tem centro de custo cadastrado
- Log de mudanças de centro de custo para auditoria
- Validação de integridade dos dados

### 7. Arquivos que Serão Modificados

#### Backend
- `prisma/schema.prisma` - Adicionar campo costCenter na tabela TimeRecord
- `src/services/TimeRecordService.ts` - Lógica de inclusão do centro de custo
- `src/controllers/TimeRecordController.ts` - Atualizar criação de registros
- `src/routes/timeRecords.ts` - Verificar se precisa de ajustes

#### Frontend
- **NENHUMA MODIFICAÇÃO** na interface do funcionário
- Apenas relatórios administrativos podem ser atualizados (opcional)

#### Relatórios (Opcional)
- `src/services/ReportService.ts` - Incluir centro de custo nos relatórios admin
- `src/controllers/ReportController.ts` - Filtros por centro de custo (apenas admin)

### 8. Migração de Dados

#### Dados Existentes
- Registros de ponto existentes não terão centro de custo (campo nulo)
- Apenas novos registros terão o centro de custo preenchido automaticamente
- Opcional: Script para preencher registros antigos com centro de custo atual do funcionário

### 9. Testes

#### Cenários de Teste
1. Funcionário com centro de custo cadastrado bate ponto (verificar se salva no banco)
2. Funcionário sem centro de custo cadastrado bate ponto
3. Funcionário muda de centro de custo e bate ponto
4. **Verificar que centro de custo NÃO aparece na interface do funcionário**
5. Verificar que centro de custo está salvo no banco de dados
6. Relatórios administrativos mostram centro de custo (se implementado)

### 10. Cronograma de Implementação

1. **Fase 1**: Modificação do banco de dados e backend
2. **Fase 2**: Testes para garantir que centro de custo é salvo automaticamente
3. **Fase 3**: Validação de que interface do funcionário permanece inalterada
4. **Fase 4**: Implementação opcional nos relatórios administrativos
5. **Fase 5**: Deploy e documentação

## Conclusão

Esta implementação garantirá que todos os registros de ponto dos funcionários incluam automaticamente o centro de custo no banco de dados, proporcionando controle interno e facilitando análises administrativas, **sem alterar a experiência do usuário funcionário**.

A implementação é simples, não invasiva e mantém a interface limpa para os funcionários, enquanto fornece dados valiosos para controle interno da empresa.
