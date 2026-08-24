"use client";
import Link from "next/link";
import { useState } from "react";

type UploadResult = { filename: string; ok: boolean; parts?: number; characters?: number; duplicates?: number; error?: string };
const accept = ".pdf,.jpg,.jpeg,.png,.webp,.svg,.gif,.bmp,.html,.htm,.xml,.xlsx,.xlsm,.xlsb,.xls,.et,.docx,.ods,.odt,.csv,.numbers,.txt,.md,.markdown";

export function KnowledgeUploader() {
  const [files, setFiles] = useState<File[]>([]); const [results, setResults] = useState<UploadResult[]>([]); const [uploading, setUploading] = useState(false);
  async function upload() {
    setUploading(true); setResults([]); const next: UploadResult[] = [];
    for (const file of files) {
      try { const form = new FormData(); form.set("file", file); const response = await fetch("/api/knowledge/upload", { method: "POST", body: form }); const data = await response.json(); next.push(response.ok ? { filename: file.name, ok: true, parts: data.parts, characters: data.characters, duplicates: data.duplicates } : { filename: file.name, ok: false, error: data.error ?? "上传失败" }); }
      catch { next.push({ filename: file.name, ok: false, error: "网络或转换服务暂不可用" }); }
      setResults([...next]);
    }
    setUploading(false);
  }
  return <main className="admin-shell upload-shell"><header className="admin-header"><div><Link href="/" className="back-link">← 返回学习页</Link><h1>提交知识资料</h1><p>上传后进入管理员待审核区；未经审核的内容不会参与 Coach 召回。</p></div><Link href="/admin/knowledge" className="secondary-button">管理员知识库</Link></header><section className="channel-card upload-card"><h2>选择文档</h2><p>支持 PDF、图片、Word、Excel、HTML/XML、CSV、OpenDocument、Numbers、Markdown 和 TXT。</p><label className="upload-drop"><input type="file" accept={accept} multiple disabled={uploading} onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 10))} /><strong>{files.length ? `已选择 ${files.length} 个文件` : "选择文件或拖入此区域"}</strong><span>单文件最大 20 MB，每次最多 10 个；超长文档自动拆分。</span></label><button className="primary-button" disabled={uploading || !files.length} onClick={upload}>{uploading ? "正在逐个转换…" : "上传并转换"}</button>{results.length > 0 && <div className="upload-results">{results.map((result) => <article key={result.filename} className={result.ok ? "success" : "failed"}><strong>{result.filename}</strong><span>{result.ok ? `已提取 ${result.characters?.toLocaleString()} 字符，生成 ${result.parts} 份草稿${result.duplicates ? `，跳过 ${result.duplicates} 份重复内容` : ""}` : result.error}</span></article>)}</div>}</section><aside className="security-note"><strong>内容安全</strong><span>上传资料只作为草稿保存。管理员必须检查来源、版权、敏感信息和正文质量，再批准向量化。</span></aside></main>;
}
