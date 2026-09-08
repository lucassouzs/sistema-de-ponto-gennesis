/**
 * import-trello.js
 * ------------------------------------------------------------------
 * Importa um board exportado do Trello (JSON) para o PostgreSQL do
 * Kanban/Tasks (Gennesis) — schema Prisma real.
 *
 * Mapeamento de domínio:
 *   Board Trello  -> kanban_boards   (já deve existir; passe o boardId)
 *   Lista Trello  -> kanban_columns
 *   Card Trello   -> kanban_cards
 *
 * COMO EXPORTAR O JSON DO TRELLO:
 *   No board -> menu "..." -> "Imprimir, exportar e compartilhar"
 *   -> "Exportar como JSON"
 *
 * COMO USAR:
 *   1. npm install pg   (se ainda não tiver)
 *   2. Configure DATABASE_URL (ou DB_*) — mesmo do apps/backend/.env
 *   3. Liste membros do Trello e monte o mapa em SCHEMA.members.trelloIdToUserId
 *   4. Rode (substitui o que já está no quadro):
 *        node scripts/import-trello.js ./trello-export.json <boardId> \
 *          --import-as-user <userId> --replace --yes
 *
 *   Sem --replace: só ACRESCENTA colunas/cards (não apaga o que já existe).
 *   Com --replace: apaga TODAS as colunas/cards do board e importa o Trello no lugar.
 *
 * IMPORTANTE: NÃO rode em produção sem staging. Sempre em BEGIN/COMMIT/ROLLBACK.
 * ------------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');

// Carrega .env do backend se existir (sem dependência dotenv)
try {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m || process.env[m[1]] !== undefined) continue;
      let v = m[2].trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      process.env[m[1]] = v;
    }
  }
} catch {
  // ignore
}

// ============================================================
// 1) CONEXÃO COM O BANCO
// ============================================================
function createClient() {
  if (process.env.DATABASE_URL) {
    return new Client({ connectionString: process.env.DATABASE_URL });
  }
  return new Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'Gennesis',
  });
}

const client = createClient();

/** Usuário do sistema usado em comentários/anexos (FK obrigatória). */
let importAsUserId = process.env.TRELLO_IMPORT_USER_ID || '';

/** Se true: apaga colunas/cards do board e importa o Trello no lugar. */
let replaceMode = false;
let assumeYes = false;

function newId() {
  // cuid-like suficiente para TEXT @id (Prisma usa cuid; UUID também serve)
  return 'c' + crypto.randomBytes(12).toString('hex');
}

function now() {
  return new Date();
}

/** Aspas em identificadores camelCase (Postgres senão vira boardid etc.). */
function q(ident) {
  return `"${String(ident).replace(/"/g, '""')}"`;
}

