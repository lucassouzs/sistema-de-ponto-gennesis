import { Prisma, TaskPriority, KanbanBoardSharePermission } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  isKanbanHiddenPickerUser,
  isCustomKanbanBoardKey,
  KANBAN_CUSTOM_KEY_PREFIX,
  KANBAN_LEGACY_DEPARTMENT_KEY,
  KANBAN_UNB_DEPARTMENT_KEY,
  KANBAN_UNB_DEPARTMENT_LABEL,
  resolveKanbanBoardKeyParam,
  userIsAdministrator,
} from '../lib/kanbanAccess';
import { userHasKanbanValuesPermission } from '../lib/kanbanValuesAccess';
import { isEmployeeUnbUser } from '../lib/unbCostCenterScope';
import {
  DEFAULT_KANBAN_LABEL_PRESETS,
  applyLabelColorRemaps,
  detectLabelColorRemapsByName,
  mergeLabelColorRemaps,
  parseLabelColorRemapsInput,
  resolveKanbanLabelPresets,
  validateCardLabelsForBoard,
  validateKanbanLabelPresetsInput,
  type KanbanLabelPresetDto,
} from '../lib/kanbanLabelPresets';
import { prisma } from '../lib/prisma';
import {
  boardToTrelloExport,
  importTrelloIntoBoard,
  loadBoardForTrelloTransfer,
  type TrelloExportBoard,
} from '../lib/kanbanTrelloTransfer';
import { ChatService } from './ChatService';

const chatUploadService = new ChatService();

export const KANBAN_FORBIDDEN = 'KANBAN_FORBIDDEN';

