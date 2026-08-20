import { EvidenceForm } from "./EvidenceForm";
import { LearningState } from "./LearningState";
import { CoachChat } from "./CoachChat";
import { Quiz } from "./Quiz";
export default function Home(){return <main style={{padding:48,maxWidth:900}}><h1>阿建 · Agent Engineering 私教</h1><h2>今日任务：为搜索工具写出 Agent 接口契约</h2><p>目标：区分 API 参数与 Agent 可稳定使用的工具。</p><p>提交物：工具名称、description、JSON schema，以及 3 条失败返回示例。</p><h3>验收方式</h3><ul><li>名称是否指向单一动作</li><li>description 是否说明何时该用/不该用</li><li>错误信息是否给出下一步</li></ul><h3>提交学习证据</h3><EvidenceForm/><LearningState/><CoachChat/><Quiz/></main>}