// Cores nomeadas do Trello -> hex (#RRGGBB) usado no Kanban
const TRELLO_COLOR_TO_HEX = {
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

function trelloColorToHex(colorName) {
  if (!colorName) return TRELLO_COLOR_TO_HEX.null;
  const raw = String(colorName).trim();
  if (!raw) return TRELLO_COLOR_TO_HEX.null;
  if (raw.startsWith('#')) return raw.toUpperCase();
  const key = raw.toLowerCase().replace(/-/g, '_').replace(/\s+/g, '_');
  return TRELLO_COLOR_TO_HEX[key] || TRELLO_COLOR_TO_HEX.null;
}

// ============================================================
// 2) MAPEAMENTO DE SCHEMA  (schema Prisma real)
// ============================================================
// Domínio real:
//   - não existe "projects" / "tasks": é kanban_boards / kanban_cards
//   - labels do card são JSON em kanban_cards.labels (não tabela)
//   - presets de etiqueta ficam em kanban_boards.label_presets
//   - comentários/anexos exigem userId (users.id)
//   - não há coluna trello_card_id: marcamos no description p/ evitar reimport
const SCHEMA = {
  boards: {
    table: 'kanban_boards',
    fields: {
      id: 'id',
      name: 'name',
      labelPresets: 'label_presets',
      updatedAt: 'updatedAt',
    },
  },
  columns: {
    table: 'kanban_columns',
    fields: {
      id: 'id',
      boardId: 'boardId', // FK para kanban_boards (não project_id)
      title: 'title', // não "name"
      color: 'color',
      position: 'position',
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    },
  },
  tasks: {
    // cards = "tasks" no vocabulário do script original
    table: 'kanban_cards',
    fields: {
      id: 'id',
      columnId: 'columnId',
      title: 'title',
      description: 'description',
      priority: 'priority', // enum TaskPriority
      dueDate: 'dueDate', // Prisma map endDate -> dueDate no banco
      position: 'position',
      labels: 'labels', // JSONB [{ color, text }]
      totalTasks: 'totalTasks',
      completedTasks: 'completedTasks',
      checklistEnabled: 'checklistEnabled',
      attachmentsEnabled: 'attachmentsEnabled',
      completedAt: 'completedAt',
      assigneeUserId: 'assigneeUserId',
      assigneeName: 'assigneeName',
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
      // Sem trello_card_id no schema — usamos marcador no description
    },
  },
  labels: {
    // NÃO é tabela: JSON no card + presets no board
    mode: 'json_on_card',
    cardField: 'labels',
    boardPresetsField: 'label_presets',
    shape: { color: 'color', text: 'text' }, // { color, text } no card
  },
  checklistItems: {
    table: 'kanban_checklist_items',
    fields: {
      id: 'id',
      cardId: 'cardId',
      title: 'title', // não "name"
      isDone: 'isDone', // não "completed"
      position: 'position',
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    },
  },
  comments: {
    table: 'kanban_card_comments',
    fields: {
      id: 'id',
      cardId: 'cardId',
      userId: 'userId', // obrigatório (FK users)
      content: 'content', // não "text"
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    },
  },
  attachments: {
    table: 'kanban_card_attachments',
    fields: {
      id: 'id',
      cardId: 'cardId',
      userId: 'userId', // obrigatório
      fileName: 'fileName',
      fileUrl: 'fileUrl',
      fileKey: 'fileKey',
      fileSize: 'fileSize',
      mimeType: 'mimeType',
      createdAt: 'createdAt',
    },
  },
  cardMembers: {
    table: 'kanban_card_members',
    fields: {
      id: 'id',
      cardId: 'cardId',
      userId: 'userId',
      createdAt: 'createdAt',
    },
  },
  members: {
    table: 'users',
    fields: { id: 'id', name: 'name', email: 'email' },
    // mapa manual: trelloMemberId -> users.id
    // preencha após: node scripts/import-trello.js ./trello.json --list-members
    trelloIdToUserId: {
      // David David (@daviddavid15) — no banco local não há "David";
      // mapeado para Administrador só para teste local.
      // Em staging/produção, troque pelo users.id real do David.
      '6a5773acab4675aa5de698ac': 'cmr0wzm1k00018djqnihk43y6',
    },
  },
};

const TRELLO_MARKER_PREFIX = '[trello_card_id:';
const TRELLO_MARKER_SUFFIX = ']';

function trelloMarker(trelloCardId) {
  return `${TRELLO_MARKER_PREFIX}${trelloCardId}${TRELLO_MARKER_SUFFIX}`;
}

// ============================================================
// 3) LEITURA E PARSE DO EXPORT DO TRELLO
// ============================================================
function loadTrelloExport(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

function parseBoard(trelloData) {
  const openLists = (trelloData.lists || [])
    .filter((list) => !list.closed)
    .slice()
    .sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0));

  const listsById = {};
  openLists.forEach((list, idx) => {
    listsById[list.id] = {
      trelloId: list.id,
      name: list.name,
      position: idx,
      cards: [],
    };
  });

  const labelsById = {};
  (trelloData.labels || []).forEach((label) => {
    labelsById[label.id] = label;
  });

  const openCards = (trelloData.cards || [])
    .filter((card) => !card.closed)
    .slice()
    .sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0));

  openCards.forEach((card) => {
    const list = listsById[card.idList];
    if (!list) return;

    const checklistItems = [];
    (trelloData.checklists || [])
      .filter((cl) => cl.idCard === card.id)
      .forEach((cl) => {
        (cl.checkItems || [])
          .slice()
          .sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0))
          .forEach((item) => {
            checklistItems.push({
              name: item.name,
              completed: item.state === 'complete',
            });
          });
      });

    const comments = (trelloData.actions || [])
      .filter((a) => a.type === 'commentCard' && a.data?.card?.id === card.id)
      .map((a) => ({
        text: a.data.text,
        authorName: a.memberCreator ? a.memberCreator.fullName : 'Desconhecido',
        authorTrelloId: a.memberCreator ? a.memberCreator.id : null,
        createdAt: a.date,
      }));

    list.cards.push({
      trelloId: card.id,
      title: card.name,
      description: card.desc || '',
      dueDate: card.due || null,
      position: list.cards.length, // Int sequencial na coluna
      completed: !!card.dueComplete,
      labels: (card.idLabels || [])
        .map((id) => labelsById[id])
        .filter(Boolean)
        .map((l) => ({
          name: (l.name || l.color || 'Etiqueta').trim(),
          color: trelloColorToHex(l.color),
        })),
      memberTrelloIds: card.idMembers || [],
      checklistItems,
      comments,
      attachments: (card.attachments || []).map((att) => ({
        url: att.url,
        name: att.name || 'anexo',
      })),
    });
  });

  return Object.values(listsById).sort((a, b) => a.position - b.position);
}

