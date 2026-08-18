# Agent Coach 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个主动式 Agent 教练系统，通过飞书/Telegram/Discord 主动推送学习任务、检查进度、给予反馈。

**Architecture:** 单进程 Node.js/TypeScript 应用。Coach Core 是心脏（Agent + Tools + Triggers），Channel Adapters 是可插拔的消息渠道，Web Dashboard 是管理界面。SQLite 存储所有状态。

**Tech Stack:** Node.js, TypeScript, Anthropic SDK, SQLite (better-sqlite3), Express, EJS, node-cron

---

## 文件结构

```
agent-coach/
├── package.json
├── tsconfig.json
├── .env.example
│
├── src/
│   ├── index.ts                    # 入口
│   │
│   ├── config.ts                   # 环境变量 + 配置
│   │
│   ├── store/
│   │   ├── db.ts                   # SQLite 初始化 + 建表
│   │   ├── students.ts             # 学生 CRUD
│   │   ├── progress.ts             # 进度 CRUD
│   │   ├── conversations.ts        # 对话记录
│   │   ├── events.ts               # 教练事件日志
│   │   └── activity.ts             # 活跃日志
│   │
│   ├── curriculum/
│   │   ├── loader.ts               # 课程加载器
│   │   ├── topics.ts               # 18 个知识点
│   │   ├── sources.ts              # 22 个资料源
│   │   ├── phases.ts               # 5 个阶段
│   │   └── days/                   # 30 天课程 Markdown
│   │       ├── 01-mental-model.md
│   │       ├── 02-agent-loop.md
│   │       └── ...
│   │
│   ├── coach/
│   │   ├── coach-prompt.ts         # 教练系统 prompt
│   │   ├── coach-agent.ts          # 教练 Agent（Anthropic SDK）
│   │   ├── coach-tools.ts          # Agent 工具实现
│   │   └── triggers.ts             # 触发器：判断何时触发教练
│   │
│   ├── scheduler/
│   │   └── scheduler.ts            # node-cron 调度
│   │
│   ├── channels/
│   │   ├── types.ts                # ChannelAdapter 接口 + UnifiedMessage
│   │   ├── router.ts               # 消息路由
│   │   ├── feishu.ts               # 飞书 Adapter
│   │   ├── telegram.ts             # Telegram Adapter
│   │   └── discord.ts              # Discord Adapter
│   │
│   ├── web/
│   │   ├── server.ts               # Express 服务
│   │   ├── routes/
│   │   │   ├── api.ts              # REST API
│   │   │   ├── dashboard.ts        # 学生 Dashboard 路由
│   │   │   └── admin.ts            # 管理页面路由
│   │   └── views/
│   │       ├── dashboard.ejs       # 学生 Dashboard 模板
│   │       └── admin.ejs           # 管理页面模板
│   │
│   └── public/
│       └── css/
│           └── theme.css           # 从现有 HTML 提取的 CSS
│
├── data/                           # SQLite 数据库（gitignored）
│   └── .gitkeep
│
└── docs/
    └── superpowers/
        └── specs/
            └── 2026-08-16-agent-coach-design.md
```

---

## Phase 1: 项目基础 + 数据层 + 课程

### Task 1: 初始化项目

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `data/.gitkeep`

- [ ] **Step 1: 创建 package.json**

```bash
mkdir -p agent-coach/src agent-coach/data
cd agent-coach
```

```json
{
  "name": "agent-coach",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.33.0",
    "better-sqlite3": "^11.7.0",
    "dotenv": "^16.4.0",
    "ejs": "^3.1.10",
    "express": "^4.21.0",
    "node-cron": "^3.0.3",
    "node-telegram-bot-api": "^0.66.0",
    "discord.js": "^14.16.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.12",
    "@types/ejs": "^3.1.5",
    "@types/express": "^5.0.0",
    "@types/node": "^22.10.0",
    "@types/node-cron": "^3.0.11",
    "@types/node-telegram-bot-api": "^0.64.7",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: 创建 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: 创建 .env.example**

```
ANTHROPIC_API_KEY=sk-ant-...

# 飞书
FEISHU_APP_ID=
FEISHU_APP_SECRET=
FEISHU_VERIFICATION_TOKEN=
FEISHU_ENCRYPT_KEY=

# Telegram
TELEGRAM_BOT_TOKEN=

# Discord
DISCORD_BOT_TOKEN=
DISCORD_CLIENT_ID=

