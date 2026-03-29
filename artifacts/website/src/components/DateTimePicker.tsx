/**
 * Custom premium date/time picker for the dark luxury design.
 * Uses react-datepicker with a fully styled dark calendar UI.
 * Supports min date/time, 15-minute intervals, and all existing validation logic.
 * Logic (strToDate, dateToStr, filterTime, all DatePicker props) is unchanged.
 */
import { forwardRef, useCallback } from "react";
import DatePicker from "react-datepicker";
import { Calendar, Clock } from "lucide-react";

interface DateTimePickerProps {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
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

const CustomInput = forwardRef<HTMLButtonElement, {
  value?: string; onClick?: () => void; placeholder?: string; disabled?: boolean; className?: string;
}>(({ value, onClick, placeholder, disabled, className }, ref) => (
  <button
    type="button"
    ref={ref}
    onClick={onClick}
    disabled={disabled}
    className={`w-full flex items-center gap-2.5 rounded-lg border border-input bg-secondary/40 px-3.5 py-3 text-sm text-left focus:outline-none focus:ring-2 focus:ring-primary/60 transition-all hover:border-primary/40 hover:bg-secondary/60 disabled:opacity-50 disabled:cursor-not-allowed group ${className ?? ""}`}
  >
    <Calendar className="w-4 h-4 text-primary shrink-0" />
    <span className={`flex-1 truncate ${value ? "text-foreground" : "text-muted-foreground"}`}>
      {value || placeholder || "Select date & time"}
    </span>
    <Clock className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0 group-hover:text-primary/50 transition-colors" />
  </button>
));
CustomInput.displayName = "DateTimePickerInput";

const POPPER_MODIFIERS = [
  { name: "flip",       enabled: true,  options: { fallbackPlacements: ["top-start", "bottom-start"] } },
  { name: "preventOverflow", enabled: true, options: { padding: 12 } },
] as any;

export function DateTimePicker({ value, onChange, min, placeholder, disabled, className }: DateTimePickerProps) {
  const selected = strToDate(value);
  const minDate = min ? strToDate(min) : null;

  const filterTime = useCallback((time: Date): boolean => {
    if (!minDate) return true;
    const candidateDay = selected ?? time;
    const sameDay =
      candidateDay.getFullYear() === minDate.getFullYear() &&
      candidateDay.getMonth() === minDate.getMonth() &&
      candidateDay.getDate() === minDate.getDate();
    if (!sameDay) return true;
    return time.getTime() >= minDate.getTime();
  }, [minDate, selected]);

  return (
    <div className={`tc-datepicker${className ? ` ${className}` : ""}`}>
      <DatePicker
        selected={selected}
        onChange={(d: Date | null) => { if (d) onChange(dateToStr(d)); }}
        showTimeSelect
        timeIntervals={15}
        timeFormat="HH:mm"
        dateFormat="d MMM yyyy, HH:mm"
        minDate={minDate ?? undefined}
        filterTime={filterTime}
        placeholderText={placeholder ?? "Select date & time"}
        customInput={<CustomInput placeholder={placeholder} disabled={disabled} />}
        popperPlacement="bottom-start"
        popperModifiers={POPPER_MODIFIERS}
        showPopperArrow={false}
        disabled={disabled}
        popperClassName="tc-datepicker-popper"
      />
    </div>
  );
}
