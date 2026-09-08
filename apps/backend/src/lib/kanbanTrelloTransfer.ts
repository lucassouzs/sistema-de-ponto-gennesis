/**
 * Import/export de quadros Kanban no formato JSON compatível com export do Trello.
 * Formato portátil: o mesmo arquivo serve neste sistema e em ferramentas que leem export Trello.
 */

import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { resolveKanbanLabelPresets } from './kanbanLabelPresets';

/** Cores base usadas no export (nearest match). */
const TRELLO_COLORS = [
  'green',
  'yellow',
  'orange',
  'red',
  'purple',
  'blue',
  'sky',
  'lime',
  'pink',
  'black',
] as const;

/**
 * Paleta oficial Trello (API usa green / green_light / green_dark).
 * Sem isso, labels modernas viravam cinza genérico no import.
 */
const TRELLO_COLOR_HEX: Record<string, string> = {
  // padrão (médio)
  green: '#6FC25F',
  yellow: '#F2D918',
  orange: '#FEA72F',
  red: '#EC6957',
  purple: '#C883E2',
  blue: '#1885C4',
  sky: '#18C7E2',
  lime: '#61E9A1',
  pink: '#FE84CF',
  black: '#486271',
  // light
  green_light: '#B7DEB0',
  yellow_light: '#F6EA92',
  orange_light: '#FBD19C',
  red_light: '#F0B3AB',
  purple_light: '#DFC0EB',
  blue_light: '#8CBED9',
  sky_light: '#90DFEB',
  lime_light: '#B3F1D0',
  pink_light: '#F8C2E4',
  black_light: '#506079',
  // dark
  green_dark: '#59AC44',
  yellow_dark: '#E7C60B',
  orange_dark: '#E79217',
  red_dark: '#CF513D',
  purple_dark: '#A86CC1',
  blue_dark: '#036AA7',
  sky_dark: '#03AECC',
  lime_dark: '#4FD582',
  pink_dark: '#E668AF',
  black_dark: '#081F42',
  // legado / sem cor
  gray: '#B9C3C9',
  grey: '#B9C3C9',
  null: '#B3BAC5',
};

const COLUMN_COLORS = [
  '#111827',
  '#14B8A6',
  '#3B82F6',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#6B7280',
];

function trelloColorToHex(colorName: string | null | undefined): string {
  if (!colorName) return TRELLO_COLOR_HEX.null;
  const raw = String(colorName).trim();
  if (!raw) return TRELLO_COLOR_HEX.null;
  if (raw.startsWith('#')) return raw.toUpperCase();
  // API: blue_light | UI legada às vezes: blue-light
  const key = raw.toLowerCase().replace(/-/g, '_');
  if (TRELLO_COLOR_HEX[key]) return TRELLO_COLOR_HEX[key];
  // fallback: "blue light" -> blue_light
  const spaced = key.replace(/\s+/g, '_');
  if (TRELLO_COLOR_HEX[spaced]) return TRELLO_COLOR_HEX[spaced];
  return TRELLO_COLOR_HEX.null;
}

function hexToNearestTrelloColor(hex: string): (typeof TRELLO_COLORS)[number] {
  const raw = hex.trim().toUpperCase();
  const parse = (h: string) => {
    const m = h.match(/^#?([0-9A-F]{6})$/i);
    if (!m) return null;
    return {
      r: parseInt(m[1].slice(0, 2), 16),
      g: parseInt(m[1].slice(2, 4), 16),
      b: parseInt(m[1].slice(4, 6), 16),
    };
  };
  const target = parse(raw);
  if (!target) return 'black';
  let best: (typeof TRELLO_COLORS)[number] = 'black';
  let bestDist = Infinity;
  for (const name of TRELLO_COLORS) {
    const c = parse(TRELLO_COLOR_HEX[name]);
    if (!c) continue;
    const d =
      (c.r - target.r) ** 2 + (c.g - target.g) ** 2 + (c.b - target.b) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = name;
    }
  }
  return best;
}

function parseCardLabels(raw: unknown): Array<{ color: string; text: string }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (x): x is { color: string; text: string } =>
        !!x &&
        typeof x === 'object' &&
        typeof (x as { color?: unknown }).color === 'string' &&
        typeof (x as { text?: unknown }).text === 'string',
    )
    .map((x) => ({ color: x.color, text: x.text.trim() }));
}

