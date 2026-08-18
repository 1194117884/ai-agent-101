# Agent Coach: 主动式 Agent 学习教练系统

## 概述

将 30 天 Agent Engineering 训练营课程变成一个**主动式 AI 教练系统**。Agent 不是等着学生来问，而是主动推送、主动检查、主动拉回。

**核心洞察：** 自驱力差的本质是行为设计问题。静态内容（无论多精美）解决不了行为设计问题。只有主动触达 + 即时反馈 + 温和问责才能降低放弃率。

## 架构

```
┌──────────────────────────────────────────────────────────┐
│                    Web Dashboard                          │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│   │ Student View │  │ Admin View   │  │ 复用现有      │  │
│   │ 进度/笔记/eval│  │ 所有人状态    │  │ HTML CSS     │  │
│   └──────┬───────┘  └──────┬───────┘  └──────────────┘  │
│          │                 │                              │
│          └────────┬────────┘                              │
│                   │  REST API                             │
│          ┌────────┴────────┐                              │
│          │   API Server    │                              │
│          │   (Express)     │                              │
│          └────────┬────────┘                              │
└───────────────────┼──────────────────────────────────────┘
                    │
┌───────────────────┼──────────────────────────────────────┐
│          ┌────────┴────────┐                              │
│          │   Coach Core    │                              │
│          │                 │                              │
│          │ ┌─────────────┐ │   ┌──────────────────────┐  │
│          │ │ Coach Agent │ │   │   Scheduler          │  │
│          │ │ (Anthropic) │◄┼───┤   (node-cron)        │  │
│          │ └──────┬──────┘ │   │   - 每日提醒          │  │
│          │        │        │   │   - 3日沉默检测       │  │
│          │ ┌──────┴──────┐ │   │   - 阶段总结          │  │
│          │ │   Tools     │ │   │   - 周报生成          │  │
│          │ │ - 查进度    │ │   └──────────────────────┘  │
│          │ │ - 跑Eval    │ │                              │
│          │ │ - 查课程    │ │   ┌──────────────────────┐  │
│          │ │ - 发消息    │ │   │   State Store        │  │
│          │ └─────────────┘ │   │   (SQLite)           │  │
│          └────────┬────────┘   └──────────────────────┘  │
│                   │                                       │
│          ┌────────┴────────┐                              │
│          │ Channel Router  │                              │
│          └────────┬────────┘                              │
│       ┌───────────┼───────────┐                           │
│  ┌────┴────┐ ┌────┴────┐ ┌───┴────┐                      │
│  │ Feishu  │ │Telegram │ │Discord │                      │
│  │ Adapter │ │ Adapter │ │Adapter │                      │
│  └─────────┘ └─────────┘ └────────┘                      │
└──────────────────────────────────────────────────────────┘
```

### 关键决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 运行时 | Node.js + TypeScript | 全栈统一，三个频道 SDK 一等公民 |
| Agent SDK | Anthropic SDK (tool use) | 课程本身教这个，吃自己的狗粮 |
| 数据存储 | SQLite (better-sqlite3) | 零配置，单文件，够用到几百人 |
| Web 框架 | Express | 轻量，够用 |
| 前端 | 复用现有 HTML CSS 设计系统 | 已有完整 dark theme、组件样式 |
| 调度 | node-cron（进程内） | MVP 不需要 Redis |
| 部署 | 单进程 | 简单，后期可拆 |

---

## Coach Agent 设计

### 人格设定

```
你是一个 Agent Engineering 教练，名字叫"阿建"。
你的目标不是"把课讲完"，而是"让学生不放弃"。

你的风格：
- 直接、务实，不废话，不鸡汤
- 像健身房教练：推你一把，但不羞辱你
- 学生说"不会"时，不给答案，给一个更小的子问题
- 学生做得好时，具体指出哪里好，不说"太棒了"这种空话
```

### 主动行为矩阵

教练自己决定什么时候做什么，不是死板的 cron 脚本：