# Web
PORT=3000
ADMIN_PASSWORD=changeme
```

- [ ] **Step 4: 创建 .gitignore**

```
node_modules/
dist/
data/*.db
.env
```

- [ ] **Step 5: 安装依赖**

```bash
npm install
```

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: init project with deps and config"
```

---

### Task 2: 配置模块 + 入口

**Files:**
- Create: `src/config.ts`
- Create: `src/index.ts`

- [ ] **Step 1: 创建 src/config.ts**

```typescript
import dotenv from 'dotenv';
dotenv.config();

export const config = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  feishu: {
    appId: process.env.FEISHU_APP_ID || '',
    appSecret: process.env.FEISHU_APP_SECRET || '',
    verificationToken: process.env.FEISHU_VERIFICATION_TOKEN || '',
    encryptKey: process.env.FEISHU_ENCRYPT_KEY || '',
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
  },
  discord: {
    botToken: process.env.DISCORD_BOT_TOKEN || '',
    clientId: process.env.DISCORD_CLIENT_ID || '',
  },
  web: {
    port: parseInt(process.env.PORT || '3000', 10),
    adminPassword: process.env.ADMIN_PASSWORD || 'changeme',
  },
};
```

- [ ] **Step 2: 创建 src/index.ts（最小入口，后续逐步加模块）**

```typescript
import { config } from './config';

async function main() {
  console.log('[Agent Coach] Starting...');

  if (!config.anthropicApiKey) {
    console.error('[Agent Coach] ANTHROPIC_API_KEY is required');
    process.exit(1);
  }

  // TODO: 后续 task 会逐步加 db init, scheduler, channels, web server
  console.log('[Agent Coach] Config loaded');
  console.log('[Agent Coach] Ready (no modules started yet)');
}

main().catch((err) => {
  console.error('[Agent Coach] Fatal error:', err);
  process.exit(1);
});
```

- [ ] **Step 3: 验证能跑**

```bash
npx tsx src/index.ts
# Expected: [Agent Coach] Starting... / Config loaded / Ready
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: add config and minimal entry point"
```

---

### Task 3: SQLite 数据库初始化 + 建表

**Files:**
- Create: `src/store/db.ts`

- [ ] **Step 1: 创建 src/store/db.ts**

```typescript
import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'coach.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS students (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      channel       TEXT NOT NULL,
      channel_id    TEXT NOT NULL,
      timezone      TEXT DEFAULT 'Asia/Shanghai',
      daily_hours   INTEGER DEFAULT 4,
      start_date    TEXT NOT NULL,
      reminder_time TEXT DEFAULT '09:00',
      created_at    TEXT DEFAULT (datetime('now')),
      updated_at    TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS daily_progress (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id    TEXT NOT NULL REFERENCES students(id),
      day           INTEGER NOT NULL,
      read_done     INTEGER DEFAULT 0,
      build_done    INTEGER DEFAULT 0,
      eval_done     INTEGER DEFAULT 0,
      note_done     INTEGER DEFAULT 0,
      notes         TEXT,
      completed_at  TEXT,
      UNIQUE(student_id, day)
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id    TEXT NOT NULL REFERENCES students(id),
      role          TEXT NOT NULL,
      content       TEXT NOT NULL,
      channel       TEXT NOT NULL,
      created_at    TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS coaching_events (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id    TEXT NOT NULL REFERENCES students(id),
      event_type    TEXT NOT NULL,
      trigger       TEXT NOT NULL,
      content       TEXT NOT NULL,
      created_at    TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS eval_runs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id    TEXT NOT NULL REFERENCES students(id),
      day           INTEGER NOT NULL,
      case_count    INTEGER NOT NULL,
      pass_count    INTEGER NOT NULL,
      score         REAL NOT NULL,
      details       TEXT,
      created_at    TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id    TEXT NOT NULL REFERENCES students(id),
      activity_type TEXT NOT NULL,
      detail        TEXT,
      created_at    TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_progress_student ON daily_progress(student_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_student ON conversations(student_id);
    CREATE INDEX IF NOT EXISTS idx_activity_student ON activity_log(student_id);
    CREATE INDEX IF NOT EXISTS idx_events_student ON coaching_events(student_id);
  `);
}

export function closeDb(): void {
  if (db) {
    db.close();
  }
}
```

- [ ] **Step 2: 更新 src/index.ts 加入 db 初始化**

```typescript
import { config } from './config';
import { getDb } from './store/db';

async function main() {
  console.log('[Agent Coach] Starting...');

  if (!config.anthropicApiKey) {
    console.error('[Agent Coach] ANTHROPIC_API_KEY is required');
    process.exit(1);
  }

  // 初始化数据库
  const db = getDb();
  console.log('[Agent Coach] Database initialized');
  console.log('[Agent Coach] Ready');
}

main().catch((err) => {
  console.error('[Agent Coach] Fatal error:', err);
  process.exit(1);
});
```

- [ ] **Step 3: 验证建表**

```bash
npx tsx -e "
const { getDb } = require('./src/store/db');
const db = getDb();
const tables = db.prepare(\"SELECT name FROM sqlite_master WHERE type='table'\").all();
console.log('Tables:', tables.map(t => t.name));
"
# Expected: Tables: [ 'students', 'daily_progress', 'conversations', 'coaching_events', 'eval_runs', 'activity_log' ]
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: add SQLite schema and db initialization"
```

---

### Task 4: 学生和进度 Store

**Files:**
- Create: `src/store/students.ts`
- Create: `src/store/progress.ts`
- Create: `src/store/conversations.ts`
- Create: `src/store/events.ts`
- Create: `src/store/activity.ts`

- [ ] **Step 1: 创建 src/store/students.ts**

```typescript
import { getDb } from './db';

export interface Student {
  id: string;
  name: string;
  channel: 'feishu' | 'telegram' | 'discord';
  channel_id: string;
  timezone: string;
  daily_hours: number;
  start_date: string;
  reminder_time: string;
  created_at: string;
  updated_at: string;
}

export function createStudent(student: Omit<Student, 'created_at' | 'updated_at'>): Student {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO students (id, name, channel, channel_id, timezone, daily_hours, start_date, reminder_time)
    VALUES (@id, @name, @channel, @channel_id, @timezone, @daily_hours, @start_date, @reminder_time)
  `);
  stmt.run(student);
  return getStudent(student.id)!;
}

export function getStudent(id: string): Student | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM students WHERE id = ?').get(id) as Student | undefined;
}

export function getStudentByChannel(channel: string, channelId: string): Student | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM students WHERE channel = ? AND channel_id = ?').get(channel, channelId) as Student | undefined;
}

export function listStudents(): Student[] {
  const db = getDb();
  return db.prepare('SELECT * FROM students ORDER BY created_at DESC').all() as Student[];
}

export function updateStudent(id: string, updates: Partial<Omit<Student, 'id' | 'created_at'>>): Student | undefined {
  const db = getDb();
  const fields = Object.keys(updates).filter(k => k !== 'id' && k !== 'created_at');
  if (fields.length === 0) return getStudent(id);
  const setClause = fields.map(f => `${f} = @${f}`).join(', ');
  db.prepare(`UPDATE students SET ${setClause}, updated_at = datetime('now') WHERE id = @id`).run({ ...updates, id });
  return getStudent(id);
}

export function deleteStudent(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM students WHERE id = ?').run(id);
}
```

- [ ] **Step 2: 创建 src/store/progress.ts**

```typescript
import { getDb } from './db';

export interface DailyProgress {
  id?: number;
  student_id: string;
  day: number;
  read_done: number;
  build_done: number;
  eval_done: number;
  note_done: number;
  notes: string | null;
  completed_at: string | null;
}

export function upsertProgress(p: DailyProgress): DailyProgress {
  const db = getDb();
  db.prepare(`
    INSERT INTO daily_progress (student_id, day, read_done, build_done, eval_done, note_done, notes, completed_at)
    VALUES (@student_id, @day, @read_done, @build_done, @eval_done, @note_done, @notes, @completed_at)
    ON CONFLICT(student_id, day) DO UPDATE SET
      read_done = @read_done, build_done = @build_done,
      eval_done = @eval_done, note_done = @note_done,
      notes = @notes, completed_at = @completed_at
  `).run(p);
  return getProgress(p.student_id, p.day)!;
}

export function getProgress(studentId: string, day: number): DailyProgress | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM daily_progress WHERE student_id = ? AND day = ?').get(studentId, day) as DailyProgress | undefined;
}

export function getAllProgress(studentId: string): DailyProgress[] {
  const db = getDb();
  return db.prepare('SELECT * FROM daily_progress WHERE student_id = ? ORDER BY day').all(studentId) as DailyProgress[];
}

export function getProgressSummary(studentId: string): { total: number; completed: number; percentage: number } {
  const all = getAllProgress(studentId);
  const total = all.length * 4; // 4 tasks per day
  const completed = all.reduce((sum, p) => sum + p.read_done + p.build_done + p.eval_done + p.note_done, 0);
  return { total, completed, percentage: total > 0 ? Math.round((completed / total) * 100) : 0 };
}

export function getCurrentDay(studentId: string): number {
  const all = getAllProgress(studentId);
  if (all.length === 0) return 1;
  // 找到第一个未完成的 day
  for (const p of all) {
    const allDone = p.read_done && p.build_done && p.eval_done && p.note_done;
    if (!allDone) return p.day;
  }
  // 全部完成，返回下一天
  return Math.min(all.length + 1, 30);
}

export function getStuckDays(studentId: string): number[] {
  const all = getAllProgress(studentId);
  return all
    .filter(p => {
      const allDone = p.read_done && p.build_done && p.eval_done && p.note_done;
      return !allDone;
    })
    .map(p => p.day);
}
```

- [ ] **Step 3: 创建 src/store/conversations.ts**

```typescript
import { getDb } from './db';

export interface Conversation {
  id?: number;
  student_id: string;
  role: 'student' | 'coach' | 'system';
  content: string;
  channel: string;
  created_at: string;
}

export function addConversation(c: Omit<Conversation, 'id' | 'created_at'>): Conversation {
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO conversations (student_id, role, content, channel) VALUES (@student_id, @role, @content, @channel)'
  ).run(c);
  return db.prepare('SELECT * FROM conversations WHERE id = ?').get(result.lastInsertRowid) as Conversation;
}

export function getRecentConversations(studentId: string, limit: number = 20): Conversation[] {
  const db = getDb();
  return db.prepare('SELECT * FROM conversations WHERE student_id = ? ORDER BY created_at DESC LIMIT ?').all(studentId, limit) as Conversation[];
}

export function getLastActivity(studentId: string): { last_message_at: string | null; days_since_last: number | null } {
  const db = getDb();
  const row = db.prepare(
    "SELECT created_at FROM conversations WHERE student_id = ? AND role = 'student' ORDER BY created_at DESC LIMIT 1"
  ).get(studentId) as { created_at: string } | undefined;
  if (!row) return { last_message_at: null, days_since_last: null };
  const lastDate = new Date(row.created_at + 'Z');
  const now = new Date();
  const days = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
  return { last_message_at: row.created_at, days_since_last: days };
}
```

- [ ] **Step 4: 创建 src/store/events.ts**

```typescript
import { getDb } from './db';

export interface CoachingEvent {
  id?: number;
  student_id: string;
  event_type: 'nudge' | 'daily_reminder' | 'eval_feedback' | 'phase_summary' | 'weekly_plan' | 'check_in';
  trigger: 'cron' | 'student_message' | 'eval_result' | 'manual';
  content: string;
  created_at: string;
}

export function logEvent(e: Omit<CoachingEvent, 'id' | 'created_at'>): CoachingEvent {
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO coaching_events (student_id, event_type, trigger, content) VALUES (@student_id, @event_type, @trigger, @content)'
  ).run(e);
  return db.prepare('SELECT * FROM coaching_events WHERE id = ?').get(result.lastInsertRowid) as CoachingEvent;
}

export function getRecentEvents(studentId: string, limit: number = 10): CoachingEvent[] {
  const db = getDb();
  return db.prepare('SELECT * FROM coaching_events WHERE student_id = ? ORDER BY created_at DESC LIMIT ?').all(studentId, limit) as CoachingEvent[];
}
```

- [ ] **Step 5: 创建 src/store/activity.ts**

```typescript
import { getDb } from './db';

export function logActivity(studentId: string, activityType: string, detail?: string): void {
  const db = getDb();
  db.prepare('INSERT INTO activity_log (student_id, activity_type, detail) VALUES (?, ?, ?)').run(studentId, activityType, detail || null);
}

export function getRecentActivity(studentId: string, limit: number = 20) {
  const db = getDb();
  return db.prepare('SELECT * FROM activity_log WHERE student_id = ? ORDER BY created_at DESC LIMIT ?').all(studentId, limit);
}
```

- [ ] **Step 6: 验证 Store 模块**

```bash
npx tsx -e "
const { getDb } = require('./src/store/db');
const { createStudent, listStudents } = require('./src/store/students');
const { upsertProgress, getProgressSummary } = require('./src/store/progress');
const { addConversation } = require('./src/store/conversations');
const { logEvent } = require('./src/store/events');
const { logActivity } = require('./src/store/activity');

const db = getDb();
const s = createStudent({ id: 'test-1', name: 'Test', channel: 'telegram', channel_id: '123', timezone: 'Asia/Shanghai', daily_hours: 4, start_date: '2026-08-16', reminder_time: '09:00' });
console.log('Student:', s.name);

upsertProgress({ student_id: 'test-1', day: 1, read_done: 1, build_done: 0, eval_done: 0, note_done: 0, notes: null, completed_at: null });
const summary = getProgressSummary('test-1');
console.log('Progress:', summary);

addConversation({ student_id: 'test-1', role: 'student', content: '今天学了 Day 1', channel: 'telegram' });
logEvent({ student_id: 'test-1', event_type: 'daily_reminder', trigger: 'cron', content: '提醒学习' });
logActivity('test-1', 'message', '学生发消息');
console.log('All store ops OK');
"
```

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: add student, progress, conversation, event, activity stores"
```

---

### Task 5: 课程数据（从 HTML 提取）

**Files:**
- Create: `src/curriculum/topics.ts`
- Create: `src/curriculum/phases.ts`
- Create: `src/curriculum/sources.ts`
- Create: `src/curriculum/loader.ts`
- Create: `src/curriculum/days/01-mental-model.md` 到 `30-retrospective.md`

- [ ] **Step 1: 创建 src/curriculum/phases.ts**

```typescript
export interface Phase {
  id: string;
  days: string;
  name: string;
  desc: string;
  color: string;
}

export const phases: Phase[] = [
  { id: 'F1', days: '1–6', name: '基础与单 Agent', desc: 'mental model / loop / tools / trace', color: '#7c9cff' },
  { id: 'F2', days: '7–12', name: 'MCP · Context · Memory', desc: 'skills / RAG / memory', color: '#8b7cff' },
  { id: 'F3', days: '13–18', name: 'Reasoning · Reliability', desc: 'ReAct / recovery / orchestration', color: '#4fc4b4' },
  { id: 'F4', days: '19–24', name: 'Eval · Security · Harness', desc: 'benchmark / sandbox / long-running', color: '#ffb85c' },
  { id: 'F5', days: '25–30', name: 'Capstone 产品化', desc: '迁移 / ablation / final benchmark', color: '#ff7b8a' },
];

export function getPhaseForDay(day: number): Phase {
  if (day <= 6) return phases[0];
  if (day <= 12) return phases[1];
  if (day <= 18) return phases[2];
  if (day <= 24) return phases[3];
  return phases[4];
}
```

- [ ] **Step 2: 创建 src/curriculum/topics.ts**

```typescript
export interface Topic {
  id: string;
  name: string;
  score: number;
  prio: 'P0' | 'P1' | 'P2';
}

export const topics: Topic[] = [
  { id: 'loop', name: 'Agent Loop / Runtime / State', score: 5.0, prio: 'P0' },
  { id: 'tools', name: 'Tool Design / Function Calling', score: 5.0, prio: 'P0' },
  { id: 'eval', name: 'Evaluation / Benchmark', score: 5.0, prio: 'P0' },
  { id: 'context', name: 'Context Engineering', score: 5.0, prio: 'P0' },
  { id: 'reliability', name: 'Reliability / Recovery / Idempotency', score: 5.0, prio: 'P0' },
  { id: 'security', name: 'Security / Guardrails / HITL', score: 5.0, prio: 'P0' },
  { id: 'contracts', name: 'Structured Output / Contracts', score: 4.8, prio: 'P0' },
  { id: 'skills', name: 'Skills / ACI / Tool UX', score: 4.8, prio: 'P0' },
  { id: 'mcp', name: 'MCP / Capability Protocol', score: 4.7, prio: 'P1' },
  { id: 'observe', name: 'Trace / Observability', score: 4.7, prio: 'P1' },
  { id: 'longrun', name: 'Long-running / Checkpoint / Resume', score: 4.6, prio: 'P1' },
  { id: 'reason', name: 'Planning / ReAct / Reasoning', score: 4.5, prio: 'P1' },
  { id: 'memory', name: 'Memory / Forgetting', score: 4.4, prio: 'P1' },
  { id: 'orchestrate', name: 'Routing / Parallel / Orchestration', score: 4.3, prio: 'P1' },
  { id: 'deploy', name: 'Deployment / Cost / Model Routing', score: 4.2, prio: 'P1' },
  { id: 'rag', name: 'RAG / Retrieval', score: 4.0, prio: 'P1' },
  { id: 'multi', name: 'Multi-Agent / Handoff / A2A', score: 3.7, prio: 'P2' },
  { id: 'advanced', name: 'Advanced Search / ToT / MCTS', score: 2.6, prio: 'P2' },
];

export const topicMap = new Map(topics.map(t => [t.id, t]));
```

- [ ] **Step 3: 创建 src/curriculum/sources.ts**

```typescript
export interface Source {
  name: string;
  kind: string;
  note: string;
  url: string;
}

export const sources: Source[] = [
  { name: 'Agentic Design Patterns: A Hands-On Guide to Building Intelligent Systems', kind: 'Book · Springer · 2025', note: '按 pattern 查阅。', url: 'https://link.springer.com/book/10.1007/978-3-032-01402-3' },
  { name: 'AI Agents in Action, Second Edition', kind: 'Book · Manning · Jun 2026', note: '392 页 / 11 章。工程主教材。', url: 'https://www.manning.com/books/ai-agents-in-action-second-edition' },
  { name: 'AI Agents: The Definitive Guide', kind: 'Book Preview · O\'Reilly · Sep 2026', note: '即将出版/在线预览。', url: 'https://www.oreilly.com/library/view/ai-agents-the/0642572247775/' },
  { name: 'Building effective agents', kind: 'Engineering Guide · Anthropic', note: 'Workflow vs Agent、composable patterns。', url: 'https://www.anthropic.com/engineering/building-effective-agents' },
  { name: 'Writing effective tools for agents', kind: 'Engineering Guide · Anthropic · Sep 2025', note: 'Tool UX、namespacing、high-signal response。', url: 'https://www.anthropic.com/engineering/writing-tools-for-agents' },
  { name: 'Effective context engineering for AI agents', kind: 'Engineering Guide · Anthropic · Sep 2025', note: 'Context 当有限资源管理。', url: 'https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents' },
  { name: 'Equipping agents for the real world with Agent Skills', kind: 'Engineering Guide · Anthropic · Oct 2025', note: 'Skill anatomy、progressive disclosure。', url: 'https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills' },
  { name: 'Effective harnesses for long-running agents', kind: 'Engineering Guide · Anthropic · Nov 2025', note: 'initializer + incremental worker。', url: 'https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents' },
  { name: 'Harness design for long-running application development', kind: 'Engineering Guide · Anthropic · Mar 2026', note: 'Ablation 简化 harness。', url: 'https://www.anthropic.com/engineering/harness-design-long-running-apps' },
  { name: 'Demystifying evals for AI agents', kind: 'Engineering Guide · Anthropic · Jan 2026', note: 'task/trial/grader/trace/outcome。', url: 'https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents' },
  { name: 'How we built our multi-agent research system', kind: 'Engineering Case Study · Anthropic · Jun 2025', note: 'Multi-agent 场景、token multiplier。', url: 'https://www.anthropic.com/engineering/multi-agent-research-system' },
  { name: 'How we contain Claude across products', kind: 'Security Engineering · Anthropic · May 2026', note: 'blast radius、containment。', url: 'https://www.anthropic.com/engineering/how-we-contain-claude' },
  { name: 'A practical guide to building agents', kind: 'Guide · OpenAI', note: 'Model / Tools / Instructions。', url: 'https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/' },
  { name: 'OpenAI Agents SDK Docs', kind: 'Official Docs · OpenAI', note: 'Running agents / Sandbox / Orchestration。', url: 'https://developers.openai.com/api/docs/guides/agents' },
  { name: 'MCP Specification 2026-07-28', kind: 'Protocol Spec', note: 'Architecture、Tools、Resources、Prompts。', url: 'https://modelcontextprotocol.io/docs/2026-07-28/learn/architecture' },
  { name: 'ReAct: Synergizing Reasoning and Acting in Language Models', kind: 'Paper · 2022', note: 'Tool-using agent loop 奠基。', url: 'https://arxiv.org/abs/2210.03629' },
  { name: 'Toolformer: Language Models Can Teach Themselves to Use Tools', kind: 'Paper · 2023', note: '何时调用、什么参数。', url: 'https://arxiv.org/abs/2302.04761' },
  { name: 'Reflexion: Language Agents with Verbal Reinforcement Learning', kind: 'Paper · 2023', note: 'feedback → reflection → episodic memory。', url: 'https://arxiv.org/abs/2303.11366' },
  { name: 'Voyager: An Open-Ended Embodied Agent with LLMs', kind: 'Paper · 2023', note: 'skill library + iterative prompting。', url: 'https://arxiv.org/abs/2305.16291' },
  { name: 'SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering', kind: 'Paper · 2024', note: 'ACI 思想对浏览器外骨骼关键。', url: 'https://arxiv.org/abs/2405.15793' },
  { name: 'τ-bench: A Benchmark for Tool-Agent-User Interaction', kind: 'Paper · 2024', note: 'end-state evaluation 与 pass^k。', url: 'https://arxiv.org/abs/2406.12045' },
  { name: 'AgentBench: Evaluating LLMs as Agents', kind: 'Paper · 2023', note: 'Interactive environment 多轮决策。', url: 'https://arxiv.org/abs/2308.03688' },
];
```

- [ ] **Step 4: 创建 src/curriculum/loader.ts**

```typescript
import fs from 'fs';
import path from 'path';
import { phases, getPhaseForDay } from './phases';
import { topics, topicMap } from './topics';

export interface DayCurriculum {
  day: number;
  phase: string;
  title: string;
  prio: 'P0' | 'P1' | 'P2';
  projects: string[];
  topics: string[];
  read: string[];
  learn: string[];
  build: string;
  accept: string;
}

const DAYS_DIR = path.join(__dirname, 'days');

export function loadDay(day: number): DayCurriculum | null {
  const filePath = path.join(DAYS_DIR, `${String(day).padStart(2, '0')}-*.md`);
  // glob 匹配
  const dir = fs.readdirSync(DAYS_DIR);
  const match = dir.find(f => f.startsWith(`${String(day).padStart(2, '0')}-`) && f.endsWith('.md'));
  if (!match) return null;
  return parseDayMarkdown(fs.readFileSync(path.join(DAYS_DIR, match), 'utf-8'), day);
}

export function loadAllDays(): DayCurriculum[] {
  const days: DayCurriculum[] = [];
  for (let d = 1; d <= 30; d++) {
    const day = loadDay(d);
    if (day) days.push(day);
  }
  return days;
}

export function getDaySummary(day: number): string {
  const curriculum = loadDay(day);
  if (!curriculum) return `Day ${day} 课程数据未找到`;
  const phase = getPhaseForDay(day);
  return [
    `**Day ${day}: ${curriculum.title}**`,
    `阶段: ${phase.name} (${phase.id})`,
    `优先级: ${curriculum.prio}`,
    `项目: ${curriculum.projects.join(', ')}`,
    ``,
    `**今日目标：**`,
    ...curriculum.learn.map((l, i) => `${i + 1}. ${l}`),
    ``,
    `**阅读：** ${curriculum.read.length} 组资料`,
    `**编码：** ${curriculum.build}`,
    `**验收：** ${curriculum.accept}`,
  ].join('\n');
}

function parseDayMarkdown(content: string, dayNumber: number): DayCurriculum {
  const lines = content.split('\n');
  let title = '';
  const read: string[] = [];
  const learn: string[] = [];
  let build = '';
  let accept = '';
  let section: 'read' | 'learn' | 'build' | 'accept' | null = null;

  for (const line of lines) {
    if (line.startsWith('# ')) {
      title = line.replace('# ', '').trim();
    } else if (line.startsWith('## 阅读')) {
      section = 'read';
    } else if (line.startsWith('## 学习目标')) {
      section = 'learn';
    } else if (line.startsWith('## 编码')) {
      section = 'build';
    } else if (line.startsWith('## 验收')) {
      section = 'accept';
    } else if (line.startsWith('- ') && section === 'read') {
      read.push(line.replace('- ', '').trim());
    } else if (line.startsWith('- ') && section === 'learn') {
      learn.push(line.replace('- ', '').trim());
    } else if (line.trim() && section === 'build') {
      build += (build ? ' ' : '') + line.trim();
    } else if (line.trim() && section === 'accept') {
      accept += (accept ? ' ' : '') + line.trim();
    }
  }

  const phase = getPhaseForDay(dayNumber);

  return {
    day: dayNumber,
    phase: phase.id,
    title,
    prio: dayNumber <= 24 ? 'P0' : 'P1',
    projects: ['runtime'],
    topics: [],
    read,
    learn,
    build,
    accept,
  };
}
```

- [ ] **Step 5: 创建第一个课程文件 src/curriculum/days/01-mental-model.md**

```markdown
# 建立正确的 Agent 心智模型

## 阅读
- Anthropic · Building effective agents：What are agents? / When (and when not) to use agents
- AI Agents in Action 2e · Ch1 §1.1–1.3（agent、sense-plan-act-learn、five functional layers）
- OpenAI · A practical guide：What is an agent? / When should you build an agent?

## 学习目标
- Workflow vs Agent：谁决定路径？
- Sense → Plan → Act → Learn
- Model / Tools / Instructions 与 5 functional layers
- "最简单方案优先"的 complexity ladder

## 编码
建立 agent-lab 仓库：/runtime /tools /skills /evals /examples；写 ADR-001《什么时候不用 Agent》；画出你的 Runtime 分层图。

## 验收
能把 10 个业务需求分类成：plain LLM / deterministic workflow / single-agent / multi-agent，并说明为什么。
```

- [ ] **Step 6: 创建其余 29 天课程文件（从 HTML 中提取数据，批量创建）**

每个文件格式同 Day 1。从 HTML 中的 `days` 数组提取数据。

- [ ] **Step 7: 验证课程加载**

```bash
npx tsx -e "
const { loadDay, getDaySummary } = require('./src/curriculum/loader');
const day1 = loadDay(1);
console.log('Day 1 title:', day1?.title);
console.log('---');
console.log(getDaySummary(1));
"
# Expected: Day 1 title and full summary
```

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: add curriculum data (topics, phases, sources, days)"
```

---

## Phase 2: Coach Core

### Task 6: 教练系统 Prompt

**Files:**
- Create: `src/coach/coach-prompt.ts`

- [ ] **Step 1: 创建 src/coach/coach-prompt.ts**

```typescript
export const COACH_SYSTEM_PROMPT = `你是一个 Agent Engineering 教练，名字叫"阿建"。

## 你的目标
不是"把课讲完"，而是"让学生不放弃"。你管理一个 30 天的 Agent Engineering 训练营。

## 你的风格
- 直接、务实，不废话，不鸡汤
- 像健身房教练：推你一把，但不羞辱你
- 学生说"不会"时，不给答案，给一个更小的子问题
- 学生做得好时，具体指出哪里好，不说"太棒了"这种空话
- 学生说"不想学"时，说"好，那我周五再来"，不要施压
- 永远给两个选项："今天做 10 分钟版还是 45 分钟版？"

## 主动行为规则
你会在以下情况被触发（由调度器触发你）：

1. **学生 3 天没活动** → 发一条温和的 check-in 消息
2. **学生 7 天没活动** → 直接问是不是卡住了，提供帮助
3. **学生连续 2 天完成所有任务** → 肯定节奏，问要不要加量
4. **学生 eval 结果明显下降** → 具体指出哪里掉了，给 10 分钟修复建议
5. **学生完成一个阶段** → 发阶段总结，指出强项和薄弱点
6. **学生卡在同一任务超过 2 天** → 主动拆解成小步骤
7. **每天固定时间** → 发今日任务概览
8. **周一早上** → 发本周计划

## 可用的工具
你可以调用以下工具来获取信息和执行操作：

- get_student_progress: 查询学生的进度、完成率、未完成的任务
- get_day_curriculum: 获取某天的课程内容
- get_student_history: 查询最近的对话和活动记录
- get_student_eval_results: 查询学生的 eval 结果
- check_silent_students: 扫描所有沉默的学生

## 输出格式
你需要输出一个 JSON 对象：
{
  "should_send": true/false,    // 是否应该发送消息
  "message": "要发送的消息内容",  // 如果 should_send 为 true
  "reasoning": "为什么做这个决定"  // 内部决策理由
}

## 重要原则
- 不要过度打扰：一天最多主动发一条消息（除非学生主动找你）
- 如果学生上周已经连续 7 天没活动且你发过消息，本周不要再发
- 庆祝微小进步："你第一次跑通了 agent loop，这是最关键的一步"
- 不要假装关心：如果你没有什么可说的，就说"今天没什么特别的，按计划进行就行"
`;
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat: add coach system prompt"
```

---

### Task 7: 教练工具实现

**Files:**
- Create: `src/coach/coach-tools.ts`

- [ ] **Step 1: 创建 src/coach/coach-tools.ts**

```typescript
import { getStudent, getStudentByChannel, listStudents } from '../store/students';
import { getAllProgress, getProgressSummary, getCurrentDay, getStuckDays } from '../store/progress';
import { getRecentConversations, getLastActivity } from '../store/conversations';
import { getRecentEvents } from '../store/events';
import { getRecentActivity } from '../store/activity';
import { getDaySummary } from '../curriculum/loader';
import { getDb } from '../store/db';

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}

export const COACH_TOOLS: ToolDefinition[] = [
  {
    name: 'get_student_progress',
    description: '查询某个学生的完整进度，包括完成率、当前天、未完成的任务列表',
    input_schema: {
      type: 'object',
      properties: {
        student_id: { type: 'string', description: '学生 ID' },
      },
      required: ['student_id'],
    },
  },
  {
    name: 'get_day_curriculum',
    description: '获取某一天的课程内容摘要',
    input_schema: {
      type: 'object',
      properties: {
        day: { type: 'number', description: '第几天 (1-30)' },
      },
      required: ['day'],
    },
  },
  {
    name: 'get_student_history',
    description: '查询学生最近的对话和活动记录',
    input_schema: {
      type: 'object',
      properties: {
        student_id: { type: 'string', description: '学生 ID' },
      },
      required: ['student_id'],
    },
  },
  {
    name: 'get_student_eval_results',
    description: '查询学生的 eval 运行结果',
    input_schema: {
      type: 'object',
      properties: {
        student_id: { type: 'string', description: '学生 ID' },
      },
      required: ['student_id'],
    },
  },
  {
    name: 'check_silent_students',
    description: '扫描所有学生，返回超过 3 天没有任何活动的学生列表',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];

export async function executeTool(name: string, input: Record<string, any>): Promise<string> {
  switch (name) {
    case 'get_student_progress': {
      const student = getStudent(input.student_id);
      if (!student) return JSON.stringify({ error: '学生不存在' });
      const summary = getProgressSummary(input.student_id);
      const currentDay = getCurrentDay(input.student_id);
      const stuckDays = getStuckDays(input.student_id);
      const all = getAllProgress(input.student_id);
      const lastActivity = getLastActivity(input.student_id);
      return JSON.stringify({
        student_name: student.name,
        channel: student.channel,
        start_date: student.start_date,
        daily_hours: student.daily_hours,
        current_day: currentDay,
        progress_percentage: summary.percentage,
        completed_tasks: summary.completed,
        total_tasks: summary.total,
        stuck_days: stuckDays,
        days_since_last_activity: lastActivity.days_since_last,
        last_message_at: lastActivity.last_message_at,
        daily_detail: all.map(p => ({
          day: p.day,
          read: !!p.read_done,
          build: !!p.build_done,
          eval: !!p.eval_done,
          note: !!p.note_done,
        })),
      });
    }

    case 'get_day_curriculum': {
      const day = input.day;
      const summary = getDaySummary(day);
      return JSON.stringify({ day, summary });
    }

    case 'get_student_history': {
      const conversations = getRecentConversations(input.student_id, 20);
      const events = getRecentEvents(input.student_id, 5);
      const activity = getRecentActivity(input.student_id, 10);
      return JSON.stringify({
        recent_conversations: conversations.map(c => ({ role: c.role, content: c.content.slice(0, 200), at: c.created_at })),
        recent_coaching_events: events.map(e => ({ type: e.event_type, trigger: e.trigger, at: e.created_at })),
        recent_activity: activity.map(a => ({ type: a.activity_type, detail: a.detail, at: a.created_at })),
      });
    }

    case 'get_student_eval_results': {
      const db = getDb();
      const results = db.prepare('SELECT * FROM eval_runs WHERE student_id = ? ORDER BY created_at DESC LIMIT 10').all(input.student_id);
      return JSON.stringify(results);
    }

    case 'check_silent_students': {
      const students = listStudents();
      const silent: any[] = [];
      for (const s of students) {
        const activity = getLastActivity(s.id);
        if (activity.days_since_last !== null && activity.days_since_last >= 3) {
          silent.push({
            student_id: s.id,
            name: s.name,
            channel: s.channel,
            days_silent: activity.days_since_last,
            last_message: activity.last_message_at,
            progress: getProgressSummary(s.id).percentage,
          });
        }
      }
      return JSON.stringify({ silent_count: silent.length, silent_students: silent });
    }

    default:
      return JSON.stringify({ error: `未知工具: ${name}` });
  }
}
```

- [ ] **Step 2: 验证工具**

```bash
npx tsx -e "
const { executeTool } = require('./src/coach/coach-tools');
const { getDb } = require('./src/store/db');
const { createStudent } = require('./src/store/students');
getDb();

// 先创建测试学生
createStudent({ id: 'test-tool', name: 'Tool Test', channel: 'telegram', channel_id: '456', timezone: 'Asia/Shanghai', daily_hours: 4, start_date: '2026-08-16', reminder_time: '09:00' });

async function test() {
  const r1 = await executeTool('get_student_progress', { student_id: 'test-tool' });
  console.log('Progress:', JSON.parse(r1).student_name);

  const r2 = await executeTool('get_day_curriculum', { day: 1 });
  console.log('Day 1 summary length:', JSON.parse(r2).summary.length);

  const r3 = await executeTool('check_silent_students', {});
  console.log('Silent students:', JSON.parse(r3).silent_count);
}
test();
"
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: add coach tools implementation"
```

---

### Task 8: 触发器逻辑

**Files:**
- Create: `src/coach/triggers.ts`

- [ ] **Step 1: 创建 src/coach/triggers.ts**

```typescript
import { listStudents } from '../store/students';
import { getProgressSummary, getCurrentDay, getStuckDays, getAllProgress } from '../store/progress';
import { getLastActivity } from '../store/conversations';
import { getRecentEvents } from '../store/events';
import { getDb } from '../store/db';

export interface TriggerResult {
  type: 'silent_3d' | 'silent_7d' | 'streak_2d' | 'eval_drop' | 'phase_complete' | 'stuck_2d' | 'daily_reminder' | 'weekly_plan';
  studentId: string;
  context: Record<string, any>;
}

export function scanTriggers(): TriggerResult[] {
  const results: TriggerResult[] = [];
  const students = listStudents();

  for (const student of students) {
    const activity = getLastActivity(student.id);
    const summary = getProgressSummary(student.id);
    const currentDay = getCurrentDay(student.id);
    const stuckDays = getStuckDays(student.id);
    const events = getRecentEvents(student.id, 20);

    // 1. 7 天沉默（最高优先级）
    if (activity.days_since_last !== null && activity.days_since_last >= 7) {
      const lastNudge = events.find(e => e.event_type === 'nudge' && e.trigger === 'cron');
      const lastNudgeDays = lastNudge
        ? Math.floor((Date.now() - new Date(lastNudge.created_at + 'Z').getTime()) / (1000 * 60 * 60 * 24))
        : 999;
      if (lastNudgeDays > 5) { // 不要每 5 天内重复提醒
        results.push({
          type: 'silent_7d',
          studentId: student.id,
          context: { days_silent: activity.days_since_last, progress: summary.percentage },
        });
      }
    }
    // 2. 3 天沉默
    else if (activity.days_since_last !== null && activity.days_since_last >= 3) {
      results.push({
        type: 'silent_3d',
        studentId: student.id,
        context: { days_silent: activity.days_since_last, progress: summary.percentage },
      });
    }

    // 3. 连续 2 天完成
    const allProgress = getAllProgress(student.id);
    const recentCompleted = allProgress
      .filter(p => p.read_done && p.build_done && p.eval_done && p.note_done)
      .slice(-2);
    if (recentCompleted.length >= 2) {
      const lastStreakEvent = events.find(e => e.event_type === 'check_in' && e.trigger === 'cron');
      if (!lastStreakEvent || new Date(lastStreakEvent.created_at + 'Z').getTime() < Date.now() - 24 * 60 * 60 * 1000) {
        results.push({
          type: 'streak_2d',
          studentId: student.id,
          context: { completed_days: recentCompleted.map(p => p.day) },
        });
      }
    }

    // 4. 卡住超过 2 天
    if (stuckDays.length > 0 && currentDay <= 30) {
      results.push({
        type: 'stuck_2d',
        studentId: student.id,
        context: { stuck_days: stuckDays, current_day: currentDay },
      });
    }

    // 5. Phase 完成检查
    const phaseBoundaries = [6, 12, 18, 24, 30];
    for (const boundary of phaseBoundaries) {
      if (currentDay > boundary) {
        const boundaryDay = getAllProgress(student.id).find(p => p.day === boundary);
        if (boundaryDay && boundaryDay.read_done && boundaryDay.build_done && boundaryDay.eval_done && boundaryDay.note_done) {
          const lastPhaseEvent = events.find(e => e.event_type === 'phase_summary' && e.content.includes(`Day ${boundary}`));
          if (!lastPhaseEvent) {
            results.push({
              type: 'phase_complete',
              studentId: student.id,
              context: { phase_day: boundary, current_day: currentDay },
            });
          }
        }
      }
    }
  }

  return results;
}
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat: add trigger scanning logic"
```

---

### Task 9: 教练 Agent 主逻辑

**Files:**
- Create: `src/coach/coach-agent.ts`

- [ ] **Step 1: 创建 src/coach/coach-agent.ts**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { COACH_SYSTEM_PROMPT } from './coach-prompt';
import { COACH_TOOLS, executeTool } from './coach-tools';
import { TriggerResult } from './triggers';
import { getStudent } from '../store/students';
import { addConversation } from '../store/conversations';
import { logEvent } from '../store/events';
import { logActivity } from '../store/activity';

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

export interface CoachDecision {
  shouldSend: boolean;
  message: string;
  reasoning: string;
}

export async function coachTrigger(
  studentId: string,
  trigger: TriggerResult,
): Promise<CoachDecision> {
  const student = getStudent(studentId);
  if (!student) {
    return { shouldSend: false, message: '', reasoning: '学生不存在' };
  }

  const triggerDescriptions: Record<string, string> = {
    silent_3d: `学生 ${student.name} 已经 ${trigger.context.days_silent} 天没有任何活动。当前进度 ${trigger.context.progress}%。发送一条温和的 check-in 消息。`,
    silent_7d: `学生 ${student.name} 已经 ${trigger.context.days_silent} 天没有任何活动，进度仅 ${trigger.context.progress}%。需要直接问是不是卡住了，提供帮助。`,
    streak_2d: `学生 ${student.name} 连续完成了 Day ${trigger.context.completed_days.join(' 和 Day ')}。肯定他们的节奏，问要不要加量。`,
    stuck_2d: `学生 ${student.name} 卡在 Day ${trigger.context.stuck_days.join(', ')}，当前在第 ${trigger.context.current_day} 天。需要主动拆解任务。`,
    phase_complete: `学生 ${student.name} 完成了 Day ${trigger.context.phase_day}（阶段末尾），当前在第 ${trigger.context.current_day} 天。发阶段总结。`,
    daily_reminder: `现在是学生 ${student.name} 的每日提醒时间。当前在第 ${trigger.context.current_day} 天。发今日任务。`,
    weekly_plan: `周一早上，为学生 ${student.name} 生成本周计划。当前在第 ${trigger.context.current_day} 天。`,
    eval_drop: `学生 ${student.name} 的 eval 结果下降了。具体数据：${JSON.stringify(trigger.context)}。给具体反馈。`,
  };

  const triggerPrompt = triggerDescriptions[trigger.type] || JSON.stringify(trigger);

  const userMessage = `触发类型: ${trigger.type}
触发上下文: ${triggerPrompt}

请根据你的教练规则，决定是否应该发消息给学生，以及发什么内容。

输出 JSON 格式：{"should_send": true/false, "message": "消息内容", "reasoning": "决策理由"}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 1024,
    system: COACH_SYSTEM_PROMPT,
    tools: COACH_TOOLS.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    })),
    messages: [{ role: 'user', content: userMessage }],
  });

  // 处理 tool calls
  let finalContent = '';
  const toolUses: { name: string; input: any; result: string }[] = [];

  for (const block of response.content) {
    if (block.type === 'text') {
      finalContent = block.text;
    } else if (block.type === 'tool_use') {
      const result = await executeTool(block.name, block.input as Record<string, any>);
      toolUses.push({ name: block.name, input: block.input, result });
    }
  }

  // 如果有 tool calls，需要继续对话
  if (toolUses.length > 0) {
    const toolResults = toolUses.map(tu => ({
      type: 'tool_result' as const,
      tool_use_id: '', // 需要从原始 response 中获取
      content: tu.result,
    }));

    // 简化处理：直接用 tool results 再发一次请求
    const followUp = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1024,
      system: COACH_SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: userMessage },
        { role: 'assistant', content: toolUses.map(tu =>
          `我用 ${tu.name} 工具查询了数据，结果如下：\n${tu.result}`
        ).join('\n\n') },
        { role: 'user', content: '好的，现在请根据这些数据和你的教练规则，输出最终的 JSON 决策。' },
      ],
    });

    const textBlock = followUp.content.find(b => b.type === 'text');
    if (textBlock && textBlock.type === 'text') {
      finalContent = textBlock.text;
    }
  }

  // 解析 JSON 输出
  try {
    const jsonMatch = finalContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const decision: CoachDecision = JSON.parse(jsonMatch[0]);
      return decision;
    }
  } catch (e) {
    // fallback
  }

  return { shouldSend: false, message: '', reasoning: '无法解析 Agent 输出' };
}

export async function coachReply(
  studentId: string,
  studentMessage: string,
): Promise<CoachDecision> {
  const student = getStudent(studentId);
  if (!student) {
    return { shouldSend: true, message: '抱歉，我找不到你的学习记录。请先注册。', reasoning: '学生不存在' };
  }

  const userMessage = `学生 ${student.name} 发来消息："${studentMessage}"

你是一个教练，学生主动联系你。请根据你的教练规则回复。

输出 JSON 格式：{"should_send": true, "message": "回复内容", "reasoning": "决策理由"}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 1024,
    system: COACH_SYSTEM_PROMPT,
    tools: COACH_TOOLS.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    })),
    messages: [{ role: 'user', content: userMessage }],
  });

  const textBlock = response.content.find(b => b.type === 'text');
  const finalContent = (textBlock && textBlock.type === 'text') ? textBlock.text : '';

  try {
    const jsonMatch = finalContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const decision: CoachDecision = JSON.parse(jsonMatch[0]);
      return decision;
    }
  } catch (e) {
    return { shouldSend: true, message: '收到，让我想想怎么帮你。', reasoning: 'fallback' };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat: add coach agent main logic with Anthropic SDK"
```

---

## Phase 3: 调度器 + 频道

### Task 10: 频道抽象层

**Files:**
- Create: `src/channels/types.ts`
- Create: `src/channels/router.ts`

- [ ] **Step 1: 创建 src/channels/types.ts**

```typescript
export interface UnifiedMessage {
  direction: 'inbound' | 'outbound';
  content: string;
  contentType: 'text' | 'markdown';
  studentId: string;
  channel: 'feishu' | 'telegram' | 'discord';
  channelMessageId?: string;
  timestamp: Date;
  replyTo?: string;
}

export interface ChannelAdapter {
  readonly channel: 'feishu' | 'telegram' | 'discord';
  start(): Promise<void>;
  stop(): Promise<void>;
  onMessage(handler: (msg: UnifiedMessage) => Promise<void>): void;
  sendMessage(msg: UnifiedMessage): Promise<string>;
  healthCheck(): Promise<boolean>;
}
```

- [ ] **Step 2: 创建 src/channels/router.ts**

```typescript
import { ChannelAdapter, UnifiedMessage } from './types';
import { coachReply } from '../coach/coach-agent';
import { getStudentByChannel, createStudent } from '../store/students';
import { addConversation } from '../store/conversations';
import { logActivity } from '../store/activity';
import { v4 as uuidv4 } from 'uuid';

export class ChannelRouter {
  private adapters: Map<string, ChannelAdapter> = new Map();
  private inboundHandler: ((msg: UnifiedMessage) => Promise<void>) | null = null;

  register(adapter: ChannelAdapter): void {
    this.adapters.set(adapter.channel, adapter);
    adapter.onMessage(async (msg) => {
      await this.handleInbound(msg);
    });
  }

  async startAll(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      await adapter.start();
      console.log(`[ChannelRouter] ${adapter.channel} started`);
    }
  }

  async stopAll(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      await adapter.stop();
    }
  }

  async sendMessage(msg: UnifiedMessage): Promise<string> {
    const adapter = this.adapters.get(msg.channel);
    if (!adapter) throw new Error(`No adapter for channel: ${msg.channel}`);
    return adapter.sendMessage(msg);
  }

  private async handleInbound(msg: UnifiedMessage): Promise<void> {
    // 查找或创建学生
    let student = getStudentByChannel(msg.channel, msg.studentId);
    if (!student) {
      student = createStudent({
        id: uuidv4(),
        name: msg.channel === 'telegram' ? `Telegram User ${msg.studentId.slice(0, 6)}` : `User ${msg.studentId.slice(0, 6)}`,
        channel: msg.channel,
        channel_id: msg.studentId,
        timezone: 'Asia/Shanghai',
        daily_hours: 4,
        start_date: new Date().toISOString().split('T')[0],
        reminder_time: '09:00',
      });
      console.log(`[ChannelRouter] Created new student: ${student.id}`);
    }

    // 记录对话
    addConversation({
      student_id: student.id,
      role: 'student',
      content: msg.content,
      channel: msg.channel,
    });

    logActivity(student.id, 'message', '学生发消息');

    // 调用教练 Agent
    const decision = await coachReply(student.id, msg.content);

    if (decision.shouldSend && decision.message) {
      await this.sendMessage({
        direction: 'outbound',
        content: decision.message,
        contentType: 'text',
        studentId: student.id,
        channel: msg.channel,
        timestamp: new Date(),
        replyTo: msg.channelMessageId,
      });

      addConversation({
        student_id: student.id,
        role: 'coach',
        content: decision.message,
        channel: msg.channel,
      });
    }
  }
}

export const router = new ChannelRouter();
```

- [ ] **Step 3: 安装 uuid**

```bash
npm install uuid && npm install -D @types/uuid
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: add channel abstraction layer and router"
```

---

### Task 11: Telegram Adapter

**Files:**
- Create: `src/channels/telegram.ts`

- [ ] **Step 1: 创建 src/channels/telegram.ts**

```typescript
import TelegramBot from 'node-telegram-bot-api';
import { config } from '../config';
import { ChannelAdapter, UnifiedMessage } from './types';

export class TelegramAdapter implements ChannelAdapter {
  readonly channel = 'telegram' as const;
  private bot: TelegramBot;
  private messageHandler: ((msg: UnifiedMessage) => Promise<void>) | null = null;

  constructor() {
    this.bot = new TelegramBot(config.telegram.botToken, { polling: false });
  }

  async start(): Promise<void> {
    if (!config.telegram.botToken) {
      console.log('[Telegram] No bot token configured, skipping');
      return;
    }
    // 使用 webhook 或 long polling
    await this.bot.startPolling();
    console.log('[Telegram] Bot started polling');
  }

  async stop(): Promise<void> {
    await this.bot.stopPolling();
  }

  onMessage(handler: (msg: UnifiedMessage) => Promise<void>): void {
    this.messageHandler = handler;

    this.bot.on('message', async (tgMsg) => {
      if (!tgMsg.from || !tgMsg.text) return;
      const unified: UnifiedMessage = {
        direction: 'inbound',
        content: tgMsg.text,
        contentType: 'text',
        studentId: String(tgMsg.from.id),
        channel: 'telegram',
        channelMessageId: String(tgMsg.message_id),
        timestamp: new Date(tgMsg.date * 1000),
      };
      await handler(unified);
    });
  }

  async sendMessage(msg: UnifiedMessage): Promise<string> {
    const sent = await this.bot.sendMessage(msg.studentId, msg.content, {
      parse_mode: 'Markdown',
      reply_to_message_id: msg.replyTo ? parseInt(msg.replyTo) : undefined,
    });
    return String(sent.message_id);
  }

  async healthCheck(): Promise<boolean> {
    try {
      const me = await this.bot.getMe();
      return !!me.username;
    } catch {
      return false;
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat: add Telegram adapter"
```

---

### Task 12: Discord Adapter

**Files:**
- Create: `src/channels/discord.ts`

- [ ] **Step 1: 创建 src/channels/discord.ts**

```typescript
import { Client, GatewayIntentBits, TextChannel, Message } from 'discord.js';
import { config } from '../config';
import { ChannelAdapter, UnifiedMessage } from './types';

export class DiscordAdapter implements ChannelAdapter {
  readonly channel = 'discord' as const;
  private client: Client;
  private messageHandler: ((msg: UnifiedMessage) => Promise<void>) | null = null;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
    });
  }

  async start(): Promise<void> {
    if (!config.discord.botToken) {
      console.log('[Discord] No bot token configured, skipping');
      return;
    }
    await this.client.login(config.discord.botToken);
    console.log('[Discord] Bot logged in');
  }

  async stop(): Promise<void> {
    this.client.destroy();
  }

  onMessage(handler: (msg: UnifiedMessage) => Promise<void>): void {
    this.messageHandler = handler;

    this.client.on('messageCreate', async (message: Message) => {
      if (message.author.bot || !message.content) return;
      const unified: UnifiedMessage = {
        direction: 'inbound',
        content: message.content,
        contentType: 'text',
        studentId: message.author.id,
        channel: 'discord',
        channelMessageId: message.id,
        timestamp: message.createdAt,
      };
      await handler(unified);
    });
  }

  async sendMessage(msg: UnifiedMessage): Promise<string> {
    // Discord DM
    const user = await this.client.users.fetch(msg.studentId);
    const dm = await user.createDM();
    const sent = await dm.send({
      content: msg.content.length > 2000 ? msg.content.slice(0, 1997) + '...' : msg.content,
      reply: msg.replyTo ? { messageReference: msg.replyTo } : undefined,
    });
    return sent.id;
  }

  async healthCheck(): Promise<boolean> {
    return this.client.isReady();
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat: add Discord adapter"
```

---

### Task 13: 飞书 Adapter

**Files:**
- Create: `src/channels/feishu.ts`

- [ ] **Step 1: 创建 src/channels/feishu.ts（Webhook 模式）**

飞书机器人使用 Webhook 接收消息，需要 Express 配合。我们创建一个简化版，先实现消息发送，webhook 接收在 Web 服务中处理。

```typescript
import { ChannelAdapter, UnifiedMessage } from './types';
import { config } from '../config';

interface FeishuTokenCache {
  token: string;
  expiresAt: number;
}

export class FeishuAdapter implements ChannelAdapter {
  readonly channel = 'feishu' as const;
  private messageHandler: ((msg: UnifiedMessage) => Promise<void>) | null = null;
  private tokenCache: FeishuTokenCache | null = null;

  async start(): Promise<void> {
    if (!config.feishu.appId) {
      console.log('[Feishu] No app credentials configured, skipping');
      return;
    }
    console.log('[Feishu] Adapter ready (webhook mode)');
  }

  async stop(): Promise<void> {
    // no-op
  }

  onMessage(handler: (msg: UnifiedMessage) => Promise<void>): void {
    this.messageHandler = handler;
  }

  // 由 Express webhook 路由调用
  async handleWebhook(body: any): Promise<UnifiedMessage | null> {
    // 飞书事件格式
    const event = body?.event;
    if (!event || !event.message || !event.sender) return null;
    const msg = event.message;
    const content = msg.content || '';
    // 飞书消息 content 是 JSON 字符串
    let text = content;
    try {
      const parsed = JSON.parse(content);
      text = parsed.text || content;
    } catch {}

    const unified: UnifiedMessage = {
      direction: 'inbound',
      content: text,
      contentType: 'text',
      studentId: event.sender.sender_id?.open_id || event.sender.sender_id?.user_id || '',
      channel: 'feishu',
      channelMessageId: msg.message_id,
      timestamp: new Date(parseInt(msg.create_time || '0') * 1000),
    };

    if (this.messageHandler) {
      await this.messageHandler(unified);
    }

    return unified;
  }

  async sendMessage(msg: UnifiedMessage): Promise<string> {
    const token = await this.getTenantAccessToken();
    const response = await fetch(
      'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          receive_id: msg.studentId,
          msg_type: 'text',
          content: JSON.stringify({ text: msg.content }),
        }),
      }
    );
    const data = await response.json() as any;
    return data?.data?.message_id || '';
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.getTenantAccessToken();
      return true;
    } catch {
      return false;
    }
  }

  private async getTenantAccessToken(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now()) {
      return this.tokenCache.token;
    }
    const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: config.feishu.appId,
        app_secret: config.feishu.appSecret,
      }),
    });
    const data = await response.json() as any;
    if (data.code !== 0) throw new Error(`Feishu auth error: ${data.msg}`);
    this.tokenCache = {
      token: data.tenant_access_token,
      expiresAt: Date.now() + (data.expire - 300) * 1000,
    };
    return this.tokenCache.token;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat: add Feishu adapter (webhook mode)"
```

---

### Task 14: 调度器

**Files:**
- Create: `src/scheduler/scheduler.ts`

- [ ] **Step 1: 创建 src/scheduler/scheduler.ts**

```typescript
import cron from 'node-cron';
import { scanTriggers, TriggerResult } from '../coach/triggers';
import { coachTrigger } from '../coach/coach-agent';
import { router } from '../channels/router';
import { getStudent } from '../store/students';
import { addConversation } from '../store/conversations';
import { logEvent } from '../store/events';
import { logActivity } from '../store/activity';

export function startScheduler(): void {
  console.log('[Scheduler] Starting...');

  // 每 30 分钟扫描一次沉默学生
  cron.schedule('*/30 * * * *', async () => {
    console.log('[Scheduler] Scanning for silent students...');
    const triggers = scanTriggers();
    const highPriority = triggers.filter(t => t.type === 'silent_7d' || t.type === 'silent_3d');

    for (const trigger of highPriority) {
      await handleTrigger(trigger);
    }
  });

  // 每天早上 9:00 发送每日提醒
  cron.schedule('0 9 * * *', async () => {
    console.log('[Scheduler] Daily reminder time...');
    const triggers = scanTriggers();

    for (const trigger of triggers) {
      if (trigger.type === 'daily_reminder' || trigger.type === 'stuck_2d' || trigger.type === 'streak_2d') {
        await handleTrigger(trigger);
      }
    }
  });

  // 每周一早上 9:00 发送周计划
  cron.schedule('0 9 * * 1', async () => {
    console.log('[Scheduler] Weekly plan time...');
    const triggers = scanTriggers();

    for (const trigger of triggers) {
      if (trigger.type === 'weekly_plan' || trigger.type === 'phase_complete') {
        await handleTrigger(trigger);
      }
    }
  });

  console.log('[Scheduler] Started');
}

