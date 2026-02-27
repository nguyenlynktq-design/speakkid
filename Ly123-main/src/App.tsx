import React, { useState, useRef } from 'react';
import { 
  Image as ImageIcon, 
  Type, 
  Sparkles, 
  Download, 
  RefreshCw, 
  Upload, 
  Layout, 
  X,
  CheckCircle2,
  AlertCircle,
  GraduationCap,
  FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import html2canvas from 'html2canvas';
import { generateContent, generateImage, EnglishLevel } from './services/geminiService';

type AspectRatio = "1:1" | "3:4" | "4:3" | "9:16" | "16:9";

export default function App() {
  const [topic, setTopic] = useState('');
  const [level, setLevel] = useState<EnglishLevel>("A1");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("4:3");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [generatedPrompt, setGeneratedPrompt] = useState<string | null>(null);
  const [readingText, setReadingText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const posterRef = useRef<HTMLDivElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async () => {
    if (!topic && !imagePreview) {
      setError("Vui lòng nhập chủ đề hoặc tải ảnh lên.");
      return;
    }

    setIsGenerating(true);
    setError(null);
    setGeneratedImage(null);
    setReadingText(null);

    try {
      // 1. Generate the optimized prompt and reading text
      const { prompt, readingText } = await generateContent(
        topic || "A scene based on the provided image", 
        level,
        imagePreview || undefined
      );
      setGeneratedPrompt(prompt);
      setReadingText(readingText);

      // 2. Generate the image
      const imageUrl = await generateImage(prompt, aspectRatio);
      setGeneratedImage(imageUrl);
    } catch (err: any) {
      console.error(err);
      setError("Có lỗi xảy ra khi tạo ảnh. Vui lòng thử lại.");
    } finally {
      setIsGenerating(false);
    }
  };

  const [isDownloading, setIsDownloading] = useState(false);

  const downloadPoster = async () => {
    if (!posterRef.current || isDownloading) return;

    setIsDownloading(true);
    try {
      // Give a tiny delay to ensure any layout shifts are settled
      await new Promise(resolve => setTimeout(resolve, 100));

      const canvas = await html2canvas(posterRef.current, {
        useCORS: true,
        allowTaint: true,
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
        onclone: (clonedDoc) => {
          // Ensure the cloned element is visible for capture
          const el = clonedDoc.querySelector('[data-poster-container]');
          if (el instanceof HTMLElement) {
            el.style.transform = 'none';
          }
        }
      });

      const dataUrl = canvas.toDataURL('image/png', 1.0);
      const link = document.createElement('a');
      link.style.display = 'none';
      link.href = dataUrl;
      link.download = `kids-edu-poster-${Date.now()}.png`;
      
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(dataUrl);
      }, 100);

    } catch (err) {
      console.error("Failed to download poster", err);
      setError("Không thể tải poster. Vui lòng thử lại hoặc chụp màn hình.");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans selection:bg-indigo-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
              <Sparkles size={22} />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-gray-900">KidsEdu Illustrator</h1>
          </div>
          <div className="hidden sm:flex items-center gap-4 text-sm font-medium text-gray-500">
            <span className="flex items-center gap-1.5"><CheckCircle2 size={16} className="text-green-500" /> AI-Powered</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 size={16} className="text-green-500" /> Educational Style</span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Controls Panel */}
          <div className="lg:col-span-4 space-y-6">
            <section className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-6">
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
                  <Type size={18} className="text-indigo-500" />
                  Chủ đề hoặc Từ vựng
                </label>
                <textarea
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Ví dụ: Công viên, Bãi biển, Các bạn nhỏ đang chơi đùa..."
                  className="w-full h-24 p-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-none text-gray-800 placeholder:text-gray-400"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
                  <GraduationCap size={18} className="text-indigo-500" />
                  Trình độ Tiếng Anh
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["Starter", "A1", "A2", "B1", "B2"] as EnglishLevel[]).map((lvl) => (
                    <button
                      key={lvl}
                      onClick={() => setLevel(lvl)}
                      className={`px-2 py-2 rounded-lg text-xs font-bold border transition-all
                        ${level === lvl 
                          ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' 
                          : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
                  <ImageIcon size={18} className="text-indigo-500" />
                  Ảnh tham khảo (Tùy chọn)
                </label>
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className={`relative group cursor-pointer border-2 border-dashed rounded-xl transition-all flex flex-col items-center justify-center overflow-hidden
                    ${imagePreview ? 'border-indigo-500 h-32' : 'border-gray-200 hover:border-indigo-400 h-24 bg-gray-50'}`}
                >
                  {imagePreview ? (
                    <>
                      <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <RefreshCw className="text-white" />
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setImagePreview(null); }}
                        className="absolute top-2 right-2 p-1.5 bg-white/90 rounded-full text-gray-700 hover:bg-white shadow-sm"
                      >
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    <>
                      <Upload className="text-gray-400 mb-1 group-hover:scale-110 transition-transform" size={20} />
                      <span className="text-[10px] font-medium text-gray-500">Tải ảnh lên</span>
                    </>
                  )}
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleImageUpload} 
                    accept="image/*" 
                    className="hidden" 
                  />
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
                  <Layout size={18} className="text-indigo-500" />
                  Kích thước Ảnh
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: '4:3', label: 'Ngang (4:3)' },
                    { id: '3:4', label: 'Dọc (3:4)' },
                    { id: '16:9', label: 'Rộng (16:9)' },
                    { id: '1:1', label: 'Vuông (1:1)' },
                  ].map((ratio) => (
                    <button
                      key={ratio.id}
                      onClick={() => setAspectRatio(ratio.id as AspectRatio)}
                      className={`px-3 py-2 rounded-lg text-[10px] font-bold border transition-all
                        ${aspectRatio === ratio.id 
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm' 
                          : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}
                    >
                      {ratio.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className={`w-full py-4 rounded-xl font-bold text-white shadow-lg transition-all flex items-center justify-center gap-2
                  ${isGenerating 
                    ? 'bg-indigo-400 cursor-not-allowed' 
                    : 'bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] shadow-indigo-200'}`}
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="animate-spin" size={20} />
                    Đang tạo nội dung...
                  </>
                ) : (
                  <>
                    <Sparkles size={20} />
                    Bắt đầu tạo
                  </>
                )}
              </button>

              {error && (
                <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-700 text-sm">
                  <AlertCircle size={18} className="shrink-0 mt-0.5" />
                  <p>{error}</p>
                </div>
              )}
            </section>
          </div>

          {/* Preview Panel */}
          <div className="lg:col-span-8">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden min-h-[600px] flex flex-col">
              <div className="p-4 border-b border-gray-50 flex items-center justify-between bg-gray-50/50">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-gray-500 uppercase tracking-wider">Poster Kết quả</span>
                  {readingText && <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-bold rounded-full">{level}</span>}
                </div>
                <div className="flex items-center gap-2">
                  {generatedImage && (
                    <button 
                      onClick={() => {
                        const link = document.createElement('a');
                        link.href = generatedImage;
                        link.download = `illustration-${Date.now()}.png`;
                        link.click();
                      }}
                      className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
                    >
                      <ImageIcon size={14} />
                      Tải ảnh
                    </button>
                  )}
                  {generatedImage && readingText && (
                    <button 
                      onClick={downloadPoster}
                      disabled={isDownloading}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all shadow-lg
                        ${isDownloading 
                          ? 'bg-indigo-400 cursor-not-allowed' 
                          : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100'}`}
                    >
                      {isDownloading ? (
                        <RefreshCw className="animate-spin" size={14} />
                      ) : (
                        <Download size={14} />
                      )}
                      {isDownloading ? 'Đang xử lý...' : 'Tải Poster (Ảnh + Chữ)'}
                    </button>
                  )}
                </div>
              </div>
              
              <div className="flex-1 flex items-center justify-center p-4 sm:p-8 bg-[#FAFAFA] overflow-auto">
                <AnimatePresence mode="wait">
                  {isGenerating ? (
                    <motion.div 
                      key="loading"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex flex-col items-center gap-4"
                    >
                      <div className="relative">
                        <div className="w-20 h-20 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
                        <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-indigo-600" size={24} />
                      </div>
                      <p className="text-gray-500 font-medium animate-pulse">Gemini đang vẽ và soạn bài đọc cho bạn...</p>
                    </motion.div>
                  ) : (generatedImage && readingText) ? (
                    <motion.div 
                      key="result"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="w-full flex flex-col items-center gap-6"
                    >
                      {/* The Poster to be captured */}
                      <div 
                        ref={posterRef}
                        data-poster-container
                        className="p-6 flex flex-col gap-6"
                        style={{ 
                          fontFamily: "'Comic Sans MS', 'Chalkboard SE', 'cursive'",
                          backgroundColor: '#ffffff',
                          color: '#1a1a1a',
                          borderRadius: '16px',
                          border: '1px solid #e5e7eb',
                          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                          width: '100%',
                          maxWidth: '600px'
                        }}
                      >
                        {/* Image Section */}
                        <div className="w-full overflow-hidden" style={{ borderRadius: '12px', border: '4px solid #f8fafc', boxShadow: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)' }}>
                          <img 
                            src={generatedImage} 
                            alt="Generated Illustration" 
                            className="w-full h-auto object-contain"
                            crossOrigin="anonymous"
                          />
                        </div>

                        {/* Text Section */}
                        <div className="flex-1 p-4" style={{ backgroundColor: '#ffffff', border: '2px dashed #c7d2fe', borderRadius: '12px' }}>
                          <div className="flex items-center gap-2 mb-4">
                            <FileText size={20} style={{ color: '#6366f1' }} />
                            <h2 className="text-lg font-bold" style={{ color: '#4338ca', margin: 0 }}>Practice Speaking</h2>
                          </div>
                          <div className="text-sm sm:text-base leading-relaxed whitespace-pre-wrap" style={{ color: '#1f2937' }}>
                            {readingText}
                          </div>
                        </div>

                        {/* Footer in Poster */}
                        <div className="flex justify-between items-center pt-2" style={{ borderTop: '1px solid #f3f4f6' }}>
                          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#9ca3af' }}>KidsEdu Illustrator</span>
                          <span className="text-[10px] font-bold" style={{ color: '#818cf8' }}>Level: {level}</span>
                        </div>
                      </div>

                      {/* AI Prompt Debug (Optional) */}
                      {generatedPrompt && (
                        <div className="w-full max-w-[600px] p-4 bg-indigo-50/50 rounded-xl border border-indigo-100/50">
                          <p className="text-[10px] uppercase font-bold text-indigo-400 mb-1 tracking-widest">AI Prompt</p>
                          <p className="text-xs text-indigo-900/70 italic leading-relaxed">{generatedPrompt}</p>
                        </div>
                      )}
                    </motion.div>
                  ) : (
                    <motion.div 
                      key="empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-center space-y-4 max-w-xs"
                    >
                      <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto text-gray-300">
                        <ImageIcon size={40} />
                      </div>
                      <div className="space-y-2">
                        <h3 className="font-bold text-gray-700">Chưa có Poster nào</h3>
                        <p className="text-sm text-gray-400">Chọn trình độ, nhập chủ đề và nhấn nút tạo để bắt đầu!</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-6xl mx-auto px-4 py-12 text-center">
        <p className="text-sm text-gray-400 flex items-center justify-center gap-1">
          Made with <Sparkles size={14} className="text-indigo-400" /> for Kids Education
        </p>
      </footer>
    </div>
  );
}