// ============================================================
// 4) INSERÇÃO NO BANCO
// ============================================================
async function assertBoardExists(boardId) {
  const s = SCHEMA.boards;
  const res = await client.query(
    `SELECT ${q(s.fields.id)}, ${q(s.fields.labelPresets)}
     FROM ${q(s.table)}
     WHERE ${q(s.fields.id)} = $1`,
    [boardId],
  );
  if (!res.rows.length) {
    throw new Error(
      `Board não encontrado: ${boardId}. Crie/abra o quadro no Tasks e use o id de kanban_boards.`,
    );
  }
  return res.rows[0];
}

async function assertImportUser(userId) {
  const res = await client.query(
    `SELECT ${q('id')}, ${q('name')} FROM ${q(SCHEMA.members.table)} WHERE ${q('id')} = $1`,
    [userId],
  );
  if (!res.rows.length) {
    throw new Error(
      `Usuário import-as (--import-as-user / TRELLO_IMPORT_USER_ID) inválido: ${userId}`,
    );
  }
  return res.rows[0];
}

async function cardAlreadyImported(trelloCardId) {
  const marker = trelloMarker(trelloCardId);
  const s = SCHEMA.tasks;
  const res = await client.query(
    `SELECT ${q(s.fields.id)} FROM ${q(s.table)}
     WHERE ${q(s.fields.description)} LIKE $1 LIMIT 1`,
    [`%${marker}%`],
  );
  return res.rows[0]?.[s.fields.id] || null;
}

