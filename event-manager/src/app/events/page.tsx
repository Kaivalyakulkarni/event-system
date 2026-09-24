"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type EventRow = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_time: string;
  end_time: string;
  capacity: number;
  registered_count: number;
};

const ERRORS: Record<string, string> = {
  EVENT_FULL: "This event is full.",
  ALREADY_REGISTERED: "You're already registered for this event.",
  EVENT_STARTED: "This event has already started.",
  NOT_AUTHENTICATED: "Please log in again.",
  EVENT_NOT_FOUND: "Event not found.",
};

function friendlyError(message: string) {
  if (message.includes("SCHEDULE_CLASH")) {
    const title = message.split("SCHEDULE_CLASH:")[1]?.trim();
    return `Schedule clash with "${title}".`;
  }
  const key = Object.keys(ERRORS).find((k) => message.includes(k));
  return key ? ERRORS[key] : message;
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

export default function EventsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [events, setEvents] = useState<EventRow[]>([]);
  const [myIds, setMyIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"all" | "mine">("all");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    const [ev, regs] = await Promise.all([
      supabase
        .from("events_with_seats")
        .select("*")
        .gte("end_time", new Date().toISOString())
        .order("start_time"),
      supabase.from("registrations").select("event_id"),
    ]);

    if (ev.data) setEvents(ev.data as EventRow[]);
    if (regs.data) setMyIds(new Set(regs.data.map((r) => r.event_id as string)));
    setLoading(false);
  }, [supabase, router]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000); // refresh seat counts every 10s
    return () => clearInterval(t);
  }, [load]);

  async function register(id: string) {
    setBusyId(id);
    setMsg(null);
    const { error } = await supabase.rpc("register_for_event", { p_event_id: id });
    setMsg(
      error
        ? { type: "err", text: friendlyError(error.message) }
        : { type: "ok", text: "Registered successfully." }
    );
    await load();
    setBusyId(null);
  }

  async function unregister(id: string) {
    setBusyId(id);
    setMsg(null);
    const { error } = await supabase.from("registrations").delete().eq("event_id", id);
    setMsg(
      error
        ? { type: "err", text: error.message }
        : { type: "ok", text: "Unregistered." }
    );
    await load();
    setBusyId(null);
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const visible = events.filter(
    (e) =>
      e.title.toLowerCase().includes(query.toLowerCase()) &&
      (tab === "all" || myIds.has(e.id))
  );

  return (
    <main className="max-w-3xl mx-auto p-4 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Campus Events</h1>
        <button onClick={logout} className="text-sm underline">
          Log out
        </button>
      </header>

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search events..."
          className="flex-1 border rounded-lg px-3 py-2"
        />
        <div className="flex rounded-lg border overflow-hidden">
          {(["all", "mine"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm ${
                tab === t ? "bg-black text-white" : "bg-white"
              }`}
            >
              {t === "all" ? "All events" : "My events"}
            </button>
          ))}
        </div>
      </div>

      {msg && (
        <p
          className={`text-sm rounded-lg px-3 py-2 ${
            msg.type === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
          }`}
        >
          {msg.text}
        </p>
      )}

      {loading && <p className="text-gray-500">Loading events...</p>}
      {!loading && visible.length === 0 && (
        <p className="text-gray-500">No events found.</p>
      )}

      <ul className="space-y-3">
        {visible.map((e) => {
          const available = e.capacity - e.registered_count;
          const isMine = myIds.has(e.id);
          const isFull = available <= 0;
          return (
            <li key={e.id} className="bg-white border rounded-xl p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-lg">{e.title}</h2>
                  <p className="text-sm text-gray-600">
                    {fmt(e.start_time)} to {fmt(e.end_time)}
                    {e.location && ` · ${e.location}`}
                  </p>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${
                    isFull ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                  }`}
                >
                  {isFull ? "Full" : `${available} of ${e.capacity} seats left`}
                </span>
              </div>

              {e.description && <p className="text-sm">{e.description}</p>}

              {isMine ? (
                <button
                  onClick={() => unregister(e.id)}
                  disabled={busyId === e.id}
                  className="border border-red-600 text-red-600 rounded-lg px-4 py-1.5 text-sm disabled:opacity-50"
                >
                  {busyId === e.id ? "..." : "Unregister"}
                </button>
              ) : (
                <button
                  onClick={() => register(e.id)}
                  disabled={busyId === e.id || isFull}
                  className="bg-black text-white rounded-lg px-4 py-1.5 text-sm disabled:opacity-50"
                >
                  {busyId === e.id ? "..." : isFull ? "Full" : "Register"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}