/** Gera id estável curto no estilo Trello (24 hex). */
function trelloLikeId(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const base = h.toString(16).padStart(8, '0');
  const rest = Buffer.from(seed).toString('hex').slice(0, 16).padEnd(16, '0');
  return (base + rest).slice(0, 24);
}

export type TrelloExportBoard = {
  id: string;
  name: string;
  /** Marcador nosso para reconhecer round-trip */
  desc?: string;
  lists: Array<{ id: string; name: string; closed: boolean; pos: number }>;
  cards: Array<{
    id: string;
    name: string;
    desc: string;
    idList: string;
    closed: boolean;
    pos: number;
    due: string | null;
    dueComplete: boolean;
    idLabels: string[];
    idMembers: string[];
    attachments: Array<{ id: string; name: string; url: string }>;
  }>;
  labels: Array<{ id: string; name: string; color: string; idBoard: string }>;
  checklists: Array<{
    id: string;
    idCard: string;
    name: string;
    checkItems: Array<{
      id: string;
      name: string;
      state: 'complete' | 'incomplete';
      pos: number;
    }>;
  }>;
  actions: Array<{
    id: string;
    type: 'commentCard';
    date: string;
    data: { text: string; card: { id: string } };
    memberCreator: { id: string; fullName: string; username: string };
  }>;
  members: Array<{
    id: string;
    fullName: string;
    username: string;
  }>;
};

type BoardRow = {
  id: string;
  name: string;
  departmentLabel: string;
  labelPresets: unknown;
  columns: Array<{
    id: string;
    title: string;
    position: number;
    cards: Array<{
      id: string;
      title: string;
      description: string;
      position: number;
      endDate: Date | null;
      completedAt: Date | null;
      labels: unknown;
      assigneeUserId: string | null;
      assignee: { id: string; name: string } | null;
      members: Array<{ user: { id: string; name: string } }>;
      checklistItems: Array<{
        id: string;
        title: string;
        isDone: boolean;
        position: number;
      }>;
      comments: Array<{
        id: string;
        content: string;
        createdAt: Date;
        author: { id: string; name: string };
      }>;
      attachments: Array<{
        id: string;
        fileName: string;
        fileUrl: string;
      }>;
    }>;
  }>;
};

export async function loadBoardForTrelloTransfer(boardId: string): Promise<BoardRow | null> {
  return prisma.kanbanBoard.findUnique({
    where: { id: boardId },
    select: {
      id: true,
      name: true,
      departmentLabel: true,
      labelPresets: true,
      columns: {
        orderBy: { position: 'asc' },
        select: {
          id: true,
          title: true,
          position: true,
          cards: {
            orderBy: { position: 'asc' },
            select: {
              id: true,
              title: true,
              description: true,
              position: true,
              endDate: true,
              completedAt: true,
              labels: true,
              assigneeUserId: true,
              assignee: { select: { id: true, name: true } },
              members: {
                orderBy: { createdAt: 'asc' },
                select: { user: { select: { id: true, name: true } } },
              },
              checklistItems: {
                orderBy: { position: 'asc' },
                select: {
                  id: true,
                  title: true,
                  isDone: true,
                  position: true,
                },
              },
              comments: {
                orderBy: { createdAt: 'asc' },
                select: {
                  id: true,
                  content: true,
                  createdAt: true,
                  author: { select: { id: true, name: true } },
                },
              },
              attachments: {
                orderBy: { createdAt: 'asc' },
                select: { id: true, fileName: true, fileUrl: true },
              },
            },
          },
        },
      },
    },
  });
}

