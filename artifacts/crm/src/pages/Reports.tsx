import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart3, Download, Filter, AlertCircle,
  BookOpen, DollarSign, Car, Wrench, MapPin, TrendingUp
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type ReportType = "bookings" | "financial" | "fleet-utilization" | "service" | "region";

interface Meta {
  accountingCategories: string[];
  serviceCategories: string[];
  bookingStatuses: string[];
  cities: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function apiFetch(url: string) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function fmt(n: number | string | null | undefined) {
  if (n == null) return "—";
  const num = Number(n);
  if (isNaN(num)) return String(n);
  return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtInt(n: number | string | null | undefined) {
  if (n == null) return "—";
  return Number(n).toLocaleString();
}

function exportCsv(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]!);
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      headers
        .map((h) => {
          const v = r[h];
          const s = v == null ? "" : String(v);
          return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  CONFIRMED: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  DELIVERED: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  RETURNED: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  CANCELED: "bg-red-500/15 text-red-400 border-red-500/30",
  NO_SHOW: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  INCOME: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  EXPENSE: "bg-red-500/15 text-red-400 border-red-500/30",
  AVAILABLE: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  RENTED: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  MAINTENANCE: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  RESERVED: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  INACTIVE: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  COMPLETED: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  SCHEDULED: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  IN_PROGRESS: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
};

function StatusBadge({ value }: { value: string }) {
  return (
    <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[value] ?? "bg-muted/20"}`}>
      {value}
    </Badge>
  );
}

// ── Report definitions ─────────────────────────────────────────────────────────

const REPORT_TABS: { id: ReportType; label: string; icon: React.ReactNode }[] = [
  { id: "bookings", label: "Bookings", icon: <BookOpen className="w-4 h-4" /> },
  { id: "financial", label: "Financial", icon: <DollarSign className="w-4 h-4" /> },
  { id: "fleet-utilization", label: "Fleet Utilization", icon: <Car className="w-4 h-4" /> },
  { id: "service", label: "Service", icon: <Wrench className="w-4 h-4" /> },
  { id: "region", label: "Region Activity", icon: <MapPin className="w-4 h-4" /> },
];

// ── Main component ─────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [activeReport, setActiveReport] = useState<ReportType>("bookings");
  const [triggered, setTriggered] = useState(false);

  // Shared filters
  const today = new Date().toISOString().split("T")[0]!;
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0]!;

  const [startDate, setStartDate] = useState(monthAgo);
  const [endDate, setEndDate] = useState(today);
  const [city, setCity] = useState("all");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [currency, setCurrency] = useState("all");
  const [entryType, setEntryType] = useState("all");
  const [search, setSearch] = useState("");

  // Load meta (categories, statuses, cities)
  const { data: meta } = useQuery<Meta>({
    queryKey: ["reports-meta"],
    queryFn: () => apiFetch("/api/admin/reports/meta"),
  });

  // Build query URL based on active report
  const queryUrl = useMemo(() => {
    if (!triggered) return null;
    const p = new URLSearchParams();
    if (startDate) p.set("startDate", startDate);
    if (endDate) p.set("endDate", endDate);

    switch (activeReport) {
      case "bookings":
        if (city !== "all") p.set("city", city);
        if (status !== "all") p.set("status", status);
        if (search) p.set("search", search);
        return `/api/admin/reports/bookings?${p}`;
      case "financial":
        if (entryType !== "all") p.set("type", entryType);
        if (category !== "all") p.set("category", category);
        if (currency !== "all") p.set("currency", currency);
        return `/api/admin/reports/financial?${p}`;
      case "fleet-utilization":
        if (city !== "all") p.set("city", city);
        if (search) p.set("search", search);
        return `/api/admin/reports/fleet-utilization?${p}`;
      case "service":
        if (category !== "all") p.set("category", category);
        if (search) p.set("search", search);
        return `/api/admin/reports/service?${p}`;
      case "region":
        return `/api/admin/reports/region?${p}`;
    }
  }, [triggered, activeReport, startDate, endDate, city, status, category, currency, entryType, search]);

  const { data: reportData, isLoading, error } = useQuery({
    queryKey: ["report", queryUrl],
    queryFn: () => apiFetch(queryUrl!),
    enabled: !!queryUrl,
  });

  const rows: Record<string, unknown>[] = useMemo(() => {
    if (!reportData) return [];
    if (Array.isArray(reportData)) return reportData;
    if (reportData.rows) return reportData.rows;
    return [];
  }, [reportData]);

  const handleRunReport = () => {
    setTriggered(true);
  };

  const handleExportCsv = () => {
    if (!rows.length) return;
    const reportLabel = REPORT_TABS.find((t) => t.id === activeReport)?.label ?? activeReport;
    exportCsv(rows, `tbilisicars-${activeReport}-report-${today}.csv`);
  };

  // Switch report type
  const handleTabChange = (id: ReportType) => {
    setActiveReport(id);
    setTriggered(false);
    setCategory("all");
    setStatus("all");
  };

  return (
    <div className="flex flex-col gap-5 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold font-display tracking-tight flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-primary" /> Reports &amp; Exports
          </h2>
          <p className="text-muted-foreground text-sm">Operational reports with CSV export</p>
        </div>
        <Button
          onClick={handleExportCsv}
          variant="outline"
          disabled={!rows.length}
          className="gap-2"
        >
          <Download className="w-4 h-4" /> Export CSV
        </Button>
      </div>

      {/* Report type tabs */}
      <div className="flex gap-1.5 flex-wrap border-b border-border/30 pb-1">
        {REPORT_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-t-md text-sm font-medium transition-all
              ${activeReport === tab.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"}`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filter panel */}
      <Card className="border-border/40 bg-card/60 backdrop-blur-md">
        <CardHeader className="pb-3 pt-4 px-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Filter className="w-4 h-4 text-primary" /> Filters
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Date range — all reports */}
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">From Date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">To Date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-8 text-sm" />
            </div>

