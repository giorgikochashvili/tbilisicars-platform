import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { format } from "date-fns";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PaymentDocData {
  payment_id: number;
  booking_id: number;
  payment_type: string;
  amount: string;
  currency: string;
  converted_gel: string;
  payment_date: string;
  method: string;
  notes: string | null;
  booking_status: string;
  contact_full_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  total_amount: string | null;
  deposit: string | null;
  customer_name: string | null;
  customer_email: string | null;
  vehicle_id: number | null;
  license_plate: string | null;
  vehicle_model_name: string | null;
  vehicle_brand_name: string | null;
  booking_model_name: string | null;
  booking_brand_name: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(dt: string) {
  try { return format(new Date(dt), "d MMMM yyyy"); }
  catch { return dt; }
}

function sym(c: string | null) {
  return c === "USD" ? "$" : c === "EUR" ? "€" : "₾";
}

function vehicleLabel(d: PaymentDocData): string {
  if (d.vehicle_id && d.vehicle_model_name) {
    const brand = d.vehicle_brand_name ? `${d.vehicle_brand_name} ` : "";
    const plate = d.license_plate ? ` · ${d.license_plate}` : "";
    return `${brand}${d.vehicle_model_name}${plate}`;
  }
  if (d.booking_model_name) {
    const brand = d.booking_brand_name ? `${d.booking_brand_name} ` : "";
    return `${brand}${d.booking_model_name} (to be assigned)`;
  }
  return "To be assigned";
}

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  BOOKING_PAYMENT: "Booking Payment",
  DEPOSIT_RECEIVED: "Deposit Received",
  DEPOSIT_RETURNED: "Deposit Returned",
  REFUND: "Refund",
  ADJUSTMENT: "Adjustment",
};

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card / POS",
  BANK_TRANSFER: "Bank Transfer",
  OTHER: "Other",
};

function receiptTitle(type: string, docType: string): string {
  if (docType === "deposit-receipt") return "Deposit Receipt";
  if (docType === "deposit-return") return "Deposit Return Confirmation";
  return "Payment Receipt";
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const S = {
  page: {
    fontFamily: "'Segoe UI', Arial, sans-serif",
    fontSize: "13px",
    color: "#1a1a1a",
    background: "#fff",
    maxWidth: "700px",
    margin: "0 auto",
    padding: "40px 40px 60px",
    lineHeight: "1.5",
  } as React.CSSProperties,
  logo: {
    fontSize: "22px",
    fontWeight: 800,
    letterSpacing: "-0.5px",
    color: "#7f1d2e",
  } as React.CSSProperties,
  subheader: {
    fontSize: "11px",
    color: "#6b7280",
    letterSpacing: "0.5px",
    textTransform: "uppercase" as const,
  },
  divider: {
    borderTop: "1px solid #e5e7eb",
    margin: "16px 0",
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: "10px",
    fontWeight: 700,
    letterSpacing: "1px",
    textTransform: "uppercase" as const,
    color: "#6b7280",
    marginBottom: "10px",
    paddingBottom: "4px",
    borderBottom: "2px solid #2563eb",
    display: "inline-block",
  },
  grid2: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "10px 24px",
    marginBottom: "4px",
  } as React.CSSProperties,
  field: { marginBottom: "4px" } as React.CSSProperties,
  label: {
    fontSize: "10px",
    fontWeight: 600,
    color: "#9ca3af",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
    display: "block",
    marginBottom: "2px",
  },
  value: {
    fontSize: "13px",
    color: "#111827",
    fontWeight: 500,
  } as React.CSSProperties,
  section: { marginBottom: "22px" } as React.CSSProperties,
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={S.field}>
      <span style={S.label}>{label}</span>
      <span style={S.value}>{value || "—"}</span>
    </div>
  );
}

// ── Document Component ────────────────────────────────────────────────────────