export function normalizeDepartmentKey(dept: string | null | undefined): string {
  if (!dept?.trim()) return 'SEM_SETOR';
  return dept.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function slugFromDepartmentKey(key: string): string {
  const slug = key.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug || 'sem-setor';
}

const AVATAR_COLORS = [
  'bg-gradient-to-br from-amber-400 to-orange-500',
  'bg-gradient-to-br from-sky-400 to-blue-600',
  'bg-gradient-to-br from-violet-400 to-purple-600',
  'bg-gradient-to-br from-emerald-400 to-teal-600',
  'bg-gradient-to-br from-rose-400 to-pink-600',
  'bg-gradient-to-br from-indigo-400 to-blue-600',
];

function avatarColorForKey(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = key.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function calcProgress(completed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((completed / total) * 100);
}

const MONTHLY_WORK_HOURS = 220;

type KanbanWorkWindow = { startHour: number; endHour: number };

/** Seg–qui: 07–12 e 13–17 (1h almoço). Sex: 07–12 e 13–16 (1h almoço). */
function getKanbanWorkWindowsForWeekday(dayOfWeek: number): KanbanWorkWindow[] {
  if (dayOfWeek >= 1 && dayOfWeek <= 4) {
    return [
      { startHour: 7, endHour: 12 },
      { startHour: 13, endHour: 17 },
    ];
  }
  if (dayOfWeek === 5) {
    return [
      { startHour: 7, endHour: 12 },
      { startHour: 13, endHour: 16 },
    ];
  }
  return [];
}

/** Soma horas úteis entre duas datas (fuso local do servidor). */
export function calculateKanbanBusinessHoursBetween(start: Date, end: Date): number {
  if (end.getTime() <= start.getTime()) return 0;

  let totalMs = 0;
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const endMs = end.getTime();

  while (cursor.getTime() <= endMs) {
    const windows = getKanbanWorkWindowsForWeekday(cursor.getDay());

    for (const w of windows) {
      const workStart = new Date(cursor);
      workStart.setHours(w.startHour, 0, 0, 0);
      const workEnd = new Date(cursor);
      workEnd.setHours(w.endHour, 0, 0, 0);

      const intervalStart = Math.max(start.getTime(), workStart.getTime());
      const intervalEnd = Math.min(endMs, workEnd.getTime());

      if (intervalEnd > intervalStart) {
        totalMs += intervalEnd - intervalStart;
      }
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return totalMs / (1000 * 60 * 60);
}

export function isKanbanCompletedColumnTitle(title: string): boolean {
  const t = title.trim().toLowerCase();
  return t === 'completed' || t === 'concluído' || t === 'concluido';
}

export function calculateKanbanHourlyRate(
  salary: number,
  dangerPay: number,
  unhealthyPay: number,
): number {
  return (salary + dangerPay + unhealthyPay) / MONTHLY_WORK_HOURS;
}

function roundHours(h: number): number {
  return Math.round(h * 100) / 100;
}

function roundMoney(v: number): number {
  return Math.round(v * 100) / 100;
}

function priorityToClient(p: TaskPriority): string {
  return p.toLowerCase();
}

function priorityFromClient(p: string): TaskPriority {
  const map: Record<string, TaskPriority> = {
    low: TaskPriority.LOW,
    medium: TaskPriority.MEDIUM,
    high: TaskPriority.HIGH,
    critical: TaskPriority.CRITICAL,
  };
  return map[p?.toLowerCase()] ?? TaskPriority.MEDIUM;
}

function parseDateInput(value?: string | null): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(value + 'T12:00:00');
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateTimeForClient(d: Date | null): string | null {
  if (!d || Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export type KanbanCardLabelDto = { color: string; text: string };

function parseLabels(raw: unknown): KanbanCardLabelDto[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (x): x is KanbanCardLabelDto =>
        !!x &&
        typeof x === 'object' &&
        typeof (x as KanbanCardLabelDto).color === 'string',
    )
    .map((x) => ({
      color: x.color,
      text: String(x.text ?? '').trim(),
    }));
}

function labelsToJson(labels?: KanbanCardLabelDto[]) {
  if (labels === undefined) return undefined;
  return labels.map((l) => ({ color: l.color, text: l.text.trim() }));
}

export type KanbanCardMemberDto = {
  userId: string;
  name: string;
  profilePhotoUrl: string | null;
  avatarColor: string;
};

function formatMembersList(card: {
  members?: Array<{ user: { id: string; name: string; profilePhotoUrl: string | null } }>;
  assignee?: { id: string; name: string; profilePhotoUrl: string | null } | null;
  assigneeUserId: string | null;
  assigneeName: string | null;
}): KanbanCardMemberDto[] {
  if (card.members?.length) {
    return card.members.map((m) => ({
      userId: m.user.id,
      name: m.user.name,
      profilePhotoUrl: m.user.profilePhotoUrl,
      avatarColor: avatarColorForKey(m.user.id),
    }));
  }
  if (card.assignee) {
    return [
      {
        userId: card.assignee.id,
        name: card.assignee.name,
        profilePhotoUrl: card.assignee.profilePhotoUrl,
        avatarColor: avatarColorForKey(card.assignee.id),
      },
    ];
  }
  return [];
}

function formatCard(card: {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  startDate: Date | null;
  endDate: Date | null;
  assigneeUserId: string | null;
  assigneeName: string | null;
  totalTasks: number;
  completedTasks: number;
  checklistEnabled: boolean;
  attachmentsEnabled: boolean;
  position: number;
  labels?: unknown;
  createdAt: Date;
  updatedAt?: Date;
  completedAt?: Date | null;
  workHours?: { toNumber?: () => number } | number | null;
  assignee?: { id: string; name: string; profilePhotoUrl: string | null } | null;
  members?: Array<{ user: { id: string; name: string; profilePhotoUrl: string | null } }>;
  checklistItems?: Array<{
    id: string;
    cardId: string;
    title: string;
    isDone: boolean;
    position: number;
    dueDate: Date | null;
    assigneeUserId: string | null;
    assignee?: { id: string; name: string; profilePhotoUrl: string | null } | null;
  }>;
  _count?: { comments: number; attachments: number };
}) {
  const members = formatMembersList(card);
  const assignee =
    members.length > 0
      ? members.map((m) => m.name).join(', ')
      : (card.assignee?.name ?? card.assigneeName ?? 'Sem responsável');
  const primary = members[0];
  const colorKey = primary?.userId ?? card.assigneeUserId ?? card.assigneeName ?? assignee;
  return {
    id: card.id,
    title: card.title,
    description: card.description,
    priority: priorityToClient(card.priority),
    startDate: formatDateTimeForClient(card.startDate),
    endDate: formatDateTimeForClient(card.endDate),
    assignee,
    assigneeUserId: primary?.userId ?? card.assigneeUserId,
    assigneeProfilePhotoUrl: primary?.profilePhotoUrl ?? card.assignee?.profilePhotoUrl ?? null,
    assigneeColor: avatarColorForKey(colorKey),
    members,
    progress: calcProgress(card.completedTasks, card.totalTasks),
    totalTasks: card.totalTasks,
    completedTasks: card.completedTasks,
    checklistEnabled: card.checklistEnabled,
    attachmentsEnabled: card.attachmentsEnabled,
    position: card.position,
    labels: parseLabels(card.labels),
    attachments: card._count?.attachments ?? 0,
    comments: card._count?.comments ?? 0,
    createdAt: card.createdAt.toISOString(),
    updatedAt: card.updatedAt?.toISOString() ?? card.createdAt.toISOString(),
    completedAt: card.completedAt?.toISOString() ?? null,
    workHours: card.workHours != null ? Number(card.workHours) : null,
    ...(card.checklistItems
      ? { checklistItems: card.checklistItems.map((item) => formatChecklistItem(item)) }
      : {}),
  };
}

export type KanbanChecklistItemDto = {
  id: string;
  cardId: string;
  title: string;
  isDone: boolean;
  position: number;
  dueDate: string | null;
  assigneeUserId: string | null;
  assignee: {
    id: string;
    name: string;
    profilePhotoUrl: string | null;
    avatarColor: string;
  } | null;
};

function formatChecklistItem(item: {
  id: string;
  cardId: string;
  title: string;
  isDone: boolean;
  position: number;
  dueDate: Date | null;
  assigneeUserId: string | null;
  assignee?: { id: string; name: string; profilePhotoUrl: string | null } | null;
}): KanbanChecklistItemDto {
  const due =
    item.dueDate && !Number.isNaN(item.dueDate.getTime())
      ? item.dueDate.toISOString().slice(0, 10)
      : null;
  return {
    id: item.id,
    cardId: item.cardId,
    title: item.title,
    isDone: item.isDone,
    position: item.position,
    dueDate: due,
    assigneeUserId: item.assigneeUserId,
    assignee: item.assignee
      ? {
          id: item.assignee.id,
          name: item.assignee.name,
          profilePhotoUrl: item.assignee.profilePhotoUrl,
          avatarColor: avatarColorForKey(item.assignee.id),
        }
      : null,
  };
}

const memberUserSelect = { id: true, name: true, profilePhotoUrl: true } as const;

/** Include da listagem do quadro (membros leves + checklist para visão expandida nos cards). */
const boardListCardInclude = {
  assignee: { select: memberUserSelect },
  members: {
    orderBy: { createdAt: 'asc' as const },
    include: { user: { select: memberUserSelect } },
  },
  checklistItems: {
    orderBy: { position: 'asc' as const },
    select: {
      id: true,
      cardId: true,
      title: true,
      isDone: true,
      position: true,
      dueDate: true,
      assigneeUserId: true,
    },
  },
  _count: { select: { comments: true, attachments: true } },
} as const;

const cardInclude = {
  assignee: { select: memberUserSelect },
  members: {
    orderBy: { createdAt: 'asc' as const },
    include: { user: { select: memberUserSelect } },
  },
  checklistItems: {
    orderBy: { position: 'asc' as const },
    include: { assignee: { select: memberUserSelect } },
  },
  _count: { select: { comments: true, attachments: true } },
} as const;

const activeBoardCards = {
  where: { archivedAt: null },
  orderBy: { position: 'asc' as const },
  include: boardListCardInclude,
} as const;

const boardListInclude = {
  columns: {
    orderBy: { position: 'asc' as const },
    include: {
      cards: activeBoardCards,
    },
  },
} as const;

let legacyKanbanMembersMigrationDone = false;
let legacyKanbanMembersMigrationPromise: Promise<void> | null = null;

async function migrateLegacyCardMembers() {
  if (legacyKanbanMembersMigrationDone) return;
  if (legacyKanbanMembersMigrationPromise) {
    await legacyKanbanMembersMigrationPromise;
    return;
  }

  legacyKanbanMembersMigrationPromise = (async () => {
    const cards = await prisma.kanbanCard.findMany({
      where: {
        assigneeUserId: { not: null },
        members: { none: {} },
      },
      select: { id: true, assigneeUserId: true },
      take: 500,
    });
    if (cards.length === 0) {
      legacyKanbanMembersMigrationDone = true;
      return;
    }
    await prisma.kanbanCardMember.createMany({
      data: cards.map((c) => ({ cardId: c.id, userId: c.assigneeUserId! })),
      skipDuplicates: true,
    });
    legacyKanbanMembersMigrationDone = true;
  })();

  await legacyKanbanMembersMigrationPromise;
}

async function syncLegacyAssignee(cardId: string) {
  const first = await prisma.kanbanCardMember.findFirst({
    where: { cardId },
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { id: true, name: true } } },
  });
  await prisma.kanbanCard.update({
    where: { id: cardId },
    data: {
      assigneeUserId: first?.user.id ?? null,
      assigneeName: first?.user.name ?? null,
    },
  });
}

async function syncCardTaskCounts(cardId: string) {
  const items = await prisma.kanbanChecklistItem.findMany({ where: { cardId } });
  const totalTasks = items.length;
  const completedTasks = items.filter((i) => i.isDone).length;
  await prisma.kanbanCard.update({
    where: { id: cardId },
    data: {
      totalTasks,
      completedTasks,
      ...(totalTasks === 0 ? { checklistEnabled: false } : {}),
    },
  });
  return { totalTasks, completedTasks };
}

function formatBoardResponse(
  board: {
    id: string;
    name: string;
    slug: string;
    departmentKey: string;
    departmentLabel: string;
    isCustom?: boolean;
    labelPresets?: unknown;
    columns: Array<{
      id: string;
      title: string;
      color: string;
      position: number;
      cardLimit: number | null;
      cards: Parameters<typeof formatCard>[0][];
    }>;
  },
  meta?: { canWrite?: boolean; isOwner?: boolean; canManageShares?: boolean },
) {
  const isCustom = board.isCustom ?? isCustomKanbanBoardKey(board.departmentKey);
  return {
    id: board.id,
    name: board.name,
    slug: board.slug,
    department: board.departmentLabel,
    departmentKey: board.departmentKey,
    isCustom,
    isOwner: meta?.isOwner ?? false,
    canManageShares: meta?.canManageShares ?? false,
    labelPresets: resolveKanbanLabelPresets(board.labelPresets),
    canWrite: meta?.canWrite ?? true,
    columns: board.columns.map((col) => ({
      id: col.id,
      title: col.title,
      color: col.color,
      position: col.position,
      limit: col.cardLimit ?? undefined,
      cards: col.cards.map(formatCard),
    })),
  };
}

async function seedBoardForDepartment(
  departmentKey: string,
  departmentLabel: string,
  createdById?: string,
) {
  const isUnbBoard = departmentKey === KANBAN_UNB_DEPARTMENT_KEY;
  return prisma.kanbanBoard.create({
    data: {
      name: isUnbBoard ? 'Tasks UNB' : 'Tasks',
      slug: slugFromDepartmentKey(departmentKey),
      departmentKey,
      departmentLabel,
      labelPresets: DEFAULT_KANBAN_LABEL_PRESETS as Prisma.InputJsonValue,
      createdById: createdById ?? null,
      columns: {
        create: [
          { title: 'Planned', color: '#111827', position: 0 },
          { title: 'Active', color: '#14B8A6', position: 1 },
          { title: 'Completed', color: '#3B82F6', position: 2 },
        ],
      },
    },
    include: boardListInclude,
  });
}

const kanbanCardOrderBy = [{ position: 'asc' as const }, { createdAt: 'asc' as const }];
const kanbanColumnOrderBy = [{ position: 'asc' as const }, { createdAt: 'asc' as const }];

async function applyKanbanBoardColumnOrder(
  tx: Prisma.TransactionClient,
  orderedIds: string[],
) {
  await Promise.all(
    orderedIds.map((id, index) =>
      tx.kanbanColumn.update({
        where: { id },
        data: { position: index },
      }),
    ),
  );
}

async function reorderKanbanColumnInBoard(
  tx: Prisma.TransactionClient,
  columnId: string,
  boardId: string,
  insertAt: number,
) {
  const columns = await tx.kanbanColumn.findMany({
    where: { boardId },
    orderBy: kanbanColumnOrderBy,
    select: { id: true },
  });
  const fromIndex = columns.findIndex((col) => col.id === columnId);
  if (fromIndex < 0) return;

  const next = columns.filter((col) => col.id !== columnId);
  const clamped = Math.max(0, Math.min(insertAt, next.length));
  next.splice(clamped, 0, columns[fromIndex]);
  await applyKanbanBoardColumnOrder(
    tx,
    next.map((col) => col.id),
  );
}

async function applyKanbanColumnCardOrder(
  tx: Prisma.TransactionClient,
  orderedIds: string[],
) {
  await Promise.all(
    orderedIds.map((id, index) =>
      tx.kanbanCard.update({
        where: { id },
        data: { position: index },
      }),
    ),
  );
}

async function reorderKanbanCardInColumn(
  tx: Prisma.TransactionClient,
  cardId: string,
  columnId: string,
  insertAt: number,
) {
  const card = await tx.kanbanCard.findUnique({
    where: { id: cardId },
    select: { position: true },
  });
  if (!card) return;

  const fromPos = card.position;
  const count = await tx.kanbanCard.count({ where: { columnId } });
  const clamped = Math.max(0, Math.min(insertAt, Math.max(0, count - 1)));
  if (fromPos === clamped) return;

  if (fromPos < clamped) {
    await tx.kanbanCard.updateMany({
      where: {
        columnId,
        position: { gt: fromPos, lte: clamped },
        id: { not: cardId },
      },
      data: { position: { decrement: 1 } },
    });
  } else {
    await tx.kanbanCard.updateMany({
      where: {
        columnId,
        position: { gte: clamped, lt: fromPos },
        id: { not: cardId },
      },
      data: { position: { increment: 1 } },
    });
  }

  await tx.kanbanCard.update({
    where: { id: cardId },
    data: { position: clamped },
  });
}

async function moveKanbanCardToColumn(
  tx: Prisma.TransactionClient,
  cardId: string,
  fromColumnId: string,
  toColumnId: string,
  insertAt: number,
) {
  const card = await tx.kanbanCard.findUnique({
    where: { id: cardId },
    select: { position: true },
  });
  if (!card) return;

  const fromPos = card.position;

  await tx.kanbanCard.updateMany({
    where: { columnId: fromColumnId, position: { gt: fromPos } },
    data: { position: { decrement: 1 } },
  });

  const targetCount = await tx.kanbanCard.count({
    where: { columnId: toColumnId, id: { not: cardId } },
  });
  const clamped = Math.max(0, Math.min(insertAt, targetCount));

  await tx.kanbanCard.updateMany({
    where: { columnId: toColumnId, position: { gte: clamped } },
    data: { position: { increment: 1 } },
  });

  await tx.kanbanCard.update({
    where: { id: cardId },
    data: { columnId: toColumnId, position: clamped },
  });
}

/** Garante posições contíguas 0..n-1 (evita ordem instável após race/gaps). */
async function renumberKanbanColumnCards(tx: Prisma.TransactionClient, columnId: string) {
  await tx.$executeRaw`
    WITH ordered AS (
      SELECT id, (ROW_NUMBER() OVER (ORDER BY position ASC, "createdAt" ASC) - 1)::int AS new_pos
      FROM kanban_cards
      WHERE "columnId" = ${columnId}
    )
    UPDATE kanban_cards AS c
    SET position = ordered.new_pos
    FROM ordered
    WHERE c.id = ordered.id
      AND c.position IS DISTINCT FROM ordered.new_pos
  `;
}

export class KanbanService {
  private boardAccessSelect = {
    id: true,
    departmentKey: true,
    isCustom: true,
    createdById: true,
  } as const;

  private async getUserDepartment(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { employee: { select: { department: true, costCenter: true } } },
    });
    if (!user) throw new Error('Usuário não encontrado');

    // Centro de custo UNB → quadro institucional próprio (não o quadro do setor).
    if (isEmployeeUnbUser(user.employee?.costCenter)) {
      return {
        key: KANBAN_UNB_DEPARTMENT_KEY,
        label: KANBAN_UNB_DEPARTMENT_LABEL,
      };
    }

    const label = user.employee?.department?.trim() || 'Sem setor';
    let key = normalizeDepartmentKey(label);
    // Evita colisão com o quadro institucional UNB (só quem tem CC UNB acessa).
    if (key === KANBAN_UNB_DEPARTMENT_KEY) {
      key = 'SETOR_UNB';
    }
    return { key, label };
  }

  private async getOrCreateBoardForDepartment(userId: string) {
    const { key, label } = await this.getUserDepartment(userId);

    let board = await prisma.kanbanBoard.findUnique({
      where: { departmentKey: key },
      include: boardListInclude,
    });

    if (!board) {
      board = await seedBoardForDepartment(key, label, userId);
    }

    return board;
  }

  private async resolveBoardAccessForUser(
    userId: string,
    board: {
      id: string;
      departmentKey: string;
      isCustom: boolean;
      createdById: string | null;
    },
    ownKey?: string,
  ): Promise<{ canRead: boolean; canWrite: boolean; isOwner: boolean }> {
    const key = ownKey ?? (await this.getUserDepartment(userId)).key;

    if (board.isCustom) {
      const isOwner = board.createdById === userId;
      if (isOwner) return { canRead: true, canWrite: true, isOwner: true };

      const share = await prisma.kanbanBoardShare.findUnique({
        where: { boardId_userId: { boardId: board.id, userId } },
      });
      if (share) {
        return {
          canRead: true,
          canWrite: true,
          isOwner: false,
        };
      }
      if (await userIsAdministrator(userId)) {
        return { canRead: true, canWrite: true, isOwner: false };
      }
      return { canRead: false, canWrite: false, isOwner: false };
    }

    // Quadro UNB: só quem tem centro de custo UNB (ownKey === UNB) ou admin.
    if (board.departmentKey === KANBAN_UNB_DEPARTMENT_KEY) {
      if (key === KANBAN_UNB_DEPARTMENT_KEY) {
        return { canRead: true, canWrite: true, isOwner: false };
      }
      if (await userIsAdministrator(userId)) {
        return { canRead: true, canWrite: true, isOwner: false };
      }
      return { canRead: false, canWrite: false, isOwner: false };
    }

    if (board.departmentKey === key) {
      return { canRead: true, canWrite: true, isOwner: false };
    }
    if (await userIsAdministrator(userId)) {
      return { canRead: true, canWrite: true, isOwner: false };
    }
    return { canRead: false, canWrite: false, isOwner: false };
  }

  private async assertBoardAccess(
    userId: string,
    board: {
      id: string;
      departmentKey: string;
      isCustom: boolean;
      createdById: string | null;
    },
    mode: 'read' | 'write',
  ) {
    const access = await this.resolveBoardAccessForUser(userId, board);
    if (mode === 'read' && access.canRead) return;
    if (mode === 'write' && access.canWrite) return;
    throw new Error(KANBAN_FORBIDDEN);
  }

  private async assertBoardAccessByKey(
    userId: string,
    departmentKey: string,
    mode: 'read' | 'write',
  ) {
    const board = await prisma.kanbanBoard.findUnique({
      where: { departmentKey },
      select: this.boardAccessSelect,
    });
    if (!board) throw new Error(KANBAN_FORBIDDEN);
    await this.assertBoardAccess(userId, board, mode);
  }

  private async assertBoardWriteById(userId: string, boardId: string) {
    const board = await prisma.kanbanBoard.findUnique({
      where: { id: boardId },
      select: this.boardAccessSelect,
    });
    if (!board) throw new Error(KANBAN_FORBIDDEN);
    await this.assertBoardAccess(userId, board, 'write');
  }

  private async assertColumnAccess(
    userId: string,
    columnId: string,
    mode: 'read' | 'write' = 'write',
  ) {
    const column = await prisma.kanbanColumn.findUnique({
      where: { id: columnId },
      include: { board: { select: this.boardAccessSelect } },
    });
    if (!column) throw new Error(KANBAN_FORBIDDEN);
    await this.assertBoardAccess(userId, column.board, mode);
  }

  private async assertCardAccess(
    userId: string,
    cardId: string,
    mode: 'read' | 'write' = 'write',
  ) {
    const card = await prisma.kanbanCard.findUnique({
      where: { id: cardId },
      include: {
        column: { include: { board: { select: this.boardAccessSelect } } },
      },
    });
    if (!card) throw new Error(KANBAN_FORBIDDEN);
    await this.assertBoardAccess(userId, card.column.board, mode);
  }

  async listBoardsForUser(userId: string) {
    const { key: ownKey, label: ownLabel } = await this.getUserDepartment(userId);
    const isAdmin = await userIsAdministrator(userId);

    const boardSelect = {
      id: true,
      name: true,
      slug: true,
      departmentKey: true,
      departmentLabel: true,
      isCustom: true,
      createdById: true,
      updatedAt: true,
      _count: { select: { columns: true } },
    } as const;

    const seen = new Set<string>();
    const results: Array<{
      id: string;
      name: string;
      slug: string;
      departmentKey: string;
      department: string;
      columnCount: number;
      updatedAt: string;
      isOwnDepartment: boolean;
      isCustom: boolean;
      isOwner: boolean;
      canManageShares: boolean;
      sharedWithMe: boolean;
    }> = [];

    const pushBoard = (b: {
      id: string;
      name: string;
      slug: string;
      departmentKey: string;
      departmentLabel: string;
      isCustom: boolean;
      createdById: string | null;
      updatedAt: Date;
      _count: { columns: number };
    }) => {
      if (seen.has(b.id)) return;
      seen.add(b.id);
      results.push({
        id: b.id,
        name: b.name,
        slug: b.slug,
        departmentKey: b.departmentKey,
        department: b.departmentLabel,
        columnCount: b._count.columns,
        updatedAt: b.updatedAt.toISOString(),
        isOwnDepartment: !b.isCustom && b.departmentKey === ownKey,
        isCustom: b.isCustom,
        isOwner: b.isCustom && b.createdById === userId,
        canManageShares: b.isCustom && b.createdById === userId,
        sharedWithMe: b.isCustom && b.createdById !== userId,
      });
    };

    if (isAdmin) {
      const deptBoards = await prisma.kanbanBoard.findMany({
        where: {
          isCustom: false,
          departmentKey: { not: KANBAN_LEGACY_DEPARTMENT_KEY },
        },
        orderBy: { departmentLabel: 'asc' },
        select: boardSelect,
      });
      deptBoards.forEach(pushBoard);

      // Sem quadros de setor no banco o admin ficava com lista vazia e o frontend
      // nunca pedia /kanban/board (skeleton infinito). Garante o quadro do próprio setor.
      if (results.length === 0 && ownKey !== KANBAN_LEGACY_DEPARTMENT_KEY) {
        await this.getOrCreateBoardForDepartment(userId);
        const ownBoard = await prisma.kanbanBoard.findUnique({
          where: { departmentKey: ownKey },
          select: boardSelect,
        });
        if (ownBoard) pushBoard(ownBoard);
      }

      const customBoards = await prisma.kanbanBoard.findMany({
        where: { isCustom: true },
        orderBy: { departmentLabel: 'asc' },
        select: boardSelect,
      });
      customBoards.forEach(pushBoard);
    } else {
      const ownBoard = await prisma.kanbanBoard.findUnique({
        where: { departmentKey: ownKey },
        select: boardSelect,
      });
      if (ownBoard) {
        pushBoard(ownBoard);
      } else {
        results.push({
          id: '',
          name: ownKey === KANBAN_UNB_DEPARTMENT_KEY ? 'Tasks UNB' : 'Tasks',
          slug: slugFromDepartmentKey(ownKey),
          departmentKey: ownKey,
          department: ownLabel,
          columnCount: 0,
          updatedAt: new Date().toISOString(),
          isOwnDepartment: true,
          isCustom: false,
          isOwner: false,
          canManageShares: false,
          sharedWithMe: false,
        });
      }

      const customBoards = await prisma.kanbanBoard.findMany({
        where: {
          isCustom: true,
          OR: [{ createdById: userId }, { shares: { some: { userId } } }],
        },
        orderBy: { departmentLabel: 'asc' },
        select: boardSelect,
      });
      customBoards.forEach(pushBoard);
    }

    return results.sort((a, b) => a.department.localeCompare(b.department, 'pt-BR'));
  }

  async createCustomBoard(userId: string, name: string) {
    if (await userIsAdministrator(userId)) {
      throw new Error('Administradores acessam apenas quadros de setor');
    }

    const trimmed = name.trim();
    if (!trimmed) throw new Error('Nome do quadro é obrigatório');
    if (trimmed.length > 80) throw new Error('Nome do quadro deve ter no máximo 80 caracteres');

    const departmentKey = `${KANBAN_CUSTOM_KEY_PREFIX}${randomUUID().replace(/-/g, '')}`;
    const slugBase = slugFromDepartmentKey(trimmed.slice(0, 40));
    const slug = `${slugBase}-${Date.now()}`;

    const board = await prisma.kanbanBoard.create({
      data: {
        name: trimmed,
        slug,
        departmentKey,
        departmentLabel: trimmed,
        isCustom: true,
        createdById: userId,
        labelPresets: DEFAULT_KANBAN_LABEL_PRESETS as Prisma.InputJsonValue,
        columns: {
          create: [
            { title: 'Planned', color: '#111827', position: 0 },
            { title: 'Active', color: '#14B8A6', position: 1 },
            { title: 'Completed', color: '#3B82F6', position: 2 },
          ],
        },
      },
      include: boardListInclude,
    });

    return {
      id: board.id,
      name: board.name,
      slug: board.slug,
      departmentKey: board.departmentKey,
      department: board.departmentLabel,
      columnCount: board.columns.length,
      updatedAt: board.updatedAt.toISOString(),
      isOwnDepartment: false,
      isCustom: true,
      isOwner: true,
      canManageShares: true,
      sharedWithMe: false,
    };
  }

  async updateCustomBoardName(boardId: string, userId: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Nome do quadro é obrigatório');
    if (trimmed.length > 80) throw new Error('Nome do quadro deve ter no máximo 80 caracteres');

    const board = await prisma.kanbanBoard.findUnique({
      where: { id: boardId },
      select: {
        id: true,
        name: true,
        slug: true,
        departmentKey: true,
        departmentLabel: true,
        isCustom: true,
        createdById: true,
        updatedAt: true,
        _count: { select: { columns: true } },
      },
    });
    if (!board || !board.isCustom) throw new Error('Quadro não encontrado');
    if (board.createdById !== userId) throw new Error(KANBAN_FORBIDDEN);

    const updated = await prisma.kanbanBoard.update({
      where: { id: boardId },
      data: { name: trimmed, departmentLabel: trimmed },
      select: {
        id: true,
        name: true,
        slug: true,
        departmentKey: true,
        departmentLabel: true,
        isCustom: true,
        createdById: true,
        updatedAt: true,
        _count: { select: { columns: true } },
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      departmentKey: updated.departmentKey,
      department: updated.departmentLabel,
      columnCount: updated._count.columns,
      updatedAt: updated.updatedAt.toISOString(),
      isOwnDepartment: false,
      isCustom: true,
      isOwner: true,
      canManageShares: true,
      sharedWithMe: false,
    };
  }

  async deleteCustomBoard(boardId: string, userId: string) {
    const board = await prisma.kanbanBoard.findUnique({
      where: { id: boardId },
      select: { id: true, isCustom: true, createdById: true, departmentKey: true },
    });
    if (!board || !board.isCustom) throw new Error('Quadro não encontrado');
    const isOwner = board.createdById === userId;
    if (!isOwner && !(await userIsAdministrator(userId))) {
      throw new Error(KANBAN_FORBIDDEN);
    }

    await prisma.kanbanBoard.delete({ where: { id: boardId } });
    return { departmentKey: board.departmentKey };
  }

  async listBoardShares(boardId: string, requesterId: string) {
    const board = await prisma.kanbanBoard.findUnique({
      where: { id: boardId },
      select: { ...this.boardAccessSelect, isCustom: true },
    });
    if (!board || !board.isCustom) throw new Error('Quadro não encontrado');
    if (board.createdById !== requesterId) throw new Error(KANBAN_FORBIDDEN);

    const shares = await prisma.kanbanBoardShare.findMany({
      where: { boardId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            profilePhotoUrl: true,
            employee: { select: { position: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return shares
      .filter((s) => !isKanbanHiddenPickerUser(s.user))
      .map((s) => ({
        id: s.id,
        userId: s.userId,
        permission: s.permission,
        user: {
          id: s.user.id,
          name: s.user.name,
          email: s.user.email,
          profilePhotoUrl: s.user.profilePhotoUrl,
        },
      }));
  }

  async addBoardShare(
    boardId: string,
    targetUserId: string,
    permission: 'READ' | 'WRITE',
    requesterId: string,
  ) {
    if (targetUserId === requesterId) {
      throw new Error('Não é possível compartilhar consigo mesmo');
    }

    const board = await prisma.kanbanBoard.findUnique({
      where: { id: boardId },
      select: { ...this.boardAccessSelect, isCustom: true },
    });
    if (!board || !board.isCustom) throw new Error('Quadro não encontrado');
    if (board.createdById !== requesterId) throw new Error(KANBAN_FORBIDDEN);

    const target = await prisma.user.findFirst({
      where: { id: targetUserId, isActive: true },
      select: {
        id: true,
        name: true,
        email: true,
        employee: { select: { position: true } },
      },
    });
    if (!target || isKanbanHiddenPickerUser(target)) {
      throw new Error('Usuário não encontrado');
    }

    const perm = KanbanBoardSharePermission.WRITE;

    const share = await prisma.kanbanBoardShare.upsert({
      where: { boardId_userId: { boardId, userId: targetUserId } },
      create: {
        boardId,
        userId: targetUserId,
        permission: perm,
        createdBy: requesterId,
      },
      update: { permission: perm },
      include: {
        user: { select: { id: true, name: true, email: true, profilePhotoUrl: true } },
      },
    });

    return {
      id: share.id,
      userId: share.userId,
      permission: share.permission,
      user: share.user,
    };
  }

  async updateBoardShare(
    boardId: string,
    targetUserId: string,
    permission: 'READ' | 'WRITE',
    requesterId: string,
  ) {
    const board = await prisma.kanbanBoard.findUnique({
      where: { id: boardId },
      select: { ...this.boardAccessSelect, isCustom: true },
    });
    if (!board || !board.isCustom) throw new Error('Quadro não encontrado');
    if (board.createdById !== requesterId) throw new Error(KANBAN_FORBIDDEN);

    const perm =
      permission === 'WRITE'
        ? KanbanBoardSharePermission.WRITE
        : KanbanBoardSharePermission.READ;

    const share = await prisma.kanbanBoardShare.update({
      where: { boardId_userId: { boardId, userId: targetUserId } },
      data: { permission: perm },
      include: {
        user: { select: { id: true, name: true, email: true, profilePhotoUrl: true } },
      },
    });

    return {
      id: share.id,
      userId: share.userId,
      permission: share.permission,
      user: share.user,
    };
  }

  async removeBoardShare(boardId: string, targetUserId: string, requesterId: string) {
    const board = await prisma.kanbanBoard.findUnique({
      where: { id: boardId },
      select: { ...this.boardAccessSelect, isCustom: true },
    });
    if (!board || !board.isCustom) throw new Error('Quadro não encontrado');
    if (board.createdById !== requesterId) throw new Error(KANBAN_FORBIDDEN);

    await prisma.kanbanBoardShare.delete({
      where: { boardId_userId: { boardId, userId: targetUserId } },
    });
  }

  async getBoardForUser(userId: string, departmentKeyParam?: string) {
    await migrateLegacyCardMembers();

    const resolvedParam = departmentKeyParam
      ? resolveKanbanBoardKeyParam(departmentKeyParam)
      : null;

    const boardByKeyPromise =
      resolvedParam && resolvedParam !== KANBAN_LEGACY_DEPARTMENT_KEY
        ? prisma.kanbanBoard.findUnique({
            where: { departmentKey: resolvedParam },
            include: boardListInclude,
          })
        : Promise.resolve(null);

    const [{ key: ownKey }, boardFromParam] = await Promise.all([
      this.getUserDepartment(userId),
      boardByKeyPromise,
    ]);

    const targetKey = resolvedParam ?? ownKey;

    if (targetKey === KANBAN_LEGACY_DEPARTMENT_KEY) {
      throw new Error('Quadro não encontrado para este setor');
    }

    let board =
      boardFromParam ??
      (!isCustomKanbanBoardKey(targetKey) && targetKey === ownKey
        ? await this.getOrCreateBoardForDepartment(userId)
        : null);

    if (!board) {
      board = await prisma.kanbanBoard.findUnique({
        where: { departmentKey: targetKey },
        include: boardListInclude,
      });
    }

    if (!board) {
      throw new Error('Quadro não encontrado para este setor');
    }

    const access = await this.resolveBoardAccessForUser(userId, board, ownKey);
    if (!access.canRead) throw new Error(KANBAN_FORBIDDEN);

    return formatBoardResponse(board, {
      canWrite: access.canWrite,
      isOwner: access.isOwner,
      canManageShares: board.isCustom && access.isOwner,
    });
  }

  async listArchivedCards(userId: string, departmentKeyParam?: string) {
    const { key: ownKey } = await this.getUserDepartment(userId);
    const targetKey = departmentKeyParam
      ? resolveKanbanBoardKeyParam(departmentKeyParam)
      : ownKey;

    if (targetKey === KANBAN_LEGACY_DEPARTMENT_KEY) {
      throw new Error('Quadro não encontrado para este setor');
    }

    const board = await prisma.kanbanBoard.findUnique({
      where: { departmentKey: targetKey },
      select: this.boardAccessSelect,
    });
    if (!board) {
      throw new Error('Quadro não encontrado para este setor');
    }
    await this.assertBoardAccess(userId, board, 'read');

    const cards = await prisma.kanbanCard.findMany({
      where: {
        archivedAt: { not: null },
        column: { boardId: board.id },
      },
      orderBy: { archivedAt: 'desc' },
      include: {
        ...boardListCardInclude,
        column: { select: { id: true, title: true, color: true } },
      },
    });

    return cards.map((card) => ({
      ...formatCard(card),
      columnId: card.column.id,
      columnTitle: card.column.title,
      columnColor: card.column.color,
      archivedAt: card.archivedAt?.toISOString() ?? null,
    }));
  }

  async updateBoardLabelPresets(
    userId: string,
    presetsInput: unknown,
    departmentKeyParam?: string,
    colorRemapsInput?: unknown,
  ): Promise<KanbanLabelPresetDto[]> {
    const { key: ownKey } = await this.getUserDepartment(userId);
    const targetKey = departmentKeyParam
      ? resolveKanbanBoardKeyParam(departmentKeyParam)
      : ownKey;

    const board = await prisma.kanbanBoard.findUnique({
      where: { departmentKey: targetKey },
      select: { ...this.boardAccessSelect, labelPresets: true },
    });
    if (!board) {
      throw new Error('Quadro não encontrado para este setor');
    }
    await this.assertBoardAccess(userId, board, 'write');

    const oldPresets = resolveKanbanLabelPresets(board.labelPresets);
    const presets = validateKanbanLabelPresetsInput(presetsInput);
    const remaps = mergeLabelColorRemaps(
      detectLabelColorRemapsByName(oldPresets, presets),
      parseLabelColorRemapsInput(colorRemapsInput),
    );

    await prisma.$transaction(async (tx) => {
      await tx.kanbanBoard.update({
        where: { id: board.id },
        data: { labelPresets: presets as Prisma.InputJsonValue },
      });

      // Atualiza labels dos cards: remaps de cor + sync de nome/cor via presets.
      const cards = await tx.kanbanCard.findMany({
        where: { column: { boardId: board.id } },
        select: { id: true, labels: true },
      });

      for (const card of cards) {
        const labels = parseLabels(card.labels);
        if (labels.length === 0) continue;

        const next = applyLabelColorRemaps(labels, remaps, presets);
        const before = JSON.stringify(labelsToJson(labels));
        const after = JSON.stringify(labelsToJson(next));
        if (before === after) continue;

        await tx.kanbanCard.update({
          where: { id: card.id },
          data: { labels: next as Prisma.InputJsonValue },
        });
      }
    });

    return presets;
  }

  private async getLabelPresetsForColumn(columnId: string): Promise<KanbanLabelPresetDto[]> {
    const column = await prisma.kanbanColumn.findUnique({
      where: { id: columnId },
      include: { board: { select: { labelPresets: true } } },
    });
    if (!column) throw new Error('Coluna não encontrada');
    return resolveKanbanLabelPresets(column.board.labelPresets);
  }

  async createColumn(
    userId: string,
    data: {
      boardId?: string;
      title: string;
      color: string;
      cardLimit?: number;
    },
  ) {
    const board = data.boardId
      ? await prisma.kanbanBoard.findUnique({ where: { id: data.boardId } })
      : await this.getOrCreateBoardForDepartment(userId);

    if (!board) throw new Error('Quadro não encontrado');

    await this.assertBoardWriteById(userId, board.id);

    const maxPos = await prisma.kanbanColumn.aggregate({
      where: { boardId: board.id },
      _max: { position: true },
    });

    const column = await prisma.kanbanColumn.create({
      data: {
        boardId: board.id,
        title: data.title,
        color: data.color,
        cardLimit: data.cardLimit ?? null,
        position: (maxPos._max.position ?? -1) + 1,
      },
      include: { cards: { include: cardInclude } },
    });

    return {
      id: column.id,
      title: column.title,
      color: column.color,
      position: column.position,
      limit: column.cardLimit ?? undefined,
      cards: column.cards.map(formatCard),
    };
  }

  async updateColumn(
    userId: string,
    id: string,
    data: { title?: string; color?: string; cardLimit?: number | null; position?: number },
  ) {
    await this.assertColumnAccess(userId, id);

    const existing = await prisma.kanbanColumn.findUnique({
      where: { id },
      select: { boardId: true },
    });
    if (!existing) throw new Error(KANBAN_FORBIDDEN);

    const hasMeta =
      data.title !== undefined ||
      data.color !== undefined ||
      data.cardLimit !== undefined;
    const requestedPosition =
      data.position != null && Number.isFinite(data.position)
        ? Math.max(0, Math.trunc(data.position))
        : undefined;
    const needsReorder = requestedPosition !== undefined;

    if (needsReorder || hasMeta) {
      await prisma.$transaction(async (tx) => {
        if (needsReorder) {
          await reorderKanbanColumnInBoard(tx, id, existing.boardId, requestedPosition!);
        }
        if (hasMeta) {
          await tx.kanbanColumn.update({
            where: { id },
            data: {
              ...(data.title !== undefined ? { title: data.title } : {}),
              ...(data.color !== undefined ? { color: data.color } : {}),
              ...(data.cardLimit !== undefined ? { cardLimit: data.cardLimit } : {}),
            },
          });
        }
      });
    }

    const column = await prisma.kanbanColumn.findUnique({
      where: { id },
      include: {
        cards: {
          where: { archivedAt: null },
          orderBy: { position: 'asc' },
          include: cardInclude,
        },
      },
    });
    if (!column) throw new Error(KANBAN_FORBIDDEN);

    return {
      id: column.id,
      title: column.title,
      color: column.color,
      position: column.position,
      limit: column.cardLimit ?? undefined,
      cards: column.cards.map(formatCard),
    };
  }

  async deleteColumn(userId: string, id: string) {
    await this.assertColumnAccess(userId, id);
    await prisma.kanbanColumn.delete({ where: { id } });
  }

  async createCard(
    userId: string,
    data: {
    columnId: string;
    title: string;
    description?: string;
    priority?: string;
    startDate?: string | null;
    endDate?: string | null;
    labels?: KanbanCardLabelDto[];
    assigneeUserId?: string | null;
    assigneeName?: string;
    memberUserIds?: string[];
    totalTasks?: number;
    completedTasks?: number;
    insertAt?: 'top' | 'bottom';
  },
  ) {
    await this.assertColumnAccess(userId, data.columnId);

    let assigneeName = data.assigneeName?.trim() || null;
    if (data.assigneeUserId) {
      const user = await prisma.user.findUnique({
        where: { id: data.assigneeUserId },
        select: { name: true },
      });
      if (user) assigneeName = user.name;
    }

    const memberIds = [
      ...new Set(
        (data.memberUserIds ?? []).filter(Boolean).concat(
          data.assigneeUserId ? [data.assigneeUserId] : [],
        ),
      ),
    ];

    const labelPresets =
      data.labels && data.labels.length > 0
        ? await this.getLabelPresetsForColumn(data.columnId)
        : [];
    const validatedLabels =
      data.labels && data.labels.length > 0
        ? validateCardLabelsForBoard(data.labels, labelPresets) ?? []
        : [];

    const insertAt = data.insertAt === 'bottom' ? 'bottom' : 'top';

    const card = await prisma.$transaction(async (tx) => {
      let position: number;

      if (insertAt === 'bottom') {
        const maxPos = await tx.kanbanCard.aggregate({
          where: { columnId: data.columnId },
          _max: { position: true },
        });
        position = (maxPos._max.position ?? -1) + 1;
      } else {
        const minPos = await tx.kanbanCard.aggregate({
          where: { columnId: data.columnId },
          _min: { position: true },
        });
        position = (minPos._min.position ?? 0) - 1;
      }

      return tx.kanbanCard.create({
        data: {
          columnId: data.columnId,
          title: data.title.trim(),
          description: data.description?.trim() ?? '',
          priority: priorityFromClient(data.priority ?? 'medium'),
          startDate: parseDateInput(data.startDate) ?? null,
          endDate: parseDateInput(data.endDate) ?? null,
          labels: labelsToJson(validatedLabels) ?? [],
          assigneeUserId: memberIds[0] ?? data.assigneeUserId ?? null,
          assigneeName,
          totalTasks: data.totalTasks ?? 0,
          completedTasks: Math.min(data.completedTasks ?? 0, data.totalTasks ?? 0),
          position,
          ...(memberIds.length > 0
            ? {
                members: {
                  create: memberIds.map((userId) => ({ userId })),
                },
              }
            : {}),
        },
        include: boardListCardInclude,
      });
    });

    return formatCard(card);
  }

  /** Card no quadro do setor do usuário (coluna Planned), usado pela Gennecy no chat. */
  async createTaskFromChatAssistant(
    userId: string,
    payload: {
      title: string;
      description: string;
      priority?: string;
      endDate?: string | null;
      checklistItems?: string[];
      sourceChatId?: string;
    },
  ) {
    const board = await this.getOrCreateBoardForDepartment(userId);
    const column =
      board.columns.find((c) => c.title === 'Planned') ?? board.columns[0];
    if (!column) throw new Error('Quadro de Tasks sem colunas');

    const descParts = [payload.description.trim()];
    if (payload.sourceChatId) {
      descParts.push('', `Conversa de origem (chat): ${payload.sourceChatId}`);
    }

    const card = await this.createCard(userId, {
      columnId: column.id,
      title: payload.title,
      description: descParts.filter(Boolean).join('\n'),
      priority: payload.priority ?? 'medium',
      endDate: payload.endDate ?? null,
      memberUserIds: [userId],
      assigneeUserId: userId,
    });

    for (const item of payload.checklistItems ?? []) {
      const t = item.trim();
      if (t) await this.createChecklistItem(userId, card.id, t);
    }

    return {
      card,
      departmentKey: board.departmentKey,
      departmentLabel: board.departmentLabel,
    };
  }

  async updateCard(
    userId: string,
    id: string,
    data: {
      columnId?: string;
      title?: string;
      description?: string;
      priority?: string;
      startDate?: string | null;
      endDate?: string | null;
      labels?: KanbanCardLabelDto[];
      assigneeUserId?: string | null;
      assigneeName?: string;
      totalTasks?: number;
      completedTasks?: number;
      checklistEnabled?: boolean;
      attachmentsEnabled?: boolean;
      position?: number;
      workHours?: number | null;
      /** ISO ou null — marca/desmarca conclusão estilo Trello. */
      completedAt?: string | null;
      /** ISO ou null — arquiva/desarquiva o card (some do quadro). */
      archivedAt?: string | null;
    },
  ) {
    const existing = await prisma.kanbanCard.findUnique({
      where: { id },
      include: {
        column: {
          include: {
            board: { select: { ...this.boardAccessSelect, labelPresets: true } },
          },
        },
      },
    });
    if (!existing) throw new Error('Card não encontrado');
    await this.assertBoardAccess(userId, existing.column.board, 'write');

    if (data.columnId && data.columnId !== existing.columnId) {
      await this.assertColumnAccess(userId, data.columnId);
    }

    let completedAt: Date | null | undefined;
    if (data.completedAt !== undefined) {
      completedAt =
        data.completedAt === null || data.completedAt === ''
          ? null
          : new Date(data.completedAt);
      if (completedAt && Number.isNaN(completedAt.getTime())) {
        throw new Error('Data de conclusão inválida');
      }
    } else if (data.columnId && data.columnId !== existing.columnId) {
      const targetColumn = await prisma.kanbanColumn.findUnique({
        where: { id: data.columnId },
        select: { title: true },
      });
      if (targetColumn && isKanbanCompletedColumnTitle(targetColumn.title)) {
        completedAt = new Date();
      } else {
        completedAt = null;
      }
    }

    let archivedAt: Date | null | undefined;
    if (data.archivedAt !== undefined) {
      archivedAt =
        data.archivedAt === null || data.archivedAt === ''
          ? null
          : new Date(data.archivedAt);
      if (archivedAt && Number.isNaN(archivedAt.getTime())) {
        throw new Error('Data de arquivamento inválida');
      }
    }

    let assigneeName: string | null | undefined = data.assigneeName?.trim();
    if (data.assigneeUserId !== undefined) {
      if (data.assigneeUserId) {
        const user = await prisma.user.findUnique({
          where: { id: data.assigneeUserId },
          select: { name: true },
        });
        assigneeName = user?.name ?? assigneeName ?? null;
      } else {
        assigneeName =
          data.assigneeName !== undefined
            ? data.assigneeName?.trim() || null
            : null;
      }
    }

    const totalTasks = data.totalTasks ?? existing.totalTasks;
    const completedTasks = Math.min(
      data.completedTasks ?? existing.completedTasks,
      totalTasks,
    );
    const targetColumnId = data.columnId ?? existing.columnId;
    const requestedPosition =
      data.position != null && Number.isFinite(data.position)
        ? Math.max(0, Math.trunc(data.position))
        : undefined;
    const hasOrderChange =
      targetColumnId !== existing.columnId || requestedPosition !== undefined;

    let labelsJson = labelsToJson(data.labels);
    if (data.labels !== undefined) {
      const labelPresets = resolveKanbanLabelPresets(existing.column.board.labelPresets);
      const validated = validateCardLabelsForBoard(data.labels, labelPresets);
      labelsJson = labelsToJson(validated);
    }

    const baseUpdateData = {
      ...(data.columnId !== undefined ? { columnId: data.columnId } : {}),
      ...(data.title !== undefined ? { title: data.title.trim() } : {}),
      ...(data.description !== undefined ? { description: data.description.trim() } : {}),
      ...(data.priority !== undefined
        ? { priority: priorityFromClient(data.priority) }
        : {}),
      ...(data.startDate !== undefined ? { startDate: parseDateInput(data.startDate) } : {}),
      ...(data.endDate !== undefined ? { endDate: parseDateInput(data.endDate) } : {}),
      ...(data.labels !== undefined ? { labels: labelsJson } : {}),
      ...(data.assigneeUserId !== undefined ? { assigneeUserId: data.assigneeUserId } : {}),
      ...(assigneeName !== undefined ? { assigneeName } : {}),
      ...(data.totalTasks !== undefined ? { totalTasks } : {}),
      ...(data.completedTasks !== undefined ? { completedTasks } : {}),
      ...(data.checklistEnabled !== undefined ? { checklistEnabled: data.checklistEnabled } : {}),
      ...(data.attachmentsEnabled !== undefined
        ? { attachmentsEnabled: data.attachmentsEnabled }
        : {}),
      ...(completedAt !== undefined ? { completedAt } : {}),
      ...(archivedAt !== undefined ? { archivedAt } : {}),
      ...(data.workHours !== undefined
        ? { workHours: data.workHours == null ? null : data.workHours }
        : {}),
    };

    if (!hasOrderChange) {
      // Meta simples: include leve (o frontend tipa como KanbanCard do board).
      const card = await prisma.kanbanCard.update({
        where: { id },
        data: baseUpdateData,
        include: boardListCardInclude,
      });
      return formatCard(card);
    }

    const insertAt = requestedPosition ?? 0;

    // Move/reorder: include leve (sem checklist) — o board não precisa do payload completo.
    const card = await prisma.$transaction(async (tx) => {
      if (targetColumnId !== existing.columnId) {
        await moveKanbanCardToColumn(tx, id, existing.columnId, targetColumnId, insertAt);
        await renumberKanbanColumnCards(tx, existing.columnId);
        await renumberKanbanColumnCards(tx, targetColumnId);
      } else {
        await reorderKanbanCardInColumn(tx, id, existing.columnId, insertAt);
        await renumberKanbanColumnCards(tx, existing.columnId);
      }

      // columnId/position já aplicados acima — não reenviar columnId.
      const { columnId: _omitColumnId, ...metaWithoutColumn } = baseUpdateData;
      void _omitColumnId;

      return tx.kanbanCard.update({
        where: { id },
        data: metaWithoutColumn,
        include: boardListCardInclude,
      });
    });

    return formatCard(card);
  }

  /**
   * Move/reordena card com resposta mínima — usado pelo drag-and-drop do board.
   * Evita o PATCH genérico (checklist/membros) que deixava o save lento.
   */
  async moveCard(
    userId: string,
    id: string,
    data: { columnId: string; position: number },
  ): Promise<{ id: string; columnId: string; position: number }> {
    const existing = await prisma.kanbanCard.findUnique({
      where: { id },
      select: {
        id: true,
        columnId: true,
        position: true,
        column: {
          select: {
            board: { select: this.boardAccessSelect },
          },
        },
      },
    });
    if (!existing) throw new Error('Card não encontrado');
    await this.assertBoardAccess(userId, existing.column.board, 'write');

    const targetColumnId = data.columnId;
    if (!targetColumnId) throw new Error('Coluna obrigatória');
    const insertAt =
      data.position != null && Number.isFinite(data.position)
        ? Math.max(0, Math.trunc(data.position))
        : 0;

    if (targetColumnId !== existing.columnId) {
      await this.assertColumnAccess(userId, targetColumnId);
    }

    let completedAt: Date | null | undefined;
    if (targetColumnId !== existing.columnId) {
      const targetColumn = await prisma.kanbanColumn.findUnique({
        where: { id: targetColumnId },
        select: { title: true },
      });
      if (targetColumn && isKanbanCompletedColumnTitle(targetColumn.title)) {
        completedAt = new Date();
      } else {
        completedAt = null;
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM kanban_cards WHERE id = ${id} FOR UPDATE`;

      if (targetColumnId !== existing.columnId) {
        await moveKanbanCardToColumn(tx, id, existing.columnId, targetColumnId, insertAt);
        await renumberKanbanColumnCards(tx, existing.columnId);
        await renumberKanbanColumnCards(tx, targetColumnId);
      } else if (insertAt !== existing.position) {
        await reorderKanbanCardInColumn(tx, id, existing.columnId, insertAt);
        await renumberKanbanColumnCards(tx, existing.columnId);
      }

      if (completedAt !== undefined) {
        await tx.kanbanCard.update({
          where: { id },
          data: { completedAt },
        });
      }

      return tx.kanbanCard.findUniqueOrThrow({
        where: { id },
        select: { id: true, columnId: true, position: true },
      });
    });

    return updated;
  }

  async getCardCost(userId: string, cardId: string) {
    if (!(await userHasKanbanValuesPermission(userId))) {
      throw new Error(KANBAN_FORBIDDEN);
    }

    await this.assertCardAccess(userId, cardId);

    const card = await prisma.kanbanCard.findUnique({
      where: { id: cardId },
      include: {
        column: { select: { title: true } },
        assignee: { select: { id: true, name: true } },
        members: { include: { user: { select: { id: true, name: true } } } },
      },
    });

    if (!card) throw new Error('Card não encontrado');

    const peopleMeta: Array<{ userId: string; name: string }> = [];
    if (card.members.length) {
      for (const m of card.members) {
        peopleMeta.push({ userId: m.user.id, name: m.user.name });
      }
    } else if (card.assignee) {
      peopleMeta.push({ userId: card.assignee.id, name: card.assignee.name });
    } else if (card.assigneeName) {
      peopleMeta.push({ userId: '', name: card.assigneeName });
    }

    if (!card.startDate || !card.endDate) {
      throw new Error(
        'Defina a data de entrega (início e fim) no card para calcular o custo',
      );
    }

    const periodStart = card.startDate;
    const periodEnd = card.endDate;

    if (periodEnd.getTime() <= periodStart.getTime()) {
      throw new Error('A data final deve ser posterior à data inicial');
    }

    const hours = roundHours(
      Math.max(0, calculateKanbanBusinessHoursBetween(periodStart, periodEnd)),
    );

    const people: Array<{
      userId: string;
      name: string;
      hourlyRate: number | null;
      cost: number | null;
      hasEmployeeRecord: boolean;
    }> = [];

    let totalCost = 0;
    let hasMissingSalary = false;

    for (const person of peopleMeta) {
      if (!person.userId) {
        people.push({
          userId: '',
          name: person.name,
          hourlyRate: null,
          cost: null,
          hasEmployeeRecord: false,
        });
        hasMissingSalary = true;
        continue;
      }

      const employee = await prisma.employee.findUnique({
        where: { userId: person.userId },
        select: { salary: true, dangerPay: true, unhealthyPay: true },
      });

      if (!employee) {
        people.push({
          userId: person.userId,
          name: person.name,
          hourlyRate: null,
          cost: null,
          hasEmployeeRecord: false,
        });
        hasMissingSalary = true;
        continue;
      }

      const salary = Number(employee.salary);
      const dangerPay = Number(employee.dangerPay ?? 0);
      const unhealthyPay = Number(employee.unhealthyPay ?? 0);
      const hourlyRate = roundMoney(
        calculateKanbanHourlyRate(salary, dangerPay, unhealthyPay),
      );
      const cost = roundMoney(hourlyRate * hours);
      totalCost += cost;

      people.push({
        userId: person.userId,
        name: person.name,
        hourlyRate,
        cost,
        hasEmployeeRecord: true,
      });
    }

    if (peopleMeta.length === 0) {
      hasMissingSalary = true;
    }

    return {
      hours,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      monthlyWorkHours: MONTHLY_WORK_HOURS,
      totalCost: roundMoney(totalCost),
      hasMissingSalary,
      people,
    };
  }

  async duplicateCard(
    userId: string,
    cardId: string,
    options?: { title?: string; columnId?: string },
  ) {
    const source = await prisma.kanbanCard.findUnique({
      where: { id: cardId },
      include: {
        column: { include: { board: { select: this.boardAccessSelect } } },
        members: { select: { userId: true } },
        checklistItems: { orderBy: { position: 'asc' } },
      },
    });
    if (!source) throw new Error('Card não encontrado');
    await this.assertBoardAccess(userId, source.column.board, 'write');

    const targetColumnId = options?.columnId?.trim() || source.columnId;
    const nextTitle = options?.title?.trim() || source.title;

    if (targetColumnId !== source.columnId) {
      await this.assertColumnAccess(userId, targetColumnId);
      const targetColumn = await prisma.kanbanColumn.findUnique({
        where: { id: targetColumnId },
        select: { boardId: true },
      });
      if (!targetColumn || targetColumn.boardId !== source.column.boardId) {
        throw new Error('Coluna inválida');
      }
    }

    const checklistCount = source.checklistItems.length;

    const duplicated = await prisma.$transaction(async (tx) => {
      await tx.kanbanCard.updateMany({
        where: { columnId: targetColumnId },
        data: { position: { increment: 1 } },
      });

      const created = await tx.kanbanCard.create({
        data: {
          columnId: targetColumnId,
          title: nextTitle,
          description: source.description,
          priority: source.priority,
          startDate: source.startDate,
          endDate: source.endDate,
          labels: source.labels ?? [],
          assigneeUserId: source.assigneeUserId,
          assigneeName: source.assigneeName,
          totalTasks: source.checklistEnabled ? checklistCount : source.totalTasks,
          completedTasks: source.checklistEnabled ? 0 : source.completedTasks,
          checklistEnabled: source.checklistEnabled,
          attachmentsEnabled: source.attachmentsEnabled,
          workHours: source.workHours,
          completedAt: null,
          position: 0,
          ...(source.members.length > 0
            ? {
                members: {
                  create: source.members.map((member) => ({ userId: member.userId })),
                },
              }
            : {}),
          ...(source.checklistItems.length > 0
            ? {
                checklistItems: {
                  create: source.checklistItems.map((item, index) => ({
                    title: item.title,
                    isDone: false,
                    position: index,
                    assigneeUserId: item.assigneeUserId,
                    dueDate: item.dueDate,
                  })),
                },
              }
            : {}),
        },
        include: cardInclude,
      });

      return created;
    });

    return formatCard(duplicated);
  }

  async deleteCard(userId: string, id: string) {
    await this.assertCardAccess(userId, id);
    await prisma.kanbanCard.delete({ where: { id } });
  }

  async listPickerUsers(_requesterId: string) {
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        profilePhotoUrl: true,
        employee: { select: { position: true } },
      },
      orderBy: { name: 'asc' },
    });
    return users
      .filter((u) => !isKanbanHiddenPickerUser(u))
      .map(({ employee: _e, ...u }) => u);
  }

  async addCardMember(requesterId: string, cardId: string, userId: string) {
    await this.assertCardAccess(requesterId, cardId);
    const card = await prisma.kanbanCard.findUnique({ where: { id: cardId } });
    if (!card) throw new Error('Card não encontrado');

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        isActive: true,
        name: true,
        email: true,
        employee: { select: { position: true } },
      },
    });
    if (!user?.isActive || isKanbanHiddenPickerUser(user)) {
      throw new Error('Usuário não encontrado');
    }

    await prisma.kanbanCardMember.upsert({
      where: { cardId_userId: { cardId, userId } },
      create: { cardId, userId },
      update: {},
    });
    await syncLegacyAssignee(cardId);
    return this.getCardById(requesterId, cardId);
  }

  async removeCardMember(requesterId: string, cardId: string, userId: string) {
    await this.assertCardAccess(requesterId, cardId);
    const card = await prisma.kanbanCard.findUnique({ where: { id: cardId } });
    if (!card) throw new Error('Card não encontrado');

    await prisma.kanbanCardMember.deleteMany({ where: { cardId, userId } });
    await syncLegacyAssignee(cardId);
    return this.getCardById(requesterId, cardId);
  }

  async getCardById(userId: string, id: string) {
    await this.assertCardAccess(userId, id, 'read');
    const card = await prisma.kanbanCard.findUnique({
      where: { id },
      include: {
        assignee: { select: memberUserSelect },
        members: {
          orderBy: { createdAt: 'asc' },
          include: { user: { select: memberUserSelect } },
        },
        column: { select: { id: true, title: true, color: true } },
        checklistItems: {
          orderBy: { position: 'asc' },
          include: { assignee: { select: memberUserSelect } },
        },
        comments: {
          orderBy: { createdAt: 'desc' },
          include: {
            author: { select: { id: true, name: true, profilePhotoUrl: true } },
          },
        },
        attachments: {
          orderBy: { createdAt: 'desc' },
          include: {
            uploader: { select: { id: true, name: true } },
          },
        },
        _count: { select: { comments: true, attachments: true } },
      },
    });
    if (!card) throw new Error('Card não encontrado');

    const base = formatCard(card);
    return {
      ...base,
      columnId: card.columnId,
      columnTitle: card.column.title,
      columnColor: card.column.color,
      attachmentsList: card.attachments.map((a) => ({
        id: a.id,
        fileName: a.fileName,
        fileUrl: a.fileUrl,
        fileSize: a.fileSize,
        mimeType: a.mimeType,
        createdAt: a.createdAt.toISOString(),
        uploader: {
          id: a.uploader.id,
          name: a.uploader.name,
        },
      })),
      checklistItems: card.checklistItems.map((item) => formatChecklistItem(item)),
      commentsList: card.comments.map((c) => ({
        id: c.id,
        content: c.content,
        createdAt: c.createdAt.toISOString(),
        author: {
          id: c.author.id,
          name: c.author.name,
          profilePhotoUrl: c.author.profilePhotoUrl,
          avatarColor: avatarColorForKey(c.author.id),
        },
      })),
    };
  }

  async createChecklistItem(userId: string, cardId: string, title: string) {
    await this.assertCardAccess(userId, cardId);
    const maxPos = await prisma.kanbanChecklistItem.aggregate({
      where: { cardId },
      _max: { position: true },
    });
    const item = await prisma.kanbanChecklistItem.create({
      data: {
        cardId,
        title: title.trim(),
        position: (maxPos._max.position ?? -1) + 1,
      },
      include: { assignee: { select: memberUserSelect } },
    });
    await syncCardTaskCounts(cardId);
    await prisma.kanbanCard.update({
      where: { id: cardId },
      data: { checklistEnabled: true },
    });
    const card = await this.getCardChecklistSnapshot(cardId);
    return { item: formatChecklistItem(item), card };
  }

  /**
   * Snapshot leve do card após mutação de checklist — sem comments/attachments.
   * O frontend preserva comentários/anexos do cache local.
   */
  private async getCardChecklistSnapshot(cardId: string) {
    const card = await prisma.kanbanCard.findUnique({
      where: { id: cardId },
      include: {
        ...boardListCardInclude,
        checklistItems: {
          orderBy: { position: 'asc' as const },
          include: { assignee: { select: memberUserSelect } },
        },
        column: { select: { id: true, title: true, color: true } },
      },
    });
    if (!card) throw new Error('Card não encontrado');
    const base = formatCard(card);
    return {
      ...base,
      columnId: card.columnId,
      columnTitle: card.column.title,
      columnColor: card.column.color,
      checklistItems: card.checklistItems.map((item) => formatChecklistItem(item)),
      commentsList: [] as Array<unknown>,
      attachmentsList: [] as Array<unknown>,
    };
  }

  async updateChecklistItem(
    userId: string,
    id: string,
    data: {
      title?: string;
      isDone?: boolean;
      assigneeUserId?: string | null;
      dueDate?: string | null;
    },
  ) {
    const existing = await prisma.kanbanChecklistItem.findUnique({
      where: { id },
      select: { cardId: true },
    });
    if (!existing) throw new Error('Tarefa não encontrada');
    await this.assertCardAccess(userId, existing.cardId);

    const item = await prisma.kanbanChecklistItem.update({
      where: { id },
      data: {
        title: data.title?.trim(),
        isDone: data.isDone,
        ...(data.assigneeUserId !== undefined && { assigneeUserId: data.assigneeUserId }),
        ...(data.dueDate !== undefined && { dueDate: parseDateInput(data.dueDate) }),
      },
      include: { assignee: { select: memberUserSelect } },
    });
    await syncCardTaskCounts(item.cardId);
    const card = await this.getCardChecklistSnapshot(item.cardId);
    return { item: formatChecklistItem(item), card };
  }

  async deleteChecklistItem(userId: string, id: string) {
    const item = await prisma.kanbanChecklistItem.findUnique({
      where: { id },
      select: { cardId: true },
    });
    if (!item) return;
    await this.assertCardAccess(userId, item.cardId);
    await prisma.kanbanChecklistItem.delete({ where: { id } });
    await syncCardTaskCounts(item.cardId);
  }

  async createComment(requesterId: string, cardId: string, content: string) {
    await this.assertCardAccess(requesterId, cardId);
    const comment = await prisma.kanbanCardComment.create({
      data: {
        cardId,
        userId: requesterId,
        content: content.trim(),
      },
      include: {
        author: { select: { id: true, name: true, profilePhotoUrl: true } },
      },
    });
    return {
      id: comment.id,
      content: comment.content,
      createdAt: comment.createdAt.toISOString(),
      author: {
        id: comment.author.id,
        name: comment.author.name,
        profilePhotoUrl: comment.author.profilePhotoUrl,
        avatarColor: avatarColorForKey(comment.author.id),
      },
    };
  }

  async deleteComment(requesterId: string, id: string) {
    const comment = await prisma.kanbanCardComment.findUnique({
      where: { id },
      select: { cardId: true },
    });
    if (!comment) throw new Error('Comentário não encontrado');
    await this.assertCardAccess(requesterId, comment.cardId);
    await prisma.kanbanCardComment.delete({ where: { id } });
  }

  static readonly LINK_ATTACHMENT_MIME = 'text/x-kanban-link';

  private normalizeLinkUrl(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) throw new Error('URL é obrigatória');
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    let parsed: URL;
    try {
      parsed = new URL(withScheme);
    } catch {
      throw new Error('URL inválida');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('URL inválida');
    }
    return parsed.href;
  }

  async addLinkAttachment(
    requesterId: string,
    cardId: string,
    data: { url: string; displayName?: string },
  ) {
    await this.assertCardAccess(requesterId, cardId);
    const card = await prisma.kanbanCard.findUnique({ where: { id: cardId } });
    if (!card) throw new Error('Card não encontrado');

    const fileUrl = this.normalizeLinkUrl(data.url);
    const display = data.displayName?.trim();
    const fileName = (display || fileUrl).slice(0, 500);

    await prisma.kanbanCardAttachment.create({
      data: {
        cardId,
        userId: requesterId,
        fileName,
        fileUrl,
        fileKey: null,
        fileSize: 0,
        mimeType: KanbanService.LINK_ATTACHMENT_MIME,
      },
    });

    await prisma.kanbanCard.update({
      where: { id: cardId },
      data: { attachmentsEnabled: true },
    });

    return this.getCardById(requesterId, cardId);
  }

  async addAttachments(
    requesterId: string,
    cardId: string,
    files: Array<{ originalname: string; buffer: Buffer; size: number; mimetype?: string }>,
  ) {
    await this.assertCardAccess(requesterId, cardId);
    const card = await prisma.kanbanCard.findUnique({ where: { id: cardId } });
    if (!card) throw new Error('Card não encontrado');
    if (!files.length) throw new Error('Nenhum arquivo enviado');

    for (const file of files) {
      const upload = await chatUploadService.uploadFile(file, requesterId);
      await prisma.kanbanCardAttachment.create({
        data: {
          cardId,
          userId: requesterId,
          fileName: file.originalname || 'arquivo',
          fileUrl: upload.url,
          fileKey: upload.key,
          fileSize: upload.size,
          mimeType: upload.mimeType,
        },
      });
    }

    await prisma.kanbanCard.update({
      where: { id: cardId },
      data: { attachmentsEnabled: true },
    });

    return this.getCardById(requesterId, cardId);
  }

  async deleteAttachment(requesterId: string, attachmentId: string) {
    const att = await prisma.kanbanCardAttachment.findUnique({ where: { id: attachmentId } });
    if (!att) throw new Error('Anexo não encontrado');
    await this.assertCardAccess(requesterId, att.cardId);
    if (att.userId !== requesterId) throw new Error('Sem permissão para remover este anexo');

    await prisma.kanbanCardAttachment.delete({ where: { id: attachmentId } });

    const remaining = await prisma.kanbanCardAttachment.count({
      where: { cardId: att.cardId },
    });
    if (remaining === 0) {
      await prisma.kanbanCard.update({
        where: { id: att.cardId },
        data: { attachmentsEnabled: false },
      });
    }

    return this.getCardById(requesterId, att.cardId);
  }

  /** Exporta o quadro no JSON compatível com Trello. */
  async exportBoardAsTrello(
    userId: string,
    departmentKeyParam?: string,
  ): Promise<{ filename: string; payload: TrelloExportBoard }> {
    const formatted = await this.getBoardForUser(userId, departmentKeyParam);
    const row = await loadBoardForTrelloTransfer(formatted.id);
    if (!row) throw new Error('Quadro não encontrado para este setor');
    const payload = boardToTrelloExport(row);
    const safeName = (payload.name || 'tasks')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9-_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()
      .slice(0, 60) || 'tasks';
    return {
      filename: `${safeName}-trello-export.json`,
      payload,
    };
  }

  /**
   * Importa JSON estilo Trello no quadro atual.
   * @param replace se true, apaga colunas/cards existentes antes.
   */
  async importBoardFromTrello(
    userId: string,
    data: unknown,
    options: {
      departmentKey?: string;
      replace?: boolean;
      memberMap?: Record<string, string>;
    } = {},
  ) {
    const formatted = await this.getBoardForUser(userId, options.departmentKey);
    if (formatted.canWrite === false) throw new Error(KANBAN_FORBIDDEN);

    const boardMeta = await prisma.kanbanBoard.findUnique({
      where: { id: formatted.id },
      select: this.boardAccessSelect,
    });
    if (!boardMeta) throw new Error('Quadro não encontrado para este setor');
    await this.assertBoardAccess(userId, boardMeta, 'write');

    return importTrelloIntoBoard(data, {
      boardId: formatted.id,
      replace: !!options.replace,
      importAsUserId: userId,
      memberMap: options.memberMap || {},
    });
  }
}
