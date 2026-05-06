# PLANO DE IMPLEMENTAÇÃO - VA E VT

## 🔧 1. ESTRUTURA DO BANCO DE DADOS

### Modificações no Schema Prisma:
```prisma
model Employee {
  // ... campos existentes ...
  dailyFoodVoucher    Float?  @default(33.40) // Vale Alimentação diário (padrão R$ 33,40)
  dailyTransportVoucher Float? @default(11.00) // Vale Transporte diário (padrão R$ 11,00)
  // ... outros campos ...
}

model TimeRecord {
  // ... campos existentes ...
  foodVoucherAmount   Float?  @default(0) // Valor do VA no dia
  transportVoucherAmount Float? @default(0) // Valor do VT no dia
  // ... outros campos ...
}
```

## 🎯 2. FUNCIONALIDADES IMPLEMENTADAS

### A. Cadastro de Funcionários:
- ✅ **Campo VA Diário**: Input numérico para valor do vale alimentação
- ✅ **Campo VT Diário**: Input numérico para valor do vale transporte
- ✅ **Validação**: Valores não podem ser negativos
- ✅ **Padrão**: R$ 33,40 para VA e R$ 11,00 para VT
- ✅ **Valores fixos**: Definidos no cadastro, não precisam de aprovação

### B. Cálculo Automático nos Registros:
- ✅ **Foi para o trabalho**: Adiciona VA + VT ao registro (valores completos)
- ✅ **Ausência justificada**: VA = 0, VT = 0 (não foi para o trabalho)
- ✅ **Ausência não justificada**: VA = 0, VT = 0 (não foi para o trabalho)
- ✅ **Lógica simples**: Ou foi para o trabalho e ganhou VA/VT, ou não foi e não ganhou

### C. Relatórios e Consultas:
- ✅ **Por enquanto**: Não implementar relatórios específicos
- ✅ **Futuro**: Depois implementamos relatórios se necessário

## 💡 3. IDEIAS ADICIONAIS (SIMPLIFICADAS)

### A. Configurações Básicas:
- ✅ **Valores por funcionário**: Cada funcionário tem seus valores específicos
- ✅ **Valores padrão**: R$ 33,40 VA e R$ 11,00 VT

### B. Regras de Negócio:
- ✅ **Dias úteis**: Calcular apenas dias de trabalho
- ✅ **Valores fixos**: Não mudam após definidos no cadastro

## 🚀 4. FLUXO DE FUNCIONAMENTO

### Cadastro do Funcionário:
```
1. Admin cadastra funcionário
2. Define VA diário (padrão: R$ 33,40)
3. Define VT diário (padrão: R$ 11,00)
4. Salva no banco de dados
```

### Registro de Ponto:
```
1. Funcionário bate ponto
2. Sistema verifica se foi para o trabalho
3. Se foi para o trabalho: Adiciona VA (R$ 33,40) + VT (R$ 11,00) ao registro
4. Se ausência justificada: VA = 0, VT = 0 (não foi para o trabalho)
5. Se ausência não justificada: VA = 0, VT = 0 (não foi para o trabalho)
```

### Cálculo Mensal:
```
1. Sistema soma todos os registros do mês
2. Calcula total de VA pago
3. Calcula total de VT pago
4. Valores ficam disponíveis para consulta
```

## 📊 5. EXEMPLO PRÁTICO

### Funcionário João:
- **VA Diário**: R$ 33,40
- **VT Diário**: R$ 11,00

### Registros de Setembro:
- **01/09**: Foi para o trabalho → VA: R$ 33,40, VT: R$ 11,00
- **02/09**: Ausência justificada → VA: R$ 0,00, VT: R$ 0,00 (não foi para o trabalho)
- **03/09**: Foi para o trabalho → VA: R$ 33,40, VT: R$ 11,00
- **04/09**: Ausência não justificada → VA: R$ 0,00, VT: R$ 0,00 (não foi para o trabalho)

### Total do Mês:
- **VA Total**: R$ 66,80 (2 dias que foi para o trabalho)
- **VT Total**: R$ 22,00 (2 dias que foi para o trabalho)

## 🎨 6. INTERFACE PROPOSTA

### Cadastro de Funcionário:
```
┌─────────────────────────────────────┐
│ Vale Alimentação Diário             │
│ [R$ 33,40]                         │
├─────────────────────────────────────┤
│ Vale Transporte Diário              │
│ [R$ 11,00]                         │
└─────────────────────────────────────┘
```

### Registros de Ponto:
```
┌─────────────────────────────────────┐
│ 01/09/2024 - Entrada: 08:00         │
│ VA: R$ 33,40 | VT: R$ 11,00         │
├─────────────────────────────────────┤
│ 02/09/2024 - Ausência Justificada   │
│ VA: R$ 0,00 | VT: R$ 0,00           │
└─────────────────────────────────────┘
```

## 🔧 7. IMPLEMENTAÇÃO SIMPLIFICADA

### Etapas:
1. **Etapa 1**: Campos no cadastro + banco de dados
2. **Etapa 2**: Cálculo automático nos registros
3. **Etapa 3**: Exibição nos registros existentes

### Não implementar por enquanto:
- ❌ Relatórios específicos de VA/VT
- ❌ Aprovação de valores pelo RH
- ❌ Cálculo proporcional
- ❌ Histórico de mudanças
- ❌ Notificações de limites

## ✅ 8. RESUMO DAS ALTERAÇÕES

### Valores padrão atualizados:
- **VA**: R$ 33,40 (era R$ 25,00)
- **VT**: R$ 11,00 (era R$ 8,00)

### Funcionalidades removidas:
- ❌ Cálculo proporcional
- ❌ Integração com RH (aprovação, histórico, notificações)
- ❌ Relatórios específicos (por enquanto)

### Funcionalidades mantidas:
- ✅ Campos no cadastro de funcionário
- ✅ Cálculo automático nos registros
- ✅ **Lógica simples**: Ou foi para o trabalho e ganhou VA/VT, ou não foi e não ganhou
- ✅ Valores fixos por funcionário

---

**Agora está correto! Posso começar a implementar?** 🚀
