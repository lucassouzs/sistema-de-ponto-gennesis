import { MutableRefObject, useEffect, useRef } from 'react';

type ColumnPrefs = {
  order: string[];
  widths: Record<string, number>;
};

type TableRuntime = {
  resizing?: {
    startX: number;
    startWidth: number;
    colIndex: number;
    colKey: string;
    tableEl: HTMLTableElement;
  };
};

const STORAGE_PREFIX = 'contracts:table-columns:v1:';

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function safeLocalStorageGet(key: string): ColumnPrefs | null {
  try {
    return safeJsonParse<ColumnPrefs>(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: ColumnPrefs) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function normalizeKey(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

function getThKey(th: HTMLTableCellElement, index: number): string {
  const attrKey = th.getAttribute('data-col-key');
  if (attrKey && attrKey.trim()) return attrKey.trim();
  const txt = th.textContent?.trim() ?? '';
  if (txt) return normalizeKey(txt);
  return `col_${index}`;
}

function getHeaderRow(tableEl: HTMLTableElement): HTMLTableRowElement | null {
  const thead = tableEl.tHead;
  if (!thead) return null;
  // assume first header row for width/index mapping
  return thead.rows.length > 0 ? thead.rows[0] : null;
}

function getCurrentColumnKeys(tableEl: HTMLTableElement): string[] {
  const headerRow = getHeaderRow(tableEl);
  if (!headerRow) return [];
  const cells = Array.from(headerRow.cells);
  return cells.map((th, idx) => getThKey(th as HTMLTableCellElement, idx));
}

function applyColumnOrder(tableEl: HTMLTableElement, order: string[]) {
  const headerKeys = getCurrentColumnKeys(tableEl);
  if (headerKeys.length === 0) return;

  const indexByKey = new Map(headerKeys.map((k, i) => [k, i]));
  const existingSet = new Set(headerKeys);
  const headerRow = getHeaderRow(tableEl);
  if (!headerRow) return;
  const lockFirstKeys = Array.from(headerRow.cells)
    .map((th, idx) => ({ th: th as HTMLTableCellElement, idx }))
    .filter(({ th }) => th.getAttribute('data-col-lock-first') === '1')
    .map(({ th, idx }) => getThKey(th, idx));

  const baseOrder = [...order.filter((k) => existingSet.has(k)), ...headerKeys.filter((k) => !order.includes(k))];
  const unlocked = baseOrder.filter((k) => !lockFirstKeys.includes(k));
  const finalOrder = [...lockFirstKeys.filter((k) => existingSet.has(k)), ...unlocked];

  // Reorder thead cells
  const headerCells = Array.from(headerRow.cells);
  const finalIndices = finalOrder.map((k) => indexByKey.get(k)).filter((v): v is number => v !== undefined);
  const headerFrag = document.createDocumentFragment();
  finalIndices.forEach((idx) => headerFrag.appendChild(headerCells[idx]));
  headerRow.appendChild(headerFrag);

  const rows = Array.from(tableEl.querySelectorAll('tbody tr'));
  rows.forEach((row) => {
    const rowCells = Array.from(row.children).filter((el) => el.tagName === 'TD' || el.tagName === 'TH') as HTMLTableCellElement[];
    if (rowCells.length !== headerKeys.length) return;
    const frag = document.createDocumentFragment();
    finalIndices.forEach((idx) => frag.appendChild(rowCells[idx]));
    row.appendChild(frag);
  });
}

function applyColumnWidths(tableEl: HTMLTableElement, widths: Record<string, number>) {
  const headerKeys = getCurrentColumnKeys(tableEl);
  if (headerKeys.length === 0) return;

  const headerRow = getHeaderRow(tableEl);
  if (!headerRow) return;
  const headerCells = Array.from(headerRow.cells) as HTMLTableCellElement[];

  headerCells.forEach((th, idx) => {
    const key = headerKeys[idx];
    const w = widths[key];
    if (!w || w <= 0) return;
    th.style.width = `${w}px`;
    th.style.maxWidth = `${w}px`;
    th.style.minWidth = `${w}px`;
  });

  const rows = Array.from(tableEl.querySelectorAll('tbody tr'));
  rows.forEach((row) => {
    const rowCells = Array.from(row.children).filter((el) => el.tagName === 'TD' || el.tagName === 'TH') as HTMLTableCellElement[];
    if (rowCells.length !== headerKeys.length) return;
    rowCells.forEach((td, idx) => {
      const key = headerKeys[idx];
      const w = widths[key];
      if (!w || w <= 0) return;
      td.style.width = `${w}px`;
      td.style.maxWidth = `${w}px`;
      td.style.minWidth = `${w}px`;
    });
  });
}

function ensureResizerHandles(tableEl: HTMLTableElement) {
  const headerRow = getHeaderRow(tableEl);
  if (!headerRow) return;
  Array.from(headerRow.cells).forEach((cell) => {
    const th = cell as HTMLTableCellElement;
    const hasHandle = th.querySelector('.cc-col-resizer-handle');
    if (!hasHandle) {
      const handle = document.createElement('span');
      handle.className = 'cc-col-resizer-handle';
      handle.style.position = 'absolute';
      handle.style.top = '0';
      handle.style.right = '0';
      handle.style.height = '100%';
      handle.style.width = '6px';
        handle.style.background = 'rgba(148, 163, 184, 0.25)'; // subtle gray grip
      handle.style.cursor = 'col-resize';
      handle.style.userSelect = 'none';
      handle.style.zIndex = '10';
      th.style.position = th.style.position || 'relative';
      th.appendChild(handle);
    }
  });
}

function ensureDraggable(tableEl: HTMLTableElement) {
  const headerRow = getHeaderRow(tableEl);
  if (!headerRow) return;
  Array.from(headerRow.cells).forEach((cell) => {
    const th = cell as HTMLTableCellElement;
    th.draggable = th.getAttribute('data-col-lock-first') !== '1';
  });
}

function attachTableInteractions(tableEl: HTMLTableElement, storageKey: string, runtimeRef: MutableRefObject<TableRuntime>) {
  if (tableEl.dataset.ccInteractionsAttached === '1') return;
  tableEl.dataset.ccInteractionsAttached = '1';
  tableEl.style.tableLayout = 'fixed';
  tableEl.style.width = '100%';

  const onDragStart = (e: DragEvent) => {
    const target = e.target as HTMLElement | null;
    const th = target?.closest('th') as HTMLTableCellElement | null;
    if (!th) return;
    if (th.getAttribute('data-col-lock-first') === '1') {
      e.preventDefault();
      return;
    }
    const headerRow = getHeaderRow(tableEl);
    if (!headerRow) return;
    const cells = Array.from(headerRow.cells);
    const idx = cells.indexOf(th);
    if (idx < 0) return;
    const colKey = getThKey(th, idx);
    if (e.dataTransfer) {
      e.dataTransfer.setData('text/plain', colKey);
      e.dataTransfer.effectAllowed = 'move';
    }
  };

  const onDragOver = (e: DragEvent) => {
    const target = e.target as HTMLElement | null;
    const th = target?.closest('th');
    if (!th) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const target = e.target as HTMLElement | null;
    const th = target?.closest('th') as HTMLTableCellElement | null;
    if (!th) return;

    const draggedKey = e.dataTransfer?.getData('text/plain');
    if (!draggedKey) return;

    const headerRow = getHeaderRow(tableEl);
    if (!headerRow) return;
    const cells = Array.from(headerRow.cells);
    const targetIdx = cells.indexOf(th);
    if (targetIdx < 0) return;

    const currentKeys = getCurrentColumnKeys(tableEl);
    const draggedIdx = currentKeys.indexOf(draggedKey);
    if (draggedIdx < 0) return;

    const nextOrder = [...currentKeys];
    nextOrder.splice(draggedIdx, 1);
    nextOrder.splice(targetIdx, 0, draggedKey);

    applyColumnOrder(tableEl, nextOrder);

    const existing = safeLocalStorageGet(storageKey) ?? { order: currentKeys, widths: {} };
    safeLocalStorageSet(storageKey, { ...existing, order: nextOrder });
  };

  const onMouseDown = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    const handle = target?.closest('.cc-col-resizer-handle') as HTMLElement | null;
    if (!handle) return;

    const th = target?.closest('th') as HTMLTableCellElement | null;
    if (!th) return;
    const headerRow = getHeaderRow(tableEl);
    if (!headerRow) return;

    const cells = Array.from(headerRow.cells);
    const colIndex = cells.indexOf(th);
    if (colIndex < 0) return;
    const colKey = getThKey(th, colIndex);

    runtimeRef.current.resizing = {
      startX: e.clientX,
      startWidth: th.getBoundingClientRect().width,
      colIndex,
      colKey,
      tableEl
    };

    e.preventDefault();
    e.stopPropagation();

    const onMouseMove = (ev: MouseEvent) => {
      const rt = runtimeRef.current.resizing;
      if (!rt) return;
      const delta = ev.clientX - rt.startX;
      const nextW = Math.max(60, Math.round(rt.startWidth + delta));

      // apply live width to th + td at colIndex
      const headerRowLive = getHeaderRow(tableEl);
      if (!headerRowLive) return;
      const headerCells = Array.from(headerRowLive.cells) as HTMLTableCellElement[];
      const headerCell = headerCells[rt.colIndex];
      if (!headerCell) return;

      headerCell.style.width = `${nextW}px`;
      headerCell.style.maxWidth = `${nextW}px`;
      headerCell.style.minWidth = `${nextW}px`;

      const rows = Array.from(tableEl.querySelectorAll('tbody tr'));
      rows.forEach((row) => {
        const rowCells = Array.from(row.children).filter((el) => el.tagName === 'TD' || el.tagName === 'TH') as HTMLTableCellElement[];
        if (rowCells.length <= rt.colIndex) return;
        const td = rowCells[rt.colIndex];
        td.style.width = `${nextW}px`;
        td.style.maxWidth = `${nextW}px`;
        td.style.minWidth = `${nextW}px`;
      });
    };

    const onMouseUp = () => {
      const rt = runtimeRef.current.resizing;
      runtimeRef.current.resizing = undefined;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (!rt) return;

      const currentKeys = getCurrentColumnKeys(tableEl);
      const widths: Record<string, number> = safeLocalStorageGet(storageKey)?.widths ?? {};
      const headerRowLive = getHeaderRow(tableEl);
      const headerCells = headerRowLive ? (Array.from(headerRowLive.cells) as HTMLTableCellElement[]) : [];
      const th = headerCells[rt.colIndex];
      const w = th?.getBoundingClientRect().width;
      if (w && w > 0) widths[rt.colKey] = Math.round(w);

      const existing = safeLocalStorageGet(storageKey);
      safeLocalStorageSet(storageKey, {
        order: currentKeys,
        widths: { ...(existing?.widths ?? {}), ...widths }
      });
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  tableEl.addEventListener('dragstart', onDragStart);
  tableEl.addEventListener('dragover', onDragOver);
  tableEl.addEventListener('drop', onDrop);
  tableEl.addEventListener('mousedown', onMouseDown);
}

export function useContractTableColumnCustomizer(
  containerRef: MutableRefObject<HTMLElement | null>,
  storageKeyPrefix: string,
  rerenderKey: unknown
) {
  const runtimeRef = useRef<TableRuntime>({});

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const tables = Array.from(container.querySelectorAll('table'));
    if (!tables.length) return;

    tables.forEach((tableEl, idx) => {
      if (!(tableEl instanceof HTMLTableElement)) return;

      const key = `${STORAGE_PREFIX}${storageKeyPrefix}:table${idx}`;
      attachTableInteractions(tableEl, key, runtimeRef);

      ensureDraggable(tableEl);
      ensureResizerHandles(tableEl);

      const prefs = safeLocalStorageGet(key);
      if (prefs?.order?.length) {
        applyColumnOrder(tableEl, prefs.order);
      }
      if (prefs?.widths) {
        applyColumnWidths(tableEl, prefs.widths);
      }
    });
  }, [containerRef, storageKeyPrefix, rerenderKey]);
}

