import React, { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { useSearchParams } from "react-router-dom";

import { buildApiUrl } from "../api/httpClient";
import { readAssistantStream } from "../api/assistantStream";
import { createConversation, loadConversation } from "../api/conversations";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link } from "react-router-dom";
import { listConversations } from "../api/conversations";
import "./SmartAssistant.css";

function SmartAssistant({ locale = "ar" }) {
  const { user, authChecked } = useSelector((state) => state.auth);
  const userId = user?._id || null;
  const [searchParams, setSearchParams] = useSearchParams();
  const conversationId = searchParams.get("conversationId");
  const conversationRef = useRef(null);
  const ownerRef = useRef(null);
  const retryRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const messagesEndRef = useRef(null);
  const scrollRef = useRef(null);
  const followRef = useRef(true);
  const inputRef = useRef(null);
  const drawerRef = useRef(null);
  const menuRef = useRef(null);
  const [showLatest, setShowLatest] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyError, setHistoryError] = useState("");
  useEffect(() => {
    document.body.classList.add("rt-assistant-active");
    return () => document.body.classList.remove("rt-assistant-active");
  }, []);
  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.activeElement;
    drawerRef.current?.querySelector("button")?.focus();
    const keydown = event => {
      if (event.key === "Escape") setDrawerOpen(false);
      if (event.key === "Tab") {
        const items = [...drawerRef.current.querySelectorAll("button, a[href]")].filter(item => !item.disabled);
        const first = items[0], last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, [drawerOpen]);
  useEffect(() => {
    setHistory([]);
    setHistoryError("");
    if (!userId || !authChecked) return;
    const controller = new AbortController();
    listConversations(controller.signal).then(data => {
      if (!controller.signal.aborted) setHistory(data.conversations || []);
    }).catch(e => { if (!controller.signal.aborted) setHistoryError(e.message); });
    return () => controller.abort();
  }, [userId, authChecked, conversationId]);
  const requestRef = useRef(null);
  const [hasStreamText, setHasStreamText] = useState(false);
  useEffect(() => () => requestRef.current?.abort(), []);

  const isArabic = locale === "ar";
  const direction = isArabic ? "rtl" : "ltr";

  const copy = isArabic
    ? {
        title: "مساعد ريادتك الذكي",
        subtitle: "اسأل عن مشروعك، السوق، التمويل، أو تحليل الموقع.",
        placeholder: "اكتب سؤالك أو فكرتك هنا...",
        send: "إرسال",
        sending: "جارٍ الإرسال...",
        emptyTitle: "كيف أقدر أساعدك اليوم؟",
        loading: "يفكر",
        genericError: "حدث خطأ أثناء الاتصال بالمساعد. حاول مرة أخرى.",
        interrupted: "انقطع الرد قبل اكتماله. يمكنك إعادة إرسال السؤال للمحاولة مرة أخرى.",
        loginRequired: "سجّل الدخول لحفظ محادثتك واستعادتها لاحقًا.",
        archived: "هذه المحادثة مؤرشفة ولا تقبل رسائل جديدة.",
        suggestions: [
          "حلّل فكرة مشروعي",
          "اقترح لي مشروع مربح",
          "كيف أحصل على تمويل؟",
        ],
      }
    : {
        title: "RiadaTach Smart Assistant",
        subtitle: "Ask about your project, market, funding, or location analysis.",
        placeholder: "Write your question or idea here...",
        send: "Send",
        sending: "Sending...",
        emptyTitle: "How can I help you today?",
        loading: "Thinking",
        genericError: "Something went wrong while contacting the assistant. Please try again.",
        interrupted: "The response was interrupted before completion. Please send your question again to retry.",
        loginRequired: "Sign in to save and restore your conversation.",
        archived: "This conversation is archived and cannot accept new messages.",
        suggestions: [
          "Analyze my business idea",
          "Suggest a profitable project",
          "How can I get funding?",
        ],
      };

  useEffect(() => {
    if (!authChecked) return;
    if (ownerRef.current !== userId) {
      requestRef.current?.abort();
      requestRef.current = null;
      conversationRef.current = null;
      retryRef.current = null;
      setMessages([]);
      setInputValue("");
      ownerRef.current = userId;
    }
    if (!userId) {
      setIsLoading(false);
      setError("");
      return;
    }
    if (!conversationId) {
      requestRef.current?.abort();
      requestRef.current = null;
      setIsLoading(false);
      conversationRef.current = null;
      retryRef.current = null;
      setMessages([]);
      setError("");
      return;
    }
    // Creating the URL during a send must not reload or abort that same request.
    if (conversationRef.current === conversationId && requestRef.current) return;
    requestRef.current?.abort();
    requestRef.current = null;
    const controller = new AbortController();
    conversationRef.current = conversationId;
    setMessages([]);
    setIsLoading(true);
    setError("");
    loadConversation(conversationId, controller.signal).then(({ conversation, messages: saved }) => {
      if (controller.signal.aborted) return;
      setMessages(saved.filter(m => m.role === "user" || m.text).map(m => ({ ...m, id: m._id })));
      const last = saved.at(-1);
      const pendingUser = last?.role === "user" ? last : saved.find(m => m.role === "user" && m.requestId === last?.requestId);
      if (last && (last.role === "user" || last.status !== "completed") && pendingUser) {
        retryRef.current = { message: pendingUser.text, requestId: pendingUser.requestId };
        setInputValue(pendingUser.text);
        setError(copy.interrupted);
      } else retryRef.current = null;
      if (conversation.status !== "active") setError(copy.archived);
    }).catch(e => {
      if (!controller.signal.aborted) setError(e.message);
    }).finally(() => {
      if (!controller.signal.aborted) setIsLoading(false);
    });
    return () => controller.abort();
  }, [conversationId, userId, authChecked, copy.loginRequired, copy.interrupted, copy.archived]);

  useEffect(() => {
    if (followRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  async function sendMessage(message) {
    const trimmedMessage = String(message || "").trim();

    if (!trimmedMessage || isLoading || requestRef.current) {
      return;
    }
    if (!authChecked) return;
    const requestId = retryRef.current?.message === trimmedMessage
      ? retryRef.current.requestId : crypto.randomUUID();
    retryRef.current = { message: trimmedMessage, requestId };

    setMessages((current) => current.some(m => m.role === "user" && m.requestId === requestId) ? current : [
      ...current,
      {
        id: `user-${requestId}`,
        requestId,
        role: "user",
        text: trimmedMessage,
      },
    ]);
    setInputValue("");
    setError("");
    setIsLoading(true);
    setHasStreamText(false);
    const controller = new AbortController();
    requestRef.current = controller;
    const assistantId = `assistant-${requestId}`;
    let assistantText = "";

    try {
      let id = conversationRef.current;
      if (userId && !id) {
        const created = await createConversation(trimmedMessage, controller.signal);
        if (controller.signal.aborted) return;
        id = created.conversation._id;
        conversationRef.current = id;
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set("conversationId", id);
        setSearchParams(nextParams, { replace: true });
      }
      const response = await fetch(buildApiUrl(userId ? "/api/smart-assistant" : "/api/smart-assistant/guest"), {
        signal: controller.signal,
        credentials: "include",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-RiadaTech-Request": "1",
        },
        body: JSON.stringify({
          message: trimmedMessage,
          conversationId: id,
          requestId,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || `Request failed with status ${response.status}`);
      }
      const metadata = await readAssistantStream(response, (delta) => {
        if (controller.signal.aborted) return;
        assistantText += delta;
        const text = assistantText;
        setHasStreamText(true);
        setMessages((current) => current.some((item) => item.role === "assistant" && item.requestId === requestId)
          ? current.map((item) => item.role === "assistant" && item.requestId === requestId ? { ...item, text, status: "streaming" } : item)
          : [...current, { id: assistantId, requestId, role: "assistant", text, status: "streaming" }]);
      }, copy.interrupted);
      if (!controller.signal.aborted) {
        retryRef.current = null;
        setMessages(current => current.map(m => m.requestId === requestId ? { ...m, status: "completed", ...(m.role === "assistant" ? { sources: metadata?.sources || [] } : {}) } : m));
      }
    } catch (requestError) {
      if (!controller.signal.aborted) {
        setError(requestError.message || copy.genericError);
        setInputValue(trimmedMessage);
      }
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      if (!controller.signal.aborted) setIsLoading(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    sendMessage(inputValue);
  }

  function handleSuggestionClick(suggestion) {
    sendMessage(suggestion);
  }

  function newConversation() {
    requestRef.current?.abort();
    requestRef.current = null;
    conversationRef.current = null;
    retryRef.current = null;
    setMessages([]); setInputValue(""); setError(""); setIsLoading(false);
    setHasStreamText(false); followRef.current = true; setShowLatest(false);
    const next = new URLSearchParams(searchParams); next.delete("conversationId");
    setSearchParams(next); setDrawerOpen(false);
  }
  function preparePrompt(prompt) {
    setInputValue(prompt); setDrawerOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }
  const actions = isArabic ? ["إنشاء دراسة جدوى", "حساب الأرباح", "تحليل المنافسين"]
    : ["Create a feasibility study", "Calculate profits", "Analyze competitors"];
  const latest = () => {
    followRef.current = true; setShowLatest(false);
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  };
  return (
    <div className="rt-assistant-page" dir={direction}>
      {drawerOpen && <button className="rt-assistant-backdrop" aria-label={isArabic ? "إغلاق القائمة" : "Close menu"} onClick={() => setDrawerOpen(false)} />}
      <aside id="assistant-sidebar" ref={drawerRef} className={`rt-assistant-sidebar${drawerOpen ? " is-open" : ""}`} aria-label={isArabic ? "أدوات المساعد" : "Assistant tools"}>
        <div className="rt-assistant-sidebar-brand">RiadaTech <span>AI</span>
          <button className="rt-assistant-drawer-close" onClick={() => setDrawerOpen(false)} aria-label={isArabic ? "إغلاق" : "Close"}>×</button>
        </div>
        <button className="rt-assistant-new" onClick={newConversation}>＋ {isArabic ? "محادثة جديدة" : "New conversation"}</button>
        <nav className="rt-assistant-tools">
          <button onClick={() => preparePrompt(actions[0])}>{actions[0]}</button>
          <Link to="/map-analysis">{isArabic ? "تحليل موقع" : "Analyze a location"}</Link>
          {actions.slice(1).map(action => <button key={action} onClick={() => preparePrompt(action)}>{action}</button>)}
        </nav>
        <div className="rt-assistant-history">
          <h2>{isArabic ? "سجل المحادثات" : "Conversation history"}</h2>
          {!userId ? <p>{copy.loginRequired}</p> : historyError ? <p role="status">{historyError}</p> : history.length ? history.map(item => (
            <Link key={item._id} to={`/assistant?conversationId=${encodeURIComponent(item._id)}`} aria-current={conversationId === item._id ? "page" : undefined} onClick={() => { setDrawerOpen(false); followRef.current = true; setShowLatest(false); }}>{item.title || (isArabic ? "محادثة" : "Conversation")}</Link>
          )) : <p>{isArabic ? "ستظهر محادثاتك هنا" : "Your conversations will appear here"}</p>}
        </div>
        <p className="rt-assistant-sidebar-note">{isArabic ? "من الفكرة إلى القرار" : "From idea to decision"}</p>
      </aside>
      <main className="rt-assistant-main" inert={drawerOpen ? "" : undefined}>
        <header className="rt-assistant-topbar">
          <button ref={menuRef} className="rt-assistant-menu" aria-label={isArabic ? "فتح القائمة" : "Open menu"} aria-expanded={drawerOpen} aria-controls="assistant-sidebar" onClick={() => setDrawerOpen(true)}>☰</button>
          <div><div className="rt-assistant-title-row"><span className="rt-assistant-status-dot" /><h1>{copy.title}</h1></div><p>{copy.subtitle}</p></div>
        </header>
        <section className="rt-assistant-chat-card" aria-label={copy.title}>
          <div className="rt-assistant-messages" ref={scrollRef} onScroll={event => {
            const el = event.currentTarget;
            followRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 64;
            setShowLatest(!followRef.current);
          }}>
            {messages.length === 0 && <div className="rt-assistant-empty-state">
              <span className="rt-assistant-empty-mark" aria-hidden="true">✦</span>
              <p className="rt-assistant-eyebrow">RiadaTech • {isArabic ? "شريك فكرتك" : "Your idea partner"}</p>
              <h2>{copy.emptyTitle}</h2><p>{copy.subtitle}</p>
              <div className="rt-assistant-suggestions">{copy.suggestions.map(suggestion => <button key={suggestion} className="rt-assistant-suggestion" onClick={() => handleSuggestionClick(suggestion)} disabled={isLoading || !authChecked}>{suggestion}<span aria-hidden="true"> ↗</span></button>)}</div>
            </div>}
            {messages.map(message => <article key={message.id} className={`rt-assistant-message rt-assistant-message-${message.role}`}>
              <div className="rt-assistant-message-content">
                <span className="rt-assistant-message-author">{message.role === "assistant" ? "RiadaTech" : isArabic ? "أنت" : "You"}</span>
                <div className="rt-assistant-bubble" dir="auto">{message.role === "assistant" ? <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ table: ({node, ...props}) => <div className="rt-assistant-table" tabIndex={0}><table {...props} /></div> }}>{message.text}</ReactMarkdown> : message.text}</div>
                {message.role === "assistant" && message.sources?.length > 0 && <details className="rt-assistant-sources"><summary>{isArabic ? "المصادر" : "Sources"} ({message.sources.length})</summary><ul>{message.sources.map((source, index) => <li key={index}>{/^https?:\/\//i.test(source.url || "") ? <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title || source.url}</a> : <span>{source.title}</span>}{source.authority && <small> — {source.authority}</small>}</li>)}</ul></details>}
              </div>
            </article>)}
            {isLoading && !hasStreamText && <div className="rt-assistant-message rt-assistant-message-assistant" role="status"><div className="rt-assistant-bubble rt-assistant-bubble-loading">{copy.loading}<span className="rt-assistant-dots" aria-hidden="true"><span /><span /><span /></span></div></div>}
            <div ref={messagesEndRef} />
          </div>
          <div className="rt-assistant-compose">
            {showLatest && <button className="rt-assistant-latest" onClick={latest} aria-label={isArabic ? "الانتقال لأحدث رسالة" : "Jump to latest message"}>↓</button>}
            {error && <div className="rt-assistant-error" role="alert">{error}</div>}
            <form className="rt-assistant-form" onSubmit={handleSubmit}>
              <input ref={inputRef} type="text" dir="auto" className="rt-assistant-input" value={inputValue} onChange={event => setInputValue(event.target.value)} placeholder={copy.placeholder} aria-label={copy.placeholder} disabled={isLoading} />
              <button type="submit" className="rt-assistant-send" disabled={isLoading || !authChecked || !inputValue.trim()}>{isLoading ? copy.sending : copy.send}</button>
            </form>
            {!userId && <p className="rt-assistant-guest-note">{isArabic ? "دردشة ضيف · لا تُحفظ في سجل الحساب" : "Guest chat · Not saved to account history"}</p>}
          </div>
        </section>
      </main>
    </div>
  );
}

export default SmartAssistant;
