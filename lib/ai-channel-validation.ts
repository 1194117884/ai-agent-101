export type ChannelInput = {
  id?: string;
  slug: string;
  displayName: string;
  protocol: "anthropic" | "openai-compatible";
  baseUrl: string;
  model: string;
  priority: number;
  enabled: boolean;
  keys: { id?: string; label: string; value?: string; enabled: boolean }[];
};

export class ChannelValidationError extends Error {}

export function validateAIChannels(inputs: ChannelInput[]) {
  const supported = new Set(["anthropic", "openai", "deepseek", "openrouter"]);
  if (inputs.length > supported.size) throw new ChannelValidationError("渠道数量超出支持范围。");
  const slugs = inputs.map((input) => input.slug.trim().toLowerCase());
  if (new Set(slugs).size !== inputs.length) throw new ChannelValidationError("渠道不能重复。");
  const keyIds = inputs.flatMap((input) => input.keys.flatMap((key) => key.id ? [key.id] : []));
  if (new Set(keyIds).size !== keyIds.length) throw new ChannelValidationError("同一个 Key 不能配置到多个位置。");

  for (const [index, input] of inputs.entries()) {
    const slug = slugs[index];
    if (!supported.has(slug)) throw new ChannelValidationError(`暂不支持渠道 ${input.slug}。`);
    if ((slug === "anthropic") !== (input.protocol === "anthropic")) throw new ChannelValidationError("渠道协议与渠道类型不匹配。");
    if (!input.displayName.trim() || !input.model.trim()) throw new ChannelValidationError("显示名称和模型不能为空。");
    if (!Number.isFinite(input.priority) || input.priority < 0) throw new ChannelValidationError("渠道优先级必须是大于或等于 0 的数字。");
    if (input.keys.length > 20) throw new ChannelValidationError("每个渠道最多配置 20 个 Key。");
    let url: URL;
    try { url = new URL(input.baseUrl); }
    catch { throw new ChannelValidationError("API 地址格式不正确。"); }
    if (url.protocol !== "https:" || url.username || url.password) throw new ChannelValidationError("API 地址必须是无账号信息的 HTTPS 地址。");
    for (const key of input.keys) {
      if (!key.label.trim()) throw new ChannelValidationError("Key 标签不能为空。");
      if (!key.id && !key.value?.trim()) throw new ChannelValidationError("新增 Key 时必须填写 API Key。");
    }
  }
}