function ReceiptDoc({ d, docType }: { d: PaymentDocData; docType: string }) {
  const cs = sym(d.currency);
  const amount = parseFloat(d.amount);
  const showGel = d.currency !== "GEL" && d.converted_gel;
  const gelAmount = d.converted_gel ? parseFloat(d.converted_gel) : null;

  const isDepositReceipt = docType === "deposit-receipt";
  const isDepositReturn = docType === "deposit-return";

  const accentColor =
    isDepositReceipt ? "#059669" :
    isDepositReturn ? "#7c3aed" :
    "#2563eb";

  const bannerBg =
    isDepositReceipt ? "#d1fae5" :
    isDepositReturn ? "#ede9fe" :
    "#eff6ff";

  const bannerBorder =
    isDepositReceipt ? "#6ee7b7" :
    isDepositReturn ? "#c4b5fd" :
    "#bfdbfe";

  const bannerText =
    isDepositReceipt ? "#065f46" :
    isDepositReturn ? "#4c1d95" :
    "#1e40af";

  const title = receiptTitle(d.payment_type, docType);

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
        <div>
          <div style={S.logo}>Tbilisicars</div>
          <div style={S.subheader}>Car Rental Georgia</div>
          <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "4px" }}>
            reservations@tbilisicars.com · Tbilisi/Batumi: +995 557 37 63 63 · Kutaisi: +995 595 28 66 00
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "11px", color: "#6b7280" }}>Issued</div>
          <div style={{ fontSize: "12px", fontWeight: 600 }}>{fmtDate(new Date().toISOString())}</div>
        </div>
      </div>

      <div style={S.divider} />

      {/* Title + Amount Banner */}
      <div style={{
        background: bannerBg,
        border: `1px solid ${bannerBorder}`,
        borderRadius: "8px",
        padding: "16px 20px",
        marginBottom: "24px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <div>
          <div style={{ fontSize: "18px", fontWeight: 800, color: bannerText }}>{title}</div>
          <div style={{ fontSize: "12px", color: bannerText, opacity: 0.8, marginTop: "2px" }}>
            Receipt No: <strong>TC-REC-{String(d.payment_id).padStart(6, "0")}</strong>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "28px", fontWeight: 900, color: bannerText, letterSpacing: "-1px" }}>
            {cs}{amount.toFixed(2)}
          </div>
          <div style={{ fontSize: "12px", color: bannerText, opacity: 0.7 }}>{d.currency}</div>
          {showGel && gelAmount != null && (
            <div style={{ fontSize: "11px", color: bannerText, opacity: 0.7 }}>≈ ₾{gelAmount.toFixed(2)} GEL</div>
          )}
        </div>
      </div>

      {/* Booking Reference */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Booking Reference</div>
        <div style={S.grid2}>
          <Field label="Booking Ref" value={`TC-${String(d.booking_id).padStart(6, "0")}`} />
          <Field label="Booking Status" value={d.booking_status.replace(/_/g, " ")} />
        </div>
      </div>

      {/* Customer */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Customer</div>
        <div style={S.grid2}>
          <Field label="Full Name" value={d.customer_name || d.contact_full_name} />
          <Field label="Phone" value={d.contact_phone || "—"} />
          <Field label="Email" value={d.contact_email || d.customer_email || "—"} />
        </div>
      </div>

      {/* Vehicle */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Vehicle</div>
        <div style={S.grid2}>
          <Field label="Vehicle / Model" value={vehicleLabel(d)} />
          {d.license_plate && <Field label="License Plate" value={d.license_plate} />}
        </div>
      </div>

      {/* Payment Details */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Payment Details</div>
        <div style={{
          background: "#f9fafb",
          border: "1px solid #e5e7eb",
          borderRadius: "6px",
          padding: "14px 16px",
        }}>
          <div style={S.grid2}>
            <Field label="Payment Type" value={PAYMENT_TYPE_LABELS[d.payment_type] ?? d.payment_type} />
            <Field label="Payment Method" value={METHOD_LABELS[d.method] ?? d.method} />
            <Field label="Payment Date" value={fmtDate(d.payment_date)} />
            <Field
              label="Amount"
              value={`${cs}${amount.toFixed(2)} ${d.currency}${showGel && gelAmount != null ? ` (≈ ₾${gelAmount.toFixed(2)} GEL)` : ""}`}
            />
          </div>
          {d.notes && (
            <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid #e5e7eb" }}>
              <span style={S.label}>Notes</span>
              <span style={{ ...S.value, display: "block" }}>{d.notes}</span>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation note */}
      <div style={{
        background: bannerBg,
        border: `1px solid ${bannerBorder}`,
        borderRadius: "6px",
        padding: "10px 14px",
        marginTop: "8px",
      }}>
        <div style={{ fontSize: "12px", color: bannerText }}>
          {isDepositReceipt &&
            "This receipt confirms the security deposit has been received and will be held for the duration of the rental period."}
          {isDepositReturn &&
            "This document confirms the security deposit has been returned to the customer in full as specified above."}
          {!isDepositReceipt && !isDepositReturn &&
            "This receipt confirms payment has been received for the above-referenced booking."}
        </div>
      </div>

      {/* Footer */}
      <div style={{ ...S.divider, marginTop: "32px" }} />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#9ca3af" }}>
        <span>Tbilisicars · Tbilisi, Georgia · reservations@tbilisicars.com</span>
        <span>Tbilisi/Batumi: +995 557 37 63 63 · Kutaisi: +995 595 28 66 00</span>
      </div>
      <div style={{ fontSize: "10px", color: "#d1d5db", textAlign: "center", marginTop: "6px" }}>
        Receipt TC-REC-{String(d.payment_id).padStart(6, "0")} · Generated {fmtDate(new Date().toISOString())}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PaymentDocument() {
  const params = useParams<{ bookingId: string; paymentId: string; type: string }>();
  const { bookingId, paymentId, type } = params;

  const [data, setData] = useState<PaymentDocData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.remove("dark");
    document.title = receiptTitle("", type ?? "");

    fetch(`/api/admin/bookings/${bookingId}/payments/${paymentId}/document-data`, {
      credentials: "include",
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });

    return () => {
      document.documentElement.classList.add("dark");
    };
  }, [bookingId, paymentId, type]);

  const title = receiptTitle(data?.payment_type ?? "", type ?? "");

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          @page { margin: 12mm; size: A4; }
        }
        body { background: #f3f4f6; }
      `}</style>

      {/* Control bar */}
      <div className="no-print" style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        background: "#0f172a", color: "#fff",
        padding: "10px 20px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontWeight: 700, fontSize: "14px" }}>{title}</span>
          {data && (
            <span style={{ fontSize: "12px", color: "#94a3b8" }}>
              Booking #{data.booking_id} · Payment #{data.payment_id}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={() => window.close()}
            style={{
              padding: "6px 14px", fontSize: "12px", cursor: "pointer",
              background: "transparent", color: "#cbd5e1", border: "1px solid #475569",
              borderRadius: "5px",
            }}
          >
            ✕ Close
          </button>
          <button
            onClick={() => window.print()}
            style={{
              padding: "6px 16px", fontSize: "12px", cursor: "pointer",
              background: "#2563eb", color: "#fff", border: "none",
              borderRadius: "5px", fontWeight: 600,
            }}
          >
            🖨 Print
          </button>
        </div>
      </div>

      {/* Document area */}
      <div style={{ paddingTop: "56px" }}>
        {loading && (
          <div style={{ textAlign: "center", padding: "80px", color: "#6b7280" }}>
            Loading document…
          </div>
        )}
        {error && (
          <div style={{ textAlign: "center", padding: "80px", color: "#ef4444" }}>
            Error: {error}
          </div>
        )}
        {!loading && !error && data && (
          <div style={{
            background: "#fff",
            boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
            margin: "24px auto",
            maxWidth: "760px",
            borderRadius: "6px",
            overflow: "hidden",
          }}>
            <ReceiptDoc d={data} docType={type ?? "receipt"} />
          </div>
        )}
      </div>
    </>
  );
}
