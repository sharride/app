import React, { useEffect, useRef, useState } from 'react';
import { MessageCircle, X, Send, Phone, Sparkles, Loader2, CheckCircle2 } from 'lucide-react';
import { submitSupportMessage } from '../services/apiService';

// ---------------------------------------------------------------------------
// FOFi — ShareRide's assistant.
//
// Rule-based on purpose (not an LLM call): a small FAQ knowledge base
// matched by keyword overlap against whatever the user types. Simple,
// free, and fast — appropriate for a fixed set of "كيف أعمل كذا؟" questions
// about the platform. FOFi only ever talks about ShareRide itself (how to
// book, publish, pay, cancel, etc.) — never about the admin panel, the
// codebase, or who runs the platform.
//
// When nothing matches, it hands off to a human: a WhatsApp link, or an
// in-app message saved to `support_messages` (visible to admins in the
// dashboard) — this is the "دردشة خاصة داخل التطبيق" hand-off.
// ---------------------------------------------------------------------------

const SUPPORT_WHATSAPP_NUMBER = '201101002429';
const SUPPORT_WHATSAPP_LINK = `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}`;

interface FAQItem {
  id: string;
  question: string; // shown as a quick-suggestion chip
  keywords: string[]; // matched against the user's free-typed message
  answer: string;
}

const FAQ: FAQItem[] = [
  {
    id: 'book',
    question: 'إزاي أحجز رحلة؟',
    keywords: ['احجز', 'حجز', 'أحجز', 'ابحث عن رحلة', 'اركب', 'راكب'],
    answer:
      'من تبويب "بحث" في الأسفل، حدد نقطة الانطلاق والوصول (من الاقتراحات أو الخريطة مباشرة)، وهيظهرلك أقرب الرحلات المتوافقة مع مسارك. اضغط على أي رحلة عشان تشوف تفاصيلها وترسل طلب حجز للقائد.'
  },
  {
    id: 'publish',
    question: 'إزاي أنشئ رحلة كقائد؟',
    keywords: ['أنشئ رحلة', 'انشر رحلة', 'قائد', 'كابتن', 'نشر رحلة', 'اضيف رحلة'],
    answer:
      'لازم يكون عندك مركبة مسجّلة الأول (من صفحة "مركباتي")، بعدين من زرار "رحلة جديدة" في المنتصف تحت، حدد نقطة الانطلاق والوصول، الموعد، وعدد المقاعد. النظام هيقترحلك سعر مناسب تلقائيًا حسب المسافة، وتقدر تعدله يدويًا قبل النشر.'
  },
  {
    id: 'price',
    question: 'إزاي بيتحدد السعر؟',
    keywords: ['سعر', 'اسعار', 'تسعير', 'فلوس', 'تكلفة', 'مقعد بكام'],
    answer:
      'السعر المقترح بيتحسب تلقائيًا حسب المسافة الفعلية بالقيادة ونوع الرحلة (يومية، اشتراك أسبوعي أو شهري بيجيلهم خصم). القائد قادر دايمًا يعدل السعر يدويًا قبل النشر.'
  },
  {
    id: 'subscription',
    question: 'رحلات الاشتراك الأسبوعي/الشهري إيه؟',
    keywords: ['اشتراك', 'أسبوعي', 'شهري', 'تجربة'],
    answer:
      'رحلات الاشتراك بتبدأ بفترة تجربة 3 أيام بسعر الرحلة اليومية العادية، وبعدها تقدر تختار تكمل الاشتراك أو توقفه من صفحة "رحلاتي".'
  },
  {
    id: 'cancel',
    question: 'إزاي ألغي رحلة أو حجز؟',
    keywords: ['الغاء', 'إلغاء', 'الغي', 'ألغي', 'حذف الرحلة', 'حذف رحلة'],
    answer:
      'من صفحة "رحلاتي" تقدر تلغي حجزك أو تحذف رحلة نشرتها. حذف الرحلة بيشيلها من نتائج البحث فورًا، وبيفضل سجلها محفوظ لحد ما يراجعه فريقنا.'
  },
  {
    id: 'safety',
    question: 'إزاي بتتأكدوا من هوية المستخدمين؟',
    keywords: ['أمان', 'هوية', 'توثيق', 'امن', 'ثقة', 'تراست سكور', 'trust'],
    answer:
      'قبل ما تنشر رحلة أو تحجز، بنطلب منك تكمل بيانات هوية بسيطة. وكل مستخدم عنده "تقييم ثقة" بيتحسب من تقييمات الرحلات السابقة، وتقدر تشوفه في بروفايل أي كابتن أو راكب قبل التعامل معاه.'
  },
  {
    id: 'payment',
    question: 'طرق الدفع المتاحة؟',
    keywords: ['دفع', 'ادفع', 'فيزا', 'كاش', 'محفظة'],
    answer:
      'حاليًا التنسيق المالي بين الراكب والقائد بيتم مباشرة (كاش عادةً)، السعر المتفق عليه بيظهر واضح في تفاصيل الرحلة قبل التأكيد.'
  },
  {
    id: 'children',
    question: 'إزاي أضيف رحلة مدرسية لابني؟',
    keywords: ['ابني', 'ابنتي', 'مدرسة', 'اطفال', 'أطفال', 'سوزوكي'],
    answer:
      'من صفحة "الأبناء" ضيف بيانات ابنك/ابنتك، وبعدين من صفحة البحث فعّل خيار "بحث عن رحلة مدرسية لأحد أبنائي" — هيظهرلك بس رحلات المواصلات المدرسية المناسبة.'
  },
  {
    id: 'review',
    question: 'إزاي أقيّم رحلة؟',
    keywords: ['تقييم', 'قيم', 'ريفيو', 'نجوم'],
    answer:
      'بعد ما الرحلة تخلص، هتلاقي في صفحة "رحلاتي" قسم "رحلات بانتظار تقييمك" — اضغط "قيّم الرحلة" واختار عدد النجوم واكتب تعليق لو حابب.'
  }
];

