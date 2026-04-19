import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { format } from "date-fns";

// ── Types ─────────────────────────────────────────────────────────────────────

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
  document_type: string | null;
  document_number: string | null;
  customer_name: string | null;
  customer_email: string | null;
  vehicle_id: number | null;
  license_plate: string | null;
  vehicle_mileage: number | null;
  vehicle_color: string | null;
  vehicle_year: number | null;
  vehicle_model_name: string | null;
  vehicle_brand_name: string | null;
  booking_model_name: string | null;
  booking_brand_name: string | null;
  pickup_location: string;
  dropoff_location: string;
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
    return `${brand}${d.vehicle_model_name}`;
  }
  if (d.booking_model_name) {
    const brand = d.booking_brand_name ? `${d.booking_brand_name} ` : "";
    return `${brand}${d.booking_model_name}`;
  }
  return "To be assigned";
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const S = {
  page: {
    fontFamily: "'Segoe UI', Arial, sans-serif",
    fontSize: "12.5px",
    color: "#1a1a1a",
    background: "#fff",
    maxWidth: "800px",
    margin: "0 auto",
    padding: "36px 40px 56px",
    lineHeight: "1.5",
  } as React.CSSProperties,
  logo: {
    fontSize: "21px",
    fontWeight: 800,
    letterSpacing: "-0.5px",
    color: "#7f1d2e",
  } as React.CSSProperties,
  docTitle: {
    fontSize: "19px",
    fontWeight: 800,
    color: "#111827",
    marginBottom: "2px",
    letterSpacing: "-0.3px",
  } as React.CSSProperties,
  refLine: {
    fontSize: "11px",
    color: "#6b7280",
    marginBottom: "20px",
  } as React.CSSProperties,
  divider: {
    borderTop: "1px solid #e5e7eb",
    margin: "14px 0",
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: "9.5px",
    fontWeight: 700,
    letterSpacing: "1px",
    textTransform: "uppercase" as const,
    color: "#6b7280",
    marginBottom: "9px",
    paddingBottom: "3px",
    borderBottom: "2px solid #2563eb",
    display: "inline-block",
  },
  grid2: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "8px 24px",
  } as React.CSSProperties,
  grid3: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: "8px 16px",
  } as React.CSSProperties,
  field: { marginBottom: "2px" } as React.CSSProperties,
  label: {
    fontSize: "9.5px",
    fontWeight: 600,
    color: "#9ca3af",
    textTransform: "uppercase" as const,
    letterSpacing: "0.4px",
    display: "block",
    marginBottom: "1px",
  },
  value: {
    fontSize: "12.5px",
    color: "#111827",
    fontWeight: 500,
  } as React.CSSProperties,
  section: { marginBottom: "18px" } as React.CSSProperties,
  box: {
    border: "1px solid #d1d5db",
    borderRadius: "5px",
    padding: "10px 14px",
    background: "#fafafa",
  } as React.CSSProperties,
  fillLine: {
    borderBottom: "1.5px solid #374151",
    height: "22px",
    marginTop: "2px",
  } as React.CSSProperties,
  fillLineLight: {
    borderBottom: "1px solid #9ca3af",
    height: "20px",
    marginTop: "2px",
  } as React.CSSProperties,
  checkRow: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    marginBottom: "5px",
    fontSize: "12px",
    color: "#374151",
  } as React.CSSProperties,
  checkbox: {
    width: "13px",
    height: "13px",
    border: "1.5px solid #374151",
    borderRadius: "2px",
    flexShrink: 0,
    display: "inline-block",
  } as React.CSSProperties,
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={S.field}>
      <span style={S.label}>{label}</span>
      <span style={S.value}>{value || "—"}</span>
    </div>
  );
}

function FillField({ label, hint }: { label: string; hint?: string }) {
  return (
    <div style={S.field}>
      <span style={S.label}>{label}</span>
      <div style={S.fillLine} />
      {hint && <span style={{ fontSize: "9px", color: "#9ca3af" }}>{hint}</span>}
    </div>
  );
}

function Checkbox({ label }: { label: string }) {
  return (
    <div style={S.checkRow}>
      <span style={S.checkbox} />
      <span>{label}</span>
    </div>
  );
}

