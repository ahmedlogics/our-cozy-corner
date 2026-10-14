import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Lock, MessageSquare, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { canReadChat, canSendChat, messagesQuery, sendMessage, useMessagesRealtime, type Message } from "@/features/chat/chat";
import type { OrderStatus } from "@/features/orders/orders";

import { supabase } from "@/integrations/supabase/client";

export function ChatPanel({ orderId, status, riderId, meId, otherName }: { orderId: string; status: OrderStatus; riderId: string | null; meId: string; otherName: string }) {
  if (!canReadChat(status, riderId)) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border p-6 text-center">
        <Lock className="size-6 text-muted-foreground" />
        <p className="text-sm font-medium">Chat opens once a rider accepts</p>
        <p className="text-xs text-muted-foreground">You'll be able to message each other right away.</p>
      </div>
    );
  }
  return <ChatInner orderId={orderId} status={status} riderId={riderId} meId={meId} otherName={otherName} />;
}

const QUICK_REPLIES = [
  "I'm at the pickup spot",
  "Please call upon arrival",
  "Parcel is ready",
  "On my way!",
];

function ChatInner({ orderId, status, riderId, meId, otherName }: { orderId: string; status: OrderStatus; riderId: string | null; meId: string; otherName: string }) {
  useMessagesRealtime(orderId);
  const qc = useQueryClient();
  const q = useQuery(messagesQuery(orderId));
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string>(meId);
  const listRef = useRef<HTMLDivElement>(null);
  const canSend = canSendChat(status, riderId);
  const count = q.data?.length ?? 0;

  useEffect(() => {
    if (!myUserId) {
      supabase.auth.getUser().then(({ data }) => {
        if (data.user?.id) setMyUserId(data.user.id);
      });
    }
  }, [myUserId]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);

  const submit = async (body: string) => {
    if (!body.trim() || sending) return;
    setSending(true);
    setFailed(null);
    try {
      const m = await sendMessage(orderId, body);
      qc.setQueryData<Message[]>(["messages", orderId], (old) => (old?.some((x) => x.id === m.id) ? old : [...(old ?? []), m]));
      setText("");
      qc.invalidateQueries({ queryKey: ["messages", orderId] });
    } catch (e) {
      setFailed(body);
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-secondary/20 shadow-soft">
      <div className="flex items-center justify-between border-b border-border bg-card/60 px-4 py-2.5 backdrop-blur">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <MessageSquare className="size-4 text-primary" />
          <span>{otherName}</span>
          <span className="size-2 rounded-full bg-success" title="Active Delivery Session" />
        </p>
        <button type="button" onClick={() => q.refetch()} className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground" aria-label="Refresh messages">
          <RefreshCw className={cn("size-4", q.isFetching && "animate-spin")} />
        </button>
      </div>
      <div ref={listRef} className="h-72 space-y-2 overflow-y-auto p-4" aria-live="polite">
        {q.isLoading ? (
          <div className="grid h-full place-items-center text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
        ) : q.isError ? (
          <div className="grid h-full place-items-center text-center text-sm text-muted-foreground">
            <div><p>Couldn't load messages.</p><Button size="sm" variant="glass" className="mt-2" onClick={() => q.refetch()}>Retry</Button></div>
          </div>
        ) : count === 0 ? (
          <div className="grid h-full place-items-center text-center text-sm text-muted-foreground">
            <p>No messages yet — send an update or instructions below 👋</p>
          </div>
        ) : (
          q.data!.map((m) => {
            const mine = m.sender_id === (meId || myUserId);
            return (
              <div key={m.id} className={cn("animate-enter flex", mine ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-sm", mine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-card border border-border text-foreground")}>
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={cn("mt-1 text-[10px]", mine ? "text-primary-foreground/75" : "text-muted-foreground")}>{new Date(m.created_at).toLocaleTimeString("en-PK", { timeStyle: "short" })}</p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {canSend ? (
        <>
          <div className="flex flex-wrap gap-1.5 border-t border-border/60 bg-background/40 px-3 py-2">
            {QUICK_REPLIES.map((qr) => (
              <button
                key={qr}
                type="button"
                onClick={() => submit(qr)}
                disabled={sending}
                className="rounded-full border border-border/80 bg-secondary/50 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                {qr}
              </button>
            ))}
          </div>

          <form className="flex gap-2 border-t border-border bg-card/60 p-3" onSubmit={(e) => { e.preventDefault(); submit(text); }}>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={2000}
              placeholder="Type a message…"
              aria-label="Message"
              className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            {failed && !sending ? (
              <Button type="button" variant="glass" onClick={() => submit(failed)}><RefreshCw /> Retry</Button>
            ) : (
              <Button type="submit" variant="hero" disabled={sending || !text.trim()} aria-label="Send">{sending ? <Loader2 className="animate-spin" /> : <Send />}</Button>
            )}
          </form>
        </>
      ) : (
        <p className="border-t border-border p-3 text-center text-xs text-muted-foreground"><Lock className="mr-1 inline size-3" />Delivery complete — chat is read-only.</p>
      )}
    </div>
  );
}
