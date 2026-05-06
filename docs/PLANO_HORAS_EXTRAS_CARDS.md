# Plano de Implementação - Cards de Horas Extras

## Objetivo
Adicionar dois novos cards na folha de pagamento entre "Resumo Financeiro" e "Informações de Presença" para exibir as horas extras trabalhadas pelo funcionário.

## Cards a Implementar

### 1. Card H.E 50%
**Localização**: Entre "Resumo Financeiro" e "Informações de Presença"
**Função**: Exibir horas extras com adicional de 50%

**Cálculo das Horas Extras 50%**:
- **Segunda a Quinta**: Horas trabalhadas acima de 9h/dia
- **Sexta-feira**: Horas trabalhadas acima de 8h/dia  
- **Sábado**: Todas as horas trabalhadas no sábado

**Exemplo**:
- Segunda: 10h trabalhadas = 1h extra (50%) → 1,5h no total
- Sexta: 9h trabalhadas = 1h extra (50%) → 1,5h no total
- Sábado: 4h trabalhadas = 4h extra (50%) → 6h no total

### 2. Card H.E 100%
**Localização**: Entre "Resumo Financeiro" e "Informações de Presença"
**Função**: Exibir horas extras com adicional de 100%

**Cálculo das Horas Extras 100%**:
- **Após 22h**: Qualquer hora trabalhada após as 22h em qualquer dia
- **Domingos**: Todas as horas trabalhadas em domingos
- **Feriados**: Todas as horas trabalhadas em feriados

**Exemplo**:
- Terça: 22h às 23h = 1h extra (100%) → 2h no total
- Domingo: 8h às 12h = 4h extra (100%) → 8h no total
- Feriado: 9h às 17h = 8h extra (100%) → 16h no total

## Estrutura dos Cards

### Card H.E 50%
```
┌─────────────────────────────────┐
│ 🕐 HORAS EXTRAS 50%              │
├─────────────────────────────────┤
│ Total de Horas: 1h 30min        │
│ Valor por Hora: R$ 15,00         │
│ Total: R$ 22,50                  │
└─────────────────────────────────┘
```

### Card H.E 100%
```
┌─────────────────────────────────┐
│ 🌙 HORAS EXTRAS 100%             │
├─────────────────────────────────┤
│ Total de Horas: 2h 00min        │
│ Valor por Hora: R$ 15,00         │
│ Total: R$ 30,00                  │
└─────────────────────────────────┘
```

## Lógica de Cálculo

### Para H.E 50%:
1. Buscar todos os registros de ponto do funcionário no mês
2. Para cada dia útil (seg-qui):
   - Se horas trabalhadas > 9h: calcular diferença
3. Para sexta-feira:
   - Se horas trabalhadas > 8h: calcular diferença
4. Para sábados:
   - Somar todas as horas trabalhadas
5. Somar todas as horas extras encontradas

### Para H.E 100%:
1. Buscar todos os registros de ponto do funcionário no mês
2. Para cada dia:
   - Identificar horas após 22h
3. Para domingos:
   - Somar todas as horas trabalhadas
4. Para feriados:
   - Somar todas as horas trabalhadas
5. Somar todas as horas extras encontradas

## Arquivos a Modificar

### Backend:
- `PayrollService.ts`: Adicionar cálculos de horas extras
- `TimeRecordService.ts`: Criar funções para calcular H.E 50% e 100%

### Frontend:
- `PayrollDetailModal.tsx`: Adicionar os dois novos cards
- `types/index.ts`: Adicionar interfaces para horas extras

## Valores de Referência
- **H.E 50%**: Valor da hora normal + 50%
- **H.E 100%**: Valor da hora normal + 100%
- **Valor da hora normal**: (Salário base + Periculosidade + Insalubridade) ÷ 220h (jornada mensal)

## Considerações Técnicas
- Verificar se existe tabela de feriados
- Considerar timezone para cálculo de 22h
- Validar se registros de ponto estão completos
- Tratar casos de funcionários com jornada diferenciada
