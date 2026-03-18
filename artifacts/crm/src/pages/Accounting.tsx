import { useState, useEffect } from "react";
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
  RefreshCw,
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
  "Deposit Received",
  "Other Income",
];

const EXPENSE_CATEGORIES = [
  "Service / Maintenance",
  "Delivery / Transport",
  "Fuel",
  "Refund",
  "Office Expense",
  "Salary",
  "Marketing",
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

  const { data: listData, isLoading } = useQuery({
    queryKey: ["accounting-entries", filterType, filterCategory, filterCurrency, filterDateFrom, filterDateTo],
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
    } else {
      setEditingEntry(null);
      setFormData(EMPTY_FORM);
      setAutoGel("");
    }
    setIsModalOpen(true);
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
  };

  const hasFilters = filterType || filterCategory || filterCurrency || filterDateFrom || filterDateTo;
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
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
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <TrendingDown className="w-8 h-8 opacity-20" />
                      <p>{hasFilters ? "No entries match the current filters." : "No accounting entries yet."}</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((e: any) => (
                  <TableRow key={e.id} className="border-border/20 hover:bg-muted/30 transition-colors">
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