export function boardToTrelloExport(board: BoardRow): TrelloExportBoard {
  const boardId = trelloLikeId(`board:${board.id}`);
  const labelKeyToId = new Map<string, string>();
  const labels: TrelloExportBoard['labels'] = [];

  const ensureLabel = (color: string, text: string) => {
    const key = `${color.toUpperCase()}|${text}`;
    let id = labelKeyToId.get(key);
    if (id) return id;
    id = trelloLikeId(`label:${board.id}:${key}`);
    labelKeyToId.set(key, id);
    labels.push({
      id,
      name: text || '',
      color: hexToNearestTrelloColor(color),
      idBoard: boardId,
    });
    return id;
  };

  for (const p of resolveKanbanLabelPresets(board.labelPresets)) {
    ensureLabel(p.color, p.name);
  }

  /** key = users.id do sistema */
  const memberByUserId = new Map<
    string,
    { id: string; fullName: string; username: string }
  >();
  const trackMember = (userId: string, name: string) => {
    const existing = memberByUserId.get(userId);
    if (existing) return existing.id;
    const trelloMemberId = trelloLikeId(`user:${userId}`);
    memberByUserId.set(userId, {
      id: trelloMemberId,
      fullName: name || 'Usuário',
      // Round-trip: permite reimportar membros no Gennesis sem mapa manual
      username: `guser_${userId}`,
    });
    return trelloMemberId;
  };

  const lists: TrelloExportBoard['lists'] = [];
  const cards: TrelloExportBoard['cards'] = [];
  const checklists: TrelloExportBoard['checklists'] = [];
  const actions: TrelloExportBoard['actions'] = [];

  for (const col of board.columns) {
    const listId = trelloLikeId(`list:${col.id}`);
    lists.push({
      id: listId,
      name: col.title,
      closed: false,
      pos: (col.position + 1) * 16384,
    });

    for (const card of col.cards) {
      const cardId = trelloLikeId(`card:${card.id}`);
      const cardLabels = parseCardLabels(card.labels);
      const idLabels = cardLabels.map((l) => ensureLabel(l.color, l.text));

      const idMembers: string[] = [];
      const seenMembers = new Set<string>();
      for (const m of card.members) {
        const mid = trackMember(m.user.id, m.user.name);
        if (!seenMembers.has(mid)) {
          seenMembers.add(mid);
          idMembers.push(mid);
        }
      }
      if (card.assignee) {
        const mid = trackMember(card.assignee.id, card.assignee.name);
        if (!seenMembers.has(mid)) {
          seenMembers.add(mid);
          idMembers.push(mid);
        }
      }

      cards.push({
        id: cardId,
        name: card.title,
        desc: card.description || '',
        idList: listId,
        closed: false,
        pos: (card.position + 1) * 16384,
        due: card.endDate ? card.endDate.toISOString() : null,
        dueComplete: !!card.completedAt,
        idLabels,
        idMembers,
        attachments: card.attachments.map((a) => ({
          id: trelloLikeId(`att:${a.id}`),
          name: a.fileName,
          url: a.fileUrl,
        })),
      });

      if (card.checklistItems.length) {
        const clId = trelloLikeId(`cl:${card.id}`);
        checklists.push({
          id: clId,
          idCard: cardId,
          name: 'Checklist',
          checkItems: card.checklistItems.map((item, idx) => ({
            id: trelloLikeId(`ci:${item.id}`),
            name: item.title,
            state: item.isDone ? 'complete' : 'incomplete',
            pos: (item.position ?? idx) * 16384,
          })),
        });
      }

      for (const c of card.comments) {
        const memberId = trackMember(c.author.id, c.author.name);
        actions.push({
          id: trelloLikeId(`act:${c.id}`),
          type: 'commentCard',
          date: c.createdAt.toISOString(),
          data: { text: c.content, card: { id: cardId } },
          memberCreator: {
            id: memberId,
            fullName: c.author.name,
            username: memberByUserId.get(c.author.id)?.username || `guser_${c.author.id}`,
          },
        });
      }
    }
  }

  return {
    id: boardId,
    name: board.departmentLabel || board.name || 'Tasks',
    desc: 'Exported from Gennesis Tasks (Trello-compatible JSON)',
    lists,
    cards,
    labels,
    checklists,
    actions,
    members: Array.from(memberByUserId.values()),
  };
}

type ParsedList = {
  trelloId: string;
  name: string;
  position: number;
  cards: ParsedCard[];
};

type ParsedCard = {
  trelloId: string;
  title: string;
  description: string;
  dueDate: string | null;
  position: number;
  completed: boolean;
  labels: Array<{ name: string; color: string }>;
  memberTrelloIds: string[];
  checklistItems: Array<{ name: string; completed: boolean }>;
  comments: Array<{
    text: string;
    authorName: string;
    authorTrelloId: string | null;
    createdAt: string;
  }>;
  attachments: Array<{ url: string; name: string }>;
};

