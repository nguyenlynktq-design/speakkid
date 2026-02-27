
import React, { useState, useEffect } from 'react';
import { X, Key, Cpu, ExternalLink, CheckCircle2, AlertCircle } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (apiKey: string, model: string) => void;
  currentApiKey: string;
  currentModel: string;
}

const AI_MODELS = [
  {
    id: 'gemini-3-flash-preview',
    name: 'Gemini 3 Flash',
    desc: 'Nhanh nhất, phù hợp phần lớn tác vụ',
    badge: 'Mặc định',
    color: 'from-blue-500 to-cyan-400',
  },
  {
    id: 'gemini-3-pro-preview',
    name: 'Gemini 3 Pro',
    desc: 'Chất lượng cao, phân tích sâu hơn',
    badge: 'Pro',
    color: 'from-purple-500 to-indigo-400',
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    desc: 'Ổn định, tốc độ nhanh',
    badge: 'Dự phòng',
    color: 'from-emerald-500 to-teal-400',
  },
];

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onSave, currentApiKey, currentModel }) => {
  const [apiKey, setApiKey] = useState(currentApiKey);
  const [selectedModel, setSelectedModel] = useState(currentModel || 'gemini-3-flash-preview');
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    setApiKey(currentApiKey);
    setSelectedModel(currentModel || 'gemini-3-flash-preview');
  }, [currentApiKey, currentModel, isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (!apiKey.trim()) {
      alert('Bé ơi, nhập API Key trước nhé!');
      return;
    }
    onSave(apiKey.trim(), selectedModel);
  };

  const maskedKey = apiKey ? apiKey.slice(0, 6) + '•••••••••' + apiKey.slice(-4) : '';

  return (
    <div className="fixed inset-0 z-[2000] bg-slate-900/80 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in duration-300" onClick={onClose}>
      <div 
        className="bg-white w-full max-w-lg rounded-[3rem] shadow-2xl overflow-hidden border-4 border-orange-50 animate-in zoom-in-95 duration-300" 
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 to-yellow-500 p-8 text-white relative">
          <button 
            onClick={onClose} 
            className="absolute top-4 right-4 p-2 bg-white/20 rounded-full hover:bg-white/30 transition-all"
          >
            <X size={20} />
          </button>
          <div className="flex items-center gap-4">
            <div className="bg-white/20 p-3 rounded-2xl">
              <Key size={28} />
            </div>
            <div>
              <h2 className="text-2xl font-black italic tracking-tighter">Thiết lập API Key</h2>
              <p className="text-sm opacity-90 font-bold">Cài đặt AI cho SpeakPro Lab</p>
            </div>
          </div>
        </div>

        <div className="p-8 space-y-8">
          {/* API Key Input */}
          <div className="space-y-3">
            <label className="text-xs font-black uppercase text-slate-400 tracking-[0.2em] flex items-center gap-2">
              <Key size={14} /> API Key của bạn
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="Nhập Google AI API Key..."
                className="w-full p-5 pr-20 bg-slate-50 border-2 border-orange-100 rounded-2xl outline-none font-bold text-lg focus:border-orange-400 transition-all shadow-inner"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-orange-500 hover:text-orange-600 uppercase"
              >
                {showKey ? 'Ẩn' : 'Hiện'}
              </button>
            </div>
            <a 
              href="https://aistudio.google.com/api-keys" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-bold text-blue-500 hover:text-blue-600 transition-colors"
            >
              <ExternalLink size={14} />
              Lấy API Key miễn phí tại Google AI Studio →
            </a>
          </div>

          {/* Model Selection */}
          <div className="space-y-3">
            <label className="text-xs font-black uppercase text-slate-400 tracking-[0.2em] flex items-center gap-2">
              <Cpu size={14} /> Model AI
            </label>
            <p className="text-xs text-slate-400 font-medium -mt-1">
              Nếu model chính gặp lỗi, hệ thống sẽ tự động chuyển sang model dự phòng.
            </p>
            <div className="space-y-3">
              {AI_MODELS.map(model => (
                <button
                  key={model.id}
                  onClick={() => setSelectedModel(model.id)}
                  className={`w-full p-4 rounded-2xl border-2 text-left transition-all flex items-center gap-4 ${
                    selectedModel === model.id
                      ? 'border-orange-400 bg-orange-50 shadow-md scale-[1.02]'
                      : 'border-slate-100 bg-white hover:border-orange-200 hover:bg-orange-50/30'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${model.color} flex items-center justify-center text-white shadow-lg`}>
                    <Cpu size={20} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-black text-slate-800">{model.name}</p>
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                        model.badge === 'Mặc định' ? 'bg-blue-100 text-blue-600' :
                        model.badge === 'Pro' ? 'bg-purple-100 text-purple-600' :
                        'bg-emerald-100 text-emerald-600'
                      }`}>{model.badge}</span>
                    </div>
                    <p className="text-xs text-slate-400 font-medium">{model.desc}</p>
                  </div>
                  {selectedModel === model.id && (
                    <CheckCircle2 size={24} className="text-orange-500" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            className="w-full py-5 bg-gradient-to-r from-orange-500 to-yellow-500 text-white rounded-2xl font-black text-xl shadow-xl hover:scale-[1.02] active:scale-95 transition-all uppercase italic tracking-tighter"
          >
            💾 Lưu cài đặt
          </button>

          {/* Info */}
          <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-2xl">
            <AlertCircle size={18} className="text-blue-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-blue-600 font-medium leading-relaxed">
              API Key được lưu trên trình duyệt của bạn (localStorage), không gửi đến server nào khác ngoài Google AI.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
