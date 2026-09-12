/**
 * DateInput — קלט תאריך נטיבי (משוב יונתן 3, הנגשה).
 *
 * הוחלף מימוש הטקסט-עם-מסכה (dd/mm/yyyy) ב-input type="date":
 * לחיצה פותחת לוח שנה גרפי של הדפדפן, התצוגה בפורמט ישראלי לפי
 * ה-locale, והקלדת טקסט חופשי אינה אפשרית פיזית — אין צורך בוולידציה.
 *
 * החוזה נשאר זהה: value/onChange עובדים עם ISO "yyyy-mm-dd" (או "").
 */

export function DateInput({
  value,
  onChange,
  style,
  required,
  disabled,
}: {
  value: string;
  onChange: (iso: string) => void;
  style?: React.CSSProperties;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => {
        // פתיחת לוח השנה בלחיצה בכל מקום בשדה (בדפדפנים שתומכים)
        try { e.currentTarget.showPicker?.(); } catch { /* דפדפנים ישנים / חוסר הרשאה — הקליק הרגיל עדיין עובד */ }
      }}
      required={required}
      disabled={disabled}
      min="2000-01-01"
      max="2100-12-31"
      style={style}
    />
  );
}
