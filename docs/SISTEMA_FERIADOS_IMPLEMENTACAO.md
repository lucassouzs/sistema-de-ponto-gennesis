# Sistema de Feriados - Documentação Completa

## 📋 Resumo da Implementação

Sistema completo de gerenciamento de feriados com suporte a:
- ✅ Feriados nacionais (aplicados a todos os estados)
- ✅ Feriados estaduais (DF e GO)
- ✅ Feriados municipais
- ✅ Verificação automática considerando o polo do funcionário
- ✅ Integração com banco de horas, alocação e horas extras

---

## 🗄️ Banco de Dados

### Modelo Holiday (Prisma)
```prisma
model Holiday {
  id          String      @id @default(cuid())
  name        String      // Nome do feriado
  date        DateTime    // Data do feriado
  type        HolidayType @default(NATIONAL)
  isRecurring Boolean     @default(false) // Recorrente (todos os anos)
  state       String?     // Estado (DF, GO, etc.) - null = nacional
  city        String?     // Cidade (para feriados municipais)
  description String?
  isActive    Boolean     @default(true)
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
  createdBy   String?
}
```

### Tipos de Feriado
- `NATIONAL`: Feriado nacional (todos os estados)
- `STATE`: Feriado estadual (específico de um estado)
- `MUNICIPAL`: Feriado municipal
- `OPTIONAL`: Ponto facultativo
- `COMPANY`: Feriado da empresa

---

## 🔧 Backend - Serviços

### 1. HolidayService (`src/services/HolidayService.ts`)

#### Métodos Principais:

**`isHoliday(date, state?)`**
- Verifica se uma data é feriado
- Considera feriados nacionais (`state = null`) + feriados do estado especificado
- Verifica feriados fixos e recorrentes
- **Filtro de estado:**
  ```typescript
  stateFilter = state ? {
    OR: [
      { state: null },    // Feriados nacionais
      { state: state }    // Feriados do estado
    ]
  } : {}
  ```

**`getHolidaysByPeriod(startDate, endDate, state?)`**
- Busca todos os feriados de um período
- Considera feriados fixos e recorrentes
- Aplica filtro de estado (nacionais + estaduais)

**`importNationalHolidays(year)`**
- Importa feriados nacionais para um ano
- Inclui: Confraternização Universal, Carnaval, Sexta-feira Santa, Tiradentes, Dia do Trabalho, Corpus Christi, Independência, Nossa Senhora Aparecida, Finados, Proclamação da República, Dia Nacional de Zumbi e da Consciência Negra, Natal
- Calcula datas variáveis (Páscoa, Carnaval, etc.)

---

### 2. TimeRecordService (`src/services/TimeRecordService.ts`)

#### Conversão Polo → Estado
```typescript
private poloToState(polo?: string | null): string | undefined {
  if (!polo) return undefined;
  const poloUpper = polo.toUpperCase();
  if (poloUpper.includes('BRASÍLIA') || poloUpper.includes('BRASILIA')) return 'DF';
  if (poloUpper.includes('GOIÁS') || poloUpper.includes('GOIAS')) return 'GO';
  return undefined;
}
```

#### Método `getExpectedWorkHoursByRule(date, state?)`
- **ANTES:** Calculava apenas baseado no dia da semana
- **AGORA:** Verifica se é feriado primeiro
  ```typescript
  const isHoliday = await holidayService.isHoliday(date, state);
  if (isHoliday) {
    return 0; // Feriado: não há horas esperadas
  }
  // Depois verifica dia da semana...
  ```

#### Métodos Atualizados:
1. **`calculateBankHoursDetailed(userId, startDate, endDate)`**
   - Busca o estado do funcionário (polo)
   - Calcula horas esperadas considerando feriados
   - Adiciona nota "Feriado" quando aplicável
   - **Horas esperadas = 0 em feriados**

2. **`calculateWorkHours(userId, date)`**
   - Busca o estado do funcionário
   - Considera feriados no cálculo de horas esperadas

