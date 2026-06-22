import { useState, useRef, useEffect } from 'react';
import { Send, Cpu, Brain, User, ArrowRight, Plus, MessageSquare } from 'lucide-react';
import { getConversations, getConversationMessages } from '../services/api';
import type { Conversation } from '../services/api';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  toolCall?: {
    name: string;
    input?: any;
    status: 'running' | 'completed' | 'failed';
    result?: any;
  };
}

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: "Hello! I am your PipelineDoc Assistant. I monitor Service Level Objectives, run Gatekeeper audits on pull requests, and orchestrate self-healing tasks via UiPath Maestro. What can I help you with today?"
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadConversationsList = async () => {
    try {
      const data = await getConversations();
      setConversations(data);
    } catch (err) {
      console.error('Error loading conversations:', err);
    }
  };

  useEffect(() => {
    loadConversationsList();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSelectConversation = async (id: string) => {
    if (loading) return;
    setActiveConversationId(id);
    setLoadingHistory(true);
    try {
      const history = await getConversationMessages(id);
      const mapped: ChatMessage[] = history.map(m => ({
        role: m.role,
        content: m.content
      }));
      setMessages(mapped.length > 0 ? mapped : [
        {
          role: 'assistant',
          content: "Hello! The conversation is empty. How can I assist you?"
        }
      ]);
    } catch (err) {
      console.error('Error loading messages for conversation:', id, err);
      setMessages([
        {
          role: 'assistant',
          content: "Error loading messages. Please check connectivity or refresh."
        }
      ]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleNewChat = () => {
    if (loading) return;
    setActiveConversationId(null);
    setMessages([
      {
        role: 'assistant',
        content: "Hello! I am your PipelineDoc Assistant. I monitor Service Level Objectives, run Gatekeeper audits on pull requests, and orchestrate self-healing tasks via UiPath Maestro. What can I help you with today?"
      }
    ]);
    setInput('');
  };

  const handleSend = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMessage: ChatMessage = { role: 'user', content: text };
    
    // If messages is just assistant greeting, replace it on new chat send
    setMessages(prev => {
      const filtered = prev.filter(m => m.content !== "Hello! I am your PipelineDoc Assistant. I monitor Service Level Objectives, run Gatekeeper audits on pull requests, and orchestrate self-healing tasks via UiPath Maestro. What can I help you with today?");
      return [...filtered, userMessage];
    });
    setInput('');
    setLoading(true);

    // Prepare history payload for API
    const historyPayload = messages.map(m => ({
      role: m.role,
      content: m.content
    }));

    // Add dummy streaming message for assistant response
    setMessages(prev => [...prev, { role: 'assistant', content: '', isStreaming: true }]);

    try {
      const baseUrl = import.meta.env.VITE_API_URL || '';
      const token = localStorage.getItem('pipelinedoc_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: text,
          conversation_history: historyPayload,
          conversation_id: activeConversationId || undefined
        })
      });

      if (!response.body) throw new Error('Readable stream not supported by connection.');

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        
        // Preserve last partial chunk in buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          const cleanedLine = line.trim();
          if (!cleanedLine.startsWith('data: ')) continue;

          const rawData = cleanedLine.substring(6).trim();
          if (rawData === '[DONE]') continue;

          try {
            const parsed = JSON.parse(rawData);

            if (parsed.type === 'metadata') {
              const newId = parsed.conversationId;
              setActiveConversationId(newId);
              loadConversationsList();
            }

            setMessages(prev => {
              const updated = [...prev];
              const streamingIndex = updated.findIndex(m => m.isStreaming);
              if (streamingIndex === -1) return prev;

              const streamMsg = { ...updated[streamingIndex] };

              if (parsed.type === 'text') {
                streamMsg.content += parsed.text;
              } else if (parsed.type === 'tool_start') {
                streamMsg.toolCall = {
                  name: parsed.name,
                  input: parsed.input,
                  status: 'running'
                };
              } else if (parsed.type === 'tool_result') {
                streamMsg.toolCall = {
                  name: parsed.name,
                  input: streamMsg.toolCall?.input,
                  status: 'completed',
                  result: parsed.result
                };
              } else if (parsed.type === 'error') {
                streamMsg.content += `\n[Error: ${parsed.error}]`;
              }

              updated[streamingIndex] = streamMsg;
              return updated;
            });
          } catch (err) {
            console.error('Failed to parse SSE chunk:', rawData, err);
          }
        }
      }

      // Finalize streaming state
      setMessages(prev => prev.map(m => m.isStreaming ? { ...m, isStreaming: false } : m));
      loadConversationsList(); // refresh to show updated_at status

    } catch (err: any) {
      console.error('Error during streaming chat:', err);
      setMessages(prev => {
        const updated = [...prev];
        const streamingIndex = updated.findIndex(m => m.isStreaming);
        if (streamingIndex !== -1) {
          updated[streamingIndex] = {
            role: 'assistant',
            content: `I encountered an error connecting to the API gateway: ${err.message || err}`,
            isStreaming: false
          };
        }
        return updated;
      });
    } finally {
      setLoading(false);
    }
  };

  const suggestions = [
    { title: 'Check system health', prompt: 'Show recent deployments' },
    { title: 'Evaluate SLO status', prompt: 'Show current SLO compliance status' },
    { title: 'Trigger manual deployment', prompt: 'Deploy branch main of payment-service using canary strategy' }
  ];

  return (
    <div className="h-[calc(100vh-10rem)] flex bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
      {/* Sidebar Panel */}
      <aside className="w-80 border-r border-slate-200 flex flex-col bg-slate-50/50 shrink-0">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <h3 className="text-sm font-bold text-slate-800 m-0 font-sans">Recent Chats</h3>
          <button
            onClick={handleNewChat}
            className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-600 transition-colors cursor-pointer"
            title="New Chat"
          >
            <Plus className="w-4.5 h-4.5" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2.5 space-y-1">
          {conversations.length === 0 ? (
            <div className="text-center py-12 text-xs text-slate-400">
              No recent conversations
            </div>
          ) : (
            conversations.map((conv) => {
              const isActive = activeConversationId === conv.id;
              return (
                <button
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv.id)}
                  className={`w-full text-left px-3.5 py-3 rounded-xl transition-all duration-150 cursor-pointer group flex items-start space-x-3 ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 font-semibold'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <MessageSquare className={`w-4 h-4 shrink-0 mt-0.5 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs truncate font-medium m-0">{conv.title}</p>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      {new Date(conv.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Agent Banner */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center">
              <Brain className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 m-0 font-sans">Autopilot Copilot</h3>
              <span className="text-[10px] text-emerald-600 font-medium font-mono flex items-center space-x-1.5 animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span>Available for self-healing actions</span>
              </span>
            </div>
          </div>
        </div>

        {/* Messages Scroll Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/20">
          {loadingHistory ? (
            <div className="flex flex-col items-center justify-center h-full space-y-2">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-xs text-slate-400">Loading conversation history...</p>
            </div>
          ) : (
            messages.map((msg, index) => {
              const isUser = msg.role === 'user';
              return (
                <div 
                  key={index} 
                  className={`flex items-start space-x-4 ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  {/* Agent Profile */}
                  {!isUser && (
                    <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center text-white shrink-0 shadow-sm">
                      <Brain className="w-4.5 h-4.5" />
                    </div>
                  )}

                  {/* Message Content Bubble */}
                  <div className="max-w-[75%] space-y-3">
                    <div className={`px-5 py-3.5 rounded-2xl leading-relaxed text-sm ${
                      isUser 
                        ? 'bg-blue-600 text-white font-medium rounded-tr-none shadow-sm' 
                        : 'bg-white text-slate-700 border border-slate-200 rounded-tl-none'
                    }`}>
                      <p className="whitespace-pre-line m-0">{msg.content || (msg.isStreaming && !msg.toolCall ? 'Thinking...' : '')}</p>
                    </div>

                    {/* Tool Call Activity log */}
                    {msg.toolCall && (
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5 font-mono text-xs">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2 text-slate-700">
                            <Cpu className={`w-3.5 h-3.5 ${msg.toolCall.status === 'running' ? 'animate-spin text-amber-500' : 'text-blue-600'}`} />
                            <span className="font-semibold text-slate-800">Tool call: {msg.toolCall.name}</span>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            msg.toolCall.status === 'running' 
                              ? 'bg-amber-50 text-amber-700 border border-amber-200/50 animate-pulse' 
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200/50'
                          }`}>
                            {msg.toolCall.status}
                          </span>
                        </div>

                        {msg.toolCall.input && (
                          <div className="text-[10px] text-slate-600 bg-white p-2.5 rounded border border-slate-200">
                            <span className="text-slate-400 block mb-0.5 font-bold text-[8px] uppercase tracking-wider">Input parameters:</span>
                            {JSON.stringify(msg.toolCall.input)}
                          </div>
                        )}

                        {msg.toolCall.result && (
                          <div className="text-[10px] text-slate-600 max-h-40 overflow-y-auto bg-white p-2.5 rounded border border-slate-200">
                            <span className="text-slate-400 block mb-0.5 font-bold text-[8px] uppercase tracking-wider">Execution output:</span>
                            <pre className="mt-1 whitespace-pre-wrap font-mono">{JSON.stringify(msg.toolCall.result, null, 2)}</pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* User Profile */}
                  {isUser && (
                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 shrink-0 border border-slate-200">
                      <User className="w-4.5 h-4.5" />
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Suggested Prompts */}
        {messages.length === 1 && !loadingHistory && (
          <div className="px-6 pb-4 bg-slate-50/20 grid grid-cols-1 md:grid-cols-3 gap-3 shrink-0">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => handleSend(s.prompt)}
                className="p-3 bg-white border border-slate-200 rounded-xl text-left hover:border-blue-600 hover:bg-blue-50/10 transition-all text-xs text-slate-600 flex justify-between items-center group cursor-pointer shadow-sm animate-fade-in"
              >
                <span>{s.title}</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all" />
              </button>
            ))}
          </div>
        )}

        {/* Chat Input Bar */}
        <form 
          onSubmit={(e) => { e.preventDefault(); handleSend(input); }}
          className="p-4 bg-slate-50 border-t border-slate-200 flex items-center space-x-3 shrink-0"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about deployments, SLOs, or trigger a self-healing process..."
            disabled={loading || loadingHistory}
            className="flex-1 bg-white border border-slate-200 text-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600/25 disabled:opacity-50 placeholder:text-slate-400"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading || loadingHistory}
            className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 disabled:hover:bg-blue-600 transition-colors shadow-sm shrink-0 cursor-pointer"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
