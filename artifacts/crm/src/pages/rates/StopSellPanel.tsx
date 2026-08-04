/**
 * StopSellPanel.tsx
 *
 * Self-contained Stop Sell tab panel for the CRM Rates page.
 * Rendered only when activeTab === "stopSell" in Rates.tsx.
 *
 * Owns all Stop Sell UI and data logic:
 *   - rule list with model names, cities, date range, active badge, edit/delete
 *   - Add Rule / edit dialog
 *   - useQuery / useMutation against /api/admin/stop-sell endpoints
 *   - useListAdminModels for the model picker
 */

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useListAdminModels } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, Ban } from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const CITIES = ["Tbilisi", "Kutaisi", "Batumi"] as const;
type City = (typeof CITIES)[number];

const QUERY_KEY = ["admin", "stop-sell"] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

interface StopSellRule {
  id: number;
  name: string | null;
  startDate: string;
  endDate: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  vehicleModelIds: number[];
  cities: string[];
}

interface FormState {
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  vehicleModelIds: number[];
  cities: City[];
}

const BLANK_FORM: FormState = {
  name: "",
  startDate: "",
  endDate: "",
  isActive: true,
  vehicleModelIds: [],
  cities: [],
};

// ─── API helpers ──────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...init });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ─── StopSellPanel ────────────────────────────────────────────────────────────

