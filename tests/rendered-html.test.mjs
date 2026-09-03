import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("build contains the authenticated learning shell and Google login gate", async () => {
  const [page, login, auth] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/Login.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/auth.ts", import.meta.url), "utf8"),
    access(new URL("../dist/server/index.js", import.meta.url)),
  ]);
  assert.match(page, /getCloudflareUser/);
  assert.match(page, /return <Login/);
  assert.match(page, /先完成眼前这一小步/);
  assert.match(page, /看今日任务/);
  assert.match(page, /提交你的答案/);
  assert.match(page, /获得下一步/);
  assert.match(page, /课程地图/);
  assert.match(page, /运行记录/);
  const curriculumPage = await readFile(new URL("../app/curriculum/page.tsx", import.meta.url), "utf8");
  const curriculumMap = await readFile(new URL("../app/curriculum/CurriculumMap.tsx", import.meta.url), "utf8");
  assert.match(curriculumPage, /30 天课程地图/);
  assert.match(curriculumMap, /当前任务/);
  assert.match(curriculumMap, /已掌握/);
  const runMonitor = await readFile(new URL("../app/admin/runs/RunMonitor.tsx", import.meta.url), "utf8");
  assert.match(runMonitor, /渠道尝试/);
  assert.match(runMonitor, /工具调用/);
  assert.match(runMonitor, /知识召回/);
  assert.match(runMonitor, /没解决/);
  assert.match(runMonitor, /用户反馈/);
  assert.match(runMonitor, /回答渠道/);
  const coachChat = await readFile(new URL("../app/CoachChat.tsx", import.meta.url), "utf8");
  assert.match(coachChat, /这次回答解决问题了吗/);
  assert.match(coachChat, /步骤不可执行/);
  await access(new URL("../app/api/coach/feedback/route.ts", import.meta.url));
  assert.match(login, /继续你的 Agent 训练/);
  assert.match(login, /accounts\.google\.com\/gsi\/client/);
  assert.match(auth, /agent_session/);
  assert.match(auth, /\/login\?returnTo=/);
  assert.doesNotMatch(auth, /cdn-cgi\/access\/login/);
});