3. **`calculatePeriodSummary(userId, startDate, endDate)`**
   - Busca o estado do funcionário uma vez
   - Considera feriados em todos os dias do período

---

### 3. HoursExtrasService (`src/services/HoursExtrasService.ts`)

#### Conversão Polo → Estado
- Mesma função `poloToState()` implementada

#### Métodos Atualizados:

**`calculateHE50ForDay(totalHours, dayOfWeek, isHoliday)`**
- Domingo e feriados não têm H.E 50%
- Sábado: todas as horas são extras 50%

**`calculateHE100ForDay(userId, date, dayOfWeek, state)`**
- Domingo: todas as horas são extras 100%
- **Feriado: todas as horas são extras 100%**
  ```typescript
  if (await this.isHoliday(date, state)) {
    return await this.calculateDayHours(userId, date);
  }
  ```

**`calculateHoursExtrasForMonth()` e `calculateHoursExtrasDetailed()`**
- Buscam o polo do funcionário
- Convertem para estado
- Passam o estado para verificação de feriados

---

### 4. TimeRecordController (`src/controllers/TimeRecordController.ts`)

#### Método `getEmployeeCostCenter(employeeId, month, year)`
- Busca o polo do funcionário
- Converte para estado
- Busca todos os feriados do mês de uma vez (otimização)
- Retorna `isHoliday: true/false` para cada dia
- Usa `Set` para verificação rápida

```typescript
const holidays = await holidayService.getHolidaysByPeriod(
  startDate, endDate, employeeState
);
const holidaysSet = new Set(holidays.map(h => moment(h.date).format('YYYY-MM-DD')));
const isHoliday = holidaysSet.has(dateKey);
```

---

## 🎨 Frontend

### 1. Página de Gerenciamento de Feriados (`app/ponto/gerenciar-feriados/page.tsx`)

#### Funcionalidades:
- ✅ Lista todos os feriados com filtros (ano, mês, tipo, estado)
- ✅ Criar/Editar/Deletar feriados
- ✅ Importar feriados nacionais automaticamente
- ✅ Campo de estado (DF ou GO) - obrigatório para estaduais/municipais
- ✅ Exibe nome completo do estado na tabela

#### Campos do Formulário:
- Nome do Feriado
- Data
- Tipo (Nacional, Estadual, Municipal, Ponto Facultativo, Empresa)
- **Estado** (DF - Brasília ou GO - Goiás) - opcional para nacionais
- Cidade (obrigatório para municipais)
- Descrição
- Recorrente (todos os anos)
- Ativo

---

### 2. Página de Alocação (`app/relatorios/alocacao/page.tsx`)

#### Funcionalidades:
- ✅ Exibe status de cada dia do mês
- ✅ **Feriados aparecem em roxo com texto "Feriado" (semibold)**
- ✅ Considera feriados nacionais + estaduais do funcionário
- ✅ Prioridade: Feriado > Final de Semana > Férias > Atestado > Falta

#### Status Exibidos:
- **Feriado** (roxo, semibold) - quando `dayData.isHoliday === true`
- Final de Semana (cinza, semibold)
- Férias (verde)
- Atestado (amarelo)
- Falta (vermelho, semibold)
- Centro de Custo (azul)

---

### 3. Página de Banco de Horas (`app/ponto/page.tsx`)

#### Funcionalidades:
- ✅ Exibe detalhamento dia a dia
- ✅ **Horas esperadas = 0 em feriados**
- ✅ **Observação "Feriado" adicionada automaticamente**
- ✅ Não marca como "Ausência no dia" em feriados

#### Colunas:
- Data
- Dia da Semana
- **Esperado** (0h em feriados)
- Trabalhado
- Horas Normais
- Horas Extras
- Devidas (0h em feriados)
- Observações (inclui "Feriado")

---

## 🔄 Fluxo de Verificação de Feriados

### 1. Quando um funcionário bate ponto:
```
1. Sistema busca o funcionário pelo userId
2. Obtém o campo `polo` (BRASÍLIA ou GOIÁS)
3. Converte polo → estado (DF ou GO)
4. Verifica se a data é feriado usando HolidayService.isHoliday(date, state)
5. Se for feriado:
   - Horas esperadas = 0
   - Todas as horas trabalhadas são extras 100%
   - Adiciona nota "Feriado"
```