| 触发条件 | 行为 | 优先级 |
|----------|------|--------|
| 学生 3 天没任何活动 | 发消息：「嘿，3 天没见了。今天不一定要学，就告诉我你还在就行。」 | 高 |
| 学生 7 天没活动 | 发消息：「是不是卡在哪了？还是单纯不想学？诚实说，我帮你调。」 | 高 |
| 学生连续 2 天完成所有任务 | 发消息：「连续两天干完了，节奏不错。明天要不要挑战一下加量？」 | 中 |
| 学生 eval 结果明显下降 | 发消息：「这次工具选择率掉了 15%，我看了下，主要是 search 工具描述太模糊。要不要花 10 分钟改一下？」 | 高 |
| 学生完成一个阶段 | 发总结：「Phase 1 完成了。你现在能：①写 Agent Loop ②设计 Tool ③跑 Trace。薄弱点是 ___。」 | 中 |
| 学生卡在同一任务超过 2 天 | 主动介入：「这个任务你卡了两天了，要不要我帮你拆成 3 个小步骤？」 | 高 |
| 每天固定时间（学生设定） | 发今日任务：「Day 8 今天的目标：MCP 解耦。先读 15 分钟，再写 45 分钟代码。现在开始？」 | 中 |
| 周一早上 | 发周计划：「本周目标：完成 Phase 2，重点是 Context Engineering。」 | 低 |

### 教练工具

```
tools:
  get_student_progress(studentId)    → 查进度、完成率、薄弱点
  get_day_curriculum(day)            → 查当天课程内容
  run_eval(studentId, day)           → 跑验收脚本，返回结果
  get_student_history(studentId)     → 查最近对话和活动
  send_message(channel, studentId, content) → 通过频道发消息
  suggest_next_action(studentId)     → 基于状态推荐下一步
  check_silent_students()            → 扫描所有沉默学生
  log_coaching_event(studentId, event) → 记录教练行为
```

### 决策流程

```
触发器触发（cron / 学生消息 / eval 结果）
    │
    ▼
┌──────────────────┐
│ 1. 读取学生状态   │  ← get_student_progress + history
└────────┬─────────┘
         ▼
┌──────────────────┐
│ 2. 判断优先级     │  ← 有紧急问题（卡住/想放弃）> 例行提醒
└────────┬─────────┘
         ▼
┌──────────────────┐
│ 3. 决定行动       │  ← 推？拉？教？鼓励？跳过？
└────────┬─────────┘
         ▼
┌──────────────────┐
│ 4. 生成消息       │  ← 教练风格的个性化消息
└────────┬─────────┘
         ▼
┌──────────────────┐
│ 5. 发送 + 记录    │  ← send_message + log_coaching_event
└──────────────────┘
```

---

## 数据模型

### SQLite 表结构

```sql
-- 学生
CREATE TABLE students (
  id            TEXT PRIMARY KEY,  -- uuid
  name          TEXT NOT NULL,
  channel       TEXT NOT NULL,     -- 'feishu' | 'telegram' | 'discord'
  channel_id    TEXT NOT NULL,     -- 频道内的用户 ID
  timezone      TEXT DEFAULT 'Asia/Shanghai',
  daily_hours   INTEGER DEFAULT 4, -- 每日投入小时
  start_date    TEXT NOT NULL,     -- 开始日期
  reminder_time TEXT DEFAULT '09:00', -- 每日提醒时间
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);

-- 每日进度
CREATE TABLE daily_progress (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id    TEXT NOT NULL REFERENCES students(id),
  day           INTEGER NOT NULL,  -- 1-30
  read_done     INTEGER DEFAULT 0, -- 0/1
  build_done    INTEGER DEFAULT 0,
  eval_done     INTEGER DEFAULT 0,
  note_done     INTEGER DEFAULT 0,
  notes         TEXT,              -- 学生笔记
  completed_at  TEXT,
  UNIQUE(student_id, day)
);

-- 教练对话历史
CREATE TABLE conversations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id    TEXT NOT NULL REFERENCES students(id),
  role          TEXT NOT NULL,     -- 'student' | 'coach' | 'system'
  content       TEXT NOT NULL,
  channel       TEXT NOT NULL,
  created_at    TEXT DEFAULT (datetime('now'))
);

-- 教练事件日志
CREATE TABLE coaching_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id    TEXT NOT NULL REFERENCES students(id),
  event_type    TEXT NOT NULL,     -- 'nudge' | 'daily_reminder' | 'eval_feedback' | 'phase_summary' | 'weekly_plan' | 'check_in'
  trigger       TEXT NOT NULL,     -- 'cron' | 'student_message' | 'eval_result' | 'manual'
  content       TEXT NOT NULL,
  created_at    TEXT DEFAULT (datetime('now'))
);

-- Eval 运行记录
CREATE TABLE eval_runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id    TEXT NOT NULL REFERENCES students(id),
  day           INTEGER NOT NULL,
  case_count    INTEGER NOT NULL,
  pass_count    INTEGER NOT NULL,
  score         REAL NOT NULL,     -- 0.0 - 1.0
  details       TEXT,              -- JSON: per-case results
  created_at    TEXT DEFAULT (datetime('now'))
);

-- 学生活跃日志
CREATE TABLE activity_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id    TEXT NOT NULL REFERENCES students(id),
  activity_type TEXT NOT NULL,     -- 'message' | 'task_complete' | 'eval_run' | 'login'
  detail        TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);
```

