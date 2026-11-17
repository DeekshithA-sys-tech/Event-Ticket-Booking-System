import { useState, useRef, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { FiMessageSquare, FiX, FiSend, FiCheck, FiAlertTriangle, FiMinimize2 } from 'react-icons/fi';
import { FaRobot, FaTicketAlt, FaSearch } from 'react-icons/fa';
import { api } from '../services/api.js';

export const AIChatWidget = () => {
  const { user } = useSelector((state) => state.auth || {});
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        "👋 Hi! I'm the **EventPulse AI Assistant**. I can help you discover live events, check seat maps, view your tickets, and reserve or cancel bookings.",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId] = useState(() => `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const sendMessage = async (messageText, confirmationState = null) => {
    const textToSend = messageText || input;
    if (!textToSend.trim() && !confirmationState) return;

    const userMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);
    if (!messageText) setInput('');
    setIsLoading(true);

    try {
      // Build conversation history for context
      const historyPayload = messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .slice(-6)
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      const res = await api.post('/ai/chat', {
        conversation_id: conversationId,
        message: textToSend,
        history: historyPayload,
        confirmation_state: confirmationState,
      });

      const aiData = res?.data || res;

      const assistantMessage = {
        id: `ai_${Date.now()}`,
        role: 'assistant',
        content: aiData.message || 'I processed your request.',
        requires_confirmation: aiData.requires_confirmation,
        pending_action: aiData.pending_action,
        tool_calls_used: aiData.tool_calls_used || [],
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      let rawMsg = err.response?.data?.message || err.message || '';
      let cleanMsg = '🤖 I encountered a momentary issue processing your request. Please try asking again or rephrasing.';
      if (
        rawMsg &&
        !rawMsg.includes('500') &&
        !rawMsg.includes('{"detail"') &&
        !rawMsg.includes('sequence item') &&
        !rawMsg.includes('AI Service responded')
      ) {
        cleanMsg = `⚠️ ${rawMsg}`;
      }
      const errorMessage = {
        id: `err_${Date.now()}`,
        role: 'assistant',
        content: cleanMsg,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmAction = (pendingAction) => {
    sendMessage(`Yes, proceed with ${pendingAction.action}`, {
      confirmed: true,
      action: pendingAction.action,
      payload: pendingAction.payload,
    });
  };

  const handleDeclineAction = () => {
    setMessages((prev) => [
      ...prev,
      {
        id: `decline_${Date.now()}`,
        role: 'assistant',
        content: 'Cancelled. The action was aborted and no changes were made.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const promptChips = [
    { label: '🎭 Find Comedy Shows', query: 'Find upcoming comedy shows in Bangalore' },
    { label: '🎸 Music Concerts', query: 'Show me music concerts happening soon' },
    { label: '🎫 My Bookings', query: 'Show my bookings' },
  ];

  if (user?.role === 'organizer' || user?.role === 'admin') {
    promptChips.push({ label: '📊 Sales Overview', query: 'Show sales analytics and revenue' });
  }

  // Simple markdown-like text parser for bullet points, bold, and code
  const renderFormattedText = (text) => {
    const lines = text.split('\n');
    return lines.map((line, idx) => {
      let formatted = line;
      // Bold
      formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      // Inline code
      formatted = formatted.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-xs font-mono">$1</code>');

      if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
        return (
          <li
            key={idx}
            className="ml-4 list-disc text-xs leading-relaxed"
            dangerouslySetInnerHTML={{ __html: formatted.replace(/^[-*]\s*/, '') }}
          />
        );
      }
      if (line.trim().startsWith('### ')) {
        return (
          <h4
            key={idx}
            className="font-bold text-sm mt-2 mb-1"
            dangerouslySetInnerHTML={{ __html: formatted.replace(/^###\s*/, '') }}
          />
        );
      }
      if (!line.trim()) {
        return <div key={idx} className="h-1.5" />;
      }
      return (
        <p
          key={idx}
          className="text-xs leading-relaxed"
          dangerouslySetInnerHTML={{ __html: formatted }}
        />
      );
    });
  };

  return (
    <>
      {/* Floating Toggle Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 flex items-center gap-2 px-3.5 py-2.5 sm:px-4 sm:py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-full shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-indigo-300 dark:focus:ring-indigo-800"
          title="Open AI Assistant"
        >
          <div className="relative">
            <FaRobot className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-white dark:border-slate-900 animate-pulse" />
          </div>
          <span className="text-xs sm:text-sm font-semibold tracking-wide">Ask AI</span>
        </button>
      )}

      {/* Floating Chat Drawer */}
      {isOpen && (
        <div className="fixed bottom-3 right-3 sm:bottom-6 sm:right-6 z-50 w-[calc(100vw-1.5rem)] sm:w-96 h-[500px] sm:h-[560px] max-h-[calc(100dvh-4.5rem)] flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-white/10 rounded-xl backdrop-blur-sm">
                <FaRobot className="w-5 h-5 text-indigo-100" />
              </div>
              <div>
                <h3 className="text-sm font-bold leading-tight">EventPulse AI</h3>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                  <span className="text-[11px] text-indigo-100 font-medium">Assistant Active</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                title="Minimize chat"
              >
                <FiMinimize2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                title="Close chat"
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick Prompt Chips */}
          <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 overflow-x-auto no-scrollbar">
            {promptChips.map((chip, idx) => (
              <button
                key={idx}
                disabled={isLoading}
                onClick={() => sendMessage(chip.query)}
                className="whitespace-nowrap px-2.5 py-1 text-[11px] font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 rounded-full text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors shadow-xs"
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* Messages Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50/60 dark:bg-slate-900/60">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs shadow-xs ${
                    m.role === 'user'
                      ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-br-none'
                      : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700/80 rounded-bl-none'
                  }`}
                >
                  {renderFormattedText(m.content)}

                  {/* Two-Phase Confirmation Dialog inside message */}
                  {m.requires_confirmation && m.pending_action && (
                    <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 rounded-xl text-amber-900 dark:text-amber-200">
                      <div className="flex items-center gap-1.5 font-semibold text-xs mb-1.5">
                        <FiAlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                        <span>Action Confirmation Required</span>
                      </div>
                      <p className="text-[11px] mb-2.5 leading-relaxed text-amber-800 dark:text-amber-300">
                        {m.pending_action.summary}
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleConfirmAction(m.pending_action)}
                          className="flex items-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-semibold transition-colors shadow-xs"
                        >
                          <FiCheck className="w-3 h-3" />
                          Confirm
                        </button>
                        <button
                          onClick={handleDeclineAction}
                          className="px-3 py-1 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg text-[11px] font-semibold transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 px-1">
                  {m.timestamp}
                </span>
              </div>
            ))}

            {isLoading && (
              <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs px-2 py-1">
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" />
                </div>
                <span className="text-[11px]">AI is reasoning...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Footer Input */}
          <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 rounded-xl px-3 py-1.5 border border-slate-200 dark:border-slate-700 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 dark:focus-within:ring-indigo-900/40 transition-all">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about events, seats, tickets..."
                disabled={isLoading}
                className="flex-1 bg-transparent border-none text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none"
              />
              <button
                onClick={() => sendMessage()}
                disabled={isLoading || !input.trim()}
                className="p-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors shrink-0"
                title="Send message"
              >
                <FiSend className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex items-center justify-between mt-1.5 px-1">
              <span className="text-[10px] text-slate-400 dark:text-slate-500">
                AI can execute actions with your approval
              </span>
              <span className="text-[10px] text-indigo-500 dark:text-indigo-400 font-medium">
                FastAPI Python AI
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
