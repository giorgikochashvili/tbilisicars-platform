import { useState, useEffect, Fragment } from "react";
import FixedExpenses from "./FixedExpenses";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Filter, X, Edit, Trash2, TrendingUp, TrendingDown,
  ArrowUpCircle, ArrowDownCircle, DollarSign, MoreHorizontal,
  RefreshCw, ChevronDown, ChevronRight, User, Car, Handshake,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ── API fetch ─────────────────────────────────────────────────────────────────

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Request failed");
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") return null;
  return res.json().catch(() => null);
}

// ── Constants ─────────────────────────────────────────────────────────────────

const INCOME_CATEGORIES = [
  "Booking Payment",
  "Extra Payment",
  "Extra Days Payment",
  "Advance Payment",
  "Other Income",
];

const EXPENSE_CATEGORIES = [
  "Service / Maintenance",
  "Fuel",
  "Refund",
  "Office Expense",
  "Salary",
  "Marketing",
  "Airport Office Fee",
  "Parking Fee",
  "Other Expense",
];

const CURRENCY_SYMBOLS: Record<string, string> = { GEL: "₾", USD: "$", EUR: "€" };

const TYPE_COLORS: Record<string, string> = {
  INCOME:  "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  EXPENSE: "bg-red-500/10 text-red-500 border-red-500/20",
};

