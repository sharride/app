import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, ShieldAlert, Send, ArrowRight } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { Skeleton } from '../components/ui/Skeleton';
import { useAuth } from '../contexts/AuthContext';
import { fetchMyChatThreads, fetchMessages, sendMessage, subscribeToMessages } from '../services/apiService';
import { formatDate, formatTime, getErrorMessage } from '../utils/formatters';
import type { Booking, ChatMessage } from '../types';

// SCHEMA ASSUMPTION: this page assumes a `messages` table exists in Supabase
// with the shape in `types/index.ts -> ChatMessage`, keyed by `booking_id`
// rather than a separate `conversations` table (every real thread in this
// app maps 1:1 to an accepted booking). That table was not found anywhere
// in the original codebase -- if it doesn't exist yet, fetching/sending
// will fail with a Postgres error, shown via the error state below.
export const ChatPage: React.FC = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const isCaptain = profile?.role === 'captain';

  const [threads, setThreads] = useState<Booking[]>([]);
  const [isLoadingThreads, setIsLoadingThreads] = useState(true);
  const [threadsError, setThreadsError] = useState('');

  const [activeThread, setActiveThread] = useState<Booking | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [messagesError, setMessagesError] = useState('');
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadThreads = () => {
    setIsLoadingThreads(true);
    setThreadsError('');
    fetchMyChatThreads(isCaptain)
      .then(setThreads)
      .catch((err) => setThreadsError(getErrorMessage(err, 'تعذر تحميل المحادثات')))
      .finally(() => setIsLoadingThreads(false));
  };

  useEffect(loadThreads, [user, isCaptain]);

  const openThread = (thread: Booking) => {
    setActiveThread(thread);
    setMessages([]);
    setMessagesError('');
    setIsLoadingMessages(true);
    fetchMessages(thread.id)
      .then(setMessages)
      .catch((err) => setMessagesError(getErrorMessage(err, 'تعذر تحميل الرسائل')))
      .finally(() => setIsLoadingMessages(false));
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Realtime: incoming messages from the other side appear without a reload.
  // Own sent messages are appended locally by handleSend already, so they're
  // filtered out here by id to avoid a duplicate bubble.
  useEffect(() => {
    if (!activeThread) return;
    const unsubscribe = subscribeToMessages(activeThread.id, (message) => {
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    });
    return unsubscribe;
  }, [activeThread]);

  const handleSend = async () => {
    if (!activeThread || !draft.trim() || isSending) return;
    setIsSending(true);
    try {
      const sent = await sendMessage(activeThread.id, draft.trim());
      setMessages((prev) => [...prev, sent]);
      setDraft('');
    } catch (err: unknown) {
      setMessagesError(getErrorMessage(err, 'تعذر إرسال الرسالة'));
    } finally {
      setIsSending(false);
    }
  };

  if (!user) {
    return (
      <Card className="text-center py-10 space-y-3 border-primary-200">
        <EmptyState
          icon={<MessageSquare className="w-10 h-10 text-primary-500 mx-auto" />}
          title="سجّل الدخول لعرض محادثاتك"
          action={{ label: 'تسجيل الدخول', onClick: () => navigate('/login') }}
        />
      </Card>
    );
  }

  // Thread view: a single open conversation.
  if (activeThread) {
    const other = isCaptain ? activeThread.passenger : activeThread.journey?.captain;
    return (
      <div className="flex flex-col animate-fade-in" style={{ minHeight: '60vh' }}>
        <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
          <button onClick={() => setActiveThread(null)} className="p-1 text-gray-600 hover:text-gray-900" aria-label="رجوع">
            <ArrowRight className="w-5 h-5" />
          </button>
          <div>
            <p className="text-xs font-black text-gray-950">{other?.full_name || 'محادثة'}</p>
            {activeThread.journey && (
              <p className="text-[11px] text-gray-500 font-semibold">{activeThread.journey.start_address} ➔ {activeThread.journey.end_address}</p>
            )}
          </div>
        </div>

        <div className="p-3 my-2 bg-primary-50 rounded-xl border border-primary-200 text-xs text-primary-800 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-primary-600 flex-shrink-0" />
          <span>تواصل بآمان: يمنع مشاركة أي بيانات مالية أو رابط تحويل خارج المنصة.</span>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 py-2">
          {isLoadingMessages && (
            <div className="space-y-2">
              <Skeleton height="h-10" />
              <Skeleton height="h-10" width="w-2/3" />
            </div>
          )}
          {!isLoadingMessages && messagesError && (
            <ErrorState title="حدث خطأ" description={messagesError} />
          )}
          {!isLoadingMessages && !messagesError && messages.length === 0 && (
            <EmptyState
              icon={<MessageSquare className="w-8 h-8 text-primary-500 mx-auto" />}
              title="ابدأ المحادثة"
              description="اكتب أول رسالة بينكما"
            />
          )}
          {messages.map((m) => {
            const mine = m.sender_id === user.id;
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-xs font-semibold ${mine ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-900'}`}>
                  <p>{m.content}</p>
                  <p className={`text-[10px] mt-1 ${mine ? 'text-primary-100' : 'text-gray-500'}`}>
                    {formatDate(m.created_at)} — {formatTime(m.created_at)}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        <div className="flex gap-2 pt-2 border-t border-gray-100">
          <input
            className="input flex-1"
            placeholder="اكتب رسالة..."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
          />
          <Button size="sm" isLoading={isSending} onClick={handleSend} aria-label="إرسال">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  // Thread list view.
  return (
    <div className="space-y-4 animate-fade-in">
      <div className="p-3 bg-primary-50 rounded-xl border border-primary-200 text-xs text-primary-800 flex items-center gap-2">
        <ShieldAlert className="w-4 h-4 text-primary-600 flex-shrink-0" />
        <span>تواصل بآمان: يمنع مشاركة أي بيانات مالية أو رابط تحويل خارج المنصة.</span>
      </div>

      {isLoadingThreads && (
        <div className="space-y-3">
          <Skeleton height="h-16" />
          <Skeleton height="h-16" />
        </div>
      )}

      {!isLoadingThreads && threadsError && (
        <Card className="border-red-200">
          <ErrorState title="حدث خطأ" description={threadsError} action={{ label: 'إعادة المحاولة', onClick: loadThreads }} />
        </Card>
      )}

      {!isLoadingThreads && !threadsError && threads.length === 0 && (
        <Card className="text-center py-10 space-y-2 bg-primary-50/30 border-dashed border-primary-200">
          <EmptyState
            icon={<MessageSquare className="w-10 h-10 text-primary-500 mx-auto" />}
            title="لسه مفيش محادثات"
            description="هتقدر تدردش أول ما حجزك يتقبل، هيفتحلك تلقائيًا"
          />
        </Card>
      )}

      {!isLoadingThreads && !threadsError && threads.length > 0 && (
        <div className="space-y-2">
          {threads.map((t) => {
            const other = isCaptain ? t.passenger : t.journey?.captain;
            return (
              <Card key={t.id} hoverable onClick={() => openThread(t)} className="p-3 flex items-center justify-between cursor-pointer border-primary-100">
                <div>
                  <p className="text-xs font-black text-gray-950">{other?.full_name || 'محادثة'}</p>
                  {t.journey && (
                    <p className="text-[11px] text-gray-500 font-semibold">{t.journey.start_address} ➔ {t.journey.end_address}</p>
                  )}
                </div>
                <MessageSquare className="w-4 h-4 text-primary-400" />
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