function isTrelloLikeExport(data: unknown): data is Record<string, unknown> {
  return (
    !!data &&
    typeof data === 'object' &&
    Array.isArray((data as { lists?: unknown }).lists) &&
    Array.isArray((data as { cards?: unknown }).cards)
  );
}

export function parseTrelloExport(data: unknown): {
  boardName: string;
  lists: ParsedList[];
  members: Array<{ id: string; fullName: string; username?: string }>;
} {
  if (!isTrelloLikeExport(data)) {
    throw new Error('JSON inválido: esperado export no formato Trello (lists + cards)');
  }

  const listsRaw = data.lists as Array<Record<string, unknown>>;
  const cardsRaw = data.cards as Array<Record<string, unknown>>;
  const labelsRaw = (data.labels as Array<Record<string, unknown>>) || [];
  const checklistsRaw = (data.checklists as Array<Record<string, unknown>>) || [];
  const actionsRaw = (data.actions as Array<Record<string, unknown>>) || [];
  const membersRaw = (data.members as Array<Record<string, unknown>>) || [];

  const openLists = listsRaw
    .filter((l) => !l.closed)
    .slice()
    .sort((a, b) => Number(a.pos ?? 0) - Number(b.pos ?? 0));

  const listsById: Record<string, ParsedList> = {};
  openLists.forEach((list, idx) => {
    const id = String(list.id);
    listsById[id] = {
      trelloId: id,
      name: String(list.name || `Lista ${idx + 1}`),
      position: idx,
      cards: [],
    };
  });

  const labelsById: Record<string, { name: string; color: string }> = {};
  for (const label of labelsRaw) {
    labelsById[String(label.id)] = {
      name: String(label.name || label.color || 'Etiqueta'),
      color: trelloColorToHex(
        typeof label.color === 'string' ? label.color : null,
      ),
    };
  }

  const openCards = cardsRaw
    .filter((c) => !c.closed)
    .slice()
    .sort((a, b) => Number(a.pos ?? 0) - Number(b.pos ?? 0));

  for (const card of openCards) {
    const list = listsById[String(card.idList)];
    if (!list) continue;
    const cardId = String(card.id);

    const checklistItems: ParsedCard['checklistItems'] = [];
    for (const cl of checklistsRaw.filter((c) => String(c.idCard) === cardId)) {
      const items = (cl.checkItems as Array<Record<string, unknown>>) || [];
      items
        .slice()
        .sort((a, b) => Number(a.pos ?? 0) - Number(b.pos ?? 0))
        .forEach((item) => {
          checklistItems.push({
            name: String(item.name || ''),
            completed: item.state === 'complete',
          });
        });
    }

    const comments = actionsRaw
      .filter(
        (a) =>
          a.type === 'commentCard' &&
          (a.data as { card?: { id?: string } } | undefined)?.card?.id === cardId,
      )
      .map((a) => {
        const dataObj = a.data as { text?: string };
        const creator = a.memberCreator as
          | { id?: string; fullName?: string }
          | undefined;
        return {
          text: String(dataObj?.text || ''),
          authorName: creator?.fullName || 'Desconhecido',
          authorTrelloId: creator?.id || null,
          createdAt: String(a.date || new Date().toISOString()),
        };
      });

    const attachments = (
      (card.attachments as Array<Record<string, unknown>>) || []
    ).map((att) => ({
      url: String(att.url || ''),
      name: String(att.name || 'anexo'),
    }));

    const idLabels = (card.idLabels as string[]) || [];

    list.cards.push({
      trelloId: cardId,
      title: String(card.name || 'Sem título'),
      description: String(card.desc || ''),
      dueDate: card.due ? String(card.due) : null,
      position: list.cards.length,
      completed: !!card.dueComplete,
      labels: idLabels
        .map((id) => labelsById[id])
        .filter(Boolean)
        .map((l) => ({ name: l.name.trim(), color: l.color })),
      memberTrelloIds: ((card.idMembers as string[]) || []).map(String),
      checklistItems,
      comments,
      attachments,
    });
  }

  return {
    boardName: String(data.name || 'Tasks'),
    lists: Object.values(listsById).sort((a, b) => a.position - b.position),
    members: membersRaw.map((m) => ({
      id: String(m.id),
      fullName: String(m.fullName || m.username || m.id),
      username: typeof m.username === 'string' ? m.username : undefined,
    })),
  };
}