async function insertColumn(boardId, list) {
  const s = SCHEMA.columns;
  const id = newId();
  const ts = now();
  const color = COLUMN_COLORS[list.position % COLUMN_COLORS.length];
  await client.query(
    `
    INSERT INTO ${q(s.table)}
      (${q(s.fields.id)}, ${q(s.fields.boardId)}, ${q(s.fields.title)}, ${q(s.fields.color)},
       ${q(s.fields.position)}, ${q(s.fields.createdAt)}, ${q(s.fields.updatedAt)})
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [id, boardId, list.name, color, list.position, ts, ts],
  );
  return id;
}

function buildCardLabelsJson(labels) {
  // Formato do app: [{ color, text }]
  return JSON.stringify(
    (labels || []).map((l) => ({
      color: l.color,
      text: String(l.name || '').slice(0, 80) || 'Etiqueta',
    })),
  );
}

async function insertTask(columnId, card, resolvedMembers, { skipDuplicateCheck = false } = {}) {
  const s = SCHEMA.tasks;
  if (!skipDuplicateCheck) {
    const existing = await cardAlreadyImported(card.trelloId);
    if (existing) {
      console.log(`    ↷ card já importado (skip): ${card.title}`);
      return { id: existing, skipped: true };
    }
  }

  const id = newId();
  const ts = now();
  const marker = trelloMarker(card.trelloId);
  const description = card.description
    ? `${card.description.trimEnd()}\n\n${marker}`
    : marker;

  const totalTasks = card.checklistItems.length;
  const completedTasks = card.checklistItems.filter((i) => i.completed).length;
  const firstMember = resolvedMembers[0] || null;

  await client.query(
    `
    INSERT INTO ${q(s.table)}
      (${q(s.fields.id)}, ${q(s.fields.columnId)}, ${q(s.fields.title)}, ${q(s.fields.description)},
       ${q(s.fields.priority)}, ${q(s.fields.dueDate)}, ${q(s.fields.position)}, ${q(s.fields.labels)},
       ${q(s.fields.totalTasks)}, ${q(s.fields.completedTasks)},
       ${q(s.fields.checklistEnabled)}, ${q(s.fields.attachmentsEnabled)},
       ${q(s.fields.completedAt)}, ${q(s.fields.assigneeUserId)}, ${q(s.fields.assigneeName)},
       ${q(s.fields.createdAt)}, ${q(s.fields.updatedAt)})
    VALUES
      ($1,$2,$3,$4,
       $5::"TaskPriority",$6,$7,$8::jsonb,
       $9,$10,
       $11,$12,
       $13,$14,$15,
       $16,$17)
    `,
    [
      id,
      columnId,
      card.title.slice(0, 500) || 'Sem título',
      description,
      'MEDIUM',
      card.dueDate ? new Date(card.dueDate) : null,
      card.position,
      buildCardLabelsJson(card.labels),
      totalTasks,
      completedTasks,
      totalTasks > 0,
      (card.attachments || []).length > 0,
      card.completed ? ts : null,
      firstMember?.userId || null,
      firstMember?.name || null,
      ts,
      ts,
    ],
  );
  return { id, skipped: false };
}

async function insertLabels(_cardId, _labels) {
  // Labels já gravadas em kanban_cards.labels no insertTask.
  // Presets do board são mesclados em mergeBoardLabelPresets.
}

async function insertChecklistItems(cardId, items) {
  const s = SCHEMA.checklistItems;
  let position = 0;
  for (const item of items) {
    const ts = now();
    await client.query(
      `
      INSERT INTO ${q(s.table)}
        (${q(s.fields.id)}, ${q(s.fields.cardId)}, ${q(s.fields.title)}, ${q(s.fields.isDone)},
         ${q(s.fields.position)}, ${q(s.fields.createdAt)}, ${q(s.fields.updatedAt)})
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [newId(), cardId, item.name, !!item.completed, position++, ts, ts],
    );
  }
}

