import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Archive,
  Brain,
  Check,
  FileText,
  RefreshCw,
  Search,
  Tag,
  UploadCloud
} from "lucide-react";
import { api } from "./api.js";
import { buildNote } from "./noteTemplate.js";
import "./styles.css";

function PaperList({ papers, selectedKey, onSelect, onImportPdf, importing }) {
  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState(false);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return papers;
    return papers.filter((paper) =>
      [paper.displayTitle || paper.title, paper.title, paper.authors, paper.venue, paper.year, paper.tags?.join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [papers, query]);

  function importFiles(fileList) {
    const file = Array.from(fileList || []).find((entry) =>
      entry.name.toLowerCase().endsWith(".pdf")
    );
    if (file) onImportPdf(file);
  }

  return (
    <aside className="sidebar">
      <label
        className={`dropZone ${dragging ? "dragging" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          importFiles(event.dataTransfer.files);
        }}
      >
        <UploadCloud size={22} />
        <span>{importing ? "正在导入 PDF..." : "拖入 PDF 到 Zotero 待读"}</span>
        <small>或点击选择文件</small>
        <input
          type="file"
          accept="application/pdf,.pdf"
          disabled={importing}
          onChange={(event) => {
            importFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </label>
      <div className="searchBox">
        <Search size={16} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索待读论文"
        />
      </div>
      <div className="paperCount">{filtered.length} 篇</div>
      <div className="paperList">
        {filtered.map((paper) => (
          <button
            key={paper.key}
            className={`paperItem ${selectedKey === paper.key ? "active" : ""}`}
            onClick={() => onSelect(paper)}
          >
            <span className="paperTitle">{paper.displayTitle || paper.title}</span>
            <span className="paperMeta">
              {paper.year} · {paper.venue || paper.authors || "No venue"}
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}

function TagList({ tags = [] }) {
  if (!tags.length) return <span className="muted">暂无标签</span>;
  return (
    <div className="tags">
      {tags.map((tag) => (
        <span key={tag} className="tag">
          {tag}
        </span>
      ))}
    </div>
  );
}

function App() {
  const [papers, setPapers] = useState([]);
  const [domains, setDomains] = useState([]);
  const [inbox, setInbox] = useState(null);
  const [selected, setSelected] = useState(null);
  const [domainKey, setDomainKey] = useState("");
  const [note, setNote] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [status, setStatus] = useState("正在连接后端...");
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  async function load() {
    setBusy(true);
    setResult(null);
    try {
      const payload = await api.papers();
      setPapers(payload.papers || []);
      setDomains(payload.domains || []);
      setInbox(payload.inbox || null);
      const first = payload.papers?.[0] || null;
      setSelected((current) => current || first);
      setStatus(payload.inbox ? "已连接 Zotero" : "未找到待读集合");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!selected) return;
    const domain = domains.find((entry) => entry.key === domainKey);
    setNote(buildNote(selected, domain?.name || ""));
    setSuggestions([]);
    setResult(null);
  }, [selected?.key]);

  useEffect(() => {
    if (!selected) return;
    const domain = domains.find((entry) => entry.key === domainKey);
    setNote((current) => {
      if (!current || current.includes('domain: ""')) {
        return buildNote(selected, domain?.name || "");
      }
      return current.replace(/^domain: ".*"$/m, `domain: "${domain?.name || ""}"`);
    });
  }, [domainKey]);

  async function suggestDomain() {
    if (!selected) return;
    setBusy(true);
    setResult(null);
    try {
      const payload = await api.suggestDomain(selected.key);
      setSuggestions(payload.suggestions || []);
    } catch (error) {
      setResult({ type: "error", message: error.message });
    } finally {
      setBusy(false);
    }
  }
  async function importPdf(file) {
    setImporting(true);
    setResult(null);
    try {
      const payload = await api.importPdf(file);
      setResult({
        type: "success",
        message: `已导入 Zotero：${payload.paper?.displayTitle || payload.paper?.title || file.name}`
      });
      const refreshed = await api.papers();
      setPapers(refreshed.papers || []);
      setDomains(refreshed.domains || []);
      setInbox(refreshed.inbox || null);
      const imported = refreshed.papers?.find((paper) => paper.key === payload.parentKey);
      if (imported) setSelected(imported);
    } catch (error) {
      setResult({ type: "error", message: error.message });
    } finally {
      setImporting(false);
    }
  }

  async function archivePaper() {
    if (!selected || !domainKey) return;
    const domain = domains.find((entry) => entry.key === domainKey);
    const ok = window.confirm(
      `确认归档？\n\n论文：${selected.title}\n领域：${domain.name}\n动作：保存 Markdown、复制 PDF（如可用）、更新 Zotero 集合和标签。`
    );
    if (!ok) return;

    setBusy(true);
    setResult(null);
    try {
      const payload = await api.archive({
        paperKey: selected.key,
        paperVersion: selected.version,
        inboxCollectionKey: inbox?.key,
        domain,
        noteBody: note
      });
      setResult({
        type: "success",
        message: `已归档。笔记：${payload.notePath}${
          payload.pdf?.copied ? `；PDF：${payload.pdf.targetPath}` : "；PDF 未复制"
        }`
      });
      setSelected(null);
      setDomainKey("");
      await load();
    } catch (error) {
      setResult({ type: "error", message: error.message });
    } finally {
      setBusy(false);
    }
  }

  const chosenDomain = domains.find((domain) => domain.key === domainKey);

  return (
    <main className="appShell">
      <header className="topbar">
        <div>
          <h1>Zotero Paper Archive</h1>
          <p>{status}</p>
        </div>
        <button className="iconButton" onClick={load} disabled={busy} title="刷新">
          <RefreshCw size={18} />
        </button>
      </header>

      <section className="workspace">
        <PaperList
          papers={papers}
          selectedKey={selected?.key}
          onSelect={setSelected}
          onImportPdf={importPdf}
          importing={importing}
        />

        <section className="detailPane">
          {!selected ? (
            <div className="emptyState">选择一篇论文开始整理</div>
          ) : (
            <>
              <div className="paperHeader">
                <div>
                  <h2>{selected.displayTitle || selected.title}</h2>
                  <p>
                    {selected.authors || "No authors"} · {selected.year}
                  </p>
                </div>
                <span className="keyBadge">{selected.key}</span>
              </div>

              <div className="infoGrid">
                <div>
                  <label>期刊 / 会议</label>
                  <span>{selected.venue || "未记录"}</span>
                </div>
                <div>
                  <label>DOI</label>
                  <span>{selected.doi || "未记录"}</span>
                </div>
                <div className="wide">
                  <label>
                    <Tag size={14} /> Zotero 标签
                  </label>
                  <TagList tags={selected.tags} />
                </div>
              </div>

              <div className="abstractBox">
                <label>摘要</label>
                <p>{selected.abstractNote || "Zotero 中暂无摘要。"}</p>
              </div>

              <div className="controls">
                <label className="domainSelect">
                  归档领域
                  <select
                    value={domainKey}
                    onChange={(event) => setDomainKey(event.target.value)}
                  >
                    <option value="">选择领域集合</option>
                    {domains.map((domain) => (
                      <option key={domain.key} value={domain.key}>
                        {domain.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button onClick={suggestDomain} disabled={busy || !domains.length}>
                  <Brain size={16} />
                  AI 建议领域
                </button>
              </div>

              {suggestions.length > 0 && (
                <div className="suggestions">
                  {suggestions.map((suggestion) => (
                    <button
                      key={`${suggestion.domain}-${suggestion.confidence}`}
                      onClick={() => {
                        const match = domains.find(
                          (domain) => domain.name === suggestion.domain
                        );
                        if (match) setDomainKey(match.key);
                      }}
                    >
                      <Brain size={14} />
                      {suggestion.domain} · {Math.round(
                        Number(suggestion.confidence || 0) * 100
                      )}
                      %
                    </button>
                  ))}
                </div>
              )}

              <div className="notePanel">
                <div className="noteTitle">
                  <FileText size={16} />
                  <span>Markdown 精读笔记</span>
                </div>
                <textarea value={note} onChange={(event) => setNote(event.target.value)} />
              </div>

              <div className="archivePreview">
                <div>
                  <strong>归档预览</strong>
                  <p>
                    {chosenDomain
                      ? `将保存到 data/notes/${chosenDomain.name}/ 并写入 Zotero 标签 read、${chosenDomain.name}`
                      : "先选择领域集合。"}
                  </p>
                </div>
                <button
                  className="primary"
                  onClick={archivePaper}
                  disabled={busy || !domainKey}
                >
                  <Archive size={16} />
                  确认归档
                </button>
              </div>

              {result && (
                <div className={`result ${result.type}`}>
                  {result.type === "success" ? <Check size={16} /> : null}
                  {result.message}
                </div>
              )}
            </>
          )}
        </section>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);




