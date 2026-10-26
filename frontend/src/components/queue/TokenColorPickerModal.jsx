import { X } from 'lucide-react';
import { useState } from 'react';
import api from '../../api/axiosInstance';
import toast from 'react-hot-toast';

/**
 * TokenColorPickerModal Component
 * Modal for selecting token color with presets: Standard, VIP, Emergency
 */
export function TokenColorPickerModal({ isOpen, onClose, appointment, onColorUpdated }) {
  const [selectedColor, setSelectedColor] = useState(appointment?.tokenColor || '#64748b');
  const [isUpdating, setIsUpdating] = useState(false);

  // Preset colors matching priority system
  const presets = [
    { name: 'Standard', color: '#64748b', icon: '⬤' },
    { name: 'VIP', color: '#f59e0b', icon: '👑' },
    { name: 'Emergency', color: '#ef4444', icon: '⚡' },
  ];

  const customColors = [
    '#0f766e', '#0ea5e9', '#1e40af', '#10b981',
    '#7c3aed', '#06b6d4', '#8b5cf6', '#ec4899',
    '#d946ef', '#059669', '#3b82f6', '#6366f1',
  ];

  const handleColorSelect = async (color) => {
    setSelectedColor(color);
    await saveColor(color);
  };

  const saveColor = async (color) => {
    setIsUpdating(true);
    try {
      const { data } = await api.patch(`/appointments/${appointment._id}/token-color`, { color });
      toast.success('Token color updated');
      if (onColorUpdated) {
        onColorUpdated(data.appointment);
      }
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update color');
    } finally {
      setIsUpdating(false);
    }
  };

  if (!isOpen || !appointment) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onClick={onClose}>
      <div 
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Token Color</h2>
            <p className="text-sm text-slate-600 mt-1">{appointment.tokenLabel} - {appointment.customerName}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          >
            <X size={20} />
          </button>
        </div>

        {/* Preset Colors */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-slate-700 mb-3">Quick Presets</label>
          <div className="grid grid-cols-3 gap-3">
            {presets.map(preset => (
              <button
                key={preset.name}
                onClick={() => handleColorSelect(preset.color)}
                disabled={isUpdating}
                className={`p-3 rounded-lg border-2 transition-all font-medium text-sm ${
                  selectedColor.toLowerCase() === preset.color.toLowerCase()
                    ? 'border-slate-900 ring-2 ring-slate-400'
                    : 'border-slate-300 hover:border-slate-500'
                } disabled:opacity-50`}
                style={{ backgroundColor: preset.color, color: 'white' }}
              >
                <div className="text-lg mb-1">{preset.icon}</div>
                {preset.name}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Colors */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-slate-700 mb-3">More Colors</label>
          <div className="grid grid-cols-6 gap-2">
            {customColors.map(color => (
              <button
                key={color}
                onClick={() => handleColorSelect(color)}
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
        </div>

        {/* Custom Color Input */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-slate-700 mb-2">Custom Color</label>
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
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm uppercase"
              placeholder="#000000"
            />
            <button
              onClick={() => saveColor(selectedColor)}
              disabled={isUpdating}
              className="rounded-lg bg-teal-600 text-white px-4 py-2 font-medium hover:bg-teal-700 disabled:opacity-50"
            >
              Apply
            </button>
          </div>
        </div>

        {/* Status Indicator */}
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <p className="text-slate-600">
            <strong>Current Status:</strong> {
              appointment.status === 'queued' || appointment.status === 'called' || appointment.status === 'in_service'
                ? '✓ Checked In (Active)'
                : 'Not Checked In (Pending)'
            }
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-6">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
