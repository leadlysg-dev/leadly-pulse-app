import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import './ChatPanel.css';

const SUGGESTIONS = [
  'Let me know when CPA falls below $10',
  'Tell me if Meta spend goes over $500 in a day',
  'Alert me when ROAS drops below 2x this week'
];

const GREETING =
  "Hi! I can set up performance alerts for you in plain English — CPA, ROAS, spend, CTR, or conversions on Meta, Google, or both. What would you like to watch?";

// The assistant chat, unchanged from the standalone Assistant page - it just
// lives inside Pulse now. onRulesCreated fires when the assistant saves a
// rule, so the alerts panel alongside can refresh.
export default function ChatPanel({ onRulesCreated }) {
  // The greeting is client-side only (flagged so it's never sent to the
  // API, whose history must start with a user turn).
  const [messages, setMessages] = useState([{ role: 'assistant', content: GREETING, greeting: true }]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  const send = useCallback(
    async (text) => {
      const content = text.trim();
      if (!content || sending) return;
      const history = [...messages.filter((m) => !m.greeting), { role: 'user', content }];
      setMessages((m) => [...m, { role: 'user', content }]);
      setInput('');
      setSending(true);
      try {
        const result = await api.assistantChat(
          history.slice(-12).map(({ role, content: c }) => ({ role, content: c }))
        );
        if (result.enabled === false) {
          setMessages((m) => [
            ...m,
            { role: 'assistant', content: 'AI features are turned off in your Settings, so I can’t help right now.' }
          ]);
        } else {
          setMessages((m) => [...m, { role: 'assistant', content: result.reply }]);
          if (result.rules?.length) onRulesCreated?.();
        }
      } catch {
        setMessages((m) => [
          ...m,
          { role: 'assistant', content: 'Something went wrong sending that — please try again.' }
        ]);
      } finally {
        setSending(false);
      }
    },
    [messages, sending, onRulesCreated]
  );

  const showSuggestions = messages.filter((m) => m.role === 'user').length === 0;

  return (
    <section className="card chat-panel" aria-label="Assistant chat">
      <div className="chat-messages" ref={scrollRef}>
        {messages.map((m, i) => (
          <div key={i} className={`chat-bubble chat-${m.role}`}>
            {m.content}
          </div>
        ))}
        {sending && (
          <div className="chat-bubble chat-assistant chat-typing" aria-label="Assistant is typing">
            <span /><span /><span />
          </div>
        )}
      </div>

      {showSuggestions && (
        <div className="chat-suggestions">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" className="chat-suggestion" onClick={() => send(s)} disabled={sending}>
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        className="chat-input-row"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <label className="visually-hidden" htmlFor="chat-input">Message the assistant</label>
        <input
          id="chat-input"
          type="text"
          placeholder="e.g. Alert me when CPA goes above $20"
          autoComplete="off"
          maxLength={500}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={sending || !input.trim()}>
          Send
        </button>
      </form>
    </section>
  );
}
