import { useState, useEffect } from "react";

/**
 * DateInput — shows dd/mm/yyyy to the user, stores yyyy-mm-dd internally.
 *
 * Props:
 *   value    — ISO date string "yyyy-mm-dd" (or "")
 *   onChange — called with ISO "yyyy-mm-dd" on valid input
 *   style    — optional CSS override (merged onto the <input> element)
 *   required — HTML required attribute
 *   placeholder — defaults to "dd/mm/yyyy"
 */

function isoToDisplay(iso: string): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso; // already in display format or unknown
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function displayToIso(display: string): string | null {
  const m = display.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = m[1].padStart(2, "0");
  const mo = m[2].padStart(2, "0");
  const y = m[3];
  // Rough validity check
  const n = Number(d), nm = Number(mo), ny = Number(y);
  if (n < 1 || n > 31 || nm < 1 || nm > 12 || ny < 2000 || ny > 2100) return null;
  return `${y}-${mo}-${d}`;
}

export function DateInput({
  value,
  onChange,
  style,
  required,
  placeholder = "dd/mm/yyyy",
}: {
  value: string;
  onChange: (iso: string) => void;
  style?: React.CSSProperties;
  required?: boolean;
  placeholder?: string;
}) {
  const [display, setDisplay] = useState(() => isoToDisplay(value));
  const [invalid, setInvalid] = useState(false);

  // Sync if value changes externally (e.g., reset form)
  useEffect(() => {
    setDisplay(isoToDisplay(value));
    setInvalid(false);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let v = e.target.value;

    // Auto-insert slash after day (2 digits) and after month (5 chars: dd/mm)
    if (v.length === 2 && display.length === 1 && /^\d{2}$/.test(v)) {
      v = v + "/";
    } else if (v.length === 5 && display.length === 4 && /^\d{2}\/\d{2}$/.test(v)) {
      v = v + "/";
    }

    setDisplay(v);

    if (!v) {
      setInvalid(false);
      return;
    }

    const iso = displayToIso(v);
    if (iso) {
      setInvalid(false);
      onChange(iso);
    } else {
      // Only mark invalid once they've typed enough to be a full date
      setInvalid(v.length >= 10);
    }
  };

  const handleBlur = () => {
    const iso = displayToIso(display);
    if (!display) { setInvalid(false); return; }
    if (!iso) {
      setInvalid(true);
    }
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      value={display}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={placeholder}
      maxLength={10}
      required={required}
      style={{
        ...style,
        borderColor: invalid ? "#DC2626" : undefined,
      }}
    />
  );
}