async function insertComments(cardId, comments) {
  const s = SCHEMA.comments;
  for (const c of comments) {
    const mapped =
      (c.authorTrelloId && SCHEMA.members.trelloIdToUserId[c.authorTrelloId]) ||
      importAsUserId;
    if (!mapped) {
      console.warn(
        `    ! comentário sem userId mapeado (pulado): "${String(c.text).slice(0, 40)}..."`,
      );
      continue;
    }
    const createdAt = c.createdAt ? new Date(c.createdAt) : now();
    const content = c.authorName
      ? `${c.text}\n\n— ${c.authorName} (importado do Trello)`
      : c.text;
    await client.query(
      `
      INSERT INTO ${q(s.table)}
        (${q(s.fields.id)}, ${q(s.fields.cardId)}, ${q(s.fields.userId)}, ${q(s.fields.content)},
         ${q(s.fields.createdAt)}, ${q(s.fields.updatedAt)})
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [newId(), cardId, mapped, content, createdAt, createdAt],
    );
  }
}

async function insertAttachments(cardId, attachments) {
  const s = SCHEMA.attachments;
  if (!importAsUserId) {
    if (attachments.length) {
      console.warn('    ! anexos pulados: informe --import-as-user (userId obrigatório)');
    }
    return;
  }
  for (const att of attachments) {
    if (!att.url) continue;
    await client.query(
      `
      INSERT INTO ${q(s.table)}
        (${q(s.fields.id)}, ${q(s.fields.cardId)}, ${q(s.fields.userId)},
         ${q(s.fields.fileName)}, ${q(s.fields.fileUrl)}, ${q(s.fields.fileKey)},
         ${q(s.fields.fileSize)}, ${q(s.fields.mimeType)}, ${q(s.fields.createdAt)})
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        newId(),
        cardId,
        importAsUserId,
        String(att.name || 'anexo').slice(0, 255),
        att.url,
        null,
        0,
        'application/octet-stream',
        now(),
      ],
    );
  }
}

async function insertTaskMembers(cardId, memberTrelloIds) {
  const s = SCHEMA.cardMembers;
  const seen = new Set();
  const resolved = [];

  for (const trelloId of memberTrelloIds || []) {
    const userId = SCHEMA.members.trelloIdToUserId[trelloId];
    if (!userId || seen.has(userId)) continue;
    seen.add(userId);

    const u = await client.query(
      `SELECT ${q('id')}, ${q('name')} FROM ${q(SCHEMA.members.table)} WHERE ${q('id')} = $1`,
      [userId],
    );
    if (!u.rows.length) {
      console.warn(`    ! membro Trello ${trelloId} mapeado para user inexistente ${userId}`);
      continue;
    }

    await client.query(
      `
      INSERT INTO ${q(s.table)}
        (${q(s.fields.id)}, ${q(s.fields.cardId)}, ${q(s.fields.userId)}, ${q(s.fields.createdAt)})
      VALUES ($1, $2, $3, $4)
      ON CONFLICT ("cardId", "userId") DO NOTHING
      `,
      [newId(), cardId, userId, now()],
    );
    resolved.push({ userId, name: u.rows[0].name });
  }

  return resolved;
}

async function mergeBoardLabelPresets(boardId, collectedLabels, { replace = false } = {}) {
  const s = SCHEMA.boards;
  const byColor = new Map();

  if (!replace) {
    const row = await client.query(
      `SELECT ${q(s.fields.labelPresets)} FROM ${q(s.table)} WHERE ${q(s.fields.id)} = $1`,
      [boardId],
    );
    let current = row.rows[0]?.[s.fields.labelPresets] || [];
    if (typeof current === 'string') {
      try {
        current = JSON.parse(current);
      } catch {
        current = [];
      }
    }
    if (!Array.isArray(current)) current = [];
    for (const p of current) {
      if (p && typeof p.color === 'string') {
        byColor.set(p.color.toUpperCase(), {
          color: p.color.toUpperCase(),
          name: String(p.name || 'Etiqueta').slice(0, 80),
        });
      }
    }
  }

  for (const label of collectedLabels.values()) {
    const color = String(label.color).toUpperCase();
    if (!byColor.has(color)) {
      byColor.set(color, {
        color,
        name: String(label.name || 'Etiqueta').slice(0, 80),
      });
    }
  }

  if (!byColor.size) return;

  const merged = Array.from(byColor.values()).slice(0, 24);
  await client.query(
    `
    UPDATE ${q(s.table)}
    SET ${q(s.fields.labelPresets)} = $2::jsonb, ${q(s.fields.updatedAt)} = $3
    WHERE ${q(s.fields.id)} = $1
    `,
    [boardId, JSON.stringify(merged), now()],
  );
}