export default function StopSellPanel() {
  const qc = useQueryClient();

  // ── Data fetching ──────────────────────────────────────────────────────────

  const { data: rules = [], isLoading, error } = useQuery<StopSellRule[]>({
    queryKey: QUERY_KEY,
    queryFn: () => apiFetch<StopSellRule[]>("/api/admin/stop-sell"),
  });

  const { data: allModels = [] } = useListAdminModels();

  // ── Dialog state ──────────────────────────────────────────────────────────

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(BLANK_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  // ── Mutations ─────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (data: Omit<FormState, "name"> & { name: string | null }) =>
      apiFetch<StopSellRule>("/api/admin/stop-sell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name || null,
          startDate: data.startDate,
          endDate: data.endDate,
          isActive: data.isActive,
          vehicleModelIds: data.vehicleModelIds,
          cities: data.cities,
        }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
      closeDialog();
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Omit<FormState, "name">> & { name: string | null } }) =>
      apiFetch<StopSellRule>(`/api/admin/stop-sell/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name || null,
          startDate: data.startDate,
          endDate: data.endDate,
          isActive: data.isActive,
          vehicleModelIds: data.vehicleModelIds,
          cities: data.cities,
        }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
      closeDialog();
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch<void>(`/api/admin/stop-sell/${id}`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiFetch<StopSellRule>(`/api/admin/stop-sell/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  // ── Dialog helpers ────────────────────────────────────────────────────────

  function openAddDialog() {
    setEditingId(null);
    setForm(BLANK_FORM);
    setFormError(null);
    setDialogOpen(true);
  }

  function openEditDialog(rule: StopSellRule) {
    setEditingId(rule.id);
    setForm({
      name: rule.name ?? "",
      startDate: rule.startDate,
      endDate: rule.endDate,
      isActive: rule.isActive,
      vehicleModelIds: rule.vehicleModelIds,
      cities: rule.cities as City[],
    });
    setFormError(null);
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingId(null);
    setForm(BLANK_FORM);
    setFormError(null);
  }

  // ── Form submission ───────────────────────────────────────────────────────

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (form.vehicleModelIds.length === 0) {
      setFormError("Select at least one vehicle model.");
      return;
    }
    if (form.cities.length === 0) {
      setFormError("Select at least one city.");
      return;
    }
    if (!form.startDate || !form.endDate) {
      setFormError("Start date and end date are required.");
      return;
    }
    if (form.startDate > form.endDate) {
      setFormError("Start date must be on or before end date.");
      return;
    }

    const payload = { ...form, name: form.name || null };
    if (editingId !== null) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  // ── Form field helpers ────────────────────────────────────────────────────

  function toggleModel(modelId: number) {
    setForm((f) => ({
      ...f,
      vehicleModelIds: f.vehicleModelIds.includes(modelId)
        ? f.vehicleModelIds.filter((id) => id !== modelId)
        : [...f.vehicleModelIds, modelId],
    }));
  }

  function toggleCity(city: City) {
    setForm((f) => ({
      ...f,
      cities: f.cities.includes(city)
        ? f.cities.filter((c) => c !== city)
        : [...f.cities, city],
    }));
  }

  // ── Model name lookup ─────────────────────────────────────────────────────

  const modelNameMap = new Map(
    allModels.map((m) => [m.id, m.name]),
  );

  function modelNames(ids: number[]): string {
    if (ids.length === 0) return "—";
    return ids.map((id) => modelNameMap.get(id) ?? `#${id}`).join(", ");
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Rules that suppress matching vehicle models from public website results for a given
            city and date range. CRM, broker, and RBG flows are unaffected.
          </p>
        </div>
        <Button onClick={openAddDialog} className="shadow-sm">
          <Plus className="w-4 h-4 mr-2" /> Add Rule
        </Button>
      </div>

      {/* Rule list */}
      <Card className="border-border/40 bg-card/60 backdrop-blur-md shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="border-border/40 hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead>Models</TableHead>
                <TableHead>Cities</TableHead>
                <TableHead>Date Range</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-destructive">
                    Failed to load Stop Sell rules.
                  </TableCell>
                </TableRow>
              ) : rules.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    <Ban className="w-8 h-8 opacity-20 mx-auto mb-2" />
                    No Stop Sell rules. Add one to suppress models from the public website.
                  </TableCell>
                </TableRow>
              ) : (
                rules.map((rule) => (
                  <TableRow key={rule.id} className="border-border/40">
                    <TableCell className="font-medium">
                      {rule.name ?? <span className="text-muted-foreground italic">—</span>}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm">
                      {modelNames(rule.vehicleModelIds)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {rule.cities.map((c) => (
                          <Badge key={c} variant="outline" className="text-[11px]">
                            {c}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {rule.startDate} → {rule.endDate}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={rule.isActive ? "default" : "secondary"}
                        className="cursor-pointer select-none"
                        onClick={() =>
                          toggleActiveMutation.mutate({ id: rule.id, isActive: !rule.isActive })
                        }
                      >
                        {rule.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEditDialog(rule)}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm("Delete this Stop Sell rule?")) {
                              deleteMutation.mutate(rule.id);
                            }
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              {editingId !== null ? "Edit Stop Sell Rule" : "Add Stop Sell Rule"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-2">
            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Internal name / note (optional)</label>
              <Input
                placeholder="e.g. Peak season Tbilisi"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            {/* Date range */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Start date</label>
                <Input
                  type="date"
                  required
                  value={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">End date</label>
                <Input
                  type="date"
                  required
                  value={form.endDate}
                  onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                />
              </div>
            </div>

            {/* Cities */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Cities</label>
              <div className="flex gap-3">
                {CITIES.map((city) => (
                  <label key={city} className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={form.cities.includes(city)}
                      onChange={() => toggleCity(city)}
                      className="w-4 h-4 accent-primary"
                    />
                    <span className="text-sm">{city}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Vehicle models */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Vehicle models</label>
              <div className="border border-border/50 rounded-md p-3 max-h-48 overflow-y-auto flex flex-col gap-1.5">
                {allModels.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Loading models…</p>
                ) : (
                  allModels.map((m) => (
                    <label key={m.id} className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={form.vehicleModelIds.includes(m.id)}
                        onChange={() => toggleModel(m.id)}
                        className="w-4 h-4 accent-primary"
                      />
                      <span className="text-sm">{m.name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>

            {/* Active toggle */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                className="w-4 h-4 accent-primary"
              />
              <span className="text-sm font-medium">Active</span>
            </label>

            {/* Error */}
            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog} disabled={isSaving}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? "Saving…" : editingId !== null ? "Save Changes" : "Add Rule"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