async function handleTrigger(trigger: TriggerResult): Promise<void> {
  const student = getStudent(trigger.studentId);
  if (!student) return;

  console.log(`[Scheduler] Handling trigger: ${trigger.type} for ${student.name}`);

  try {
    const decision = await coachTrigger(trigger.studentId, trigger);

    if (decision.shouldSend && decision.message) {
      await router.sendMessage({
        direction: 'outbound',
        content: decision.message,
        contentType: 'markdown',
        studentId: trigger.studentId,
        channel: student.channel,
        timestamp: new Date(),
      });

      addConversation({
        student_id: trigger.studentId,
        role: 'coach',
        content: decision.message,
        channel: student.channel,
      });

      logEvent({
        student_id: trigger.studentId,
        event_type: trigger.type.startsWith('silent') ? 'nudge' : trigger.type === 'daily_reminder' ? 'daily_reminder' : trigger.type === 'phase_complete' ? 'phase_summary' : trigger.type === 'weekly_plan' ? 'weekly_plan' : 'check_in',
        trigger: 'cron',
        content: decision.message,
      });

      logActivity(trigger.studentId, 'coach_action', `${trigger.type}: ${decision.reasoning}`);
    }
  } catch (err) {
    console.error(`[Scheduler] Error handling trigger ${trigger.type}:`, err);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat: add scheduler with cron jobs"
```

---

## Phase 4: Web Dashboard

### Task 15: Express 服务 + API

**Files:**
- Create: `src/web/server.ts`
- Create: `src/web/routes/api.ts`
- Create: `src/web/routes/dashboard.ts`
- Create: `src/web/routes/admin.ts`

- [ ] **Step 1: 创建 src/web/server.ts**

```typescript
import express from 'express';
import path from 'path';
import { config } from '../config';
import { apiRouter } from './routes/api';
import { dashboardRouter } from './routes/dashboard';
import { adminRouter } from './routes/admin';

export function startWebServer(): void {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // 静态文件
  app.use('/static', express.static(path.join(__dirname, '..', 'public')));

  // 视图引擎
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  // 路由
  app.use('/api', apiRouter);
  app.use('/dashboard', dashboardRouter);
  app.use('/admin', adminRouter);

  // 飞书 Webhook 回调
  app.post('/webhook/feishu', async (req, res) => {
    // 飞书 URL 验证
    if (req.body?.type === 'url_verification') {
      res.json({ challenge: req.body.challenge });
      return;
    }

    const { feishuAdapter } = await import('../channels/feishu');
    // 需要把 feishu adapter 实例传进来，这里简化处理
    res.json({ code: 0 });
  });

  app.get('/', (_req, res) => {
    res.redirect('/dashboard');
  });

  app.listen(config.web.port, () => {
    console.log(`[Web] Dashboard running on http://localhost:${config.web.port}`);
  });
}
```

- [ ] **Step 2: 创建 src/web/routes/api.ts**

```typescript
import { Router } from 'express';
import { listStudents, getStudent } from '../../store/students';
import { getAllProgress, getProgressSummary, getCurrentDay } from '../../store/progress';
import { getRecentConversations } from '../../store/conversations';
import { getRecentEvents } from '../../store/events';

export const apiRouter = Router();

apiRouter.get('/students', (_req, res) => {
  const students = listStudents();
  const enriched = students.map(s => ({
    ...s,
    progress: getProgressSummary(s.id),
    current_day: getCurrentDay(s.id),
  }));
  res.json(enriched);
});

apiRouter.get('/students/:id', (req, res) => {
  const student = getStudent(req.params.id);
  if (!student) return res.status(404).json({ error: 'Not found' });
  const progress = getAllProgress(req.params.id);
  const summary = getProgressSummary(req.params.id);
  const conversations = getRecentConversations(req.params.id, 50);
  const events = getRecentEvents(req.params.id, 20);
  res.json({ student, progress, summary, conversations, events });
});
```

- [ ] **Step 3: 创建 src/web/routes/dashboard.ts**

```typescript
import { Router } from 'express';
import { listStudents } from '../../store/students';
import { getAllProgress, getProgressSummary, getCurrentDay } from '../../store/progress';
import { getRecentConversations } from '../../store/conversations';
import { loadAllDays } from '../../curriculum/loader';
import { phases } from '../../curriculum/phases';

export const dashboardRouter = Router();

dashboardRouter.get('/', (_req, res) => {
  // 简化：展示第一个学生的 dashboard，实际需要登录
  const students = listStudents();
  const student = students[0];
  if (!student) {
    return res.send('<h1>还没有学生注册。请先通过 Telegram/Discord/飞书 联系教练机器人。</h1>');
  }
  res.redirect(`/dashboard/${student.id}`);
});

dashboardRouter.get('/:id', (req, res) => {
  const { getStudent } = require('../../store/students');
  const student = getStudent(req.params.id);
  if (!student) return res.status(404).send('Student not found');

  const progress = getAllProgress(req.params.id);
  const summary = getProgressSummary(req.params.id);
  const currentDay = getCurrentDay(req.params.id);
  const conversations = getRecentConversations(req.params.id, 30);
  const allDays = loadAllDays();

  res.render('dashboard', {
    student,
    progress,
    summary,
    currentDay,
    conversations,
    allDays,
    phases,
  });
});
```

- [ ] **Step 4: 创建 src/web/routes/admin.ts**

```typescript
import { Router } from 'express';
import { config } from '../../config';
import { listStudents, getStudent } from '../../store/students';
import { getProgressSummary, getCurrentDay } from '../../store/progress';
import { getLastActivity } from '../../store/conversations';
import { getRecentEvents } from '../../store/events';

export const adminRouter = Router();

adminRouter.get('/', (req, res) => {
  const students = listStudents();
  const enriched = students.map(s => {
    const activity = getLastActivity(s.id);
    const summary = getProgressSummary(s.id);
    const currentDay = getCurrentDay(s.id);
    return {
      ...s,
      progress_pct: summary.percentage,
      current_day: currentDay,
      days_since_last: activity.days_since_last,
      is_silent: activity.days_since_last !== null && activity.days_since_last >= 3,
    };
  });

  enriched.sort((a, b) => {
    if (a.is_silent && !b.is_silent) return -1;
    if (!a.is_silent && b.is_silent) return 1;
    return b.progress_pct - a.progress_pct;
  });

  res.render('admin', { students: enriched, phases: require('../../curriculum/phases').phases });
});

adminRouter.get('/:id', (req, res) => {
  const student = getStudent(req.params.id);
  if (!student) return res.status(404).send('Student not found');

  const progress = require('../../store/progress').getAllProgress(req.params.id);
  const summary = getProgressSummary(req.params.id);
  const events = getRecentEvents(req.params.id, 50);
  const activity = getLastActivity(req.params.id);

  res.render('admin-detail', { student, progress, summary, events, activity });
});
```

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add Express web server, API routes, dashboard and admin"
```

---

### Task 16: Dashboard 视图（EJS 模板）

**Files:**
- Create: `src/web/views/dashboard.ejs`
- Create: `src/web/views/admin.ejs`
- Create: `src/public/css/theme.css`

- [ ] **Step 1: 提取现有 HTML 的 CSS 变量到 src/public/css/theme.css**

```css
:root {
  --bg: #0b0d12;
  --panel: #121621;
  --panel2: #171c29;
  --muted: #8d98aa;
  --text: #eef3ff;
  --line: #262d3c;
  --accent: #7c9cff;
  --accent2: #7ce7c5;
  --warn: #ffcf70;
  --danger: #ff7b8a;
  --p1: #7c9cff;
  --p2: #8b7cff;
  --p3: #4fc4b4;
  --p4: #ffb85c;
  --p5: #ff7b8a;
  --shadow: 0 14px 40px rgba(0, 0, 0, .28);
  --radius: 18px;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: radial-gradient(1100px 700px at 12% -10%, rgba(124, 156, 255, .14), transparent 60%), var(--bg);
  color: var(--text);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  line-height: 1.55;
}

/* ... 复用现有 HTML 中的所有 CSS 规则 ... */
```

- [ ] **Step 2: 创建 src/web/views/dashboard.ejs（从现有 HTML 的 dashboard 部分提取）**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Agent Coach - <%= student.name %> 的学习 Dashboard</title>
  <link rel="stylesheet" href="/static/css/theme.css">
</head>
<body>
<div class="app">
  <aside>
    <div class="brand">
      <div class="eyebrow">Agent Engineering</div>
      <h1>30 天实战训练营</h1>
      <p>教练：阿建</p>
    </div>
    <nav>
      <a href="#overview"><span class="navdot"></span>总览</a>
      <a href="#progress"><span class="navdot"></span>进度</a>
      <a href="#conversations"><span class="navdot"></span>教练对话</a>
    </nav>
    <div class="sidebox">
      <small>总完成度</small>
      <div class="progressTrack">
        <div class="progressFill" style="width:<%= summary.percentage %>%"></div>
      </div>
      <b><%= summary.percentage %>%</b><br>
      <small><%= summary.completed %> / <%= summary.total %> Todo</small>
    </div>
  </aside>
  <main>
    <section id="overview">
      <div class="hero">
        <div class="eyebrow"><%= student.name %> · 第 <%= currentDay %> 天</div>
        <h2>完成度 <span style="color:#9bb2ff"><%= summary.percentage %>%</span></h2>
        <p>开始日期：<%= student.start_date %> · 每日 <%= student.daily_hours %> 小时 · <%= student.channel %> 频道</p>
      </div>
    </section>

    <section id="progress">
      <div class="sectionTitle"><h2>30 天进度</h2></div>
      <div class="days">
        <% for (let d = 1; d <= 30; d++) {
          const dp = progress.find(p => p.day === d);
          const dayData = allDays.find(dd => dd.day === d);
          const allDone = dp && dp.read_done && dp.build_done && dp.eval_done && dp.note_done;
        %>
        <div class="day <%= allDone ? 'open' : '' %>">
          <div class="dayHeader">
            <div class="dayNum"><div><b>D<%= d %></b></div></div>
            <div class="dayTitle">
              <b><%= dayData ? dayData.title : 'Day ' + d %></b>
              <div>
                <% if (dp) { %>
                  读<%= dp.read_done ? '✅' : '⬜' %> 写<%= dp.build_done ? '✅' : '⬜' %> 测<%= dp.eval_done ? '✅' : '⬜' %> 记<%= dp.note_done ? '✅' : '⬜' %>
                <% } else { %>
                  未开始
                <% } %>
              </div>
            </div>
          </div>
        </div>
        <% } %>
      </div>
    </section>

    <section id="conversations">
      <div class="sectionTitle"><h2>最近对话</h2></div>
      <div class="sourceList">
        <% conversations.slice().reverse().forEach(c => { %>
        <div class="source">
          <span class="idx"><%= c.role === 'coach' ? '🤖' : '👤' %></span>
          <span><b><%= c.role === 'coach' ? '阿建' : '你' %></b><p><%= c.content.slice(0, 200) %></p></span>
          <span class="kind"><%= c.created_at %></span>
        </div>
        <% }) %>
      </div>
    </section>
  </main>
</div>
</body>
</html>
```

- [ ] **Step 3: 创建 src/web/views/admin.ejs**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Agent Coach - Admin</title>
  <link rel="stylesheet" href="/static/css/theme.css">
  <style>
    .student-row { display: grid; grid-template-columns: 1fr 80px 80px 100px; gap: 12px; align-items: center; padding: 12px; border-bottom: 1px solid var(--line); }
    .student-row.silent { background: rgba(255, 123, 138, 0.08); }
    .student-row a { color: var(--accent); font-weight: 600; }
  </style>
</head>
<body>
<div class="app">
  <aside>
    <div class="brand"><h1>Admin</h1><p>教练管理面板</p></div>
    <nav>
      <a href="/admin"><span class="navdot"></span>学生列表</a>
      <a href="/dashboard"><span class="navdot"></span>Dashboard</a>
    </nav>
  </aside>
  <main>
    <div class="hero">
      <h2>学生列表</h2>
      <p><%= students.length %> 个学生 · <%= students.filter(s => s.is_silent).length %> 个沉默中</p>
    </div>

    <div class="card">
      <h3>所有学生</h3>
      <% students.forEach(s => { %>
      <div class="student-row <%= s.is_silent ? 'silent' : '' %>">
        <span><a href="/admin/<%= s.id %>"><%= s.name %></a> <small><%= s.channel %></small></span>
        <span><%= s.progress_pct %>%</span>
        <span>Day <%= s.current_day %></span>
        <span><%= s.is_silent ? '⚠️ ' + s.days_since_last + '天' : '✅ 活跃' %></span>
      </div>
      <% }) %>
    </div>
  </main>
</div>
</body>
</html>
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: add dashboard and admin EJS views with theme CSS"
```

---

### Task 17: 整合入口

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: 更新 src/index.ts 整合所有模块**

```typescript
import { config } from './config';
import { getDb } from './store/db';
import { startScheduler } from './scheduler/scheduler';
import { router } from './channels/router';
import { TelegramAdapter } from './channels/telegram';
import { DiscordAdapter } from './channels/discord';
import { FeishuAdapter } from './channels/feishu';
import { startWebServer } from './web/server';

async function main() {
  console.log('[Agent Coach] Starting...');

  if (!config.anthropicApiKey) {
    console.error('[Agent Coach] ANTHROPIC_API_KEY is required');
    process.exit(1);
  }

  // 1. 初始化数据库
  const db = getDb();
  console.log('[Agent Coach] Database initialized');

  // 2. 注册频道适配器
  if (config.telegram.botToken) {
    router.register(new TelegramAdapter());
  }
  if (config.discord.botToken) {
    router.register(new DiscordAdapter());
  }
  if (config.feishu.appId) {
    router.register(new FeishuAdapter());
  }
  console.log('[Agent Coach] Channel adapters registered');

  // 3. 启动频道
  await router.startAll();

  // 4. 启动调度器（主动推送）
  startScheduler();

  // 5. 启动 Web Dashboard
  startWebServer();

  console.log('[Agent Coach] All systems ready');
}

main().catch((err) => {
  console.error('[Agent Coach] Fatal error:', err);
  process.exit(1);
});
```

- [ ] **Step 2: 验证整合**

```bash
npx tsx src/index.ts
# Expected: All modules start without errors
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: integrate all modules in entry point"
```

---

## 验收清单

- [ ] `npx tsx src/index.ts` 启动不报错
- [ ] SQLite 数据库自动创建，6 张表存在
- [ ] 课程数据可以加载
- [ ] 通过 Telegram Bot 可以注册学生并发消息
- [ ] 教练 Agent 能正确回复学生消息
- [ ] 调度器定时扫描沉默学生
- [ ] Web Dashboard 可以查看学生进度
- [ ] Admin 面板可以查看所有学生状态