### 2. Na página de alocação:
```
1. Backend busca funcionário e converte polo → estado
2. Busca todos os feriados do mês (nacionais + estaduais)
3. Para cada dia, verifica se está no Set de feriados
4. Retorna isHoliday: true/false para cada dia
5. Frontend exibe "Feriado" em roxo quando isHoliday === true
```

### 3. No cálculo de horas extras:
```
1. Sistema busca polo do funcionário
2. Converte para estado
3. Para cada dia do mês:
   - Verifica se é feriado
   - Se for feriado: todas as horas são extras 100%
   - Se não for: calcula normalmente (50% ou 100% conforme regra)
```

---

## ✅ Checklist de Funcionalidades

### Backend
- [x] Modelo Holiday no Prisma com campo `state`
- [x] HolidayService com filtro de estado
- [x] Verificação de feriados nacionais + estaduais
- [x] Suporte a feriados recorrentes
- [x] TimeRecordService considera feriados no cálculo de horas esperadas
- [x] HoursExtrasService considera feriados no cálculo de horas extras
- [x] TimeRecordController retorna isHoliday na alocação
- [x] Conversão polo → estado em todos os serviços necessários

### Frontend
- [x] Página de gerenciamento de feriados
- [x] Campo de estado no formulário (DF/GO)
- [x] Exibição de feriados na página de alocação (roxo)
- [x] Banco de horas mostra 0h esperadas em feriados
- [x] Observação "Feriado" no banco de horas
- [x] Estilos corretos (semibold, cores apropriadas)

### Integrações
- [x] Alocação de funcionários
- [x] Banco de horas detalhado
- [x] Cálculo de horas extras
- [x] Relatórios de ponto

---

## 🎯 Pontos Importantes

### 1. Filtro de Estado
- **Feriados nacionais:** `state = null` no banco
- **Feriados estaduais:** `state = 'DF'` ou `state = 'GO'`
- **Verificação:** Busca feriados onde `state IS NULL OR state = 'DF'` (exemplo)

### 2. Conversão Polo → Estado
- BRASÍLIA/BRASILIA → DF
- GOIÁS/GOIAS → GO
- Implementado em: TimeRecordService, HoursExtrasService, TimeRecordController

### 3. Otimizações
- Busca todos os feriados do mês de uma vez (não uma query por dia)
- Usa `Set` para verificação rápida O(1)
- Busca funcionário uma vez e reutiliza o estado

### 4. Datas Variáveis
- Páscoa (calculada)
- Carnaval (47 dias antes da Páscoa)
- Sexta-feira Santa (2 dias antes da Páscoa)
- Corpus Christi (60 dias após a Páscoa)

---

## 🐛 Possíveis Problemas e Soluções

### Problema: Feriado não aparece
**Solução:** Verificar se:
1. O feriado está ativo (`isActive = true`)
2. O estado está correto (null para nacional, DF/GO para estadual)
3. O funcionário tem polo cadastrado
4. A data está no formato correto

### Problema: Horas esperadas não são 0 em feriado
**Solução:** Verificar se:
1. O método `getExpectedWorkHoursByRule` está sendo chamado com o estado
2. O HolidayService está retornando `true` para `isHoliday`
3. O feriado está no banco de dados

### Problema: Feriado estadual aparece para todos
**Solução:** Verificar se:
1. O campo `state` está sendo salvo corretamente no banco
2. O filtro de estado está sendo aplicado na query
3. A conversão polo → estado está funcionando

---

## 📝 Notas Finais

- ✅ Sistema completo e funcional
- ✅ Considera feriados nacionais e estaduais
- ✅ Integrado com todas as funcionalidades de ponto
- ✅ Otimizado para performance
- ✅ Frontend exibe corretamente
- ✅ Backend calcula corretamente

**Status:** ✅ **TUDO FUNCIONANDO CORRETAMENTE**

