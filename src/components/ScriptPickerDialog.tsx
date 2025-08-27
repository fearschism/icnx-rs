// no React import needed
import type { ScriptInfo } from '../types';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  scripts: ScriptInfo[];
  onPick: (script: ScriptInfo) => void;
  inputUrl: string;
};

export default function ScriptPickerDialog({ isOpen, onClose, scripts, onPick, inputUrl }: Props) {
  if (!isOpen) return null;
  return (
    <div className="dialog-overlay flex items-center justify-center p-4">
      <div className="dialog-content w-full max-w-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Choose a script for this URL</h2>
          <button className="btn-ghost" onClick={onClose}>Close</button>
        </div>
        <div className="text-sm text-gray-400 mb-4 break-all">{inputUrl}</div>
        <div className="space-y-2">
          {scripts.map((s) => (
            <button key={s.name} className="w-full flex justify-between items-center p-3 rounded border border-[var(--panel-border)] hover:bg-[var(--panel)]"
              onClick={() => onPick(s)}>
              <div className="text-left">
                <div className="text-white font-medium">{s.name}</div>
                <div className="text-xs text-gray-400">{s.description}</div>
              </div>
              <div className="text-xs text-gray-400">{(s.supportedDomains || []).join(', ')}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}