---

## 频道抽象层

### 统一消息格式

```typescript
interface UnifiedMessage {
  // 方向：student → coach 或 coach → student
  direction: 'inbound' | 'outbound';

  // 内容
  content: string;
  contentType: 'text' | 'markdown' | 'card';

  // 身份
  studentId: string;
  channel: 'feishu' | 'telegram' | 'discord';
  channelMessageId?: string; // 频道原始消息 ID

  // 元数据
  timestamp: Date;
  replyTo?: string; // 回复哪条消息
}
```

### Channel Adapter 接口

```typescript
interface ChannelAdapter {
  readonly channel: 'feishu' | 'telegram' | 'discord';

  // 生命周期
  start(): Promise<void>;
  stop(): Promise<void>;

  // 接收消息 → 统一格式
  onMessage(handler: (msg: UnifiedMessage) => Promise<void>): void;

  // 发送消息 ← 统一格式
  sendMessage(msg: UnifiedMessage): Promise<string>; // 返回频道消息 ID

  // 健康检查
  healthCheck(): Promise<boolean>;
}
```

每个 Adapter 负责：
- 频道特有的消息格式转换（Feishu card → 纯文本、Telegram markdown → 纯文本等）
- 频道特有的交互（Feishu 按钮回调、Telegram inline keyboard 等）
- Webhook 注册和消息路由

---

## 主动调度器

```
┌─────────────────────────────────────────┐
│              Scheduler                    │
│                                           │
│  ┌─────────────┐  ┌──────────────────┐   │
│  │ 每 10 分钟   │  │ check_silent()   │   │
│  │ 扫描一轮     │  │ 扫描 >3天 无活动  │   │
│  └─────────────┘  └────────┬─────────┘   │
│                            │              │
│  ┌─────────────┐  ┌───────┴──────────┐   │
│  │ 每天 09:00  │  │ trigger_coach()  │   │
│  │ 发每日提醒   │  │ 调用教练 Agent   │   │
│  └─────────────┘  └────────┬─────────┘   │
│                            │              │
│  ┌─────────────┐  ┌───────┴──────────┐   │
│  │ 每周一 09:00│  │ 生成消息          │   │
│  │ 发周计划     │  │ → Channel Router │   │
│  └─────────────┘  └──────────────────┘   │
│                                           │
│  ┌─────────────┐                          │
│  │ 学生发消息   │──→ trigger_coach()      │
│  └─────────────┘                          │
└─────────────────────────────────────────┘
```

核心原则：**Scheduler 只负责"什么时候触发"，Coach Agent 负责"触发后做什么"。** Scheduler 不做内容决策，它只是闹钟。

---

## Web Dashboard

### 学生视图
- 30 天进度总览（复用现有 HTML 的 progress bar + 每日卡片）
- 当前阶段和日期
- Eval 结果趋势图
- 教练对话记录
- 笔记编辑

### 管理视图
- 所有学生列表，按活跃度排序
- 沉默学生高亮（>3 天无活动）
- 整体完成率统计
- 可手动触发教练干预