/**
 * Apaga TODAS as colunas do board (e, em cascade: cards, checklist,
 * comentários, anexos e membros). O registro do board em si permanece.
 */
async function wipeBoardContents(boardId) {
  const cols = SCHEMA.columns;
  const colCount = await client.query(
    `SELECT COUNT(*)::int AS n FROM ${q(cols.table)} WHERE ${q(cols.fields.boardId)} = $1`,
    [boardId],
  );
  const cardCount = await client.query(
    `
    SELECT COUNT(*)::int AS n
    FROM ${q(SCHEMA.tasks.table)} t
    WHERE ${q(SCHEMA.tasks.fields.columnId)} IN (
      SELECT ${q(cols.fields.id)} FROM ${q(cols.table)} WHERE ${q(cols.fields.boardId)} = $1
    )
    `,
    [boardId],
  );
  console.log(
    `  --replace: removendo ${colCount.rows[0].n} coluna(s) e ${cardCount.rows[0].n} card(s) existentes...`,
  );

  await client.query(
    `DELETE FROM ${q(cols.table)} WHERE ${q(cols.fields.boardId)} = $1`,
    [boardId],
  );
}

// ============================================================
// 5) ORQUESTRAÇÃO
// ============================================================
async function importBoard(jsonPath, boardId) {
  const trelloData = loadTrelloExport(jsonPath);
  const lists = parseBoard(trelloData);
  const totalCards = lists.reduce((acc, l) => acc + l.cards.length, 0);

  console.log(`Board Trello: ${trelloData.name}`);
  console.log(`Listas: ${lists.length}`);
  console.log(`Cards: ${totalCards}`);
  console.log(`Destino kanban_boards.id: ${boardId}`);
  console.log(`Modo: ${replaceMode ? 'SUBSTITUIR (--replace)' : 'ACRESCENTAR'}`);

  if (replaceMode && !assumeYes) {
    throw new Error(
      'Modo --replace apaga tudo do quadro antes de importar. Confirme com --yes',
    );
  }

  await client.connect();

  try {
    await client.query('BEGIN');

    await assertBoardExists(boardId);
    if (!importAsUserId) {
      throw new Error(
        'Informe --import-as-user <users.id> (obrigatório para comentários/anexos).',
      );
    }
    const importUser = await assertImportUser(importAsUserId);
    console.log(`Importando como usuário: ${importUser.name} (${importUser.id})`);

    if (replaceMode) {
      await wipeBoardContents(boardId);
    }

    const collectedLabels = new Map(); // color -> {color,name}

    for (const list of lists) {
      const columnId = await insertColumn(boardId, list);
      console.log(`  Coluna: ${list.name} (${list.cards.length} cards) -> ${columnId}`);

      for (const card of list.cards) {
        // resolve membros primeiro (para assignee)
        const resolvedMembers = [];
        for (const trelloId of card.memberTrelloIds || []) {
          const userId = SCHEMA.members.trelloIdToUserId[trelloId];
          if (!userId) continue;
          const u = await client.query(
            `SELECT ${q('id')}, ${q('name')} FROM ${q(SCHEMA.members.table)} WHERE ${q('id')} = $1`,
            [userId],
          );
          if (u.rows.length) {
            resolvedMembers.push({ userId: u.rows[0].id, name: u.rows[0].name });
          }
        }

        // Em --replace o board já foi limpo; skip de reimport só vale no modo acrescentar
        const { id: cardId, skipped } = await insertTask(
          columnId,
          card,
          resolvedMembers,
          { skipDuplicateCheck: replaceMode },
        );
        if (skipped) continue;

        await insertTaskMembers(cardId, card.memberTrelloIds);
        await insertLabels(cardId, card.labels);
        await insertChecklistItems(cardId, card.checklistItems);
        await insertComments(cardId, card.comments);
        await insertAttachments(cardId, card.attachments);

        for (const l of card.labels || []) {
          if (l.color) collectedLabels.set(l.color.toUpperCase(), l);
        }
      }
    }

    await mergeBoardLabelPresets(boardId, collectedLabels, { replace: replaceMode });

    await client.query('COMMIT');
    console.log(
      replaceMode
        ? 'Substituição concluída: o quadro agora reflete o export do Trello.'
        : 'Importação concluída com sucesso!',
    );
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro na importação, rollback executado:', err.message || err);
    throw err;
  } finally {
    await client.end();
  }
}

