import { X, Zap, Crown } from 'lucide-react';
import { useState } from 'react';

/**
 * QueueColorPicker Modal Component
 * Allows admin to customize queue display colors with visual selection
 */
export function QueueColorPicker({ isOpen, onClose, colors, onSave, isBusy = false }) {
  const [localColors, setLocalColors] = useState(colors);

  const handleColorChange = (key, value) => {
    setLocalColors(prev => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSave = async () => {
    await onSave(localColors);
    onClose();
  };

  const presets = [
    {
      name: 'Default',
      colors: { current: '#0f766e', next: '#7c3aed', accent: '#0d9488' },
    },
    {
      name: 'Modern',
      colors: { current: '#0ea5e9', next: '#f59e0b', accent: '#10b981' },
    },
    {
      name: 'Professional',
      colors: { current: '#1e40af', next: '#7c3aed', accent: '#059669' },
    },
    {
      name: 'Warm',
      colors: { current: '#dc2626', next: '#f97316', accent: '#ea580c' },
    },
  ];

  // Common queue colors
  const commonColors = [
    '#0f766e', '#0ea5e9', '#1e40af', '#dc2626', '#f97316', '#10b981',
    '#7c3aed', '#06b6d4', '#8b5cf6', '#ec4899', '#d946ef', '#f59e0b',
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">Customize Queue Colors</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          >
            <X size={20} />
          </button>
        </div>

        {/* Color Pickers with Visual Selection */}
        <div className="space-y-6 mb-6">
          {[
            { key: 'current', label: 'Now Serving', description: 'Color for currently served token', icon: null },
            { key: 'next', label: 'Next Queue', description: 'Color for next token', icon: null },
            { key: 'accent', label: 'Accent Color', description: 'Color for accents and highlights', icon: null },
          ].map(({ key, label, description }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-slate-700 mb-2">{label}</label>
              <p className="text-xs text-slate-500 mb-3">{description}</p>
              
              {/* Color Input */}
              <div className="flex items-center gap-3 mb-3">
                <input
                  type="color"
                  value={localColors[key]}
                  onChange={e => handleColorChange(key, e.target.value)}
                  className="h-12 w-20 cursor-pointer rounded-lg border-2 border-slate-300"
                />
                <input
                  type="text"
                  value={localColors[key]}
                  onChange={e => handleColorChange(key, e.target.value)}
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm uppercase"
                  placeholder="#000000"
                />
              </div>

              {/* Color Palette */}
              <div className="grid grid-cols-6 gap-2">
                {commonColors.map(color => (
                  <button
                    key={color}
                    onClick={() => handleColorChange(key, color)}
                    className={`h-10 rounded-lg border-2 transition-all ${
                      localColors[key].toLowerCase() === color.toLowerCase()
                        ? 'border-slate-900 ring-2 ring-slate-400'
                        : 'border-slate-300 hover:border-slate-500'
                    }`}
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Color Presets */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-700 mb-2">Quick Presets</label>
          <div className="grid grid-cols-2 gap-2">
            {presets.map(preset => (
              <button
                key={preset.name}
                onClick={() => setLocalColors(preset.colors)}
                className="rounded-lg border border-slate-200 p-3 text-left hover:bg-slate-50 transition-colors"
              >
                <p className="text-xs font-medium text-slate-900">{preset.name}</p>
                <div className="mt-2 flex gap-1">
                  {Object.values(preset.colors).map((color, idx) => (
                    <div
                      key={idx}
                      className="h-6 w-6 rounded border border-slate-300"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Preview */}
        <div className="mb-6 rounded-lg bg-slate-50 p-4">
          <p className="text-xs font-medium text-slate-600 mb-3">Preview</p>
          <div className="grid grid-cols-2 gap-2">
            <div
              className="rounded-lg p-4 text-white text-center"
              style={{ backgroundColor: localColors.current }}
            >
              <p className="text-xs font-semibold opacity-80">NOW SERVING</p>
              <p className="text-2xl font-bold mt-1">Q001</p>
            </div>
            <div
              className="rounded-lg p-4 text-white text-center"
              style={{ backgroundColor: localColors.next }}
            >
              <p className="text-xs font-semibold opacity-80">NEXT QUEUE</p>
              <p className="text-2xl font-bold mt-1">Q002</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isBusy}
            className="flex-1 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
          >
            {isBusy ? 'Saving...' : 'Save Colors'}
          </button>
        </div>
      </div>
    </div>
  );
}
