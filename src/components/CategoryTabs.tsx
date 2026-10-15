import {
  Layers,
  Image,
  FileText,
  Code2,
  Link2,
  Pin,
  Trash2,
} from "lucide-react";
import type { HistoryCategory } from "../lib/history";
export type Category = HistoryCategory;
const tabs = [
  { id: "all", label: "All", Icon: Layers },
  { id: "image", label: "Images", Icon: Image },
  { id: "text", label: "Text", Icon: FileText },
  { id: "code", label: "Code", Icon: Code2 },
  { id: "link", label: "Links", Icon: Link2 },
  { id: "pinned", label: "Pinned", Icon: Pin },
  { id: "trash", label: "Trash", Icon: Trash2 },
] as const;
export function CategoryTabs({
  activeCategory,
  onSelectCategory,
  trashCount = 0,
}: {
  activeCategory: Category;
  onSelectCategory: (category: Category) => void;
  trashCount?: number;
}) {
  return (
    <nav className="category-tabs" aria-label="Filter clipboard history">
      {[tabs.slice(0, 5), tabs.slice(5)].map((group, index) => <div className="category-group" key={index}>
      {group.map(({ id, label, Icon }) => (
        <button
          key={id}
          className={activeCategory === id ? "is-active" : ""}
          aria-current={activeCategory === id ? "page" : undefined}
          onClick={() => onSelectCategory(id)}
        >
          <Icon size={15} />
          <span>{label}</span>
          {id === "trash" && trashCount > 0 && (
            <span className="count">{trashCount}</span>
          )}
        </button>
      ))}
      </div>)}
    </nav>
  );
}