// ============================================================
// 6) UTILITÁRIO: listar membros do Trello
// ============================================================
function listTrelloMembers(jsonPath) {
  const trelloData = loadTrelloExport(jsonPath);
  console.log('Membros do board (copie os IDs para SCHEMA.members.trelloIdToUserId):');
  (trelloData.members || []).forEach((m) => {
    console.log(`  '${m.id}': '',  // ${m.fullName} (@${m.username})`);
  });
  console.log('\nTambém liste users do banco, ex:');
  console.log(`  SELECT id, name, email FROM users WHERE "isActive" = true ORDER BY name;`);
}

function listLocalUsers() {
  return client
    .connect()
    .then(() =>
      client.query(
        `SELECT ${q('id')}, ${q('name')}, ${q('email')} FROM ${q(SCHEMA.members.table)}
         WHERE ${q('isActive')} = true ORDER BY ${q('name')} LIMIT 200`,
      ),
    )
    .then((res) => {
      console.log('Usuários locais (preencha o mapa trello -> id):');
      for (const row of res.rows) {
        console.log(`  ${row.id}  |  ${row.name}  |  ${row.email}`);
      }
    })
    .finally(() => client.end());
}

// ============================================================
// EXECUÇÃO VIA LINHA DE COMANDO
// ============================================================
// node import-trello.js <json> <boardId> --import-as-user <userId> --replace --yes
// node import-trello.js <json> --list-members
// node import-trello.js --list-users
const args = process.argv.slice(2);

function getFlagValue(flag) {
  const i = args.indexOf(flag);
  if (i === -1) return null;
  return args[i + 1] || null;
}

const importUserFlag = getFlagValue('--import-as-user');
if (importUserFlag) importAsUserId = importUserFlag;
replaceMode = args.includes('--replace');
assumeYes = args.includes('--yes');

const skipValues = new Set(
  [importUserFlag].filter(Boolean),
);
const positionals = args.filter((a) => !a.startsWith('--') && !skipValues.has(a));

if (args.includes('--list-users')) {
  listLocalUsers().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  const jsonPath = positionals[0];
  const boardId = positionals[1];

  if (!jsonPath) {
    console.log(`Uso:
  # Substituir tudo do quadro pelo Trello:
  node scripts/import-trello.js <trello-export.json> <boardId> --import-as-user <userId> --replace --yes

  # Só acrescentar (não apaga o que já existe):
  node scripts/import-trello.js <trello-export.json> <boardId> --import-as-user <userId>

  node scripts/import-trello.js <trello-export.json> --list-members
  node scripts/import-trello.js --list-users

Obs: use o id de kanban_boards (ex. quadro Projetos).`);
    process.exit(1);
  }

  if (args.includes('--list-members')) {
    listTrelloMembers(jsonPath);
  } else if (!boardId) {
    console.log('Faltou o boardId (kanban_boards.id).');
    process.exit(1);
  } else {
    importBoard(jsonPath, boardId).catch(() => process.exit(1));
  }
}