            {/* Booking / Fleet Utilization — city filter */}
            {(activeReport === "bookings" || activeReport === "fleet-utilization") && (
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Region</Label>
                <Select value={city} onValueChange={setCity}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Regions</SelectItem>
                    {meta?.cities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Booking — status filter */}
            {activeReport === "bookings" && (
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {meta?.bookingStatuses.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Financial — entry type */}
            {activeReport === "financial" && (
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Entry Type</Label>
                <Select value={entryType} onValueChange={setEntryType}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Income &amp; Expense</SelectItem>
                    <SelectItem value="INCOME">Income Only</SelectItem>
                    <SelectItem value="EXPENSE">Expense Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Financial — category */}
            {activeReport === "financial" && (
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {meta?.accountingCategories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Financial — currency */}
            {activeReport === "financial" && (
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Currencies</SelectItem>
                    <SelectItem value="GEL">GEL</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Service — category */}
            {activeReport === "service" && (
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Service Type</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {meta?.serviceCategories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Booking / Fleet / Service — search */}
            {["bookings", "fleet-utilization", "service"].includes(activeReport) && (
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">
                  {activeReport === "bookings" ? "Customer Name" : "Vehicle Search"}
                </Label>
                <Input
                  className="h-8 text-sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            )}

            {/* Run button */}
            <div className="flex items-end col-span-full md:col-span-1">
              <Button onClick={handleRunReport} className="h-8 text-sm w-full gap-2">
                <TrendingUp className="w-3.5 h-3.5" /> Run Report
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summaries */}
      {reportData && !Array.isArray(reportData) && reportData.totals && (
        <div className="grid grid-cols-3 gap-4">
          <Card className="border-border/40 bg-card/60">
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground mb-1">Total Income</div>
              <div className="text-xl font-bold text-emerald-400">₾{fmt(reportData.totals.totalIncome)}</div>
            </CardContent>
          </Card>
          <Card className="border-border/40 bg-card/60">
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground mb-1">Total Expenses</div>
              <div className="text-xl font-bold text-red-400">₾{fmt(reportData.totals.totalExpenses)}</div>
            </CardContent>
          </Card>
          <Card className="border-border/40 bg-card/60">
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground mb-1">Net Profit</div>
              <div className={`text-xl font-bold ${reportData.totals.netProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                ₾{fmt(reportData.totals.netProfit)}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {reportData && activeReport === "service" && reportData.totalCostGel != null && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Total Service Cost (GEL):</span>
          <span className="font-bold text-orange-400">₾{fmt(reportData.totalCostGel)}</span>
          <span className="text-xs">{rows.length} record{rows.length !== 1 ? "s" : ""} shown</span>
        </div>
      )}

      {reportData && activeReport === "fleet-utilization" && reportData.periodDays != null && (
        <div className="text-sm text-muted-foreground">
          Period: <span className="font-medium text-foreground">{reportData.periodDays} days</span>
          {" "}· Utilization = days booked ÷ period days
        </div>
      )}

      {/* Results table */}
      <Card className="border-border/40 bg-card/60 backdrop-blur-md shadow-sm">
        <div className="overflow-x-auto">
          {!triggered ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
              <BarChart3 className="w-10 h-10 opacity-20" />
              <p className="text-sm">Select filters and click "Run Report"</p>
            </div>
          ) : isLoading ? (
            <div className="p-6 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded" />
              ))}
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-32 text-destructive gap-2">
              <AlertCircle className="w-5 h-5" /> Failed to load report data
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
              <BarChart3 className="w-10 h-10 opacity-20" />
              <p className="text-sm">No data found for the selected filters</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow className="border-border/40 hover:bg-transparent">
                  {activeReport === "bookings" && (
                    <>
                      <TableHead className="text-xs">ID</TableHead>
                      <TableHead className="text-xs">Pickup</TableHead>
                      <TableHead className="text-xs">Dropoff</TableHead>
                      <TableHead className="text-xs">Days</TableHead>
                      <TableHead className="text-xs">Vehicle</TableHead>
                      <TableHead className="text-xs">Plate</TableHead>
                      <TableHead className="text-xs">Region</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Customer</TableHead>
                      <TableHead className="text-xs text-right">Amount</TableHead>
                      <TableHead className="text-xs">Curr.</TableHead>
                    </>
                  )}
                  {activeReport === "financial" && (
                    <>
                      <TableHead className="text-xs">Date</TableHead>
                      <TableHead className="text-xs">Type</TableHead>
                      <TableHead className="text-xs">Category</TableHead>
                      <TableHead className="text-xs text-right">Amount</TableHead>
                      <TableHead className="text-xs">Curr.</TableHead>
                      <TableHead className="text-xs text-right">GEL Equiv.</TableHead>
                      <TableHead className="text-xs">Notes</TableHead>
                    </>
                  )}
                  {activeReport === "fleet-utilization" && (
                    <>
                      <TableHead className="text-xs">Vehicle</TableHead>
                      <TableHead className="text-xs">Plate</TableHead>
                      <TableHead className="text-xs">City</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs text-right">Bookings</TableHead>
                      <TableHead className="text-xs text-right">Days Booked</TableHead>
                      <TableHead className="text-xs text-right">Period Days</TableHead>
                      <TableHead className="text-xs text-right">Utilization %</TableHead>
                    </>
                  )}
                  {activeReport === "service" && (
                    <>
                      <TableHead className="text-xs">Date</TableHead>
                      <TableHead className="text-xs">Vehicle</TableHead>
                      <TableHead className="text-xs">Plate</TableHead>
                      <TableHead className="text-xs">Category</TableHead>
                      <TableHead className="text-xs text-right">Mileage</TableHead>
                      <TableHead className="text-xs text-right">Cost (GEL)</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Vendor</TableHead>
                    </>
                  )}
                  {activeReport === "region" && (
                    <>
                      <TableHead className="text-xs">Region</TableHead>
                      <TableHead className="text-xs text-right">Total Bookings</TableHead>
                      <TableHead className="text-xs text-right">Active Bookings</TableHead>
                      <TableHead className="text-xs text-right">Vehicles</TableHead>
                      <TableHead className="text-xs text-right">Revenue (GEL)</TableHead>
                      <TableHead className="text-xs text-right">Service Cost (GEL)</TableHead>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, i) => (
                  <TableRow key={(row.id as number) ?? i} className="border-border/20 hover:bg-muted/20 text-sm">
                    {activeReport === "bookings" && (
                      <>
                        <TableCell className="font-mono text-xs text-muted-foreground">#{row.id as number}</TableCell>
                        <TableCell className="text-xs">{row.pickup_date as string}</TableCell>
                        <TableCell className="text-xs">{row.dropoff_date as string}</TableCell>
                        <TableCell className="text-xs text-center">{row.duration_days as number}</TableCell>
                        <TableCell className="text-xs font-medium">{(row.vehicle_label as string).trim() || "—"}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{row.plate as string}</TableCell>
                        <TableCell className="text-xs">{row.region as string}</TableCell>
                        <TableCell><StatusBadge value={row.status as string} /></TableCell>
                        <TableCell className="text-xs">{row.customer_name as string}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{fmt(row.total_amount as number)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{row.currency as string}</TableCell>
                      </>
                    )}
                    {activeReport === "financial" && (
                      <>
                        <TableCell className="text-xs">{row.entry_date as string}</TableCell>
                        <TableCell><StatusBadge value={row.type as string} /></TableCell>
                        <TableCell className="text-xs">{row.category as string}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{fmt(row.amount as number)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{row.currency as string}</TableCell>
                        <TableCell className="text-xs text-right font-mono text-primary">₾{fmt(row.converted_gel as number)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{(row.notes as string) || "—"}</TableCell>
                      </>
                    )}
                    {activeReport === "fleet-utilization" && (
                      <>
                        <TableCell className="text-xs font-medium">{(row.vehicle_label as string).trim() || "—"}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{row.plate as string}</TableCell>
                        <TableCell className="text-xs">{row.city as string}</TableCell>
                        <TableCell><StatusBadge value={row.status as string} /></TableCell>
                        <TableCell className="text-xs text-right">{fmtInt(row.total_bookings as number)}</TableCell>
                        <TableCell className="text-xs text-right">{fmtInt(row.total_days_booked as number)}</TableCell>
                        <TableCell className="text-xs text-right text-muted-foreground">{fmtInt(row.period_days as number)}</TableCell>
                        <TableCell className="text-xs text-right">
                          <span className={`font-bold ${Number(row.utilization_pct) >= 70 ? "text-emerald-400" : Number(row.utilization_pct) >= 30 ? "text-yellow-400" : "text-muted-foreground"}`}>
                            {row.utilization_pct as number}%
                          </span>
                        </TableCell>
                      </>
                    )}
                    {activeReport === "service" && (
                      <>
                        <TableCell className="text-xs">{row.service_date ? (row.service_date as string).split("T")[0] : "—"}</TableCell>
                        <TableCell className="text-xs font-medium">{(row.vehicle_label as string).trim() || "—"}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{row.plate as string}</TableCell>
                        <TableCell className="text-xs">{row.service_category as string}</TableCell>
                        <TableCell className="text-xs text-right">{row.mileage ? fmtInt(row.mileage as number) + " km" : "—"}</TableCell>
                        <TableCell className="text-xs text-right font-mono">
                          {row.cost != null ? `₾${fmt(row.cost as number)}` : "—"}
                        </TableCell>
                        <TableCell><StatusBadge value={row.status as string} /></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{row.vendor as string}</TableCell>
                      </>
                    )}
                    {activeReport === "region" && (
                      <>
                        <TableCell className="text-sm font-semibold">{row.region as string}</TableCell>
                        <TableCell className="text-xs text-right">{fmtInt(row.bookings_count as number)}</TableCell>
                        <TableCell className="text-xs text-right">{fmtInt(row.active_bookings as number)}</TableCell>
                        <TableCell className="text-xs text-right">{fmtInt(row.vehicles_count as number)}</TableCell>
                        <TableCell className="text-xs text-right font-mono text-emerald-400">
                          ₾{fmt(row.revenue_gel as number)}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono text-orange-400">
                          ₾{fmt(row.service_cost_gel as number)}
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
        {rows.length > 0 && (
          <div className="px-4 py-2 border-t border-border/20 flex items-center justify-between text-xs text-muted-foreground bg-muted/10">
            <span>{rows.length} row{rows.length !== 1 ? "s" : ""}</span>
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={handleExportCsv}>
              <Download className="w-3 h-3" /> Export CSV
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
