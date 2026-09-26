import { useEffect, useRef, useState } from 'react';
import orderChatService from '../../services/orderChatService';
import { formatTime } from '../../lib/format';
import Sheet from './Sheet';

// Discussion client / livreur d'une commande, dans une fiche. Relit les nouveaux messages toutes les 4 s tant
// qu'elle est ouverte ; les messages de l'autre sont alors marqués lus (`onRead` met à jour les pastilles).
// Les messages rapides évitent de taper au guidon ou en marchant.
export default function ChatSheet({ open, onClose, orderId, otherName, quickMessages = [], warning, onRead }) {
  const [messages, setMessages] = useState([]);
  const [writable, setWritable] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const lastId = useRef(0);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    lastId.current = 0;
    setMessages([]);
    setError('');

    async function load() {
      try {
        const data = await orderChatService.list(orderId, { after: lastId.current || undefined, open: true });
        if (cancelled) return;
        setWritable(data.writable);
        if (data.data.length > 0) {
          lastId.current = data.data[data.data.length - 1].id;
          // Dédoublonnage par identifiant : un message envoyé est déjà à l'écran quand la relecture le renvoie.
          setMessages((prev) => [...prev, ...data.data.filter((m) => !prev.some((p) => p.id === m.id))]);
        }
        onRead?.();
      } catch {
        // réseau coupé : la relecture suivante reprendra
      }
    }

    load();
    const timer = setInterval(load, 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orderId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, open]);

  async function send(body) {
    const content = body.trim();
    if (!content || sending) return;
    setSending(true);
    setError('');
    try {
      const sent = await orderChatService.send(orderId, content);
      setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
      setText('');
    } catch (err) {
      setError(err.response?.data?.errors?.body?.[0] ?? err.response?.data?.message ?? "Message non envoyé. Réessayez.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Discussion avec ${otherName ?? 'votre contact'}`}
      subtitle="Seuls vous et votre interlocuteur voyez ces messages."
      footer={
        writable ? (
          <div>
            {quickMessages.length > 0 && (
              <div className="-mx-1 mb-2 flex gap-2 overflow-x-auto px-1 pb-1">
                {quickMessages.map((quick) => (
                  <button
                    key={quick}
                    type="button"
                    onClick={() => send(quick)}
                    disabled={sending}
                    className="flex-shrink-0 rounded-full border border-outline-variant px-3 py-1.5 text-xs font-semibold text-secondary transition hover:bg-surface-container"
                  >
                    {quick}
                  </button>
                ))}
              </div>
            )}
            {error && (
              <p role="alert" className="mb-2 text-xs font-medium text-error">
                {error}
              </p>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(text);
              }}
              className="flex gap-2"
            >
              <input
                className="input-field flex-1"
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={500}
                placeholder="Votre message…"
                aria-label="Votre message"
              />
              <button type="submit" disabled={sending || !text.trim()} className="btn-primary flex-shrink-0 !px-4">
                Envoyer
              </button>
            </form>
          </div>
        ) : (
          <p className="text-center text-sm text-on-surface-variant">La course est terminée : la conversation est fermée.</p>
        )
      }
    >
      {warning && <p className="mb-3 rounded bg-primary-fixed px-3 py-2 text-xs text-on-primary-fixed-variant">{warning}</p>}

      {messages.length === 0 ? (
        <p className="py-8 text-center text-sm text-on-surface-variant">
          Aucun message pour le moment. Dites bonjour ou choisissez un message rapide.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {messages.map((m) => (
            <li key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                  m.mine ? 'rounded-br-sm bg-primary text-on-primary' : 'rounded-bl-sm bg-surface-container'
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={`mt-0.5 text-right text-[10px] ${m.mine ? 'text-on-primary/80' : 'text-on-surface-variant'}`}>{formatTime(m.created_at)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div ref={bottomRef} />
    </Sheet>
  );
}
