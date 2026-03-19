import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Plus, Trash2, CreditCard, Wallet, Landmark, HelpCircle, FileText, Ticket, Receipt, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const BASE = "/api";

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || body?.errors?.[0] || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Labels ──────────────────────────────────────────────────────────────────

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  BOOKING_PAYMENT: "Booking Payment",
  DEPOSIT_RECEIVED: "Deposit Received",
  DEPOSIT_RETURNED: "Deposit Returned",
  REFUND: "Refund",
  ADJUSTMENT: "Adjustment",
};

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  BANK_TRANSFER: "Bank Transfer",
  OTHER: "Other",
};

const METHOD_ICONS: Record<string, JSX.Element> = {
  CASH: <Wallet className="w-3 h-3" />,
  CARD: <CreditCard className="w-3 h-3" />,
  BANK_TRANSFER: <Landmark className="w-3 h-3" />,
  OTHER: <HelpCircle className="w-3 h-3" />,
};

function typeColor(type: string) {
  const map: Record<string, string> = {
    BOOKING_PAYMENT: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    DEPOSIT_RECEIVED: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    DEPOSIT_RETURNED: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    REFUND: "bg-red-500/10 text-red-400 border-red-500/20",
    ADJUSTMENT: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  };
  return map[type] ?? "bg-muted text-muted-foreground";
}

function currencySymbol(c: string) {
  return c === "GEL" ? "₾" : c === "USD" ? "$" : "€";
}

// ─── Payment Summary Card ────────────────────────────────────────────────────

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border/40 bg-muted/20 p-3 flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
      <span className="text-lg font-bold font-mono">{value}</span>
      {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
    </div>
  );
}

// ─── Empty Payment Form ───────────────────────────────────────────────────────

const EMPTY_FORM = {
  paymentType: "",
  amount: "",
  currency: "GEL",
  paymentDate: new Date().toISOString().slice(0, 10),
  method: "",
  notes: "",
};

// ─── Main Component ───────────────────────────────────────────────────────────

interface BookingDetailProps {
  bookingId: number | null;
  open: boolean;
  onClose: () => void;
}

