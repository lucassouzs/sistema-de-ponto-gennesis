export type LotBreakdownLotConfig = {
  lotKey: string;
  label: string;
  /** Valores esperados na coluna LOTE / LOTES / SERVIÇO da planilha de NF's. */
  nfsMatchValues: readonly string[];
  /** Centros de custo na aba Base de Gastos (coluna Contrato). */
  gastosCostCenters: readonly string[];
};

export type LotBreakdownColumn = 'lote' | 'lotes' | 'servico' | 'contrato';

export type LotBreakdownTabConfig = {
  tabKey: string;
  /** Coluna da planilha NFS usada para identificar o lote. */
  lotColumn: LotBreakdownColumn;
  lots: readonly LotBreakdownLotConfig[];
};

/** Contratos que devem ser exibidos separados por lote no Controle Geral. */
export const NFS_TAB_LOT_BREAKDOWN: readonly LotBreakdownTabConfig[] = [
  {
    tabKey: 'tjgo-manutencao',
    lotColumn: 'lote',
    lots: [
      {
        lotKey: 'lote-2',
        label: 'Lote 2 — Rio Verde',
        nfsMatchValues: ['2'],
        gastosCostCenters: [
          'TJ MANUTENÇÃO RIO VERDE - CORRETIVA',
          'TJGO MANUTENÇÃO LOTE 02'
        ]
      },
      {
        lotKey: 'lote-6',
        label: 'Lote 6 — Caldas Novas',
        nfsMatchValues: ['6'],
        gastosCostCenters: ['TJ MANUTENÇÃO CALDAS NOVAS - CORRETIVA']
      }
    ]
  },
  {
    tabKey: 'tjgo-retrofit',
    lotColumn: 'lotes',
    lots: [
      {
        lotKey: 'lote-1',
        label: 'Lote 1',
        nfsMatchValues: ['1'],
        gastosCostCenters: ['TJGO - RETROFIT']
      },
      {
        lotKey: 'lote-4',
        label: 'Lote 4',
        nfsMatchValues: ['4'],
        gastosCostCenters: ['TJGO RETROFIT R5 - LOTE 4']
      },
      {
        lotKey: 'lote-5',
        label: 'Lote 5',
        nfsMatchValues: ['5'],
        // Faturamento/líquido/recebido do lote 5 pertencem só ao R5 — Parceiros é outro contrato.
        gastosCostCenters: ['TJGO RETROFIT R5 - LOTE 5']
      }
    ]
  },
  {
    tabKey: 'ses',
    lotColumn: 'lote',
    lots: [
      {
        lotKey: 'lote-10',
        label: 'Lote 10',
        nfsMatchValues: ['SES - LOTE 10'],
        gastosCostCenters: ['SES - LOTE 10']
      },
      {
        lotKey: 'lote-12',
        label: 'Lote 12',
        nfsMatchValues: ['SES - LOTE 12'],
        gastosCostCenters: ['SES - LOTE 12']
      },
      {
        lotKey: 'lote-14',
        label: 'Lote 14',
        nfsMatchValues: ['SES - LOTE 14'],
        gastosCostCenters: ['SES - LOTE 14']
      },
      {
        lotKey: 'lote-17',
        label: 'Lote 17',
        nfsMatchValues: ['SES - LOTE 17'],
        gastosCostCenters: ['SES - LOTE 17']
      }
    ]
  },
  {
    tabKey: 'sedes',
    lotColumn: 'lote',
    lots: [
      {
        lotKey: 'sedes',
        label: 'SEDES (Lote 01, Lotes 6 e 7)',
        nfsMatchValues: ['LOTE 01', 'LOTE 1', 'LOTES 6 e 7', 'LOTES 6 E 7'],
        gastosCostCenters: ['SEDES']
      },
      {
        lotKey: 'sedes-norte',
        label: 'SEDES Norte (Lote 02)',
        nfsMatchValues: ['LOTE 02', 'LOTE 2', 'SEDES NORTE'],
        gastosCostCenters: ['SEDES NORTE']
      }
    ]
  },
  {
    tabKey: 'confea',
    lotColumn: 'lote',
    lots: [
      {
        lotKey: 'lote-508',
        label: 'Lote 508',
        nfsMatchValues: ['508'],
        gastosCostCenters: ['CONFEA - 508 NORTE']
      },
      {
        lotKey: 'lote-516',
        label: 'Lote 516',
        nfsMatchValues: ['516'],
        gastosCostCenters: ['CONFEA - 516 NORTE']
      }
    ]
  },
  {
    tabKey: 'itamaraty',
    lotColumn: 'servico',
    lots: [
      {
        lotKey: 'eventuais',
        label: 'Eventuais',
        nfsMatchValues: ['EVENTUAIS'],
        gastosCostCenters: ['ITAMARATY - SERVIÇOS EVENTUAIS']
      },
      {
        lotKey: 'mao-de-obra',
        label: 'Mão de obra',
        nfsMatchValues: ['MÃO DE OBRA', 'MAO DE OBRA'],
        gastosCostCenters: ['ITAMARATY - MÃO DE OBRA']
      }
    ]
  },
  {
    tabKey: 'hfa',
    lotColumn: 'servico',
    lots: [
      {
        lotKey: 'eventuais',
        label: 'Eventuais',
        nfsMatchValues: ['EVENTUAIS', 'SERVIÇOS EVENTUAIS', 'SERVICOS EVENTUAIS'],
        gastosCostCenters: ['HFA - SERVIÇOS EVENTUAIS']
      },
      {
        lotKey: 'mao-de-obra',
        label: 'Mão de obra',
        nfsMatchValues: ['MÃO DE OBRA', 'MAO DE OBRA'],
        gastosCostCenters: ['HFA - MÃO DE OBRA']
      }
    ]
  }
];

const LOT_BREAKDOWN_BY_TAB = new Map(NFS_TAB_LOT_BREAKDOWN.map((item) => [item.tabKey, item]));

export function getLotBreakdownForTab(tabKey: string): LotBreakdownTabConfig | undefined {
  return LOT_BREAKDOWN_BY_TAB.get(tabKey);
}

export function tabHasLotBreakdown(tabKey: string): boolean {
  return LOT_BREAKDOWN_BY_TAB.has(tabKey);
}

export function normalizeLotCellValue(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00a0/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function lotCellMatchesValues(cellValue: string, matchValues: readonly string[]): boolean {
  const normalizedCell = normalizeLotCellValue(cellValue);
  if (!normalizedCell) return false;

  return matchValues.some((candidate) => {
    const normalizedCandidate = normalizeLotCellValue(candidate);
    if (normalizedCell === normalizedCandidate) return true;

    // Valores curtos (ex.: "2", "508") exigem match exato para evitar "12" casar com "2".
    if (/^\d{1,3}$/.test(normalizedCandidate)) {
      return normalizedCell === normalizedCandidate;
    }

    return (
      normalizedCell.includes(normalizedCandidate) ||
      normalizedCandidate.includes(normalizedCell)
    );
  });
}