// ── Fuel Level Bar ────────────────────────────────────────────────────────────

function FuelBar() {
  const segments = ["E", "1/4", "1/2", "3/4", "F"];
  return (
    <div>
      <span style={S.label}>Fuel Level</span>
      <div style={{ display: "flex", alignItems: "center", gap: "0", marginTop: "4px" }}>
        {segments.map((s, i) => (
          <div key={i} style={{
            flex: 1,
            textAlign: "center",
            border: "1.5px solid #374151",
            borderRight: i < segments.length - 1 ? "none" : "1.5px solid #374151",
            borderRadius: i === 0 ? "3px 0 0 3px" : i === segments.length - 1 ? "0 3px 3px 0" : "0",
            padding: "5px 2px",
            fontSize: "10px",
            color: "#374151",
            fontWeight: 600,
            height: "28px",
            lineHeight: "18px",
          }}>
            {s}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", marginTop: "2px" }}>
        {segments.map((_, i) => (
          <div key={i} style={{ flex: 1, display: "flex", justifyContent: "center" }}>
            {i === 2 ? null : <span style={{ fontSize: "14px", color: "#374151" }}>○</span>}
            {i === 2 ? <span style={{ fontSize: "14px", color: "#374151" }}>○</span> : null}
          </div>
        ))}
      </div>
      <div style={{ fontSize: "9px", color: "#9ca3af", marginTop: "2px" }}>Circle the fuel level at this point</div>
    </div>
  );
}

// ── Condition Checklist ───────────────────────────────────────────────────────

function ConditionChecklist({ side }: { side: "pickup" | "return" }) {
  const items = [
    "Exterior — Front", "Exterior — Rear",
    "Exterior — Left Side", "Exterior — Right Side",
    "Windscreen / Glass", "Interior — Cleanliness",
    "Interior — Seats & Upholstery", "Spare Tyre / Jack",
    "Documents & Keys", "Warning Triangle / Reflectors",
  ];
  const ratings = ["Good", "Minor", "Damage"];

  return (
    <div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11.5px" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "5px 8px", background: "#f3f4f6", borderBottom: "1px solid #d1d5db", fontWeight: 600, color: "#374151", width: "55%" }}>
                Item
              </th>
              {ratings.map(r => (
                <th key={r} style={{ textAlign: "center", padding: "5px 8px", background: "#f3f4f6", borderBottom: "1px solid #d1d5db", fontWeight: 600, color: "#374151" }}>
                  {r}
                </th>
              ))}
              <th style={{ textAlign: "left", padding: "5px 8px", background: "#f3f4f6", borderBottom: "1px solid #d1d5db", fontWeight: 600, color: "#374151" }}>
                Notes
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                <td style={{ padding: "5px 8px", borderBottom: "1px solid #f3f4f6", color: "#374151" }}>{item}</td>
                {ratings.map(r => (
                  <td key={r} style={{ padding: "5px 8px", borderBottom: "1px solid #f3f4f6", textAlign: "center" }}>
                    <span style={S.checkbox} />
                  </td>
                ))}
                <td style={{ padding: "5px 8px", borderBottom: "1px solid #f3f4f6" }}>
                  <div style={{ ...S.fillLineLight, width: "100%", minWidth: "80px" }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── HANDOVER SHEET (Pickup) ───────────────────────────────────────────────────

function HandoverSheet({ d }: { d: DocData }) {
  const currency = d.currency || "GEL";
  const cs = sym(currency);

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
        <div>
          <div style={S.logo}>Tbilisicars</div>
          <div style={{ fontSize: "10.5px", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Vehicle Handover Sheet — Pickup
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "10.5px", color: "#6b7280" }}>Generated</div>
          <div style={{ fontSize: "12px", fontWeight: 600 }}>{fmtDate(new Date().toISOString())}</div>
        </div>
      </div>

      <div style={S.divider} />

      <div style={S.docTitle}>Vehicle Handover Sheet</div>
      <div style={S.refLine}>
        Booking Reference: <strong>TC-{String(d.id).padStart(6, "0")}</strong>
        {" · "}Document No: <strong>HDO-{String(d.id).padStart(6, "0")}</strong>
        {" · "}Status: <strong>{d.status.replace(/_/g, " ")}</strong>
      </div>

      {/* Customer + Vehicle */}
      <div style={{ ...S.section, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 28px" }}>
        <div>
          <div style={S.sectionTitle}>Customer Details</div>
          <Field label="Full Name" value={d.customer_name || d.contact_full_name} />
          <Field label="Phone" value={d.contact_phone || "—"} />
          <Field label="Email" value={d.contact_email || d.customer_email || "—"} />
          {d.document_type && <Field label="ID Type" value={d.document_type} />}
          {d.document_number && <Field label="ID Number" value={d.document_number} />}
        </div>
        <div>
          <div style={S.sectionTitle}>Vehicle Details</div>
          <Field label="Vehicle" value={vehicleLabel(d)} />
          {d.license_plate
            ? <Field label="License Plate" value={d.license_plate} />
            : <Field label="License Plate" value="To be assigned" />}
          {d.vehicle_color && <Field label="Color" value={d.vehicle_color} />}
          {d.vehicle_year && <Field label="Year" value={String(d.vehicle_year)} />}
          <Field label="Odometer (DB)" value={d.vehicle_mileage != null ? `${d.vehicle_mileage.toLocaleString()} km` : "—"} />
        </div>
      </div>

      {/* Rental Dates */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Rental Period</div>
        <div style={S.grid2}>
          <Field label="Pickup Date & Time" value={fmtDt(d.pickup_datetime)} />
          <Field label="Return Date & Time" value={fmtDt(d.dropoff_datetime)} />
          <Field label="Pickup Location" value={d.pickup_location} />
          <Field label="Return Location" value={d.dropoff_location} />
        </div>
        {d.total_amount && (
          <div style={{ marginTop: "8px" }}>
            <Field label="Total Rental Price" value={`${cs}${parseFloat(d.total_amount).toFixed(2)} ${currency}`} />
            {d.deposit && parseFloat(d.deposit) > 0 && (
              <Field label="Security Deposit" value={`${cs}${parseFloat(d.deposit).toFixed(2)} ${currency}`} />
            )}
          </div>
        )}
      </div>

      {/* Pickup Condition */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Vehicle Condition at Pickup</div>
        <div style={{ ...S.grid3, marginBottom: "12px" }}>
          <div>
            <span style={S.label}>Odometer at Pickup (km)</span>
            <div style={S.fillLine} />
          </div>
          <FuelBar />
          <div>
            <span style={S.label}>Accessories / Keys</span>
            <div style={S.fillLine} />
          </div>
        </div>
        <ConditionChecklist side="pickup" />
      </div>

      {/* Existing Damage */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Pre-Existing Damage / Notes</div>
        <div style={{ ...S.box, minHeight: "52px" }}>
          <div style={{ fontSize: "10px", color: "#9ca3af" }}>Describe any pre-existing damage or issues noted at handover:</div>
          <div style={{ marginTop: "10px" }}>
            {[1, 2].map(i => <div key={i} style={{ ...S.fillLineLight, marginBottom: "6px" }} />)}
          </div>
        </div>
      </div>

      {/* Notes */}
      {d.notes && (
        <div style={S.section}>
          <div style={S.sectionTitle}>Booking Notes</div>
          <div style={{ ...S.box, fontSize: "12px", color: "#374151" }}>{d.notes}</div>
        </div>
      )}

      {/* Confirmation */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Confirmation</div>
        <div style={{ ...S.box, fontSize: "11.5px", color: "#374151", lineHeight: "1.7" }}>
          By signing below, the customer confirms that the vehicle has been received in the condition described above,
          and agrees to the rental terms and conditions set by Tbilisicars.
          The customer accepts responsibility for the vehicle from this point until its scheduled return.
        </div>
      </div>

      {/* Signatures */}
      <div style={{ ...S.divider, marginTop: "20px" }} />
      <div style={S.grid2}>
        <div>
          <div style={{ ...S.label, marginBottom: "28px" }}>Customer Signature & Date</div>
          <div style={{ borderBottom: "1px solid #9ca3af", paddingBottom: "2px" }}>
            <span style={{ fontSize: "10px", color: "#d1d5db" }}>________________________________</span>
          </div>
          <div style={{ fontSize: "10.5px", color: "#6b7280", marginTop: "3px" }}>
            {d.customer_name || d.contact_full_name}
          </div>
        </div>
        <div>
          <div style={{ ...S.label, marginBottom: "28px" }}>Staff Signature & Date</div>
          <div style={{ borderBottom: "1px solid #9ca3af", paddingBottom: "2px" }}>
            <span style={{ fontSize: "10px", color: "#d1d5db" }}>________________________________</span>
          </div>
          <div style={{ fontSize: "10.5px", color: "#6b7280", marginTop: "3px" }}>
            Tbilisicars · Handover Officer
          </div>
        </div>
      </div>

      <div style={{ ...S.divider, marginTop: "20px" }} />
      <div style={{ fontSize: "9.5px", color: "#9ca3af", textAlign: "center" }}>
        Tbilisicars · Tbilisi, Georgia · reservations@tbilisicars.com · Tbilisi/Batumi: +995 557 37 63 63 · Kutaisi: +995 595 28 66 00
        · HDO-{String(d.id).padStart(6, "0")} · {fmtDate(new Date().toISOString())}
      </div>
    </div>
  );
}

// ── RETURN SHEET ──────────────────────────────────────────────────────────────

function ReturnSheet({ d }: { d: DocData }) {
  const currency = d.currency || "GEL";
  const cs = sym(currency);

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
        <div>
          <div style={S.logo}>Tbilisicars</div>
          <div style={{ fontSize: "10.5px", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Vehicle Return Sheet — Drop-off
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "10.5px", color: "#6b7280" }}>Generated</div>
          <div style={{ fontSize: "12px", fontWeight: 600 }}>{fmtDate(new Date().toISOString())}</div>
        </div>
      </div>

      <div style={S.divider} />

      <div style={S.docTitle}>Vehicle Return Sheet</div>
      <div style={S.refLine}>
        Booking Reference: <strong>TC-{String(d.id).padStart(6, "0")}</strong>
        {" · "}Document No: <strong>RTN-{String(d.id).padStart(6, "0")}</strong>
        {" · "}Status: <strong>{d.status.replace(/_/g, " ")}</strong>
      </div>

      {/* Customer + Vehicle */}
      <div style={{ ...S.section, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 28px" }}>
        <div>
          <div style={S.sectionTitle}>Customer Details</div>
          <Field label="Full Name" value={d.customer_name || d.contact_full_name} />
          <Field label="Phone" value={d.contact_phone || "—"} />
          <Field label="Email" value={d.contact_email || d.customer_email || "—"} />
        </div>
        <div>
          <div style={S.sectionTitle}>Vehicle Details</div>
          <Field label="Vehicle" value={vehicleLabel(d)} />
          {d.license_plate
            ? <Field label="License Plate" value={d.license_plate} />
            : <Field label="License Plate" value="To be assigned" />}
          {d.vehicle_color && <Field label="Color" value={d.vehicle_color} />}
          {d.vehicle_year && <Field label="Year" value={String(d.vehicle_year)} />}
          <Field label="Odometer at Pickup (DB)" value={d.vehicle_mileage != null ? `${d.vehicle_mileage.toLocaleString()} km` : "—"} />
        </div>
      </div>

      {/* Rental Dates */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Rental Period</div>
        <div style={S.grid2}>
          <Field label="Pickup Date" value={fmtDt(d.pickup_datetime)} />
          <Field label="Scheduled Return" value={fmtDt(d.dropoff_datetime)} />
          <Field label="Pickup Location" value={d.pickup_location} />
          <Field label="Return Location" value={d.dropoff_location} />
        </div>
      </div>

      {/* Return Condition */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Vehicle Condition at Return</div>
        <div style={{ ...S.grid3, marginBottom: "12px" }}>
          <div>
            <span style={S.label}>Actual Return Date & Time</span>
            <div style={S.fillLine} />
          </div>
          <div>
            <span style={S.label}>Odometer at Return (km)</span>
            <div style={S.fillLine} />
          </div>
          <FuelBar />
        </div>
        <ConditionChecklist side="return" />
      </div>

      {/* Damage / Issues */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Damage / Issues Found at Return</div>
        <div style={{ ...S.box, minHeight: "52px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "10px" }}>
            <Checkbox label="No new damage — vehicle returned as received" />
            <Checkbox label="Damage found — see notes below" />
          </div>
          {[1, 2].map(i => <div key={i} style={{ ...S.fillLineLight, marginBottom: "6px" }} />)}
        </div>
      </div>

      {/* Financial Reconciliation */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Financial Reconciliation</div>
        <div style={{ ...S.box }}>
          <div style={S.grid3}>
            <div>
              <span style={S.label}>Total Rental Price</span>
              <span style={S.value}>
                {d.total_amount ? `${cs}${parseFloat(d.total_amount).toFixed(2)} ${currency}` : "—"}
              </span>
            </div>
            <div>
              <span style={S.label}>Deposit Held</span>
              <span style={S.value}>
                {d.deposit && parseFloat(d.deposit) > 0 ? `${cs}${parseFloat(d.deposit).toFixed(2)} ${currency}` : "—"}
              </span>
            </div>
            <div>
              <span style={S.label}>Additional Charges</span>
              <div style={S.fillLine} />
            </div>
          </div>
          <div style={{ ...S.grid2, marginTop: "10px" }}>
            <div>
              <span style={S.label}>Deposit Return Amount</span>
              <div style={S.fillLine} />
            </div>
            <div>
              <span style={S.label}>Deposit Return Method</span>
              <div style={S.fillLine} />
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Return Confirmation</div>
        <div style={{ ...S.box, fontSize: "11.5px", color: "#374151", lineHeight: "1.7" }}>
          By signing below, the customer confirms that the vehicle has been returned and inspected.
          Any damages or discrepancies noted above have been communicated and agreed upon.
          The security deposit will be returned in accordance with the inspection findings.
        </div>
      </div>

      {/* Signatures */}
      <div style={{ ...S.divider, marginTop: "20px" }} />
      <div style={S.grid2}>
        <div>
          <div style={{ ...S.label, marginBottom: "28px" }}>Customer Signature & Date</div>
          <div style={{ borderBottom: "1px solid #9ca3af", paddingBottom: "2px" }}>
            <span style={{ fontSize: "10px", color: "#d1d5db" }}>________________________________</span>
          </div>
          <div style={{ fontSize: "10.5px", color: "#6b7280", marginTop: "3px" }}>
            {d.customer_name || d.contact_full_name}
          </div>
        </div>
        <div>
          <div style={{ ...S.label, marginBottom: "28px" }}>Staff Signature & Date</div>
          <div style={{ borderBottom: "1px solid #9ca3af", paddingBottom: "2px" }}>
            <span style={{ fontSize: "10px", color: "#d1d5db" }}>________________________________</span>
          </div>
          <div style={{ fontSize: "10.5px", color: "#6b7280", marginTop: "3px" }}>
            Tbilisicars · Returns Officer
          </div>
        </div>
      </div>

      <div style={{ ...S.divider, marginTop: "20px" }} />
      <div style={{ fontSize: "9.5px", color: "#9ca3af", textAlign: "center" }}>
        Tbilisicars · Tbilisi, Georgia · reservations@tbilisicars.com · Tbilisi/Batumi: +995 557 37 63 63 · Kutaisi: +995 595 28 66 00
        · RTN-{String(d.id).padStart(6, "0")} · {fmtDate(new Date().toISOString())}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function HandoverDocument() {
  const params = useParams<{ id: string; type: string }>();
  const id = params.id;
  const type = params.type;

  const [data, setData] = useState<DocData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isPickup = type === "pickup";
  const title = isPickup ? "Vehicle Handover Sheet" : "Vehicle Return Sheet";

  useEffect(() => {
    document.documentElement.classList.remove("dark");
    document.title = title;

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

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          @page { margin: 10mm; size: A4; }
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
            {isPickup ? <HandoverSheet d={data} /> : <ReturnSheet d={data} />}
          </div>
        )}
      </div>
    </>
  );
}
