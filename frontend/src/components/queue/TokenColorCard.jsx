import { useState } from 'react';
import { Palette, X, Check } from 'lucide-react';
import api from '../../api/axiosInstance';
import toast from 'react-hot-toast';

/**
 * TokenColorCard Component
 * Displays a token with a color picker for individual appointment tokens
 * Shows visual indicator of check-in status (active/inactive)
 */
export function TokenColorCard({ appointment, onColorUpdated }) {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [selectedColor, setSelectedColor] = useState(appointment.tokenColor || '#0f766e');
  const [isUpdating, setIsUpdating] = useState(false);

  const isCheckedIn = appointment.status === 'queued' || appointment.status === 'called' || appointment.status === 'in_service' || appointment.status === 'completed';

  const commonColors = [
    '#0f766e', '#0ea5e9', '#1e40af', '#dc2626', '#f97316', '#10b981',
    '#7c3aed', '#06b6d4', '#8b5cf6', '#ec4899', '#d946ef', '#f59e0b',
    '#059669', '#3b82f6', '#8b5cf6', '#6366f1', '#14b8a6', '#f43f5e',
  ];

  const handleColorChange = async (color) => {
    setSelectedColor(color);
    setIsUpdating(true);
    try {
      const { data } = await api.patch(`/appointments/${appointment._id}/token-color`, { color });
      toast.success('Token color updated');
      if (onColorUpdated) {
        onColorUpdated(data.appointment);
      }
      setShowColorPicker(false);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update color');
      setSelectedColor(appointment.tokenColor || '#0f766e');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="relative">
      {/* Token Display Card */}
      <div
        className={`rounded-xl p-6 text-white shadow-lg transition-all ${
          isCheckedIn ? 'ring-4 ring-green-400 brightness-110' : 'hover:shadow-xl'
        }`}
        style={{ backgroundColor: selectedColor }}
      >
        {/* Check-in Status Indicator */}
        {isCheckedIn && (
          <div className="absolute top-2 right-2 bg-green-400 rounded-full p-1">
            <Check size={16} className="text-white" />
          </div>
        )}

        {/* Token Number */}
        <p className="text-xs font-semibold opacity-80 mb-2">
          {isCheckedIn ? '✓ CHECKED IN' : 'WAITING'}
        </p>
        <p className="text-4xl font-bold mb-3">{appointment.tokenLabel}</p>

        {/* Customer Info */}
        <div className="text-sm space-y-1 opacity-90">
          <p className="font-medium">{appointment.customerName}</p>
          <p className="text-xs opacity-75">{appointment.serviceCode}</p>
        </div>

        {/* Color Picker Button */}
        <button
          onClick={() => setShowColorPicker(!showColorPicker)}
          className="mt-4 flex items-center gap-2 rounded-lg bg-white/20 hover:bg-white/30 px-3 py-2 text-sm font-medium transition-colors"
        >
          <Palette size={14} />
          Color
        </button>
      </div>

      {/* Color Picker Dropdown */}
      {showColorPicker && (
        <div className="absolute top-full left-0 mt-2 z-10 bg-white rounded-xl shadow-xl p-4 border border-slate-200 w-64">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-slate-900">Select Color</h4>
            <button
              onClick={() => setShowColorPicker(false)}
              className="rounded-lg p-1 hover:bg-slate-100 text-slate-500"
            >
              <X size={16} />
            </button>
          </div>

          {/* Color Grid */}
          <div className="grid grid-cols-6 gap-2 mb-3">
            {commonColors.map(color => (
              <button
                key={color}
                onClick={() => handleColorChange(color)}
                disabled={isUpdating}
                className={`h-10 rounded-lg border-2 transition-all ${
                  selectedColor.toLowerCase() === color.toLowerCase()
                    ? 'border-slate-900 ring-2 ring-slate-400 scale-110'
                    : 'border-slate-300 hover:border-slate-500'
                } disabled:opacity-50`}
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>

          {/* Custom Color Input */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-700">Custom Color</label>
            <div className="flex gap-2">
              <input
                type="color"
                value={selectedColor}
                onChange={e => setSelectedColor(e.target.value)}
                className="h-10 w-12 cursor-pointer rounded-lg border-2 border-slate-300"
              />
              <input
                type="text"
                value={selectedColor}
                onChange={e => setSelectedColor(e.target.value)}
                className="flex-1 rounded-lg border border-slate-300 px-2 py-2 font-mono text-xs uppercase"
                placeholder="#000000"
              />
              <button
                onClick={() => handleColorChange(selectedColor)}
                disabled={isUpdating}
                className="rounded-lg bg-teal-600 text-white px-3 py-2 text-xs font-medium hover:bg-teal-700 disabled:opacity-50"
              >
                Set
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
