/**
 * DateTimePicker — portal-based dark luxury component.
 *
 * Popup is portalled into document.body with fixed positioning so it never
 * clips inside overflow:hidden ancestors. react-datepicker runs in inline
 * mode for the calendar; time is chosen via two compact <select> dropdowns.
 *
 * External API: value, onChange, min, placeholder, disabled, className  (unchanged)
 * New additive API:
 *   onDone?   — called after the "Done" button closes the popup
 *   ref       — exposes { openPicker() } via useImperativeHandle
 */
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
  type CSSProperties,
} from "react";
import ReactDOM from "react-dom";
import DatePicker from "react-datepicker";
import { Calendar, Clock } from "lucide-react";

export interface DateTimePickerHandle {
  openPicker(): void;
}

interface DateTimePickerProps {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  onDone?: () => void;
  rangeStart?: string;
  rangeEnd?: string;
}

function strToDate(str: string): Date | null {
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function dateToStr(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatDisplay(d: Date, h: number, m: number): string {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}

/**
 * Build a valid Date from (day, h, m) that is always >= minDate.
 * Uses timestamp arithmetic to avoid hour/minute overflow bugs.
 * If the candidate datetime is before minDate, it snaps to the next
 * 15-minute slot that is >= minDate.
 */
function buildDateTime(day: Date, h: number, m: number, minDate: Date | null): Date {
  const candidate = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0, 0);
  if (!minDate || candidate >= minDate) return candidate;
  // Snap to next 15-min slot >= minDate
  const slotMs = 15 * 60 * 1000;
  const snappedMs = Math.ceil(minDate.getTime() / slotMs) * slotMs;
  return new Date(snappedMs);
}

const CALENDAR_STYLES = `
.tc-dp-popup {
  background: hsl(211,55%,8%);
  border: 1px solid hsl(214,35%,22%);
  border-radius: 14px;
  box-shadow: 0 24px 64px rgba(0,0,0,0.65), 0 4px 16px rgba(0,0,0,0.4);
  overflow: hidden;
  user-select: none;
}
.tc-dp-popup .react-datepicker {
  background: transparent;
  border: none;
  font-family: inherit;
  width: 100%;
}
.tc-dp-popup .react-datepicker__month-container {
  width: 100%;
  float: none;
}
.tc-dp-popup .react-datepicker__header {
  background: hsl(211,55%,10%);
  border-bottom: 1px solid hsl(214,35%,20%);
  border-radius: 0;
  padding: 12px 12px 8px;
}
.tc-dp-popup .react-datepicker__current-month {
  color: #fff;
  font-weight: 700;
  font-size: 0.875rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  margin-bottom: 8px;
}
.tc-dp-popup .react-datepicker__day-names {
  display: flex;
  justify-content: space-around;
  margin: 0;
}
.tc-dp-popup .react-datepicker__day-name {
  color: hsl(214,20%,55%);
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  width: 2.4rem;
  line-height: 2;
  text-align: center;
}
.tc-dp-popup .react-datepicker__navigation {
  top: 14px;
  background: hsl(214,35%,18%);
  border: 1px solid hsl(214,35%,26%);
  border-radius: 7px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, border-color 0.15s;
}
.tc-dp-popup .react-datepicker__navigation:hover {
  background: hsl(214,35%,24%);
  border-color: hsl(214,35%,32%);
}
.tc-dp-popup .react-datepicker__navigation--previous { left: 12px; }
.tc-dp-popup .react-datepicker__navigation--next { right: 12px; }
.tc-dp-popup .react-datepicker__navigation-icon::before {
  border-color: hsl(214,20%,65%);
  border-width: 2px 2px 0 0;
  width: 7px;
  height: 7px;
}
.tc-dp-popup .react-datepicker__month {
  margin: 6px 8px 8px;
}
.tc-dp-popup .react-datepicker__week {
  display: flex;
  justify-content: space-around;
}
.tc-dp-popup .react-datepicker__day {
  color: hsl(214,10%,82%);
  width: 2.4rem;
  line-height: 2.4rem;
  height: 2.4rem;
  margin: 2px;
  border-radius: 8px;
  font-size: 0.82rem;
  font-weight: 500;
  text-align: center;
  transition: background 0.12s, color 0.12s;
  cursor: pointer;
}
.tc-dp-popup .react-datepicker__day:hover:not(.react-datepicker__day--disabled) {
  background: hsl(350,68%,38%,0.25);
  color: #fff;
}
.tc-dp-popup .react-datepicker__day--today {
  background: hsl(214,35%,20%);
  color: hsl(214,10%,90%);
  font-weight: 700;
}
.tc-dp-popup .react-datepicker__day--selected,
.tc-dp-popup .react-datepicker__day--keyboard-selected {
  background: hsl(350,68%,38%) !important;
  color: #fff !important;
  font-weight: 700;
}
.tc-dp-popup .react-datepicker__day--selected:hover {
  background: hsl(350,68%,32%) !important;
}
.tc-dp-popup .react-datepicker__day--outside-month {
  color: hsl(214,20%,35%);
}
.tc-dp-popup .react-datepicker__day--disabled {
  color: hsl(214,20%,28%) !important;
  cursor: not-allowed;
  background: transparent !important;
}
.tc-dp-popup .react-datepicker__day--in-range {
  background: hsla(350,68%,38%,0.18);
  color: hsl(214,10%,88%);
  border-radius: 0;
}
.tc-dp-popup .react-datepicker__day--in-range:hover {
  background: hsla(350,68%,38%,0.32);
}
.tc-dp-popup .react-datepicker__day--range-start,
.tc-dp-popup .react-datepicker__day--range-end {
  background: hsl(350,68%,38%) !important;
  color: #fff !important;
  font-weight: 700;
}
.tc-dp-popup .react-datepicker__day--range-start {
  border-radius: 8px 0 0 8px !important;
}
.tc-dp-popup .react-datepicker__day--range-end {
  border-radius: 0 8px 8px 0 !important;
}
.tc-dp-popup .react-datepicker__day--range-start.react-datepicker__day--range-end {
  border-radius: 8px !important;
}
.tc-dp-time-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px 12px;
  border-top: 1px solid hsl(214,35%,18%);
  background: hsl(211,55%,9%);
}
.tc-dp-time-label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: hsl(214,20%,52%);
  margin-right: 2px;
  white-space: nowrap;
}
.tc-dp-time-sep {
  font-size: 1rem;
  font-weight: 700;
  color: hsl(214,20%,55%);
  line-height: 1;
}
.tc-dp-time-select {
  flex: 1;
  background: hsl(214,35%,15%);
  border: 1px solid hsl(214,35%,24%);
  border-radius: 8px;
  color: #fff;
  font-size: 0.9rem;
  font-weight: 600;
  padding: 6px 4px;
  cursor: pointer;
  outline: none;
  text-align: center;
  appearance: none;
  -webkit-appearance: none;
  transition: border-color 0.15s, background 0.15s;
  font-family: inherit;
  min-width: 0;
}
.tc-dp-time-select:hover:not(:disabled) {
  border-color: hsl(350,68%,38%);
  background: hsl(214,35%,18%);
}
.tc-dp-time-select:focus {
  border-color: hsl(350,68%,38%);
  box-shadow: 0 0 0 2px hsl(350,68%,38%,0.25);
}
.tc-dp-time-select:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.tc-dp-time-select option {
  background: hsl(211,55%,10%);
  color: #fff;
}
.tc-dp-time-select option:disabled {
  color: hsl(214,20%,35%);
}
`;

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected || typeof document === "undefined") return;
  const el = document.createElement("style");
  el.setAttribute("data-tc-dp", "1");
  el.textContent = CALENDAR_STYLES;
  document.head.appendChild(el);
  stylesInjected = true;
}

