import { env } from "cloudflare:workers";

export const KNOWLEDGE_VECTOR_DIMENSIONS = 1024;
export const FREE_VECTOR_DIMENSIONS = 5_000_000;
export const FREE_VECTOR_CAPACITY = Math.floor(FREE_VECTOR_DIMENSIONS / KNOWLEDGE_VECTOR_DIMENSIONS);

export type KnowledgeVector = {
  id: string;
  values: number[];
  documentId: string;
  ordinal: number;
};

export interface KnowledgeVectorProvider {
  readonly name: string;
  embed(texts: string[]): Promise<number[][]>;
  query(text: string, topK: number): Promise<Map<string, number>>;
  upsert(vectors: KnowledgeVector[]): Promise<void>;
  delete(ids: string[]): Promise<void>;
}

class CloudflareKnowledgeVectorProvider implements KnowledgeVectorProvider {
  readonly name = "cloudflare";

  private async embeddings(texts: string[]) {
    const model = env.KNOWLEDGE_EMBEDDING_MODEL ?? "@cf/baai/bge-m3";
    const result = await env.AI.run(model, { text: texts, truncate_inputs: true }) as { data?: number[][] };
    if (!result.data || result.data.length !== texts.length) throw new Error("Embedding 返回数量与输入不一致。");
    return result.data;
  }

  embed(texts: string[]) { return this.embeddings(texts); }

  async query(text: string, topK: number) {
    const [embedding] = await this.embeddings([text]);
    const result = await env.VECTORIZE.query(embedding, { topK, namespace: "knowledge" });
    return new Map(result.matches.map((match) => [match.id, match.score]));
  }

  async upsert(vectors: KnowledgeVector[]) {
    await env.VECTORIZE.upsert(vectors.map((vector) => ({
      id: vector.id,
      values: vector.values,
      namespace: "knowledge",
      metadata: { documentId: vector.documentId, ordinal: vector.ordinal, status: "approved" },
    })));
  }

  async delete(ids: string[]) {
    if (ids.length) await env.VECTORIZE.deleteByIds(ids);
  }
}

export function getKnowledgeVectorProvider(): KnowledgeVectorProvider {
  const provider = env.KNOWLEDGE_VECTOR_PROVIDER ?? "cloudflare";
  if (provider === "cloudflare") return new CloudflareKnowledgeVectorProvider();
  throw new Error(`暂不支持向量服务：${provider}`);
}
