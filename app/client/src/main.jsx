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

function PaperList({
  papers,
  domains,
  selectedKey,
  onSelect,
  onImportPdf,
  importing,
  scopeValue,
  scopeLabel,
  onScopeChange
}) {
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
      <label className="scopeSelect">
        <span>{"\u8bba\u6587\u8303\u56f4"}</span>
        <select value={scopeValue} onChange={(event) => onScopeChange(event.target.value)}>
          <option value="inbox">{"\u5f85\u8bfb\u8bba\u6587"}</option>
          {domains.map((domain) => (
            <option key={domain.key} value={domain.key}>
              {domain.name}
            </option>
          ))}
        </select>
      </label>
      <div className="searchBox">
        <Search size={16} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={
            scopeValue === "inbox"
              ? "\u641c\u7d22\u5f85\u8bfb\u8bba\u6587"
              : "\u641c\u7d22\u8be5\u9886\u57df\u8bba\u6587"
          }
        />
      </div>
      <div className="paperCount">
        {scopeLabel}{" \u00b7 "}{filtered.length}{" \u7bc7"}
      </div>
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
  const [paperScope, setPaperScope] = useState("inbox");
  const [selected, setSelected] = useState(null);
  const [domainKey, setDomainKey] = useState("");
  const [note, setNote] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [status, setStatus] = useState("正在连接后端...");
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [savedNotePath, setSavedNotePath] = useState("");
  const [openingNote, setOpeningNote] = useState(false);

  async function load({ scopeValue = paperScope, keepResult = false } = {}) {
    setBusy(true);
    if (!keepResult) setResult(null);
    try {
      const domainKeyForQuery = scopeValue === "inbox" ? "" : scopeValue;
      const payload = await api.papers({ domainKey: domainKeyForQuery });
      const nextPapers = payload.papers || [];
      setPapers(nextPapers);
      setDomains(payload.domains || []);
      setInbox(payload.inbox || null);
      setSelected((current) => {
        if (!nextPapers.length) return null;
        if (!current) return nextPapers[0];
        return nextPapers.find((paper) => paper.key === current.key) || nextPapers[0];
      });
      setStatus(
        payload.view?.type === "domain"
          ? `\u6b63\u5728\u67e5\u770b\u9886\u57df\uff1a${payload.view.domain.name}`
          : payload.inbox
            ? "\u5df2\u8fde\u63a5 Zotero"
            : "\u672a\u627e\u5230\u5f85\u8bfb\u96c6\u5408"
      );
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load({ scopeValue: "inbox" });
  }, []);

  function selectPaper(paper) {
    setSelected(paper);
    setResult(null);
    setSavedNotePath(paper?.notePath || "");
  }

  function changePaperScope(nextScope) {
    setPaperScope(nextScope);
    if (nextScope !== "inbox") setDomainKey(nextScope);
    load({ scopeValue: nextScope });
  }

  useEffect(() => {
    if (!selected) {
      setNote("");
      setSavedNotePath("");
      return;
    }
    const selectedDomainName =
      selected.archivedDomainName ||
      domains.find((entry) => entry.key === domainKey)?.name ||
      domains.find((entry) => entry.key === paperScope)?.name ||
      "";
    setNote(buildNote(selected, selectedDomainName));
    setSuggestions([]);
    setSavedNotePath(selected.notePath || "");
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
  async function analyzePaper() {
    if (!selected) return;
    setAnalyzing(true);
    setResult(null);
    try {
      const payload = await api.analyzePaper(selected.key);
      setNote(payload.markdown || "");
      const warnings = payload.warnings?.length
        ? `\uff1b\u8b66\u544a\uff1a${payload.warnings.join("\uff1b")}`
        : "";
      const assetText = payload.assets?.length
        ? `\uff1b\u56fe\u8868\u7d20\u6750\uff1a${payload.assets.length} \u4e2a`
        : "";
      setResult({
        type: "success",
        message: `\u5df2\u751f\u6210 ECG-depression \u5168\u6587\u5f52\u7eb3${assetText}${warnings}`
      });
    } catch (error) {
      setResult({ type: "error", message: error.message });
    } finally {
      setAnalyzing(false);
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
      setPaperScope("inbox");
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

  async function openSavedNote() {
    if (!savedNotePath) return;
    setOpeningNote(true);
    try {
      await api.openNote(savedNotePath);
      setResult({ type: "success", message: `\u5df2\u5728 VSCode \u4e2d\u6253\u5f00\uff1a${savedNotePath}` });
    } catch (error) {
      setResult({ type: "error", message: error.message });
    } finally {
      setOpeningNote(false);
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
      const message = `\u5df2\u5f52\u6863\u3002\u7b14\u8bb0\uff1a${payload.notePath}${
        payload.pdf?.copied ? `\uff1bPDF\uff1a${payload.pdf.targetPath}` : "\uff1bPDF \u672a\u590d\u5236"
      }`;
      const archivedPaper = {
        ...(payload.paper || selected),
        notePath: payload.notePath || "",
        archivedDomainName: domain.name
      };
      setDomainKey(domain.key);
      setPaperScope(domain.key);
      await load({ scopeValue: domain.key, keepResult: true });
      setSelected((current) =>
        current?.key === archivedPaper.key ? { ...current, ...archivedPaper } : archivedPaper
      );
      setSavedNotePath(payload.notePath || "");
      setResult({ type: "success", message });
    } catch (error) {
      setResult({ type: "error", message: error.message });
    } finally {
      setBusy(false);
    }
  }

  const chosenDomain = domains.find((domain) => domain.key === domainKey);
  const scopeDomain = domains.find((domain) => domain.key === paperScope);
  const paperScopeLabel =
    paperScope === "inbox" ? "\u5f85\u8bfb\u8bba\u6587" : scopeDomain?.name || "\u9886\u57df\u8bba\u6587";

  return (
    <main className="appShell">
      <header className="topbar">
        <div>
          <h1>Zotero Paper Archive</h1>
          <p>{status}</p>
        </div>
        <button
          className="iconButton"
          onClick={() => load({ scopeValue: paperScope })}
          disabled={busy}
          title={"\u5237\u65b0"}
        >
          <RefreshCw size={18} />
        </button>
      </header>

      <section className="workspace">
        <PaperList
          papers={papers}
          domains={domains}
          selectedKey={selected?.key}
          onSelect={selectPaper}
          onImportPdf={importPdf}
          importing={importing}
          scopeValue={paperScope}
          scopeLabel={paperScopeLabel}
          onScopeChange={changePaperScope}
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
                <button onClick={analyzePaper} disabled={busy || analyzing}>
                  <Brain size={16} />
                  {analyzing ? "\u6b63\u5728\u5f52\u7eb3\u5168\u6587..." : "AI \u5f52\u7eb3\u5168\u6587"}
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
                  <div className="noteTitleLabel">
                    <FileText size={16} />
                    <span>Markdown {"\u7cbe\u8bfb\u7b14\u8bb0"}</span>
                  </div>
                  {savedNotePath && (
                    <button className="noteOpenButton" onClick={openSavedNote} disabled={openingNote}>
                      <FileText size={16} />
                      {openingNote ? "\u6b63\u5728\u6253\u5f00..." : "\u5728 VSCode \u91cc\u6253\u5f00"}
                    </button>
                  )}
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
                  <div className="resultText">
                    {result.type === "success" ? <Check size={16} /> : null}
                    <span>{result.message}</span>
                  </div>
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




