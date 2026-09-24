"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type EventRow = {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  capacity: number;
  registered_count: number;
};
type Reg = { email: string; registered_at: string };

const empty = {
  title: "",
  description: "",
  location: "",
  start: "",
  end: "",
  capacity: "50",
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

export default function AdminPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [regs, setRegs] = useState<Reg[]>([]);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    const { data: isAdmin } = await supabase.rpc("is_admin");
    if (!isAdmin) {
      router.push("/events");
      return;
    }
    const { data } = await supabase
      .from("events_with_seats")
      .select("*")
      .order("start_time");
    if (data) setEvents(data as EventRow[]);
    setReady(true);
  }, [supabase, router]);

  useEffect(() => {
    load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const start = new Date(form.start);
    const end = new Date(form.end);
    if (end <= start) return setError("End time must be after start time.");

    const { error } = await supabase.from("events").insert({
      title: form.title,
      description: form.description || null,
      location: form.location || null,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      capacity: Number(form.capacity),
    });
    if (error) return setError(error.message);
    setForm(empty);
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this event and all its registrations?")) return;
    const { error } = await supabase.from("events").delete().eq("id", id);
    if (error) return setError(error.message);
    load();
  }

  async function toggleRegs(id: string) {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    const { data, error } = await supabase.rpc("event_registrations", {
      p_event_id: id,
    });
    if (error) return setError(error.message);
    setRegs((data ?? []) as Reg[]);
    setOpenId(id);
  }

  if (!ready) return <p className="p-4 text-gray-500">Loading...</p>;

  const totalRegs = events.reduce((n, e) => n + e.registered_count, 0);

  return (
    <main className="max-w-3xl mx-auto p-4 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Admin dashboard</h1>
        <a href="/events" className="text-sm underline">
          Student view
        </a>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border rounded-xl p-4">
          <p className="text-sm text-gray-500">Events</p>
          <p className="text-2xl font-semibold">{events.length}</p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <p className="text-sm text-gray-500">Total registrations</p>
          <p className="text-2xl font-semibold">{totalRegs}</p>
        </div>
      </div>

      <form onSubmit={create} className="bg-white border rounded-xl p-4 space-y-3">
        <h2 className="font-semibold">Create event</h2>
        <input
          required
          placeholder="Title"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          className="w-full border rounded-lg px-3 py-2"
        />
        <input
          placeholder="Description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="w-full border rounded-lg px-3 py-2"
        />
        <input
          placeholder="Location"
          value={form.location}
          onChange={(e) => setForm({ ...form, location: e.target.value })}
          className="w-full border rounded-lg px-3 py-2"
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="text-sm">
            Start
            <input
              required
              type="datetime-local"
              value={form.start}
              onChange={(e) => setForm({ ...form, start: e.target.value })}
              className="w-full border rounded-lg px-3 py-2"
            />
          </label>
          <label className="text-sm">
            End
            <input
              required
              type="datetime-local"
              value={form.end}
              onChange={(e) => setForm({ ...form, end: e.target.value })}
              className="w-full border rounded-lg px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Capacity
            <input
              required
              type="number"
              min={1}
              value={form.capacity}
              onChange={(e) => setForm({ ...form, capacity: e.target.value })}
              className="w-full border rounded-lg px-3 py-2"
            />
          </label>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="bg-black text-white rounded-lg px-4 py-2">Create</button>
      </form>

      <ul className="space-y-3">
        {events.map((e) => (
          <li key={e.id} className="bg-white border rounded-xl p-4 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">{e.title}</h3>
                <p className="text-sm text-gray-600">
                  {fmt(e.start_time)} to {fmt(e.end_time)}
                </p>
                <p className="text-sm">
                  {e.registered_count} / {e.capacity} registered
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => toggleRegs(e.id)}
                  className="border rounded-lg px-3 py-1 text-sm"
                >
                  {openId === e.id ? "Hide" : "Registrations"}
                </button>
                <button
                  onClick={() => remove(e.id)}
                  className="border border-red-600 text-red-600 rounded-lg px-3 py-1 text-sm"
                >
                  Delete
                </button>
              </div>
            </div>
            {openId === e.id && (
              <ul className="text-sm border-t pt-2 space-y-1">
                {regs.length === 0 && <li className="text-gray-500">No registrations yet.</li>}
                {regs.map((r) => (
                  <li key={r.email}>
                    {r.email}{" "}
                    <span className="text-gray-500">({fmt(r.registered_at)})</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}