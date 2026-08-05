// ─── Version & Changelog — single source of truth ─────────────────────────────
//
// Bump APP_VERSION + add a CHANGELOG entry on every merge to prod.
// Scheme: SemVer מונחה-משתמש — גל.פיצ'ר.תיקון (e.g. 2.1.0).
//
// עיקרון ניסוח מחייב: לעולם לא "תוקן באג". תמיד שיפור והתקדמות,
// בשפת הלקוחות. הפירוט הטכני נשאר ב-commits ובתדריך.

export const APP_VERSION = "2.1.0";

export interface ChangelogEntry {
  version: string;
  date: string; // display string, Hebrew
  title: string;
  items: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "2.1.0",
    date: "אוגוסט 2026",
    title: "אחוז הגבייה — בשליטה שלכם",
    items: [
      "עכשיו אפשר לקבוע את אחוז הגבייה של בית הספר — וכל המערכת מתיישרת לפיו: לוח הבקרה, מסך ההורים, ההכנסות והדוחות.",
      "חדש במסך גביית הורים: מצב תחזית. גררו את הסליידר ובדקו \"מה אם נגבה 70%?\" — תצוגה זמנית, בלי לשנות שום הגדרה.",
      "דוח גביית ההורים שודרג ומציג את היעדים בשני מבטים: לפי האחוז שקבעתם ולפי גבייה מלאה.",
      "שאלו את הסוכן החכם על מצב הגבייה — הוא מעודכן בזמן אמת עם המספרים המדויקים שלכם.",
      "תהליך ניהול אנשי הצוות שופץ — אישור והצטרפות של חברי צוות חדשים מתבצעים עכשיו בצורה חלקה.",
    ],
  },
  {
    version: "2.0.0",
    date: "יולי 2026",
    title: "תכנון מול בפועל — מבט חדש על הכסף",
    items: [
      "לכל מקור תקציב יש עכשיו תמונה מלאה: כמה תוכנן, כמה נכנס בפועל, כמה יצא — ומה היתרה האמיתית.",
      "בהגדרת שנה חדשה אפשר להזין כמה צפוי להיכנס מכל מקור, והמערכת מלווה אתכם עם חיווי עדין אם החלוקה חורגת.",
      "רישום גבייה נהיה מהיר: מזינים כמה ילדים שילמו — והמערכת מחשבת ומפצלת בין הסעיפים בשבילכם.",
      "הגבייה מופיעה בכל מקום שצריך: ברשימת ההכנסות, בלוח הבקרה ובדוחות — תמונה אחת עקבית.",
      "לחצו על כל מקור תקציב בדשבורד וראו פירוט מלא — עד רמת השכבה.",
    ],
  },
];

/** Returns entries newer than the given version (null → all treated as seen elsewhere). */
export function entriesSince(lastSeen: string | null): ChangelogEntry[] {
  if (!lastSeen) return CHANGELOG;
  return CHANGELOG.filter((e) => compareVersions(e.version, lastSeen) > 0);
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}
