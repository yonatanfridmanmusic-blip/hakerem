import { useState, useEffect, useRef } from "react";
import { ChevronDown, Search } from "lucide-react";

interface CategoryOption {
  id: string;
  name: string;
}

interface CategorySearchSelectProps {
  value: string; // "" = none, "__new__" = add new
  onChange: (id: string) => void;
  categories: CategoryOption[];
  allowAddNew?: boolean;
  sourceColor?: string;
}

export function CategorySearchSelect({
  value,
  onChange,
  categories,
  allowAddNew = false,
  sourceColor = "#2D6644",
}: CategorySearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = categories.filter(
    (c) => !search || c.name.includes(search),
  );

  const selectedCat = categories.find((c) => c.id === value);
  const displayLabel =
    value === "__new__"
      ? "+ הוסף קטגוריה חדשה..."
      : selectedCat?.name ?? "— ללא קטגוריה —";

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Focus search when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 30);
    }
  }, [open]);

  const select = (id: string) => {
    onChange(id);
    setOpen(false);
    setSearch("");
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          padding: "9px 12px",
          border: `1px solid ${open ? sourceColor : "#E8E2D9"}`,
          borderRadius: "8px",
          fontSize: "14px",
          background: "#fff",
          color: value ? "#1A1A1A" : "#AAA099",
          outline: "none",
          fontFamily: "var(--font-sans)",
          direction: "rtl",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          transition: "border-color 0.12s",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {displayLabel}
        </span>
        <ChevronDown
          size={14}
          style={{
            color: "#AAA099",
            flexShrink: 0,
            marginRight: "4px",
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.15s",
          }}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            left: 0,
            zIndex: 100,
            background: "#fff",
            border: "1px solid #E8E2D9",
            borderRadius: "10px",
            boxShadow: "0 8px 30px rgba(0,0,0,0.13)",
            overflow: "hidden",
          }}
        >
          {/* Search input */}
          <div style={{ padding: "8px", borderBottom: "1px solid #F0EBE4", display: "flex", alignItems: "center", gap: "6px" }}>
            <Search size={13} style={{ color: "#AAA099", flexShrink: 0 }} />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש קטגוריה..."
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                fontSize: "13px",
                fontFamily: "var(--font-sans)",
                direction: "rtl",
                background: "transparent",
                color: "#1A1A1A",
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#C0BAB4", padding: "0 2px", lineHeight: 1 }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Options list */}
          <div style={{ maxHeight: "200px", overflowY: "auto" }}>
            {/* No category option */}
            <div
              onClick={() => select("")}
              style={{
                padding: "9px 14px",
                cursor: "pointer",
                fontSize: "13px",
                color: value === "" ? sourceColor : "#AAA099",
                fontWeight: value === "" ? "600" : "400",
                background: value === "" ? `${sourceColor}10` : "transparent",
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#F5F3F0"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = value === "" ? `${sourceColor}10` : "transparent"; }}
            >
              — ללא קטגוריה —
            </div>

            {/* Filtered categories */}
            {filtered.map((c) => (
              <div
                key={c.id}
                onClick={() => select(c.id)}
                style={{
                  padding: "9px 14px",
                  cursor: "pointer",
                  fontSize: "14px",
                  color: c.id === value ? sourceColor : "#1A1A1A",
                  fontWeight: c.id === value ? "600" : "400",
                  background: c.id === value ? `${sourceColor}12` : "transparent",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#F5F3F0"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = c.id === value ? `${sourceColor}12` : "transparent"; }}
              >
                {c.name}
              </div>
            ))}

            {filtered.length === 0 && (
              <div style={{ padding: "10px 14px", fontSize: "13px", color: "#AAA099", textAlign: "center" }}>
                לא נמצאו תוצאות
              </div>
            )}

            {/* Add new option */}
            {allowAddNew && (
              <>
                <div style={{ height: "1px", background: "#F0EBE4", margin: "4px 0" }} />
                <div
                  onClick={() => select("__new__")}
                  style={{
                    padding: "9px 14px",
                    cursor: "pointer",
                    fontSize: "13px",
                    color: sourceColor,
                    fontWeight: "500",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = `${sourceColor}10`; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                >
                  + הוסף קטגוריה חדשה...
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
