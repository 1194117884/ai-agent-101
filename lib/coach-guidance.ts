export type CoachIssueType = "concept" | "prerequisite" | "implementation" | "debugging" | "scope";
export type CoachGuidance = { issueType: CoachIssueType; label: string; teachingMode: "question" | "hint" | "example"; instruction: string };

export function classifyCoachQuestion(message: string): CoachGuidance {
  const text = message.trim().toLowerCase();
  if (/报错|错误|失败|异常|bug|不工作|没反应|日志|trace|timeout|超时|404|500/.test(text)) return { issueType: "debugging", label: "调试定位", teachingMode: "hint", instruction: "先定位第一个异常信号，要求学生提供可复现步骤或关键日志；只给一个验证假设的实验。" };
  if (/从零|完整|全部|系统学习|怎么学|学习路线|整个|所有|一整套|全面/.test(text) || text.length > 600) return { issueType: "scope", label: "范围过大", teachingMode: "question", instruction: "先把目标缩成 20–40 分钟可完成的一步，并用一个问题确认学生当前最想解决的结果。" };
  if (/前置|基础不够|没学过|看不懂|跟不上|需要先学|从哪里开始/.test(text)) return { issueType: "prerequisite", label: "前置缺失", teachingMode: "example", instruction: "指出缺失的最小前置能力，用一个短例子补齐，然后要求学生做一次类比。" };
  if (/怎么实现|如何实现|怎么写|代码|部署|接入|配置|架构|设计一个|实现/.test(text)) return { issueType: "implementation", label: "实现路径", teachingMode: "hint", instruction: "给出最小实现顺序和一个可验证产出，不要一次展开完整工程。" };
  return { issueType: "concept", label: "概念不清", teachingMode: "question", instruction: "先用一句话澄清边界，再提出一个区分概念的具体问题；除非学生仍不理解，否则不要直接给完整答案。" };
}
