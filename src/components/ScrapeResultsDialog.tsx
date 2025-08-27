import { useEffect, useMemo, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Checkbox } from './ui/checkbox';

type Item = {
  url: string;
  filename?: string;
  title?: string;
  type?: string;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  items: Item[];
  onConfirm: (selected: Item[]) => void;
};

export default function ScrapeResultsDialog({ isOpen, onClose, items, onConfirm }: Props) {
  const [selectedMap, setSelectedMap] = useState<Record<number, boolean>>({});
  const allSelected = useMemo(() => items.length > 0 && items.every((_, idx) => selectedMap[idx]), [items, selectedMap]);
  // Pagination
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages - 1);
  const startIdx = currentPage * pageSize;
  const endIdx = Math.min(startIdx + pageSize, total);
  const pagedItems = items.slice(startIdx, endIdx);

  useEffect(() => {
    if (isOpen) {
      const defaults: Record<number, boolean> = {};
      items.forEach((_, idx) => { defaults[idx] = true; });
      setSelectedMap(defaults);
      setPage(0);
    }
  }, [isOpen, items]);

  const toggleAll = () => {
    const next: Record<number, boolean> = {};
    items.forEach((_, idx) => { next[idx] = !allSelected; });
    setSelectedMap(next);
  };

  const toggleIdx = (idx: number) => {
    setSelectedMap(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const confirm = () => {
    const selected = items.filter((_, idx) => selectedMap[idx]);
    onConfirm(selected);
  };

  if (!isOpen) return null;

  return (
    <div className="dialog-overlay flex items-center justify-center p-4">
      <div className="dialog-content glass w-full max-w-5xl p-6 rounded-lg border border-gray-600/30 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Scrape Results</h2>
          <button className="btn-ghost" onClick={onClose}>Close</button>
        </div>

        <div className="overflow-auto rounded border border-[var(--panel-border)]">
          <table className="min-w-full text-xs">
            <thead className="bg-[var(--panel)]">
              <tr>
                <th className="p-2 text-left w-8">
                  <Checkbox checked={allSelected} onCheckedChange={() => toggleAll()} />
                </th>
                <th className="p-2 text-left">Title</th>
                <th className="p-2 text-left">Filename</th>
                <th className="p-2 text-left">Type</th>
                <th className="p-2 text-left">URL</th>
                <th className="p-2 text-left w-20"></th>
              </tr>
            </thead>
            <tbody>
              {pagedItems.map((it, localIdx) => {
                const idx = startIdx + localIdx;
                return (
                <tr key={idx} className="border-t border-[var(--panel-border)]">
                  <td className="p-2">
                  <Checkbox checked={!!selectedMap[idx]} onCheckedChange={(_) => toggleIdx(idx)} />
                  </td>
                  <td className="p-2 text-gray-200">{it.title || '-'}</td>
                  <td className="p-2 font-mono text-gray-300">{it.filename || '-'}</td>
                  <td className="p-2 text-gray-300">{it.type || '-'}</td>
                  <td className="p-2 text-gray-400 break-all max-w-[22rem]">{it.url}</td>
                  <td className="p-2">
                    <div className="min-w-[100px]">
                      <Select value={selectedMap[idx] ? 'yes' : 'no'} onValueChange={(v) => setSelectedMap(prev => ({ ...prev, [idx]: v === 'yes' }))}>
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="yes">Yes</SelectItem>
                          <SelectItem value="no">No</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
        {/* Pagination controls */}
        <div className="mt-3 flex items-center justify-between text-sm text-gray-300">
          <div>
            Showing {total === 0 ? 0 : startIdx + 1}–{endIdx} of {total}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-gray-400">Rows per page:</label>
            <select className="bg-[var(--panel)] border border-[var(--panel-border)] rounded px-2 py-1"
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}>
              {[5,10,20,50].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <button className="btn-ghost px-3 py-1" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={currentPage === 0}>Prev</button>
            <span className="text-gray-400">Page {currentPage + 1} / {totalPages}</span>
            <button className="btn-ghost px-3 py-1" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={currentPage >= totalPages - 1}>Next</button>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={confirm}>Download Selected</button>
        </div>
      </div>
    </div>
  );
}


