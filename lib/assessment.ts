export const TOOL_QUESTION="一个 Agent 需要查询订单状态。请用不超过 120 字说明：工具 description、schema 和失败返回各自应解决什么问题。";
export const TOOL_RUBRIC=["区分 description 的工具选择作用","说明 schema 约束参数","说明失败返回支持恢复/下一步"];
export function grade(answer:string){const checks=[/选择|何时|调用/.test(answer),/schema|参数|字段|json/i.test(answer),/错误|失败|恢复|下一步/.test(answer)];const score=Math.round(checks.filter(Boolean).length/3*100);const missing=TOOL_RUBRIC.filter((_,i)=>!checks[i]);return {score,feedback:missing.length?`还需要说明：${missing.join("；")}。`:"三项都覆盖。你已能解释工具契约的基本分工。"};}
