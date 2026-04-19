import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { format } from "date-fns";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DocExtra {
  extra_name: string;
  quantity: number;
  price_at_booking: string | null;
}

interface DocData {
  id: number;
  status: string;
  contact_full_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  pickup_datetime: string;
  dropoff_datetime: string;
  total_amount: string | null;
  currency: string | null;
  deposit: string | null;
  notes: string | null;
  source: string | null;
  document_type: string | null;
  document_number: string | null;
  customer_name: string | null;
  customer_email: string | null;
  vehicle_id: number | null;
  license_plate: string | null;
  vehicle_model_name: string | null;
  vehicle_brand_name: string | null;
  booking_model_name: string | null;
  booking_brand_name: string | null;
  pickup_location: string;
  dropoff_location: string;
  extras: DocExtra[];
  payment_summary: {
    total_paid: string;
    deposit_received: string;
    deposit_returned: string;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDt(dt: string) {
  try { return format(new Date(dt), "EEEE, d MMMM yyyy · HH:mm"); }
  catch { return dt; }
}

function fmtDate(dt: string) {
  try { return format(new Date(dt), "d MMMM yyyy"); }
  catch { return dt; }
}

function sym(c: string | null) {
  return c === "USD" ? "$" : c === "EUR" ? "€" : "₾";
}

function vehicleLabel(d: DocData): string {
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

function nights(d: DocData): number {
  const ms = new Date(d.dropoff_datetime).getTime() - new Date(d.pickup_datetime).getTime();
  return Math.max(1, Math.ceil(ms / 86400000));
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const S = {
  page: {
    fontFamily: "'Segoe UI', Arial, sans-serif",
    fontSize: "13px",
    color: "#1a1a1a",
    background: "#fff",
    maxWidth: "780px",
    margin: "0 auto",
    padding: "40px 40px 60px",
    lineHeight: "1.5",
  } as React.CSSProperties,
  subheader: {
    fontSize: "11px",
    color: "#6b7280",
    letterSpacing: "0.5px",
    textTransform: "uppercase" as const,
  },
  docTitle: {
    fontSize: "20px",
    fontWeight: 700,
    color: "#111827",
    margin: "20px 0 4px",
    letterSpacing: "-0.3px",
  } as React.CSSProperties,
  refLine: {
    fontSize: "12px",
    color: "#6b7280",
    marginBottom: "24px",
  } as React.CSSProperties,
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
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "10px 24px",
    marginBottom: "4px",
  } as React.CSSProperties,
  grid3: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: "10px 24px",
    marginBottom: "4px",
  } as React.CSSProperties,
  field: {
    marginBottom: "4px",
  } as React.CSSProperties,
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
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: "12px",
  },
  th: {
    textAlign: "left" as const,
    padding: "6px 8px",
    backgroundColor: "#f3f4f6",
    fontWeight: 600,
    fontSize: "11px",
    borderBottom: "1px solid #d1d5db",
  },
  td: {
    padding: "6px 8px",
    borderBottom: "1px solid #f3f4f6",
    verticalAlign: "top" as const,
  },
  totalRow: {
    fontWeight: 700,
    backgroundColor: "#f9fafb",
  } as React.CSSProperties,
  section: {
    marginBottom: "22px",
  } as React.CSSProperties,
};

// ── Field component ───────────────────────────────────────────────────────────

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={S.field}>
      <span style={S.label}>{label}</span>
      <span style={S.value}>{value || "—"}</span>
    </div>
  );
}

// ── RENTAL AGREEMENT ─────────────────────────────────────────────────────────