export const DateTimePicker = forwardRef<DateTimePickerHandle, DateTimePickerProps>(
  function DateTimePicker(
    { value, onChange, min, placeholder, disabled, className, onDone, rangeStart, rangeEnd },
    ref,
  ) {
    const [open, setOpen] = useState(false);
    const [popupStyle, setPopupStyle] = useState<CSSProperties>({});
    const triggerRef = useRef<HTMLButtonElement>(null);
    const popupRef = useRef<HTMLDivElement>(null);

    const selected = strToDate(value);
    const minDate = min ? strToDate(min) : null;

    const hour = selected ? selected.getHours() : 9;
    const minute = selected ? Math.floor(selected.getMinutes() / 15) * 15 : 0;

    useEffect(() => { injectStyles(); }, []);

    const openPopup = useCallback(() => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const approxH = 400;
      const spaceBelow = window.innerHeight - rect.bottom;
      const top = spaceBelow >= approxH
        ? rect.bottom + 6
        : Math.max(8, rect.top - approxH - 6);
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - 316));
      setPopupStyle({ position: "fixed", top, left, zIndex: 9999, width: 308 });
      setOpen(true);
    }, []);

    useImperativeHandle(ref, () => ({ openPicker: openPopup }), [openPopup]);

    useEffect(() => {
      if (!open) return;
      function handleClick(e: MouseEvent) {
        const target = e.target as Node;
        if (!triggerRef.current?.contains(target) && !popupRef.current?.contains(target)) {
          setOpen(false);
        }
      }
      function handleScroll(e: Event) {
        const target = e.target;
        if (target instanceof Node && popupRef.current?.contains(target)) return;
        setOpen(false);
      }
      document.addEventListener("mousedown", handleClick);
      window.addEventListener("scroll", handleScroll, true);
      return () => {
        document.removeEventListener("mousedown", handleClick);
        window.removeEventListener("scroll", handleScroll, true);
      };
    }, [open]);

    function handleDateChange(d: Date | null) {
      if (!d) return;
      onChange(dateToStr(buildDateTime(d, hour, minute, minDate)));
    }

    function handleHourChange(h: number) {
      if (!selected) return;
      onChange(dateToStr(buildDateTime(selected, h, minute, minDate)));
    }

    function handleMinuteChange(m: number) {
      if (!selected) return;
      onChange(dateToStr(buildDateTime(selected, hour, m, minDate)));
    }

    // An hour option is disabled when ALL its 15-min slots are before minDate.
    function isHourDisabled(h: number): boolean {
      if (!minDate || !selected) return false;
      if (!isSameDay(selected, minDate)) return false;
      if (h < minDate.getHours()) return true;
      if (h > minDate.getHours()) return false;
      // h === minDate.getHours(): disabled if no 15-min slot in this hour is >= min
      return ![0, 15, 30, 45].some((m) => m >= minDate.getMinutes());
    }

    function isMinuteDisabled(m: number): boolean {
      if (!minDate || !selected) return false;
      if (!isSameDay(selected, minDate)) return false;
      if (hour > minDate.getHours()) return false;
      if (hour < minDate.getHours()) return true;
      return m < minDate.getMinutes();
    }

    const displayText = selected ? formatDisplay(selected, hour, minute) : "";

    const popup =
      open && !disabled && typeof document !== "undefined"
        ? ReactDOM.createPortal(
            <div ref={popupRef} style={popupStyle} className="tc-dp-popup">
              <DatePicker
                selected={selected}
                onChange={handleDateChange}
                inline
                minDate={minDate ?? undefined}
                startDate={rangeStart ? strToDate(rangeStart) ?? undefined : undefined}
                endDate={rangeEnd ? strToDate(rangeEnd) ?? undefined : undefined}
              />
              <div className="tc-dp-time-row">
                <div className="tc-dp-time-label">
                  <Clock className="w-3 h-3" />
                  Time
                </div>
                <select
                  className="tc-dp-time-select"
                  value={hour}
                  disabled={!selected}
                  onChange={(e) => handleHourChange(Number(e.target.value))}
                  aria-label="Hour"
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i} disabled={isHourDisabled(i)}>
                      {String(i).padStart(2, "0")}
                    </option>
                  ))}
                </select>
                <span className="tc-dp-time-sep">:</span>
                <select
                  className="tc-dp-time-select"
                  value={minute}
                  disabled={!selected}
                  onChange={(e) => handleMinuteChange(Number(e.target.value))}
                  aria-label="Minutes"
                >
                  {[0, 15, 30, 45].map((m) => (
                    <option key={m} value={m} disabled={isMinuteDisabled(m)}>
                      {String(m).padStart(2, "0")}
                    </option>
                  ))}
                </select>
                {selected && (
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onDone?.();
                    }}
                    className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                    style={{ background: "hsl(350,68%,38%)", color: "#fff" }}
                  >
                    Done
                  </button>
                )}
              </div>
            </div>,
            document.body,
          )
        : null;

    return (
      <div className={`tc-datepicker${className ? ` ${className}` : ""}`}>
        <button
          ref={triggerRef}
          type="button"
          onClick={() => (open ? setOpen(false) : openPopup())}
          disabled={disabled}
          style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
          className={[
            "w-full flex items-center gap-2.5 rounded-lg border border-white/10 px-3.5 py-3",
            "text-sm text-left focus:outline-none focus:ring-2 focus:ring-primary/60 transition-all",
            "hover:border-primary/40 disabled:opacity-50 disabled:cursor-not-allowed group",
            open ? "border-primary/50" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <Calendar className="w-4 h-4 text-primary shrink-0" />
          <span className={`flex-1 truncate ${displayText ? "text-foreground" : "text-muted-foreground"}`}>
            {displayText || placeholder || "Select date & time"}
          </span>
          <Clock className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0 group-hover:text-primary/50 transition-colors" />
        </button>
        {popup}
      </div>
    );
  },
);