export default function BookingDetail({ bookingId, open, onClose }: BookingDetailProps) {
  const { toast } = useToast();
  const [booking, setBooking] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loadingBooking, setLoadingBooking] = useState(false);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const fetchBooking = useCallback(async () => {
    if (!bookingId) return;
    setLoadingBooking(true);
    try {
      const data = await apiFetch(`/admin/bookings/${bookingId}`);
      setBooking(data);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoadingBooking(false);
    }
  }, [bookingId]);

  const fetchPayments = useCallback(async () => {
    if (!bookingId) return;
    setLoadingPayments(true);
    try {
      const data = await apiFetch(`/admin/bookings/${bookingId}/payments`);
      setPayments(data.payments ?? []);
      setSummary(data.summary ?? null);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoadingPayments(false);
    }
  }, [bookingId]);

  useEffect(() => {
    if (open && bookingId) {
      fetchBooking();
      fetchPayments();
      setShowAddForm(false);
      setForm(EMPTY_FORM);
    }
  }, [open, bookingId]);

  const handleAddPayment = async () => {
    if (!bookingId) return;
    const errors: string[] = [];
    if (!form.paymentType) errors.push("Payment type is required");
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0) errors.push("Amount must be positive");
    if (!form.method) errors.push("Payment method is required");
    if (!form.paymentDate) errors.push("Payment date is required");

    if (errors.length > 0) {
      toast({ title: "Validation", description: errors.join(" · "), variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      await apiFetch(`/admin/bookings/${bookingId}/payments`, {
        method: "POST",
        body: JSON.stringify({
          paymentType: form.paymentType,
          amount: Number(form.amount),
          currency: form.currency,
          paymentDate: form.paymentDate,
          method: form.method,
          notes: form.notes || null,
        }),
      });
      toast({ title: "Payment Added", description: `${PAYMENT_TYPE_LABELS[form.paymentType] ?? form.paymentType} of ${currencySymbol(form.currency)}${form.amount} recorded.` });
      setForm(EMPTY_FORM);
      setShowAddForm(false);
      fetchPayments();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePayment = async (paymentId: number) => {
    if (!bookingId) return;
    if (!window.confirm("Delete this payment record? The linked accounting entry will also be removed.")) return;
    try {
      await apiFetch(`/admin/bookings/${bookingId}/payments/${paymentId}`, { method: "DELETE" });
      toast({ title: "Payment Deleted" });
      fetchPayments();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const fmt = (v: number) => `₾${v.toFixed(2)}`;
  const totalPrice = booking?.totalAmount ? parseFloat(booking.totalAmount) : null;
  const remaining = totalPrice != null && summary ? totalPrice - summary.totalPaid : null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[760px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl flex items-center gap-2">
            Booking #{bookingId}
            {booking?.status && (
              <Badge variant="outline" className="text-[10px] font-bold uppercase">
                {booking.status.replace("_", " ")}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {loadingBooking ? "Loading…" : booking ? (
              <>
                {booking.customer?.fullName || booking.contactFullName || "—"} ·{" "}
                {booking.pickupDatetime ? format(new Date(booking.pickupDatetime), "MMM d") : "—"} →{" "}
                {booking.dropoffDatetime ? format(new Date(booking.dropoffDatetime), "MMM d, yyyy") : "—"}
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        {/* Document generation buttons */}
        {!loadingBooking && booking && (
          <div className="flex gap-2 mt-1 pb-1 border-b border-border/30">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5"
              onClick={() => window.open(`${import.meta.env.BASE_URL}document/${bookingId}/agreement`, "_blank")}
            >
              <FileText className="w-3 h-3" />
              Rental Agreement
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5"
              onClick={() => window.open(`${import.meta.env.BASE_URL}document/${bookingId}/voucher`, "_blank")}
            >
              <Ticket className="w-3 h-3" />
              Booking Voucher
            </Button>
          </div>
        )}

        {!loadingBooking && booking && (
          <div className="space-y-4 mt-1">
            {/* Booking Info Strip */}
            <div className="rounded-lg border border-border/40 bg-muted/10 p-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <div>
                <div className="text-[11px] uppercase text-muted-foreground tracking-wide mb-0.5">Customer</div>
                <div className="font-medium">{booking.customer?.fullName || booking.contactFullName || "—"}</div>
                {booking.customer?.phone && <div className="text-xs text-muted-foreground">{booking.customer.phone}</div>}
              </div>
              <div>
                <div className="text-[11px] uppercase text-muted-foreground tracking-wide mb-0.5">Vehicle</div>
                <div className="font-medium">
                  {booking.vehicle
                    ? `${booking.vehicle.modelName} · ${booking.vehicle.licensePlate}`
                    : booking.vehicleModelName
                      ? `${booking.vehicleModelName} (unassigned)`
                      : "—"}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase text-muted-foreground tracking-wide mb-0.5">Booking Price</div>
                <div className="font-mono font-bold text-base">
                  {booking.totalAmount ? `₾${parseFloat(booking.totalAmount).toFixed(2)}` : "—"}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase text-muted-foreground tracking-wide mb-0.5">Pickup</div>
                <div>{booking.pickupDatetime ? format(new Date(booking.pickupDatetime), "MMM d, yyyy HH:mm") : "—"}</div>
                <div className="text-xs text-muted-foreground">{booking.pickupLocation?.name}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase text-muted-foreground tracking-wide mb-0.5">Dropoff</div>
                <div>{booking.dropoffDatetime ? format(new Date(booking.dropoffDatetime), "MMM d, yyyy HH:mm") : "—"}</div>
                <div className="text-xs text-muted-foreground">{booking.dropoffLocation?.name}</div>
              </div>
              {booking.notes && (
                <div className="col-span-2 sm:col-span-3">
                  <div className="text-[11px] uppercase text-muted-foreground tracking-wide mb-0.5">Notes</div>
                  <div className="text-xs">{booking.notes}</div>
                </div>
              )}
            </div>

            {/* ─── Payment Summary ──────────────────────────────────────────── */}
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">Payment Summary</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <SummaryCard
                  label="Total Paid"
                  value={summary ? fmt(summary.totalPaid) : "₾0.00"}
                />
                <SummaryCard
                  label="Remaining Balance"
                  value={remaining != null ? fmt(Math.max(0, remaining)) : "—"}
                  sub={totalPrice == null ? "Set booking price to track balance" : undefined}
                />
                <SummaryCard
                  label="Deposit Received"
                  value={summary ? fmt(summary.depositReceived) : "₾0.00"}
                />
                <SummaryCard
                  label="Deposit Returned"
                  value={summary ? fmt(summary.depositReturned) : "₾0.00"}
                />
                <SummaryCard
                  label="Total Refunded"
                  value={summary ? fmt(summary.totalRefunded) : "₾0.00"}
                />
                <SummaryCard
                  label="Net Deposit"
                  value={summary ? fmt(summary.netDeposit) : "₾0.00"}
                  sub="Received minus returned"
                />
              </div>
            </div>

            {/* ─── Payment History ──────────────────────────────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Payment History</h3>
                <Button size="sm" onClick={() => setShowAddForm((v) => !v)} className="h-7 text-xs gap-1.5">
                  <Plus className="w-3 h-3" /> Add Payment
                </Button>
              </div>

              {/* Add Payment Form */}
              {showAddForm && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 mb-3 space-y-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-primary">New Payment Entry</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5">
                      <Label className="text-xs">Payment Type <span className="text-destructive">*</span></Label>
                      <Select value={form.paymentType} onValueChange={(v) => setForm({ ...form, paymentType: v })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select type…" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="BOOKING_PAYMENT">Booking Payment</SelectItem>
                          <SelectItem value="DEPOSIT_RECEIVED">Deposit Received</SelectItem>
                          <SelectItem value="DEPOSIT_RETURNED">Deposit Returned</SelectItem>
                          <SelectItem value="REFUND">Refund</SelectItem>
                          <SelectItem value="ADJUSTMENT">Adjustment</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs">Method <span className="text-destructive">*</span></Label>
                      <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select method…" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CASH">Cash</SelectItem>
                          <SelectItem value="CARD">Card</SelectItem>
                          <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                          <SelectItem value="OTHER">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs">Amount <span className="text-destructive">*</span></Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0.01"
                        placeholder="0.00"
                        value={form.amount}
                        onChange={(e) => setForm({ ...form, amount: e.target.value })}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs">Currency</Label>
                      <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="GEL">GEL (₾)</SelectItem>
                          <SelectItem value="USD">USD ($)</SelectItem>
                          <SelectItem value="EUR">EUR (€)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs">Payment Date <span className="text-destructive">*</span></Label>
                      <Input
                        type="date"
                        value={form.paymentDate}
                        onChange={(e) => setForm({ ...form, paymentDate: e.target.value })}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs">Notes</Label>
                      <Input
                        placeholder="Optional note…"
                        value={form.notes}
                        onChange={(e) => setForm({ ...form, notes: e.target.value })}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end pt-1">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setShowAddForm(false); setForm(EMPTY_FORM); }}>
                      Cancel
                    </Button>
                    <Button size="sm" className="h-7 text-xs" onClick={handleAddPayment} disabled={saving}>
                      {saving ? "Saving…" : "Save Payment"}
                    </Button>
                  </div>
                </div>
              )}

              {/* History Table */}
              {loadingPayments ? (
                <div className="text-sm text-muted-foreground py-4 text-center">Loading payments…</div>
              ) : payments.length === 0 ? (
                <div className="rounded-lg border border-border/30 bg-muted/10 py-8 text-center text-sm text-muted-foreground">
                  No payments recorded yet.
                </div>
              ) : (
                <div className="rounded-lg border border-border/40 overflow-hidden">
                  <Table>
                    <TableHeader className="bg-muted/30">
                      <TableRow className="border-border/40 hover:bg-transparent">
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs">Type</TableHead>
                        <TableHead className="text-xs">Amount</TableHead>
                        <TableHead className="text-xs">Method</TableHead>
                        <TableHead className="text-xs">GEL Equiv</TableHead>
                        <TableHead className="text-xs">Notes</TableHead>
                        <TableHead className="w-8" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map((p: any) => (
                        <TableRow key={p.id} className="border-border/20 hover:bg-muted/20 text-sm">
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {p.paymentDate ? format(new Date(p.paymentDate), "MMM d, yyyy") : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] font-semibold uppercase ${typeColor(p.paymentType)}`}>
                              {PAYMENT_TYPE_LABELS[p.paymentType] ?? p.paymentType}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono font-bold text-sm">
                            {currencySymbol(p.currency)}{parseFloat(p.amount).toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              {METHOD_ICONS[p.method]}{METHOD_LABELS[p.method] ?? p.method}
                            </span>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {p.currency !== "GEL" ? `₾${parseFloat(p.convertedGel).toFixed(2)}` : "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[140px] truncate">
                            {p.notes || "—"}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-primary">
                                    <Receipt className="w-3 h-3" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="text-xs">
                                  <DropdownMenuItem
                                    className="text-xs gap-1.5"
                                    onClick={() => window.open(`${import.meta.env.BASE_URL}payment-doc/${bookingId}/${p.id}/receipt`, "_blank")}
                                  >
                                    <Receipt className="w-3 h-3" /> Payment Receipt
                                  </DropdownMenuItem>
                                  {p.paymentType === "DEPOSIT_RECEIVED" && (
                                    <DropdownMenuItem
                                      className="text-xs gap-1.5"
                                      onClick={() => window.open(`${import.meta.env.BASE_URL}payment-doc/${bookingId}/${p.id}/deposit-receipt`, "_blank")}
                                    >
                                      <FileText className="w-3 h-3" /> Deposit Receipt
                                    </DropdownMenuItem>
                                  )}
                                  {p.paymentType === "DEPOSIT_RETURNED" && (
                                    <DropdownMenuItem
                                      className="text-xs gap-1.5"
                                      onClick={() => window.open(`${import.meta.env.BASE_URL}payment-doc/${bookingId}/${p.id}/deposit-return`, "_blank")}
                                    >
                                      <Ticket className="w-3 h-3" /> Deposit Return
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                onClick={() => handleDeletePayment(p.id)}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        )}

        {loadingBooking && (
          <div className="py-12 text-center text-muted-foreground text-sm">Loading booking details…</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