const normalize = (text: string) => text.trim().toLowerCase();

const matchFAQ = (input: string): FAQItem | null => {
  const normalized = normalize(input);
  if (!normalized) return null;

  let best: { item: FAQItem; score: number } | null = null;
  for (const item of FAQ) {
    let score = 0;
    for (const kw of item.keywords) {
      if (normalized.includes(kw.toLowerCase())) score += 1;
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { item, score };
    }
  }
  return best?.item ?? null;
};

interface ChatEntry {
  id: string;
  from: 'user' | 'fofi';
  text: string;
}

const WELCOME_MESSAGE =
  'أهلاً بيك! 👋 أنا FOFi، مساعد شيررايد. اسألني عن أي حاجة في التطبيق، أو اختار من الاقتراحات دي:';

export const FOFiAssistant: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatEntry[]>([{ id: 'welcome', from: 'fofi', text: WELCOME_MESSAGE }]);
  const [draft, setDraft] = useState('');
  const [showHandoff, setShowHandoff] = useState(false);
  // Phase 3, item 21: once FOFi can't answer, it offers exactly two choices
  // first ("كلم الدعم" / "واتساب") — the in-app message textarea only
  // appears after "كلم الدعم" is tapped, it's not dumped on screen
  // immediately alongside the WhatsApp button.
  const [handoffStage, setHandoffStage] = useState<'choose' | 'form'>('choose');
  const [handoffText, setHandoffText] = useState('');
  const [handoffStatus, setHandoffStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastUnansweredRef = useRef('');

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, showHandoff]);

  const pushMessage = (entry: Omit<ChatEntry, 'id'>) => {
    setMessages((prev) => [...prev, { ...entry, id: `${Date.now()}-${prev.length}` }]);
  };

  const respondTo = (text: string) => {
    pushMessage({ from: 'user', text });
    const match = matchFAQ(text);
    if (match) {
      pushMessage({ from: 'fofi', text: match.answer });
      setShowHandoff(false);
    } else {
      lastUnansweredRef.current = text;
      pushMessage({
        from: 'fofi',
        text: 'مش قادر أساعدك في النقطة دي لوحدي 😅 اختار تحب تكمل إزاي:'
      });
      setHandoffStage('choose');
      setShowHandoff(true);
    }
  };

  const handleSend = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    respondTo(text);
  };

  const handleQuickSuggestion = (item: FAQItem) => {
    respondTo(item.question);
  };

  const handleSendToSupport = async () => {
    const text = handoffText.trim();
    if (!text) return;
    setHandoffStatus('sending');
    try {
      await submitSupportMessage(text, lastUnansweredRef.current || undefined);
      setHandoffStatus('sent');
      setHandoffText('');
      pushMessage({ from: 'fofi', text: 'تمام، وصلت رسالتك لفريق الدعم وهيتواصلوا معاك في أقرب وقت 🙏' });
      setShowHandoff(false);
    } catch {
      setHandoffStatus('error');
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 max-w-md mx-auto pointer-events-none">
      <div className="relative h-0">
        {/* Launcher — deliberately on the left (mirrored from the rest of
            the RTL UI) so it never collides with the bottom-nav/profile
            controls on the right. */}
        {!isOpen && (
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            aria-label="افتح مساعد FOFi"
            className="pointer-events-auto absolute left-4 bottom-24 w-14 h-14 rounded-full bg-primary-500 text-white shadow-lg shadow-primary-500/40 border-2 border-white flex items-center justify-center hover:bg-primary-600 transition-colors animate-fade-in"
          >
            <Sparkles className="w-6 h-6" />
          </button>
        )}

        {isOpen && (
          <>
            {/* Click-away backdrop: any click outside the chat window closes
                it immediately, no need to hit the X (item 20). Sits behind
                the panel but above the rest of the app; the panel itself
                stops propagation so clicks inside it never bubble here. */}
            <div
              className="pointer-events-auto fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
              aria-hidden="true"
            />
            <div
              onClick={(e) => e.stopPropagation()}
              className="pointer-events-auto absolute z-50 left-3 right-3 bottom-24 max-h-[70vh] bg-white rounded-3xl border border-primary-200 shadow-2xl flex flex-col overflow-hidden animate-fade-in"
            >
            {/* Header */}
            <div className="flex items-center justify-between gap-2 px-4 py-3 bg-primary-500 text-white flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-black leading-none">FOFi</p>
                  <p className="text-[10px] text-primary-50 font-semibold">مساعد شيررايد</p>
                </div>
              </div>
              <button type="button" onClick={() => setIsOpen(false)} aria-label="إغلاق" className="p-1.5 rounded-full hover:bg-white/20">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 bg-neutral-50">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.from === 'user' ? 'justify-start' : 'justify-end'}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs font-semibold leading-relaxed ${
                      m.from === 'user'
                        ? 'bg-gray-200 text-gray-900 rounded-bl-sm'
                        : 'bg-primary-100 text-primary-900 rounded-br-sm'
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              ))}

              {messages.length <= 1 && !showHandoff && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {FAQ.slice(0, 5).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleQuickSuggestion(item)}
                      className="px-2.5 py-1.5 rounded-full border border-primary-200 bg-white text-primary-700 text-[11px] font-bold hover:bg-primary-50"
                    >
                      {item.question}
                    </button>
                  ))}
                </div>
              )}

              {showHandoff && (
                <div className="rounded-2xl border border-primary-200 bg-white p-3 space-y-2">
                  {handoffStage === 'choose' && (
                    <>
                      <button
                        type="button"
                        onClick={() => setHandoffStage('form')}
                        className="w-full flex items-center justify-center gap-1.5 rounded-xl border-2 border-primary-500 text-primary-700 text-[11px] font-bold py-2 hover:bg-primary-50"
                      >
                        <Send className="w-3.5 h-3.5" /> كلم الدعم
                      </button>
                      <a
                        href={SUPPORT_WHATSAPP_LINK}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-green-500 text-white text-[11px] font-bold py-2 hover:bg-green-600"
                      >
                        <Phone className="w-3.5 h-3.5" /> واتساب
                      </a>
                    </>
                  )}

                  {handoffStage === 'form' && (
                    handoffStatus === 'sent' ? (
                      <p className="flex items-center gap-1 text-[11px] font-bold text-primary-700">
                        <CheckCircle2 className="w-3.5 h-3.5" /> تم إرسال رسالتك للدعم
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        <textarea
                          value={handoffText}
                          onChange={(e) => setHandoffText(e.target.value)}
                          placeholder="اكتب رسالتك لفريق الدعم هنا..."
                          rows={2}
                          className="input text-[11px] resize-none"
                        />
                        <button
                          type="button"
                          onClick={handleSendToSupport}
                          disabled={!handoffText.trim() || handoffStatus === 'sending'}
                          className="w-full flex items-center justify-center gap-1.5 rounded-xl border-2 border-primary-500 text-primary-700 text-[11px] font-bold py-2 hover:bg-primary-50 disabled:opacity-40"
                        >
                          {handoffStatus === 'sending' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                          ابعت رسالة داخل التطبيق
                        </button>
                        {handoffStatus === 'error' && (
                          <p className="text-[10px] text-red-600 font-bold">تعذر الإرسال، جرّب واتساب بدل كده.</p>
                        )}
                      </div>
                    )
                  )}
                </div>
              )}
            </div>

            {/* Composer — hidden once FOFi has escalated to a human (item
                21: "اخفِ chat interface بالكامل، ولا تسمح باستكمال chat مع
                FOFi"). The only way forward from here is one of the two
                handoff options above; re-opening the assistant later
                starts a fresh conversation. */}
            {!showHandoff && (
              <div className="flex items-center gap-2 px-3 py-2.5 border-t border-gray-100 bg-white flex-shrink-0">
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSend(); } }}
                  placeholder="اكتب سؤالك هنا..."
                  className="input flex-1 text-xs py-2"
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!draft.trim()}
                  aria-label="إرسال"
                  className="w-9 h-9 rounded-full bg-primary-500 text-white flex items-center justify-center hover:bg-primary-600 disabled:opacity-40 flex-shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
          </>
        )}
      </div>
    </div>
  );
};

// Exported for MainLayout's floating-action-button area, and reused by
// AdminPage.tsx to know the same WhatsApp number without duplicating it.
export const FOFI_SUPPORT_WHATSAPP_LINK = SUPPORT_WHATSAPP_LINK;
export const FOFiLauncherIcon = MessageCircle;