/** Resolve mapa Trello→users: guser_<id> do nosso export + memberMap manual. */
function resolveMemberMap(
  parsedMembers: Array<{ id: string; fullName: string; username?: string }>,
  memberMap: Record<string, string>,
): Record<string, string> {
  const out = { ...memberMap };
  for (const m of parsedMembers) {
    if (out[m.id]) continue;
    const u = m.username || '';
    if (u.startsWith('guser_') && u.length > 6) {
      out[m.id] = u.slice('guser_'.length);
    }
  }
  return out;
}

function newCuidLike() {
  return (
    'c' +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 8)
  );
}

export type ImportTrelloOptions = {
  boardId: string;
  replace: boolean;
  importAsUserId: string;
  /** trelloMemberId -> users.id */
  memberMap?: Record<string, string>;
};

export type ImportTrelloResult = {
  columnsCreated: number;
  cardsCreated: number;
  boardName: string;
};

export async function importTrelloIntoBoard(
  data: unknown,
  options: ImportTrelloOptions,
): Promise<ImportTrelloResult> {
  const parsed = parseTrelloExport(data);
  const { boardId, replace, importAsUserId } = options;
  const memberMap = resolveMemberMap(parsed.members, options.memberMap || {});

  const importUser = await prisma.user.findUnique({
    where: { id: importAsUserId },
    select: { id: true, name: true },
  });
  if (!importUser) throw new Error('Usuário de importação inválido');

  const board = await prisma.kanbanBoard.findUnique({
    where: { id: boardId },
    select: { id: true, labelPresets: true },
  });
  if (!board) throw new Error('Quadro não encontrado');

  // Valida users do mapa que existem + cache de nomes
  const mappedIds = Array.from(new Set(Object.values(memberMap)));
  const userNameById = new Map<string, string>();
  if (mappedIds.length) {
    const existing = await prisma.user.findMany({
      where: { id: { in: mappedIds } },
      select: { id: true, name: true },
    });
    const ok = new Set(existing.map((u) => u.id));
    for (const u of existing) userNameById.set(u.id, u.name);
    for (const [trelloId, uid] of Object.entries(memberMap)) {
      if (!ok.has(uid)) delete memberMap[trelloId];
    }
  }
  if (!userNameById.has(importAsUserId)) {
    userNameById.set(importAsUserId, importUser.name);
  }

  // Uma transação por coluna evita timeout em boards grandes (Trello com centenas de cards).
  const colTxTimeoutMs = 3 * 60 * 1000;

  if (replace) {
    await prisma.kanbanColumn.deleteMany({ where: { boardId } });
  }

  let columnsCreated = 0;
  let cardsCreated = 0;
  const collectedLabels = new Map<string, { color: string; name: string }>();

  const flushMany = async <T>(
    rows: T[],
    write: (chunk: T[]) => Promise<unknown>,
    chunkSize = 250,
  ) => {
    for (let i = 0; i < rows.length; i += chunkSize) {
      await write(rows.slice(i, i + chunkSize));
    }
  };

  for (const list of parsed.lists) {
    const result = await prisma.$transaction(
      async (tx) => {
        const memberRows: Array<{ id: string; cardId: string; userId: string }> = [];
        const checklistRows: Array<{
          id: string;
          cardId: string;
          title: string;
          isDone: boolean;
          position: number;
        }> = [];
        const commentRows: Array<{
          id: string;
          cardId: string;
          userId: string;
          content: string;
          createdAt: Date;
          updatedAt: Date;
        }> = [];
        const attachmentRows: Array<{
          id: string;
          cardId: string;
          userId: string;
          fileName: string;
          fileUrl: string;
          fileSize: number;
          mimeType: string;
        }> = [];

        const column = await tx.kanbanColumn.create({
          data: {
            id: newCuidLike(),
            boardId,
            title: list.name.slice(0, 200),
            color: COLUMN_COLORS[list.position % COLUMN_COLORS.length],
            position: list.position,
          },
        });

        let listCards = 0;

        for (const card of list.cards) {
          const resolvedUserIds: string[] = [];
          for (const trelloId of card.memberTrelloIds) {
            const uid = memberMap[trelloId];
            if (uid && !resolvedUserIds.includes(uid)) resolvedUserIds.push(uid);
          }

          const firstUserId = resolvedUserIds[0] || null;
          const firstName = firstUserId ? userNameById.get(firstUserId) || null : null;

          const labelsJson = card.labels.map((l) => ({
            color: l.color.toUpperCase(),
            text: (l.name || 'Etiqueta').slice(0, 80),
          }));
          for (const l of labelsJson) {
            collectedLabels.set(l.color, { color: l.color, name: l.text });
          }

          const totalTasks = card.checklistItems.length;
          const completedTasks = card.checklistItems.filter((i) => i.completed).length;
          const now = new Date();
          const cardId = newCuidLike();

          await tx.kanbanCard.create({
            data: {
              id: cardId,
              columnId: column.id,
              title: card.title.slice(0, 500) || 'Sem título',
              description: card.description || '',
              priority: 'MEDIUM',
              endDate: card.dueDate ? new Date(card.dueDate) : null,
              position: card.position,
              labels: labelsJson as Prisma.InputJsonValue,
              totalTasks,
              completedTasks,
              checklistEnabled: totalTasks > 0,
              attachmentsEnabled: card.attachments.some((a) => !!a.url),
              completedAt: card.completed ? now : null,
              assigneeUserId: firstUserId,
              assigneeName: firstName,
            },
          });
          listCards += 1;

          for (const userId of resolvedUserIds) {
            memberRows.push({ id: newCuidLike(), cardId, userId });
          }

          card.checklistItems.forEach((item, idx) => {
            checklistRows.push({
              id: newCuidLike(),
              cardId,
              title: item.name || 'Item',
              isDone: item.completed,
              position: idx,
            });
          });

          for (const c of card.comments) {
            const authorId =
              (c.authorTrelloId && memberMap[c.authorTrelloId]) || importAsUserId;
            const content = c.authorName
              ? `${c.text}\n\n— ${c.authorName} (importado)`
              : c.text;
            const at = c.createdAt ? new Date(c.createdAt) : now;
            commentRows.push({
              id: newCuidLike(),
              cardId,
              userId: authorId,
              content: (content || '(sem texto)').slice(0, 20000),
              createdAt: at,
              updatedAt: at,
            });
          }

          for (const att of card.attachments) {
            if (!att.url) continue;
            // Ignora data URI / base64 embutido (estoura payload e tempo)
            if (/^data:/i.test(att.url)) continue;
            attachmentRows.push({
              id: newCuidLike(),
              cardId,
              userId: importAsUserId,
              fileName: (att.name || 'anexo').slice(0, 255),
              fileUrl: att.url.slice(0, 4000),
              fileSize: 0,
              mimeType: 'application/octet-stream',
            });
          }
        }

        await flushMany(memberRows, (data) =>
          tx.kanbanCardMember.createMany({ data, skipDuplicates: true }),
        );
        await flushMany(checklistRows, (data) =>
          tx.kanbanChecklistItem.createMany({ data }),
        );
        await flushMany(commentRows, (data) =>
          tx.kanbanCardComment.createMany({ data }),
        );
        await flushMany(attachmentRows, (data) =>
          tx.kanbanCardAttachment.createMany({ data }),
        );

        return { listCards };
      },
      { maxWait: 20_000, timeout: colTxTimeoutMs },
    );

    columnsCreated += 1;
    cardsCreated += result.listCards;
  }

  const presetsRaw = resolveKanbanLabelPresets(replace ? [] : board.labelPresets);
  const byColor = new Map(
    presetsRaw.map((p) => [
      p.color.toUpperCase(),
      { color: p.color.toUpperCase(), name: p.name },
    ]),
  );
  if (replace) byColor.clear();
  for (const l of collectedLabels.values()) {
    if (!byColor.has(l.color)) byColor.set(l.color, l);
  }
  const merged = Array.from(byColor.values()).slice(0, 24);
  if (merged.length) {
    await prisma.kanbanBoard.update({
      where: { id: boardId },
      data: { labelPresets: merged as Prisma.InputJsonValue },
    });
  }

  return {
    columnsCreated,
    cardsCreated,
    boardName: parsed.boardName,
  };
}
