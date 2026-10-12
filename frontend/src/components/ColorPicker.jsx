import { useState } from 'react';

export default function ColorPicker({ value = '#0f766e', onChange, label, required = false }) {
  const [displayValue, setDisplayValue] = useState(value);
  const [inputMode, setInputMode] = useState('color');

  const isValidHex = (hex) => /^#[0-9a-fA-F]{6}$/.test(hex);

  const handleColorChange = (e) => {
    const newValue = e.target.value;
    setDisplayValue(newValue);
    onChange(newValue);
  };

  const handleHexChange = (e) => {
    const newValue = e.target.value.toUpperCase();
    setDisplayValue(newValue);
    if (isValidHex(newValue)) {
      onChange(newValue);
    }
  };

  const displayColor = isValidHex(displayValue) ? displayValue : '#0f766e';

  return (
    <div className="flex flex-col gap-2">
      {label && (
        <label className="text-sm font-medium text-slate-700">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={displayColor}
            onChange={handleColorChange}
            aria-label="Color picker"
            className="h-11 w-16 cursor-pointer rounded-lg border border-slate-300 bg-white p-1"
          />
          <div 
            className="h-11 w-11 rounded-lg border-2 border-slate-300"
            style={{ backgroundColor: displayColor }}
            title={displayColor}
          />
        </div>

        <div className="flex-1">
          <input
            type="text"
            value={displayValue}
            onChange={handleHexChange}
            placeholder="#000000"
            maxLength="7"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
            pattern="^#[0-9a-fA-F]{6}$"
          />
          {!isValidHex(displayValue) && displayValue !== '' && (
            <p className="mt-1 text-xs text-red-600">Enter a valid hex color (e.g., #0f766e)</p>
          )}
        </div>
      </div>
    </div>
  );
}