const EMPTY_FORM = {
  type: "INCOME" as "INCOME" | "EXPENSE",
  category: "",
  amount: "",
  currency: "GEL" as "GEL" | "USD" | "EUR",
  convertedGel: "",
  entryDate: new Date().toISOString().split("T")[0],
  notes: "",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatGel(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  return `₾${parseFloat(String(value)).toFixed(2)}`;
}

function formatAmount(amount: string | number, currency: string) {
  const sym = CURRENCY_SYMBOLS[currency] ?? currency;
  return `${sym}${parseFloat(String(amount)).toFixed(2)}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AccountingPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<any>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [autoGel, setAutoGel] = useState("");

  const [filterType, setFilterType] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterCurrency, setFilterCurrency] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterCity, setFilterCity] = useState("");

  const [expandedEntryId, setExpandedEntryId] = useState<number | null>(null);
  const [expandedEntryData, setExpandedEntryData] = useState<any>(null);
  const [expandedEntryLoading, setExpandedEntryLoading] = useState(false);

  // Partner payable inline state
  const [payableAmount, setPayableAmount] = useState("");
  const [payableCurrency, setPayableCurrency] = useState<"GEL" | "USD" | "EUR">("GEL");
  const [payableError, setPayableError] = useState<string | null>(null);
  const [payableEditMode, setPayableEditMode] = useState(false);
  const [payableEditAmount, setPayableEditAmount] = useState("");
  const [payableEditNotes, setPayableEditNotes] = useState("");
  const [payableMarkPaidConfirm, setPayableMarkPaidConfirm] = useState(false);
  const [payableCancelConfirm, setPayableCancelConfirm] = useState(false);
  const [payableMutating, setPayableMutating] = useState(false);

  // Edit warning detail — fetched in background when modal opens for edit
  const [editingEntryDetail, setEditingEntryDetail] = useState<any | null>(null);

  const [showRateEditor, setShowRateEditor] = useState(false);
  const [rateUsd, setRateUsd] = useState("");
  const [rateEur, setRateEur] = useState("");

  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: rateData } = useQuery({
    queryKey: ["exchange-rate"],
    queryFn: () => apiFetch("/api/admin/accounting/rates"),
  });

  const { data: summaryData } = useQuery({
    queryKey: ["accounting-summary"],
    queryFn: () => apiFetch("/api/admin/accounting/summary"),
  });

  const params = new URLSearchParams();
  if (filterType) params.set("type", filterType);
  if (filterCategory) params.set("category", filterCategory);
  if (filterCurrency) params.set("currency", filterCurrency);
  if (filterDateFrom) params.set("dateFrom", filterDateFrom);
  if (filterDateTo) params.set("dateTo", filterDateTo);
  if (filterCity) params.set("city", filterCity);

  const { data: listData, isLoading } = useQuery({
    queryKey: ["accounting-entries", filterType, filterCategory, filterCurrency, filterDateFrom, filterDateTo, filterCity],
    queryFn: () => apiFetch(`/api/admin/accounting?${params.toString()}`),
  });

  const entries: any[] = listData?.data ?? [];
  const meta = listData?.meta;

  // ── Auto-convert GEL ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!formData.amount || formData.currency === "GEL") {
      setAutoGel(formData.currency === "GEL" ? formData.amount : "");
      return;
    }
    const amt = parseFloat(formData.amount);
    if (isNaN(amt) || !rateData) return;
    const rate =
      formData.currency === "USD"
        ? parseFloat(rateData.usdToGel)
        : parseFloat(rateData.eurToGel);
    setAutoGel((amt * rate).toFixed(2));
  }, [formData.amount, formData.currency, rateData]);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["accounting-entries"] });
    queryClient.invalidateQueries({ queryKey: ["accounting-summary"] });
  };

  const createMutation = useMutation({
    mutationFn: (body: any) =>
      apiFetch("/api/admin/accounting", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast({ title: "Entry created" });
      invalidate();
      setIsModalOpen(false);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) =>
      apiFetch(`/api/admin/accounting/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast({ title: "Entry updated" });
      invalidate();
      setIsModalOpen(false);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/admin/accounting/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Entry deleted" });
      invalidate();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const rateMutation = useMutation({
    mutationFn: (body: any) =>
      apiFetch("/api/admin/accounting/rates", { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast({ title: "Exchange rates updated" });
      queryClient.invalidateQueries({ queryKey: ["exchange-rate"] });
      setShowRateEditor(false);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  const openModal = (entry: any = null) => {
    if (entry) {
      setEditingEntry(entry);
      setFormData({
        type: entry.type ?? "INCOME",
        category: entry.category ?? "",
        amount: entry.amount?.toString() ?? "",
        currency: entry.currency ?? "GEL",
        convertedGel: entry.convertedGel?.toString() ?? "",
        entryDate: entry.entryDate ?? new Date().toISOString().split("T")[0],
        notes: entry.notes ?? "",
      });
      setAutoGel(entry.convertedGel?.toString() ?? "");
      // Fetch entry detail in background for edit warnings
      setEditingEntryDetail(null);
      apiFetch(`/api/admin/accounting/${entry.id}`)
        .then((d) => setEditingEntryDetail(d))
        .catch(() => setEditingEntryDetail(null));
    } else {
      setEditingEntry(null);
      setFormData(EMPTY_FORM);
      setAutoGel("");
      setEditingEntryDetail(null);
    }
    setIsModalOpen(true);
  };

  const handleCreatePayable = async (entryId: number, entryData: any) => {
    const amtNum = parseFloat(payableAmount);
    if (!payableAmount || isNaN(amtNum) || amtNum <= 0) {
      toast({ title: "Validation", description: "Enter a positive amount", variant: "destructive" });
      return;
    }
    setPayableMutating(true);
    setPayableError(null);
    try {
      await apiFetch("/api/admin/partners/payables", {
        method: "POST",
        body: JSON.stringify({
          partnerId: entryData.vehicle_partner_id,
          bookingId: entryData.booking_id,
          vehicleId: entryData.related_vehicle_id,
          sourceIncomeAccountingEntryId: entryId,
          amount: amtNum,
          currency: payableCurrency,
        }),
      });
      setPayableAmount("");
      setPayableCurrency("GEL");
      toast({ title: "Payable created" });
      await refreshExpandedEntry(entryId);
    } catch (err: any) {
      const msg: string = err?.message ?? "Failed to create payable";
      if (msg.includes("409") || msg.toLowerCase().includes("already exists")) {
        setPayableError(
          `A payable already exists for this income entry (status: ${entryData.partner_payable_status ?? "existing"}). Only a canceled payable may be replaced.`
        );
      } else {
        setPayableError(msg);
      }
    } finally {
      setPayableMutating(false);
    }
  };

  const handleUpdatePayable = async (payableId: number) => {
    const amtNum = parseFloat(payableEditAmount);
    if (!payableEditAmount || isNaN(amtNum) || amtNum <= 0) {
      toast({ title: "Validation", description: "Enter a positive amount", variant: "destructive" });
      return;
    }
    setPayableMutating(true);
    try {
      await apiFetch(`/api/admin/partners/payables/${payableId}`, {
        method: "PATCH",
        body: JSON.stringify({ amount: amtNum, notes: payableEditNotes || null }),
      });
      setPayableEditMode(false);
      toast({ title: "Payable updated" });
      if (expandedEntryId) await refreshExpandedEntry(expandedEntryId);
    } catch (err: any) {
      toast({ title: "Error", description: err?.message ?? "Failed to update payable", variant: "destructive" });
    } finally {
      setPayableMutating(false);
    }
  };

  const handleCancelPayable = async (payableId: number) => {
    setPayableMutating(true);
    try {
      await apiFetch(`/api/admin/partners/payables/${payableId}/cancel`, { method: "POST" });
      setPayableCancelConfirm(false);
      toast({ title: "Payable canceled" });
      if (expandedEntryId) await refreshExpandedEntry(expandedEntryId);
    } catch (err: any) {
      toast({ title: "Error", description: err?.message ?? "Failed to cancel payable", variant: "destructive" });
    } finally {
      setPayableMutating(false);
    }
  };

  const handleMarkPaidPayable = async (payableId: number) => {
    setPayableMutating(true);
    try {
      await apiFetch(`/api/admin/partners/payables/${payableId}/mark-paid`, { method: "POST" });
      setPayableMarkPaidConfirm(false);
      toast({ title: "Payable marked as paid — expense entry created" });
      if (expandedEntryId) await refreshExpandedEntry(expandedEntryId);
      invalidate();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message ?? "Failed to mark payable as paid", variant: "destructive" });
    } finally {
      setPayableMutating(false);
    }
  };

  const handleSave = () => {
    if (!formData.category) {
      toast({ title: "Validation", description: "Category is required", variant: "destructive" });
      return;
    }
    if (!formData.amount || isNaN(parseFloat(formData.amount))) {
      toast({ title: "Validation", description: "Valid amount is required", variant: "destructive" });
      return;
    }
    if (!formData.entryDate) {
      toast({ title: "Validation", description: "Date is required", variant: "destructive" });
      return;
    }
    const gelVal = formData.currency === "GEL" ? formData.amount : (autoGel || formData.convertedGel);
    const body = {
      type: formData.type,
      category: formData.category,
      amount: formData.amount,
      currency: formData.currency,
      convertedGel: gelVal,
      entryDate: formData.entryDate,
      notes: formData.notes || null,
    };
    if (editingEntry) {
      updateMutation.mutate({ id: editingEntry.id, body });
    } else {
      createMutation.mutate(body);
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Delete this accounting entry? This cannot be undone.")) {
      deleteMutation.mutate(id);
    }
  };

  const openRateEditor = () => {
    setRateUsd(rateData?.usdToGel ?? "2.72");
    setRateEur(rateData?.eurToGel ?? "2.95");
    setShowRateEditor(true);
  };

  const saveRates = () => {
    rateMutation.mutate({ usdToGel: rateUsd, eurToGel: rateEur });
  };

  const clearFilters = () => {
    setFilterType("");
    setFilterCategory("");
    setFilterCurrency("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterCity("");
  };

  const hasFilters = filterType || filterCategory || filterCurrency || filterDateFrom || filterDateTo || filterCity;

  const toggleExpand = async (id: number) => {
    if (expandedEntryId === id) {
      setExpandedEntryId(null);
      setExpandedEntryData(null);
      return;
    }
    setExpandedEntryId(id);
    setExpandedEntryData(null);
    setExpandedEntryLoading(true);
    try {
      const data = await apiFetch(`/api/admin/accounting/${id}`);
      setExpandedEntryData(data);
    } catch {
      setExpandedEntryData(null);
    } finally {
      setExpandedEntryLoading(false);
    }
  };

  const refreshExpandedEntry = async (id: number) => {
    setExpandedEntryLoading(true);
    try {
      const data = await apiFetch(`/api/admin/accounting/${id}`);
      setExpandedEntryData(data);
    } catch {
      // keep existing data on error
    } finally {
      setExpandedEntryLoading(false);
    }
  };

  // Reset payable inline state whenever the expanded row changes
  useEffect(() => {
    setPayableAmount("");
    setPayableCurrency("GEL");
    setPayableError(null);
    setPayableEditMode(false);
    setPayableEditAmount("");
    setPayableEditNotes("");
    setPayableMarkPaidConfirm(false);
    setPayableCancelConfirm(false);
    setPayableMutating(false);
  }, [expandedEntryId]);

  const allCategories = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES];
  const categoryOptions = formData.type === "INCOME" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const summary = summaryData;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold font-display tracking-tight flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-primary" /> Accounting
          </h2>
          <p className="text-muted-foreground">Operational income and expense ledger</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={openRateEditor} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Rates
            {rateData && (
              <span className="text-xs text-muted-foreground">
                $={parseFloat(rateData.usdToGel).toFixed(2)} €={parseFloat(rateData.eurToGel).toFixed(2)}
              </span>
            )}
          </Button>
          <Button onClick={() => openModal()} className="shadow-sm hover-elevate">
            <Plus className="w-4 h-4 mr-2" /> Add Entry
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border/40 bg-card/60 backdrop-blur-md shadow-sm">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <ArrowUpCircle className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Income (GEL eq.)</p>
                <p className="text-xl font-bold text-emerald-500">
                  {summary ? formatGel(summary.totalIncomeGel) : "—"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/40 bg-card/60 backdrop-blur-md shadow-sm">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                <ArrowDownCircle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Expenses (GEL eq.)</p>
                <p className="text-xl font-bold text-red-500">
                  {summary ? formatGel(summary.totalExpenseGel) : "—"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/40 bg-card/60 backdrop-blur-md shadow-sm">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Net (GEL)</p>
                <p className={`text-xl font-bold ${(summary?.netGel ?? 0) >= 0 ? "text-primary" : "text-destructive"}`}>
                  {summary ? formatGel(summary.netGel) : "—"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/40 bg-card/60 backdrop-blur-md shadow-sm">
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground mb-2">Income by Currency</p>
            <div className="flex flex-col gap-1">
              {["GEL", "USD", "EUR"].map((c) => (
                <div key={c} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{CURRENCY_SYMBOLS[c]} {c}</span>
                  <span className="font-mono font-medium">
                    {summary?.income?.[c] ? `${CURRENCY_SYMBOLS[c]}${parseFloat(summary.income[c]).toFixed(2)}` : "—"}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Fixed Monthly Expenses */}
      <FixedExpenses rates={rateData} />

      {/* Filters */}
      <Card className="border-border/40 bg-card/60 backdrop-blur-md shadow-sm p-4">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Filter className="w-4 h-4" /> Filters
            {hasFilters && (
              <Button variant="ghost" size="sm" className="h-6 px-2 ml-auto text-xs" onClick={clearFilters}>
                <X className="w-3 h-3 mr-1" /> Clear
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <Select value={filterType || "all"} onValueChange={(v) => setFilterType(v === "all" ? "" : v)}>
              <SelectTrigger className="h-9 text-sm bg-background">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="INCOME">Income</SelectItem>
                <SelectItem value="EXPENSE">Expense</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterCategory || "all"} onValueChange={(v) => setFilterCategory(v === "all" ? "" : v)}>
              <SelectTrigger className="h-9 text-sm bg-background">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {allCategories.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterCurrency || "all"} onValueChange={(v) => setFilterCurrency(v === "all" ? "" : v)}>
              <SelectTrigger className="h-9 text-sm bg-background">
                <SelectValue placeholder="Currency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Currencies</SelectItem>
                <SelectItem value="GEL">₾ GEL</SelectItem>
                <SelectItem value="USD">$ USD</SelectItem>
                <SelectItem value="EUR">€ EUR</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterCity || "all"} onValueChange={(v) => setFilterCity(v === "all" ? "" : v)}>
              <SelectTrigger className="h-9 text-sm bg-background">
                <SelectValue placeholder="Region" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Regions</SelectItem>
                <SelectItem value="Tbilisi">Tbilisi</SelectItem>
                <SelectItem value="Batumi">Batumi</SelectItem>
                <SelectItem value="Kutaisi">Kutaisi</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              className="h-9 text-sm bg-background"
              placeholder="From"
            />
            <Input
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              className="h-9 text-sm bg-background"
              placeholder="To"
            />
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card className="border-border/40 bg-card/60 backdrop-blur-md shadow-sm">
        <CardHeader className="py-4 border-b border-border/40 bg-background/50 flex flex-row items-center">
          <CardTitle className="text-base font-display">
            Ledger
            {meta && (
              <span className="font-normal text-muted-foreground ml-2 text-sm">
                ({meta.total} entries)
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="border-border/40 hover:bg-transparent">
                <TableHead className="w-8" />
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">GEL Equiv.</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <TrendingDown className="w-8 h-8 opacity-20" />
                      <p>{hasFilters ? "No entries match the current filters." : "No accounting entries yet."}</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((e: any) => (
                  <Fragment key={e.id}>
                    <TableRow className="border-border/20 hover:bg-muted/30 transition-colors">
                      <TableCell className="w-8 pr-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => toggleExpand(e.id)}
                        >
                          {expandedEntryId === e.id
                            ? <ChevronDown className="w-3.5 h-3.5" />
                            : <ChevronRight className="w-3.5 h-3.5" />}
                        </Button>
                      </TableCell>
                      <TableCell className="text-sm font-mono text-muted-foreground">
                        {e.entryDate
                          ? new Date(e.entryDate + "T00:00:00").toLocaleDateString()
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${TYPE_COLORS[e.type] ?? ""}`}>
                          {e.type === "INCOME" ? (
                            <><TrendingUp className="w-3 h-3 mr-1" />Income</>
                          ) : (
                            <><TrendingDown className="w-3 h-3 mr-1" />Expense</>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{e.category}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        <span className={e.type === "INCOME" ? "text-emerald-500" : "text-red-500"}>
                          {e.type === "EXPENSE" ? "−" : "+"}
                          {formatAmount(e.amount, e.currency)}
                        </span>
                        {e.currency !== "GEL" && (
                          <span className="ml-1 text-xs text-muted-foreground">({e.currency})</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">
                        {formatGel(e.convertedGel)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                        {e.notes || "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem onClick={() => openModal(e)}>
                              <Edit className="w-4 h-4 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDelete(e.id)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="w-4 h-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                    {expandedEntryId === e.id && (
                      <TableRow key={`${e.id}-detail`} className="border-border/10 bg-muted/10">
                        <TableCell colSpan={8} className="p-0">
                          <div className="px-6 py-3 space-y-2 border-l-2 border-primary/30 ml-8">
                            {/* Primary financial fields — always available from list row */}
                            <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                              <span>
                                <span className="font-medium text-foreground">Amount:</span>{" "}
                                <span className={`font-mono ${e.type === "INCOME" ? "text-emerald-500" : "text-red-500"}`}>
                                  {e.type === "EXPENSE" ? "−" : "+"}{formatAmount(e.amount, e.currency)}
                                </span>
                              </span>
                              {e.currency !== "GEL" && (
                                <span>
                                  <span className="font-medium text-foreground">GEL equiv.:</span>{" "}
                                  <span className="font-mono">{formatGel(e.convertedGel)}</span>
                                </span>
                              )}
                              <span>
                                <span className="font-medium text-foreground">Date:</span>{" "}
                                {e.entryDate ? new Date(e.entryDate + "T00:00:00").toLocaleDateString() : "—"}
                              </span>
                              <span>
                                <span className="font-medium text-foreground">Category:</span>{" "}
                                {e.category}
                              </span>
                              {e.notes && (
                                <span>
                                  <span className="font-medium text-foreground">Notes:</span>{" "}
                                  {e.notes}
                                </span>
                              )}
                            </div>
                            {/* Linked entity fields — loaded on expand */}
                            {expandedEntryLoading ? (
                              <div className="flex gap-4">
                                <Skeleton className="h-3 w-32" />
                                <Skeleton className="h-3 w-40" />
                                <Skeleton className="h-3 w-28" />
                              </div>
                            ) : expandedEntryData && (
                              <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground border-t border-border/30 pt-1.5">
                                {expandedEntryData.payment_type_detail && (
                                  <span>
                                    <span className="font-medium text-foreground">Payment type:</span>{" "}
                                    {expandedEntryData.payment_type_detail.toLowerCase().replace(/_/g, " ")}
                                  </span>
                                )}
                                {expandedEntryData.payment_method && (
                                  <span>
                                    <span className="font-medium text-foreground">Method:</span>{" "}
                                    {expandedEntryData.payment_method.toLowerCase().replace(/_/g, " ")}
                                  </span>
                                )}
                                {expandedEntryData.customer_name && (
                                  <span className="flex items-center gap-1">
                                    <User className="w-3 h-3" />
                                    {expandedEntryData.customer_name}
                                    {expandedEntryData.customer_phone && (
                                      <span className="opacity-70">· {expandedEntryData.customer_phone}</span>
                                    )}
                                  </span>
                                )}
                                {expandedEntryData.booking_ref_id && (
                                  <span>
                                    <span className="font-medium text-foreground">Booking:</span>{" "}
                                    <span className="font-mono">#{expandedEntryData.booking_ref_id}</span>
                                  </span>
                                )}
                                {(expandedEntryData.vehicle_brand_name || expandedEntryData.vehicle_model_name) && (
                                  <span className="flex items-center gap-1">
                                    <Car className="w-3 h-3" />
                                    {[expandedEntryData.vehicle_brand_name, expandedEntryData.vehicle_model_name].filter(Boolean).join(" ")}
                                    {expandedEntryData.vehicle_plate && (
                                      <span className="font-mono opacity-70">({expandedEntryData.vehicle_plate})</span>
                                    )}
                                  </span>
                                )}
                                {!expandedEntryData.customer_name && !expandedEntryData.booking_ref_id && !expandedEntryData.vehicle_plate && (
                                  <span className="italic">No linked booking or vehicle</span>
                                )}
                              </div>
                            )}

                            {/* Partner payable section — only when vehicle has a partner owner */}
                            {expandedEntryData?.vehicle_partner_id != null && (
                              <div className="border-t border-border/30 pt-2 mt-1 space-y-2">
                                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                                  <Handshake className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                                  Vehicle Owner Partner
                                </div>

                                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                  <span><span className="font-medium text-foreground">Partner:</span> {expandedEntryData.vehicle_partner_name}</span>
                                  {expandedEntryData.vehicle_plate && (
                                    <span><span className="font-medium text-foreground">Vehicle:</span> <span className="font-mono">{expandedEntryData.vehicle_plate}</span></span>
                                  )}
                                  {expandedEntryData.booking_ref_id && (
                                    <span><span className="font-medium text-foreground">Booking:</span> <span className="font-mono">#{expandedEntryData.booking_ref_id}</span></span>
                                  )}
                                  {expandedEntryData.vehicle_partner_agreement_notes && (
                                    <span className="w-full"><span className="font-medium text-foreground">Agreement notes:</span> {expandedEntryData.vehicle_partner_agreement_notes}</span>
                                  )}
                                </div>

                                {/* INCOME row: payable workflow */}
                                {e.type === "INCOME" && (
                                  <>
                                    {/* No payable yet (or null payable id) */}
                                    {!expandedEntryData.partner_payable_id && (
                                      <div className="space-y-2 pt-0.5">
                                        <p className="text-xs text-muted-foreground">No payable recorded yet.</p>
                                        {payableError && <p className="text-xs text-destructive">{payableError}</p>}
                                        <div className="flex items-end gap-2 flex-wrap">
                                          <div className="grid gap-1">
                                            <Label className="text-xs">Amount</Label>
                                            <Input type="number" step="0.01" min="0" value={payableAmount}
                                              onChange={(ev) => setPayableAmount(ev.target.value)}
                                              placeholder="Enter amount" className="h-8 w-32 text-xs bg-background" />
                                          </div>
                                          <div className="grid gap-1">
                                            <Label className="text-xs">Currency</Label>
                                            <Select value={payableCurrency} onValueChange={(v) => setPayableCurrency(v as "GEL" | "USD" | "EUR")}>
                                              <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
                                              <SelectContent>
                                                <SelectItem value="GEL">₾ GEL</SelectItem>
                                                <SelectItem value="USD">$ USD</SelectItem>
                                                <SelectItem value="EUR">€ EUR</SelectItem>
                                              </SelectContent>
                                            </Select>
                                          </div>
                                          <Button size="sm" className="h-8 text-xs" disabled={payableMutating}
                                            onClick={() => handleCreatePayable(e.id, expandedEntryData)}>
                                            {payableMutating ? "Saving…" : "Add to Pending"}
                                          </Button>
                                        </div>
                                      </div>
                                    )}

                                    {/* PENDING payable */}
                                    {expandedEntryData.partner_payable_id && expandedEntryData.partner_payable_status === "PENDING" && (
                                      <div className="space-y-2 pt-0.5">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <Badge variant="outline" className="text-amber-500 border-amber-500/30 bg-amber-500/10 text-xs">Pending</Badge>
                                          <span className="text-xs font-mono font-medium">
                                            {expandedEntryData.partner_payable_amount} {expandedEntryData.partner_payable_currency}
                                          </span>
                                          {expandedEntryData.partner_payable_notes && (
                                            <span className="text-xs text-muted-foreground">· {expandedEntryData.partner_payable_notes}</span>
                                          )}
                                        </div>
                                        {!payableEditMode ? (
                                          <div className="flex gap-2 flex-wrap">
                                            <Button size="sm" variant="outline" className="h-7 text-xs"
                                              onClick={() => {
                                                setPayableEditMode(true);
                                                setPayableEditAmount(expandedEntryData.partner_payable_amount?.toString() ?? "");
                                                setPayableEditNotes(expandedEntryData.partner_payable_notes ?? "");
                                              }}>Edit</Button>
                                            <Button size="sm" variant="outline" className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                                              disabled={payableMutating} onClick={() => setPayableCancelConfirm(true)}>
                                              Cancel Payable
                                            </Button>
                                            <Button size="sm" className="h-7 text-xs" disabled={payableMutating}
                                              onClick={() => setPayableMarkPaidConfirm(true)}>
                                              Mark as Paid
                                            </Button>
                                          </div>
                                        ) : (
                                          <div className="space-y-2">
                                            <div className="flex items-end gap-2 flex-wrap">
                                              <div className="grid gap-1">
                                                <Label className="text-xs">Amount</Label>
                                                <Input type="number" step="0.01" value={payableEditAmount}
                                                  onChange={(ev) => setPayableEditAmount(ev.target.value)}
                                                  className="h-8 w-32 text-xs bg-background" />
                                              </div>
                                              <div className="grid gap-1 flex-1 min-w-[140px]">
                                                <Label className="text-xs">Notes</Label>
                                                <Input value={payableEditNotes}
                                                  onChange={(ev) => setPayableEditNotes(ev.target.value)}
                                                  placeholder="Optional notes…" className="h-8 text-xs bg-background" />
                                              </div>
                                            </div>
                                            <div className="flex gap-2">
                                              <Button size="sm" className="h-7 text-xs" disabled={payableMutating}
                                                onClick={() => handleUpdatePayable(expandedEntryData.partner_payable_id)}>
                                                {payableMutating ? "Saving…" : "Save"}
                                              </Button>
                                              <Button size="sm" variant="ghost" className="h-7 text-xs"
                                                onClick={() => setPayableEditMode(false)}>Cancel</Button>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {/* PAID payable */}
                                    {expandedEntryData.partner_payable_id && expandedEntryData.partner_payable_status === "PAID" && (
                                      <div className="space-y-1 pt-0.5">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <Badge variant="outline" className="text-emerald-500 border-emerald-500/30 bg-emerald-500/10 text-xs">Paid</Badge>
                                          <span className="text-xs font-mono font-medium">
                                            {expandedEntryData.partner_payable_amount} {expandedEntryData.partner_payable_currency}
                                          </span>
                                          {expandedEntryData.partner_payable_paid_at && (
                                            <span className="text-xs text-muted-foreground">
                                              · {new Date(expandedEntryData.partner_payable_paid_at).toLocaleDateString()}
                                            </span>
                                          )}
                                        </div>
                                        {expandedEntryData.partner_payable_expense_entry_id && (
                                          <p className="text-xs text-muted-foreground">
                                            Expense entry: <span className="font-mono">#{expandedEntryData.partner_payable_expense_entry_id}</span>
                                          </p>
                                        )}
                                      </div>
                                    )}

                                    {/* CANCELED payable — allow creating a new one */}
                                    {expandedEntryData.partner_payable_id && expandedEntryData.partner_payable_status === "CANCELED" && (
                                      <div className="space-y-2 pt-0.5">
                                        <div className="flex items-center gap-2">
                                          <Badge variant="outline" className="text-slate-500 border-slate-500/30 bg-slate-500/10 text-xs">Canceled</Badge>
                                          <span className="text-xs text-muted-foreground">Create a new payable:</span>
                                        </div>
                                        {payableError && <p className="text-xs text-destructive">{payableError}</p>}
                                        <div className="flex items-end gap-2 flex-wrap">
                                          <div className="grid gap-1">
                                            <Label className="text-xs">Amount</Label>
                                            <Input type="number" step="0.01" min="0" value={payableAmount}
                                              onChange={(ev) => setPayableAmount(ev.target.value)}
                                              placeholder="Enter amount" className="h-8 w-32 text-xs bg-background" />
                                          </div>
                                          <div className="grid gap-1">
                                            <Label className="text-xs">Currency</Label>
                                            <Select value={payableCurrency} onValueChange={(v) => setPayableCurrency(v as "GEL" | "USD" | "EUR")}>
                                              <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
                                              <SelectContent>
                                                <SelectItem value="GEL">₾ GEL</SelectItem>
                                                <SelectItem value="USD">$ USD</SelectItem>
                                                <SelectItem value="EUR">€ EUR</SelectItem>
                                              </SelectContent>
                                            </Select>
                                          </div>
                                          <Button size="sm" className="h-8 text-xs" disabled={payableMutating}
                                            onClick={() => handleCreatePayable(e.id, expandedEntryData)}>
                                            {payableMutating ? "Saving…" : "Add to Pending"}
                                          </Button>
                                        </div>
                                      </div>
                                    )}
                                  </>
                                )}

                                {/* EXPENSE row: read-only partner payout section */}
                                {e.type === "EXPENSE" && expandedEntryData.partner_payable_id && (
                                  <div className="space-y-1 pt-0.5 text-xs text-muted-foreground">
                                    <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground/60">Auto-generated Partner Payout</p>
                                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                                      {expandedEntryData.vehicle_partner_name && (
                                        <span><span className="font-medium text-foreground">Partner:</span> {expandedEntryData.vehicle_partner_name}</span>
                                      )}
                                      {expandedEntryData.booking_ref_id && (
                                        <span><span className="font-medium text-foreground">Booking:</span> <span className="font-mono">#{expandedEntryData.booking_ref_id}</span></span>
                                      )}
                                      {expandedEntryData.partner_payable_source_income_id && (
                                        <span><span className="font-medium text-foreground">Source income:</span> <span className="font-mono">#{expandedEntryData.partner_payable_source_income_id}</span></span>
                                      )}
                                      <span>
                                        <span className="font-medium text-foreground">Payable:</span>{" "}
                                        <span className="font-mono">{expandedEntryData.partner_payable_amount} {expandedEntryData.partner_payable_currency}</span>
                                      </span>
                                      {expandedEntryData.partner_payable_paid_at && (
                                        <span><span className="font-medium text-foreground">Paid:</span> {new Date(expandedEntryData.partner_payable_paid_at).toLocaleDateString()}</span>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Add / Edit Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              {editingEntry ? "Edit Accounting Entry" : "Add Accounting Entry"}
            </DialogTitle>
            <DialogDescription>
              Record a financial transaction in the operational ledger.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Type */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Type <span className="text-destructive">*</span></Label>
                <Select
                  value={formData.type}
                  onValueChange={(v) =>
                    setFormData({ ...formData, type: v as "INCOME" | "EXPENSE", category: "" })
                  }
                >
                  <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INCOME">
                      <span className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-emerald-500" /> Income
                      </span>
                    </SelectItem>
                    <SelectItem value="EXPENSE">
                      <span className="flex items-center gap-2">
                        <TrendingDown className="w-4 h-4 text-red-500" /> Expense
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Date <span className="text-destructive">*</span></Label>
                <Input
                  type="date"
                  value={formData.entryDate}
                  onChange={(e) => setFormData({ ...formData, entryDate: e.target.value })}
                  className="bg-background"
                />
              </div>
            </div>

            {/* Category */}
            <div className="grid gap-2">
              <Label>Category <span className="text-destructive">*</span></Label>
              <Select
                value={formData.category || ""}
                onValueChange={(v) => setFormData({ ...formData, category: v })}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Select category…" />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Amount + Currency */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Amount <span className="text-destructive">*</span></Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  placeholder="e.g. 500.00"
                  className="bg-background"
                />
              </div>
              <div className="grid gap-2">
                <Label>Currency <span className="text-destructive">*</span></Label>
                <Select
                  value={formData.currency}
                  onValueChange={(v) =>
                    setFormData({ ...formData, currency: v as "GEL" | "USD" | "EUR" })
                  }
                >
                  <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GEL">₾ GEL</SelectItem>
                    <SelectItem value="USD">$ USD</SelectItem>
                    <SelectItem value="EUR">€ EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* GEL Equivalent */}
            <div className="grid gap-2">
              <Label className="flex items-center gap-2">
                GEL Equivalent
                {formData.currency !== "GEL" && rateData && (
                  <span className="text-xs text-muted-foreground font-normal">
                    (auto: {formData.currency === "USD" ? `$1 = ₾${parseFloat(rateData.usdToGel).toFixed(4)}` : `€1 = ₾${parseFloat(rateData.eurToGel).toFixed(4)}`})
                  </span>
                )}
              </Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={formData.currency === "GEL" ? formData.amount : autoGel}
                onChange={(e) => {
                  if (formData.currency !== "GEL") setAutoGel(e.target.value);
                }}
                readOnly={formData.currency === "GEL"}
                placeholder="Auto-calculated"
                className={`bg-background ${formData.currency === "GEL" ? "opacity-60" : ""}`}
              />
            </div>

            {/* Notes */}
            <div className="grid gap-2">
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Optional — describe this transaction…"
                rows={2}
                className="bg-background"
              />
            </div>
          </div>

          {/* Edit warnings — partner payable links */}
          {editingEntry && editingEntryDetail?.partner_payable_id &&
            editingEntryDetail?.partner_payable_status !== "CANCELED" && (
            <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2.5 text-xs text-yellow-600 dark:text-yellow-400 leading-relaxed mx-6 mb-1">
              {editingEntry.type === "INCOME" ? (
                <>⚠ This entry has a linked partner payable (#{editingEntryDetail.partner_payable_id}). Changing the amount here does not automatically update the payable — finance must adjust it manually.</>
              ) : (
                <>⚠ This expense was auto-generated from partner payable #{editingEntryDetail.partner_payable_id}. Editing here does not update the payable. All partner/booking/vehicle links are preserved.</>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending ? "Saving…" : "Save Entry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Payable Confirm */}
      <Dialog open={payableCancelConfirm} onOpenChange={setPayableCancelConfirm}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>Cancel Payable?</DialogTitle>
            <DialogDescription>
              This will mark the partner payable as canceled. A new payable can be created afterward.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayableCancelConfirm(false)}>Back</Button>
            <Button variant="destructive" disabled={payableMutating}
              onClick={() => handleCancelPayable(expandedEntryData?.partner_payable_id)}>
              {payableMutating ? "Canceling…" : "Cancel Payable"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark Payable as Paid Confirm */}
      <Dialog open={payableMarkPaidConfirm} onOpenChange={setPayableMarkPaidConfirm}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>Mark Payable as Paid?</DialogTitle>
            <DialogDescription>
              This will mark the payable as paid and auto-create a partner payout expense entry in the ledger.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayableMarkPaidConfirm(false)}>Back</Button>
            <Button disabled={payableMutating}
              onClick={() => handleMarkPaidPayable(expandedEntryData?.partner_payable_id)}>
              {payableMutating ? "Processing…" : "Confirm Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Exchange Rate Editor */}
      <Dialog open={showRateEditor} onOpenChange={setShowRateEditor}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Exchange Rates</DialogTitle>
            <DialogDescription>
              Set GEL conversion rates used when recording USD/EUR entries.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>$ USD → ₾ GEL rate</Label>
              <Input
                type="number"
                step="0.0001"
                min="0"
                value={rateUsd}
                onChange={(e) => setRateUsd(e.target.value)}
                placeholder="e.g. 2.7200"
                className="bg-background font-mono"
              />
            </div>
            <div className="grid gap-2">
              <Label>€ EUR → ₾ GEL rate</Label>
              <Input
                type="number"
                step="0.0001"
                min="0"
                value={rateEur}
                onChange={(e) => setRateEur(e.target.value)}
                placeholder="e.g. 2.9500"
                className="bg-background font-mono"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Updated at: {rateData?.updatedAt
                ? new Date(rateData.updatedAt).toLocaleString()
                : "—"}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRateEditor(false)}>Cancel</Button>
            <Button onClick={saveRates} disabled={rateMutation.isPending}>
              {rateMutation.isPending ? "Saving…" : "Save Rates"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
