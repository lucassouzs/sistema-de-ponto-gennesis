import type { ControleNfsTab } from './controleNfsTypes';

/** Lista completa das abas — espelha o backend (ControleNfsSheetsService), ordem alfabética. */
export const CONTROLE_NFS_TABS: ControleNfsTab[] = [
  { key: 'bbgo', label: 'BBGO', sheetName: 'BBGO' },
  { key: 'codevasf', label: 'CODEVASF', sheetName: 'CODEVASF' },
  {
    key: 'capitania-fluvial',
    label: 'CAPITANIA FLUVIAL',
    sheetName: 'CAPITANIA FLUVIAL'
  },
  { key: 'confea', label: 'CONFEA', sheetName: 'CONFEA' },
  { key: 'mapa', label: 'MAPA', sheetName: 'MAPA' },
  { key: 'fhe-df', label: 'FHE DF', sheetName: 'FHE DF' },
  { key: 'hfa', label: 'HFA', sheetName: 'HFA' },
  { key: 'itamaraty', label: 'ITAMARATY', sheetName: 'ITAMARATY' },
  { key: 'jfgo', label: 'JFGO', sheetName: 'JFGO' },
  {
    key: 'ministerio-da-cultura',
    label: 'MINISTERIO DA CULTURA',
    sheetName: 'MINISTÉRIO DA CULTURA'
  },
  { key: 'pgr', label: 'PGR', sheetName: 'PGR' },
  { key: 'sedes', label: 'SEDES', sheetName: 'SEDES' },
  {
    key: 'seinfra-aparecida',
    label: 'SEINFRA - APARECIDA',
    sheetName: 'SEINFRA - APARECIDA'
  },
  { key: 'senac-df', label: 'SENAC DF', sheetName: 'SENAC DF' },
  { key: 'ses', label: 'SES', sheetName: 'SES' },
  { key: 'stm', label: 'STM', sheetName: 'STM' },
  {
    key: 'tjgo-manutencao',
    label: 'TJGO MANUTENÇÃO',
    sheetName: 'TJGO MANUTENÇÃO'
  },
  { key: 'tjgo-retrofit', label: 'TJGO RETROFIT', sheetName: 'TJGO RETROFIT' },
  { key: 'ufg', label: 'UFG', sheetName: 'UFG' }
];
