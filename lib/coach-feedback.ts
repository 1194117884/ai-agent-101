export type FeedbackConversation = { role: string; content: string; metadataJson: string | null };
export type UnresolvedCoachFeedback = { reason: string; answerSummary: string };

const reasonLabels: Record<string, string> = { inaccurate: "内容不准确", misunderstood: "没理解问题", unactionable: "步骤不可执行", irrelevant_source: "资料不相关" };

export function unresolvedCoachFeedback(conversationsNewestFirst: FeedbackConversation[], limit = 3): UnresolvedCoachFeedback[] {
  const unresolved: UnresolvedCoachFeedback[] = [];
  for (const item of conversationsNewestFirst) {
    if (item.role !== "coach") continue;
    let feedback: { rating?: string; reason?: string } | undefined;
    try { feedback = (JSON.parse(item.metadataJson ?? "{}") as { userFeedback?: typeof feedback }).userFeedback; }
    catch { continue; }
    if (feedback?.rating === "helpful") break;
    if (feedback?.rating === "unhelpful") unresolved.push({ reason: reasonLabels[feedback.reason ?? ""] ?? "未说明", answerSummary: item.content });
    if (unresolved.length >= limit) break;
  }
  return unresolved;
}