### 技术方案
- Express 提供 REST API
- 前端复用现有 HTML 的 CSS 变量系统（`:root` 中的暗色主题）
- 不引入 React/Vue，保持简单：服务端渲染 HTML + 少量 vanilla JS
- 或使用轻量 EJS 模板

---

## 项目结构

```
agent-coach/
├── package.json
├── tsconfig.json
├── .env.example                  # ANTHROPIC_API_KEY, FEISHU_*, TELEGRAM_*, DISCORD_*
│
├── src/
│   ├── index.ts                  # 入口：启动所有服务
│   │
│   ├── coach/
│   │   ├── coach-agent.ts        # 教练 Agent（系统 prompt + Anthropic SDK）
│   │   ├── coach-tools.ts        # Agent 工具实现
│   │   ├── coach-prompt.ts       # 教练系统 prompt（可维护的文本）
│   │   └── triggers.ts           # 触发器逻辑：什么情况触发什么教练行为
│   │
│   ├── scheduler/
│   │   ├── scheduler.ts          # node-cron 调度器
│   │   └── jobs.ts               # 具体 job 定义
│   │
│   ├── channels/
│   │   ├── types.ts              # UnifiedMessage, ChannelAdapter 接口
│   │   ├── router.ts             # 消息路由：inbound → coach, outbound → adapter
│   │   ├── feishu.ts             # 飞书 Adapter
│   │   ├── telegram.ts           # Telegram Adapter
│   │   └── discord.ts            # Discord Adapter
│   │
│   ├── store/
│   │   ├── db.ts                 # SQLite 连接和初始化
│   │   ├── students.ts           # 学生 CRUD
│   │   ├── progress.ts           # 进度 CRUD
│   │   ├── conversations.ts      # 对话记录
│   │   └── events.ts             # 教练事件日志
│   │
│   ├── curriculum/
│   │   ├── loader.ts             # 课程加载器
│   │   ├── days/                 # 30 天课程 Markdown
│   │   │   ├── 01-mental-model.md
│   │   │   ├── 02-agent-loop.md
│   │   │   └── ...
│   │   ├── topics.ts             # 18 个知识点定义
│   │   └── sources.ts            # 22 个资料源
│   │
│   ├── evals/
│   │   ├── runner.ts             # Eval 执行器
│   │   └── suites/               # 各天的 eval 套件
│   │       ├── day-04-tool-selection.ts
│   │       └── ...
│   │
│   ├── web/
│   │   ├── server.ts             # Express 服务
│   │   ├── routes/
│   │   │   ├── api.ts            # REST API
│   │   │   ├── dashboard.ts      # 学生 dashboard 页面
│   │   │   └── admin.ts          # 管理页面
│   │   └── views/                # EJS 模板
│   │       ├── dashboard.ejs
│   │       └── admin.ejs
│   │
│   └── public/
│       └── css/
│           └── theme.css         # 从现有 HTML 提取的 CSS 变量
│
├── data/                         # SQLite 数据库文件（gitignored）
│   └── coach.db
│
└── docs/
    └── superpowers/
        └── specs/
            └── 2026-08-16-agent-coach-design.md
```

---

## 维护流程

### 课程内容维护
- 每个 day 是独立的 `curriculum/days/XX-title.md`，修改某一天不影响其他
- 知识点定义在 `curriculum/topics.ts`，更新权重/优先级即可
- 资料源在 `curriculum/sources.ts`，新增/移除资料源

### 教练行为维护
- 教练 prompt 在 `coach/coach-prompt.ts`，独立的文本字符串，方便调整
- 触发器规则在 `coach/triggers.ts`，每个触发条件是一个函数
- 新增触发行为：加一个 trigger 函数 + 在 scheduler 注册

### 频道维护
- 新增频道：实现 `ChannelAdapter` 接口，在 `router.ts` 注册
- 现有频道不受影响

### 教练效果评估
- `coaching_events` 表记录所有教练行为
- 可分析：哪种干预最有效？哪种消息学生最常回复？
- 基于数据迭代教练 prompt 和触发规则