function AgreementDoc({ d }: { d: DocData }) {
  const currency = d.currency || "GEL";
  const cs = sym(currency);
  const extrasTotal = d.extras.reduce((acc, e) => acc + (e.price_at_booking ? parseFloat(e.price_at_booking) * e.quantity : 0), 0);
  const depositReceived = parseFloat(d.payment_summary?.deposit_received ?? "0");
  const n = nights(d);

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
        <div>
          <img src="/crm/tbilisi-logo.png" alt="Tbilisicars" style={{ width: "140px", height: "auto", display: "block", marginBottom: "4px" }} />
          <div style={S.subheader}>Car Rental Georgia</div>
          <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "4px" }}>
            reservations@tbilisicars.com · Tbilisi/Batumi: +995 557 37 63 63 · Kutaisi: +995 595 28 66 00
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "11px", color: "#6b7280" }}>Generated</div>
          <div style={{ fontSize: "12px", fontWeight: 600 }}>{fmtDate(new Date().toISOString())}</div>
        </div>
      </div>

      <div style={S.divider} />

      <div style={S.docTitle}>Vehicle Rental Agreement</div>
      <div style={S.refLine}>
        Agreement Reference: <strong>TC-{String(d.id).padStart(6, "0")}</strong>
        {d.document_number ? ` · Doc #${d.document_number}` : ""}
        {" · "}Status: <strong>{d.status.replace(/_/g, " ")}</strong>
      </div>

      {/* Customer */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Renter Details</div>
        <div style={S.grid}>
          <Field label="Full Name" value={d.customer_name || d.contact_full_name} />
          <Field label="Phone" value={d.contact_phone || "—"} />
          <Field label="Email" value={d.contact_email || d.customer_email || "—"} />
          {d.document_type && <Field label="Document Type" value={d.document_type} />}
          {d.document_number && <Field label="Document Number" value={d.document_number} />}
        </div>
      </div>

      {/* Vehicle */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Vehicle</div>
        <div style={S.grid}>
          <Field label="Vehicle" value={vehicleLabel(d)} />
          {d.license_plate && <Field label="License Plate" value={d.license_plate} />}
        </div>
      </div>

      {/* Rental Period */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Rental Period</div>
        <div style={S.grid}>
          <Field label="Pickup Date & Time" value={fmtDt(d.pickup_datetime)} />
          <Field label="Dropoff Date & Time" value={fmtDt(d.dropoff_datetime)} />
          <Field label="Pickup Location" value={d.pickup_location} />
          <Field label="Return Location" value={d.dropoff_location} />
          <Field label="Duration" value={`${n} day${n !== 1 ? "s" : ""}`} />
        </div>
      </div>

      {/* Extras */}
      {d.extras.length > 0 && (
        <div style={S.section}>
          <div style={S.sectionTitle}>Additional Services & Extras</div>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Item</th>
                <th style={{ ...S.th, textAlign: "center" }}>Qty</th>
                <th style={{ ...S.th, textAlign: "right" }}>Unit Price</th>
                <th style={{ ...S.th, textAlign: "right" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {d.extras.map((e, i) => {
                const unit = e.price_at_booking ? parseFloat(e.price_at_booking) : null;
                const total = unit != null ? unit * e.quantity : null;
                return (
                  <tr key={i}>
                    <td style={S.td}>{e.extra_name}</td>
                    <td style={{ ...S.td, textAlign: "center" }}>{e.quantity}</td>
                    <td style={{ ...S.td, textAlign: "right" }}>{unit != null ? `${cs}${unit.toFixed(2)}` : "—"}</td>
                    <td style={{ ...S.td, textAlign: "right" }}>{total != null ? `${cs}${total.toFixed(2)}` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Financial */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Financial Summary</div>
        <table style={S.table}>
          <tbody>
            {extrasTotal > 0 && (
              <tr>
                <td style={{ ...S.td, color: "#6b7280" }}>Extras Subtotal</td>
                <td style={{ ...S.td, textAlign: "right" }}>{cs}{extrasTotal.toFixed(2)}</td>
              </tr>
            )}
            <tr style={S.totalRow}>
              <td style={S.td}>Total Rental Price</td>
              <td style={{ ...S.td, textAlign: "right", fontSize: "15px" }}>
                {d.total_amount ? `${cs}${parseFloat(d.total_amount).toFixed(2)} ${currency}` : "—"}
              </td>
            </tr>
            {depositReceived > 0 && (
              <tr>
                <td style={{ ...S.td, color: "#6b7280" }}>Deposit Received</td>
                <td style={{ ...S.td, textAlign: "right" }}>{cs}{depositReceived.toFixed(2)} {currency}</td>
              </tr>
            )}
            {d.deposit && parseFloat(d.deposit) > 0 && depositReceived === 0 && (
              <tr>
                <td style={{ ...S.td, color: "#6b7280" }}>Security Deposit</td>
                <td style={{ ...S.td, textAlign: "right" }}>{cs}{parseFloat(d.deposit).toFixed(2)} {currency}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Notes */}
      {d.notes && (
        <div style={S.section}>
          <div style={S.sectionTitle}>Notes</div>
          <div style={{ fontSize: "12px", color: "#374151", padding: "10px", background: "#f9fafb", borderRadius: "4px", border: "1px solid #e5e7eb" }}>
            {d.notes}
          </div>
        </div>
      )}

      {/* Terms */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Terms & Conditions</div>
        <div style={{ fontSize: "11px", color: "#6b7280", lineHeight: "1.6" }}>
          The renter agrees to return the vehicle in the same condition as received, with a full tank of fuel.
          The renter is responsible for any traffic fines, tolls, or violations incurred during the rental period.
          Any damage to the vehicle beyond normal wear will be charged to the renter.
          The vehicle must not be driven outside of agreed territory without prior written consent.
        </div>
      </div>

      {/* Signatures */}
      <div style={{ ...S.divider, marginTop: "32px" }} />
      <div style={S.grid}>
        <div>
          <div style={{ ...S.label, marginBottom: "32px" }}>Renter Signature & Date</div>
          <div style={{ borderBottom: "1px solid #9ca3af", paddingBottom: "2px", color: "#9ca3af", fontSize: "11px" }}>
            ____________________________________________
          </div>
          <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "4px" }}>
            {d.customer_name || d.contact_full_name}
          </div>
        </div>
        <div>
          <div style={{ ...S.label, marginBottom: "32px" }}>Company Representative</div>
          <div style={{ borderBottom: "1px solid #9ca3af", paddingBottom: "2px", color: "#9ca3af", fontSize: "11px" }}>
            ____________________________________________
          </div>
          <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "4px" }}>
            Tbilisicars · Authorised Signatory
          </div>
        </div>
      </div>

      <div style={{ ...S.divider, marginTop: "24px" }} />
      <div style={{ fontSize: "10px", color: "#9ca3af", textAlign: "center" }}>
        Tbilisicars · Tbilisi, Georgia · reservations@tbilisicars.com · Tbilisi/Batumi: +995 557 37 63 63 · Kutaisi: +995 595 28 66 00
        · Document generated {fmtDate(new Date().toISOString())}
      </div>
    </div>
  );
}

// ── BOOKING VOUCHER ───────────────────────────────────────────────────────────

function VoucherDoc({ d }: { d: DocData }) {
  const currency = d.currency || "GEL";
  const cs = sym(currency);
  const n = nights(d);
  const depositReceived = parseFloat(d.payment_summary?.deposit_received ?? "0");

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
        <div>
          <img src="/crm/tbilisi-logo.png" alt="Tbilisicars" style={{ width: "140px", height: "auto", display: "block", marginBottom: "4px" }} />
          <div style={S.subheader}>Car Rental Georgia</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "11px", color: "#6b7280" }}>Booking Confirmation</div>
          <div style={{ fontSize: "18px", fontWeight: 800, color: "#2563eb" }}>
            TC-{String(d.id).padStart(6, "0")}
          </div>
        </div>
      </div>

      <div style={S.divider} />

      {/* Status Banner */}
      <div style={{
        background: d.status === "CONFIRMED" || d.status === "DELIVERED" ? "#d1fae5" : "#fef3c7",
        border: `1px solid ${d.status === "CONFIRMED" || d.status === "DELIVERED" ? "#6ee7b7" : "#fbbf24"}`,
        borderRadius: "6px",
        padding: "10px 14px",
        marginBottom: "20px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <div>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "#065f46" }}>
            {d.status === "CONFIRMED" ? "✓ Booking Confirmed" :
             d.status === "DELIVERED" ? "✓ Vehicle Delivered" :
             d.status === "RETURNED" ? "✓ Vehicle Returned" :
             d.status === "PENDING" ? "⏳ Pending Confirmation" :
             d.status.replace(/_/g, " ")}
          </div>
          <div style={{ fontSize: "11px", color: "#065f46", opacity: 0.8 }}>
            Booking Reference: TC-{String(d.id).padStart(6, "0")}
          </div>
        </div>
        <div style={{ fontSize: "11px", color: "#6b7280" }}>
          {fmtDate(new Date().toISOString())}
        </div>
      </div>

      {/* Customer & Vehicle */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Booking Summary</div>
        <div style={S.grid}>
          <Field label="Customer" value={d.customer_name || d.contact_full_name} />
          <Field label="Vehicle" value={vehicleLabel(d)} />
          <Field label="Phone" value={d.contact_phone || "—"} />
          <Field label="Email" value={d.contact_email || d.customer_email || "—"} />
        </div>
      </div>

      {/* Dates */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Rental Details</div>
        <div style={{
          background: "#f3f4f6",
          borderRadius: "6px",
          padding: "14px",
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          gap: "0 16px",
          alignItems: "center",
        }}>
          <div>
            <div style={S.label}>Pickup</div>
            <div style={{ fontWeight: 700, fontSize: "14px" }}>{fmtDate(d.pickup_datetime)}</div>
            <div style={{ fontSize: "12px", color: "#6b7280" }}>{format(new Date(d.pickup_datetime), "HH:mm")}</div>
            <div style={{ fontSize: "12px", marginTop: "2px" }}>{d.pickup_location}</div>
          </div>
          <div style={{ textAlign: "center", color: "#9ca3af", fontSize: "18px" }}>→</div>
          <div>
            <div style={S.label}>Return</div>
            <div style={{ fontWeight: 700, fontSize: "14px" }}>{fmtDate(d.dropoff_datetime)}</div>
            <div style={{ fontSize: "12px", color: "#6b7280" }}>{format(new Date(d.dropoff_datetime), "HH:mm")}</div>
            <div style={{ fontSize: "12px", marginTop: "2px" }}>{d.dropoff_location}</div>
          </div>
        </div>
        <div style={{ marginTop: "8px", fontSize: "12px", color: "#6b7280" }}>
          Duration: <strong>{n} day{n !== 1 ? "s" : ""}</strong>
        </div>
      </div>

      {/* Extras */}
      {d.extras.length > 0 && (
        <div style={S.section}>
          <div style={S.sectionTitle}>Included Extras</div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {d.extras.map((e, i) => (
              <div key={i} style={{
                background: "#eff6ff",
                border: "1px solid #bfdbfe",
                borderRadius: "16px",
                padding: "4px 12px",
                fontSize: "12px",
                color: "#1e40af",
              }}>
                {e.extra_name}{e.quantity > 1 ? ` ×${e.quantity}` : ""}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Price */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Price</div>
        <div style={S.grid}>
          <Field label="Total Amount" value={d.total_amount ? `${cs}${parseFloat(d.total_amount).toFixed(2)} ${currency}` : "—"} />
          {depositReceived > 0 && <Field label="Deposit Paid" value={`${cs}${depositReceived.toFixed(2)} ${currency}`} />}
        </div>
      </div>

      {/* Notes */}
      {d.notes && (
        <div style={S.section}>
          <div style={S.sectionTitle}>Notes</div>
          <div style={{ fontSize: "12px", color: "#374151" }}>{d.notes}</div>
        </div>
      )}

      {/* Footer */}
      <div style={{ ...S.divider, marginTop: "24px" }} />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#9ca3af" }}>
        <span>Tbilisicars · Tbilisi, Georgia · reservations@tbilisicars.com</span>
        <span>Tbilisi/Batumi: +995 557 37 63 63 · Kutaisi: +995 595 28 66 00</span>
      </div>
      <div style={{ fontSize: "10px", color: "#d1d5db", textAlign: "center", marginTop: "8px" }}>
        This voucher serves as confirmation of your booking. Please present it at pickup.
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function BookingDocument() {
  const params = useParams<{ id: string; type: string }>();
  const id = params.id;
  const type = params.type;
  const [data, setData] = useState<DocData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.remove("dark");
    document.title = type === "agreement" ? "Rental Agreement" : "Booking Voucher";

    fetch(`/api/admin/bookings/${id}/document-data`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });

    return () => {
      document.documentElement.classList.add("dark");
    };
  }, [id, type]);

  const isAgreement = type === "agreement";
  const title = isAgreement ? "Rental Agreement" : "Booking Voucher";

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          @page { margin: 12mm; }
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
          <span style={{ fontWeight: 700, fontSize: "14px" }}>
            {title}
          </span>
          {data && (
            <span style={{ fontSize: "12px", color: "#94a3b8" }}>
              Booking #{data.id} · {data.contact_full_name}
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
            maxWidth: "860px",
            borderRadius: "6px",
            overflow: "hidden",
          }}>
            {isAgreement ? <AgreementDoc d={data} /> : <VoucherDoc d={data} />}
          </div>
        )}
      </div>
    </>
  );
}
