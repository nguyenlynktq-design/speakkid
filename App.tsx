
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Theme, AppStatus, PresentationData, EvaluationResult, CEFRLevel, SpeakingMistake } from './types';
import { PREDEFINED_THEMES, CEFR_LEVELS } from './constants';
import {
  generateImagePrompt,
  generatePresentationScript,
  generateTeacherVoice,
  evaluatePresentation,
  generateScriptFromImage,
  getApiKey
} from './services/geminiService';
import SettingsModal from './components/SettingsModal';
import {
  Mic, Play, Pause, RotateCcw, Sparkles,
  Trophy, ArrowRight, MessageCircle,
  ShieldCheck, CheckCircle2, X, Medal, Volume2, Printer, Calendar, Edit3, Heart, Home, Copy, ImageIcon, Star, User, Building, Award, Download, AlertCircle,
  Upload, Settings, RefreshCw
} from 'lucide-react';

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const App: React.FC = () => {
  const [selectedTheme, setSelectedTheme] = useState<Theme | null>(null);
  const [customThemeLabel, setCustomThemeLabel] = useState('');
  const [customText, setCustomText] = useState('');
  const [childName, setChildName] = useState('Tony');
  const [level, setLevel] = useState<CEFRLevel>('Starters');
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [presentation, setPresentation] = useState<PresentationData | null>(null);
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [uploadedImage, setUploadedImage] = useState<{ base64: string; mimeType: string; preview: string } | null>(null);

  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [audioState, setAudioState] = useState<'idle' | 'playing' | 'paused'>('idle');
  const [showCertificate, setShowCertificate] = useState(false);

  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);

  // Settings & Error state
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState(localStorage.getItem('gemini_api_key') || '');
  const [selectedModel, setSelectedModel] = useState(localStorage.getItem('selected_model') || 'gemini-3-flash-preview');
  const [appError, setAppError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const playbackAudioRef = useRef<HTMLAudioElement | null>(null);

  const audioCacheRef = useRef<Map<string, AudioBuffer>>(new Map());

  // Auto-show settings modal if no API key
  useEffect(() => {
    if (!localStorage.getItem('gemini_api_key')) {
      setShowSettings(true);
    }
  }, []);

  useEffect(() => {
    return () => {
      stopTeacherAudio();
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (playbackAudioRef.current) {
        playbackAudioRef.current.pause();
        if (playbackAudioRef.current.src) {
          URL.revokeObjectURL(playbackAudioRef.current.src);
        }
        playbackAudioRef.current = null;
      }
      setIsPlayingRecorded(false);
    };
  }, []);

  const handleSaveSettings = useCallback((key: string, model: string) => {
    localStorage.setItem('gemini_api_key', key);
    localStorage.setItem('selected_model', model);
    setApiKey(key);
    setSelectedModel(model);
    setShowSettings(false);

    // Clear error when saving new key
    if (appError) {
      setAppError(null);
      setStatus(AppStatus.IDLE);
    }
  }, [appError]);

  const stopTeacherAudio = () => {
    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop();
      sourceNodeRef.current = null;
    }
    setAudioState('idle');
  };

  const downloadAudio = () => {
    if (recordedBlob) {
      const url = URL.createObjectURL(recordedBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Speaking_${childName}_${new Date().getTime()}.webm`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        setUploadedImage({
          base64,
          mimeType: file.type,
          preview: reader.result as string
        });
        setSelectedTheme(null);
        setCustomThemeLabel('');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async () => {
    if (!uploadedImage && !customThemeLabel && !selectedTheme) {
      alert("Bé ơi, chọn chủ đề hoặc tải ảnh lên nhé!");
      return;
    }

    // Check for API key
    try {
      getApiKey();
    } catch {
      setShowSettings(true);
      return;
    }

    try {
      setStatus(AppStatus.GENERATING);
      setAppError(null);

      let scriptData;
      let finalImageUri;
      let finalImagePrompt = "";

      if (uploadedImage) {
        scriptData = await generateScriptFromImage(uploadedImage.base64, uploadedImage.mimeType, level, childName);
        finalImageUri = uploadedImage.preview;
        finalImagePrompt = "Phân tích từ ảnh tải lên";
      } else {
        const finalThemeLabel = customThemeLabel || selectedTheme?.label || "";
        finalImagePrompt = await generateImagePrompt(finalThemeLabel);
        scriptData = await generatePresentationScript(finalImagePrompt, customText, level, childName, finalThemeLabel);
      }

      const fullScript = `${scriptData.intro} ${scriptData.points.join(' ')} ${scriptData.conclusion}`;

      setPresentation({
        imageUri: finalImageUri,
        imagePrompt: finalImagePrompt,
        intro: scriptData.intro,
        points: scriptData.points,
        conclusion: scriptData.conclusion,
        lessonVocab: scriptData.lessonVocab,
        script: fullScript,
        level
      });
      setStatus(AppStatus.READY);

      // Auto-play teacher voice right after content is generated
      try {
        setIsAudioLoading(true);
        if (!audioContextRef.current) audioContextRef.current = new AudioContext({ sampleRate: 24000 });
        const buffer = await generateTeacherVoice(fullScript);
        audioCacheRef.current.set(fullScript, buffer);

        const source = audioContextRef.current.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContextRef.current.destination);
        source.start(0);
        sourceNodeRef.current = source;
        setAudioState('playing');
        source.onended = () => { setAudioState('idle'); sourceNodeRef.current = null; };
      } catch (e) {
        console.warn('[SpeakPro] Auto-play teacher voice failed:', e);
        setAudioState('idle');
      } finally {
        setIsAudioLoading(false);
      }
    } catch (err: any) {
      console.error("Generate error:", err);
      setAppError(err?.message || "Lỗi không xác định. Bé hãy thử lại nhé!");
      setStatus(AppStatus.ERROR);
    }
  };

  const handleRetry = useCallback(() => {
    setAppError(null);
    setStatus(AppStatus.IDLE);
  }, []);

  const startRecording = async () => {
    // Stop any playback in progress
    if (playbackAudioRef.current) {
      playbackAudioRef.current.pause();
      if (playbackAudioRef.current.src) URL.revokeObjectURL(playbackAudioRef.current.src);
      playbackAudioRef.current = null;
    }
    setIsPlayingRecorded(false);

    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
    }
    setRecordedUrl(null);
    setRecordedBlob(null);
    setRecordingTime(0);
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      const supportedTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
        'audio/aac'
      ];
      const mimeType = supportedTypes.find(type => MediaRecorder.isTypeSupported(type)) || '';

      const options = mimeType ? { mimeType } : {};
      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const finalMimeType = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: finalMimeType });

        console.log("Recording stopped. Blob size:", blob.size, "bytes, Type:", blob.type);

        if (blob.size === 0) {
          console.warn("Warning: Recorded blob is empty! Check microphone permissions.");
        }

        setRecordedBlob(blob);
        setRecordedUrl(URL.createObjectURL(blob));

        stream.getTracks().forEach(t => t.stop());
      };

      recorder.start();
      setStatus(AppStatus.RECORDING);
      timerIntervalRef.current = window.setInterval(() => setRecordingTime(p => p + 1), 1000);
    } catch (err) {
      console.error("Recording error:", err);
      alert("Không thể truy cập Micro. Bé hãy kiểm tra quyền truy cập micro của trình duyệt nhé!");
      setStatus(AppStatus.READY);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setStatus(AppStatus.REVIEWING);
  };

  const [isPlayingRecorded, setIsPlayingRecorded] = useState(false);

  const playRecordedAudio = () => {
    if (!recordedBlob) {
      console.warn("No recorded blob found for playback.");
      alert("Chưa có đoạn ghi âm nào để phát!");
      return;
    }

    // If currently playing, pause it
    if (playbackAudioRef.current && isPlayingRecorded) {
      playbackAudioRef.current.pause();
      playbackAudioRef.current.currentTime = 0;
      setIsPlayingRecorded(false);
      return;
    }

    // Stop any previously playing audio element
    if (playbackAudioRef.current) {
      playbackAudioRef.current.pause();
      playbackAudioRef.current.onended = null;
      playbackAudioRef.current.onerror = null;
      if (playbackAudioRef.current.src) {
        URL.revokeObjectURL(playbackAudioRef.current.src);
      }
      playbackAudioRef.current = null;
    }

    // Also stop teacher audio if playing
    stopTeacherAudio();

    console.log("Playing recorded audio, blob size:", recordedBlob.size, "type:", recordedBlob.type);

    // Create a fresh blob URL
    const freshUrl = URL.createObjectURL(recordedBlob);

    const audio = new Audio(freshUrl);
    playbackAudioRef.current = audio;
    audio.volume = 1.0;

    audio.onended = () => {
      setIsPlayingRecorded(false);
      URL.revokeObjectURL(freshUrl);
      playbackAudioRef.current = null;
    };

    audio.onerror = (e) => {
      console.error("Audio playback error:", e, "Audio error code:", audio.error?.code, "message:", audio.error?.message);
      setIsPlayingRecorded(false);
      URL.revokeObjectURL(freshUrl);
      playbackAudioRef.current = null;
      alert("Lỗi phát âm thanh. Bé hãy thử ghi âm lại nhé!");
    };

    // Use play() directly - modern browsers support this with blob URLs
    audio.play()
      .then(() => {
        setIsPlayingRecorded(true);
        console.log("Audio playback started successfully");
      })
      .catch(error => {
        console.error("Playback promise rejected:", error);
        URL.revokeObjectURL(freshUrl);
        playbackAudioRef.current = null;
        setIsPlayingRecorded(false);
        alert("Không thể phát âm thanh. Bé hãy kiểm tra âm lượng hoặc quyền trình duyệt nhé!");
      });
  };

  const handleEvaluate = async () => {
    if (!recordedBlob) return;

    // Check for API key
    try {
      getApiKey();
    } catch {
      setShowSettings(true);
      return;
    }

    try {
      setStatus(AppStatus.EVALUATING);
      setAppError(null);
      const reader = new FileReader();

      const resultPromise = new Promise<string>((resolve, reject) => {
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
      });

      reader.readAsDataURL(recordedBlob);
      const base64 = await resultPromise;

      const res = await evaluatePresentation(
        presentation!.script,
        base64,
        recordedBlob.type,
        level
      );

      setResult(res);
      setStatus(AppStatus.RESULT);
    } catch (err: any) {
      console.error("Evaluation error:", err);
      setAppError(err?.message || "Lỗi khi chấm bài. Bé hãy thử lại nhé!");
      setStatus(AppStatus.ERROR);
    }
  };

  const toggleTeacherVoice = async (text: string) => {
    if (isAudioLoading) return;
    if (audioState === 'playing') {
      stopTeacherAudio();
      return;
    }

    try {
      setIsAudioLoading(true);
      if (!audioContextRef.current) audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      let buffer = audioCacheRef.current.get(text) || await generateTeacherVoice(text);
      audioCacheRef.current.set(text, buffer);

      const source = audioContextRef.current.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContextRef.current.destination);
      source.start(0);
      sourceNodeRef.current = source;
      setAudioState('playing');
      source.onended = () => { setAudioState('idle'); sourceNodeRef.current = null; };
    } catch (e) { setAudioState('idle'); } finally { setIsAudioLoading(false); }
  };

  return (
    <div className="min-h-screen bg-[#fffcf5] pb-32 font-['Quicksand'] text-slate-700">
      <header className="bg-white/90 backdrop-blur-md border-b-4 border-orange-100 sticky top-0 z-50 px-4 md:px-8 py-4 flex items-center justify-between no-print shadow-sm">
        <div className="flex items-center gap-3 cursor-pointer group" onClick={() => window.location.reload()}>
          <div className="bg-orange-500 p-2 rounded-2xl text-white group-hover:rotate-12 transition-all"><Sparkles size={24} /></div>
          <h1 className="text-2xl font-black text-orange-500 italic tracking-tighter">Speakpro Lab</h1>
        </div>
        <div className="flex items-center gap-3 md:gap-8">
          <a
            href="https://aistudio.google.com/apps/4bd22ceb-72f5-465f-8ec3-7195cb808c92?fullscreenApplet=true&showPreview=true&showAssistant=true"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden md:flex items-center gap-2 bg-emerald-500 text-white px-4 py-2 rounded-xl font-black text-xs hover:bg-emerald-600 transition-all shadow-md group"
          >
            <Sparkles size={14} className="group-hover:animate-spin" />
            Tạo bài thuyết trình
          </a>
          <div className="flex items-center gap-3 bg-orange-50 px-3 md:px-5 py-2 rounded-full border-2 border-orange-100">
            <User size={18} className="text-orange-400" />
            <input type="text" value={childName} onChange={e => setChildName(e.target.value)} className="bg-transparent border-none font-black w-16 md:w-24 text-center outline-none focus:text-orange-600 transition-colors" placeholder="Tên bé" />
          </div>
          <select value={level} onChange={e => setLevel(e.target.value as CEFRLevel)} className="bg-blue-50 px-3 md:px-4 py-2 rounded-xl font-black text-blue-500 text-xs shadow-inner outline-none">
            {CEFR_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          {/* Settings Button */}
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 px-3 md:px-4 py-2 rounded-xl transition-all border-2 border-slate-200"
          >
            <Settings size={18} className="text-slate-500" />
            <span className="hidden md:inline text-xs font-black text-slate-500 uppercase">API Key</span>
            {!apiKey && <span className="text-[10px] font-black text-red-500 animate-pulse hidden md:inline">⚠️ Chưa có key</span>}
          </button>
        </div>
      </header>

      {/* API Key Warning Banner */}
      {!apiKey && (
        <div className="bg-red-50 border-b-2 border-red-100 px-6 py-3 flex items-center justify-center gap-3 no-print">
          <AlertCircle size={18} className="text-red-500" />
          <p className="text-sm font-bold text-red-600">
            Bé cần nhập API Key để sử dụng app.{' '}
            <button onClick={() => setShowSettings(true)} className="underline hover:text-red-700 font-black">
              Nhấn vào đây để nhập →
            </button>
          </p>
        </div>
      )}

      <main className="max-w-6xl mx-auto px-4 md:px-6 mt-8 md:mt-12 no-print">

        {/* ERROR STATE */}
        {status === AppStatus.ERROR && appError && (
          <div className="max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-6 duration-500">
            <div className="bg-white rounded-[3rem] shadow-2xl border-4 border-red-100 p-10 md:p-16 text-center space-y-8">
              <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                <AlertCircle size={48} className="text-red-500" />
              </div>
              <div className="space-y-4">
                <h3 className="text-3xl font-black text-red-600 uppercase italic tracking-tighter">Oops! Có lỗi rồi 😥</h3>
                <div className="bg-red-50 p-6 rounded-2xl border-2 border-dashed border-red-200">
                  <p className="text-sm font-bold text-red-700 break-words leading-relaxed text-left">{appError}</p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button
                  onClick={handleRetry}
                  className="px-8 py-4 bg-gradient-to-r from-orange-500 to-yellow-500 text-white rounded-full font-black text-lg shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-3 uppercase italic"
                >
                  <RefreshCw size={22} /> Thử lại
                </button>
                <button
                  onClick={() => setShowSettings(true)}
                  className="px-8 py-4 bg-slate-800 text-white rounded-full font-black text-lg shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-3 uppercase italic"
                >
                  <Settings size={22} /> Đổi API Key
                </button>
              </div>
            </div>
          </div>
        )}

        {status === AppStatus.IDLE && (
          <div className="space-y-12 animate-in fade-in slide-in-from-bottom-6 duration-700">
            <div className="text-center space-y-4">
              <h2 className="text-4xl md:text-5xl lg:text-7xl font-black text-slate-800 italic uppercase tracking-tighter leading-none tracking-tight">Thuyết trình tiếng Anh <br /><span className="text-orange-500">Chuẩn CEFR 🌍</span></h2>
            </div>

            <div className="grid md:grid-cols-3 gap-6 md:gap-10">
              <div className="bg-white p-6 md:p-10 rounded-[3rem] md:rounded-[4rem] shadow-xl border-4 border-orange-50 space-y-6 md:space-y-8">
                <h3 className="text-xl md:text-2xl font-black flex items-center gap-4 text-orange-500"><ImageIcon /> Chọn bối cảnh</h3>
                <input type="text" value={customThemeLabel} onChange={e => { setCustomThemeLabel(e.target.value); setSelectedTheme(null); setUploadedImage(null); }} placeholder="Nhập bối cảnh (Ví dụ: The Jungle, Space...)" className="w-full p-4 md:p-6 bg-slate-50 border-2 border-orange-100 rounded-2xl md:rounded-3xl outline-none font-bold focus:border-orange-400 transition-all shadow-inner" />
                <div className="grid grid-cols-3 gap-3 md:gap-4 h-[200px] md:h-[250px] overflow-y-auto pr-2 md:pr-4 custom-scrollbar">
                  {PREDEFINED_THEMES.map(t => (
                    <button key={t.id} onClick={() => { setSelectedTheme(t); setCustomThemeLabel(''); setUploadedImage(null); }} className={`p-3 md:p-4 rounded-[1.5rem] md:rounded-[2rem] border-2 flex flex-col items-center gap-2 transition-all ${selectedTheme?.id === t.id ? 'bg-orange-50 border-orange-400 scale-105 shadow-md' : 'bg-white border-slate-50'}`}>
                      <span className="text-2xl md:text-3xl">{t.icon}</span>
                      <span className="text-[9px] md:text-[10px] font-black uppercase text-center leading-none">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-white p-6 md:p-10 rounded-[3rem] md:rounded-[4rem] shadow-xl border-4 border-emerald-50 space-y-6 md:space-y-8">
                <h3 className="text-xl md:text-2xl font-black flex items-center gap-4 text-emerald-500"><Upload /> Tải ảnh lên</h3>
                <div
                  onClick={() => document.getElementById('image-upload')?.click()}
                  className={`w-full h-[250px] md:h-[320px] border-4 border-dashed rounded-[2rem] md:rounded-[3rem] flex flex-col items-center justify-center cursor-pointer transition-all ${uploadedImage ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 hover:border-emerald-300 bg-slate-50'}`}
                >
                  {uploadedImage ? (
                    <div className="relative w-full h-full p-4">
                      <img src={uploadedImage.preview} alt="Preview" className="w-full h-full object-contain rounded-2xl" />
                      <button
                        onClick={(e) => { e.stopPropagation(); setUploadedImage(null); }}
                        className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full shadow-lg hover:bg-red-600 transition-colors"
                      >
                        <X size={20} />
                      </button>
                    </div>
                  ) : (
                    <div className="text-center space-y-4">
                      <div className="bg-emerald-100 p-6 rounded-full inline-block text-emerald-500">
                        <Upload size={48} />
                      </div>
                      <p className="font-black text-slate-400">Nhấn để tải ảnh lên</p>
                      <p className="text-xs text-slate-300 uppercase font-bold">Hỗ trợ JPG, PNG</p>
                    </div>
                  )}
                  <input id="image-upload" type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                </div>
              </div>

              <div className="bg-white p-6 md:p-10 rounded-[3rem] md:rounded-[4rem] shadow-xl border-4 border-blue-50 space-y-6 md:space-y-8">
                <h3 className="text-xl md:text-2xl font-black flex items-center gap-4 text-blue-500"><Edit3 /> Từ vựng muốn dùng</h3>
                <textarea value={customText} onChange={e => setCustomText(e.target.value)} placeholder="Nhập các từ bé muốn dùng (ví dụ: tiger, meat, jungle...)" className="w-full h-[250px] md:h-[320px] p-6 md:p-8 bg-slate-50 border-2 border-blue-100 rounded-[2rem] md:rounded-[3rem] outline-none font-bold text-lg focus:border-blue-400 transition-all resize-none shadow-inner" />
              </div>
            </div>

            <div className="flex justify-center pt-6 md:pt-10">
              <button onClick={handleGenerate} className="px-12 md:px-24 py-6 md:py-10 bg-gradient-to-r from-orange-500 to-yellow-500 text-white rounded-full font-black text-2xl md:text-4xl shadow-2xl hover:scale-105 active:scale-95 transition-all uppercase italic tracking-tighter">
                Tạo nội dung <ArrowRight className="inline ml-3" size={32} />
              </button>
            </div>
          </div>
        )}

        {status === AppStatus.GENERATING && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-10">
            <div className="w-36 md:w-48 h-36 md:h-48 bg-orange-100 rounded-[4rem] flex items-center justify-center text-7xl md:text-8xl shadow-2xl animate-bounce">🖌️</div>
            <h3 className="text-2xl md:text-4xl font-black text-slate-800 uppercase italic animate-pulse text-center">AI đang soạn bài cho bé...</h3>
            <p className="text-sm text-slate-400 font-bold">Thường mất 10-30 giây</p>
            <button
              onClick={() => {
                setStatus(AppStatus.IDLE);
                setAppError(null);
              }}
              className="px-8 py-3 bg-slate-200 text-slate-600 rounded-full font-black text-sm uppercase hover:bg-slate-300 transition-all flex items-center gap-2"
            >
              <X size={16} /> Huỷ
            </button>
          </div>
        )}

        {presentation && (status === AppStatus.READY || status === AppStatus.RECORDING || status === AppStatus.REVIEWING) && (
          <div className="space-y-10 pb-48 animate-in fade-in duration-700">
            <div className="relative bg-white rounded-[3rem] md:rounded-[4.5rem] shadow-2xl border-[10px] md:border-[16px] border-white p-8 md:p-16 overflow-hidden">
              {presentation.imageUri && (
                <div className="mb-10 rounded-[2rem] md:rounded-[3rem] overflow-hidden border-4 border-slate-100 shadow-inner">
                  <img src={presentation.imageUri} alt="Presentation Context" className="w-full max-h-[400px] md:max-h-[500px] object-contain" />
                </div>
              )}
              <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-4 md:gap-6">
                  <div className="bg-orange-500 p-3 md:p-4 rounded-[1.5rem] text-white shadow-xl rotate-3"><MessageCircle size={28} /></div>
                  <h4 className="text-xl md:text-3xl font-black italic tracking-tighter text-slate-800 uppercase">Kịch bản thuyết trình</h4>
                </div>
                <button onClick={() => toggleTeacherVoice(presentation.script)} className={`w-14 h-14 md:w-16 md:h-16 rounded-[2rem] flex items-center justify-center transition-all shadow-xl ${audioState === 'playing' ? 'bg-red-500 animate-pulse' : 'bg-orange-500 hover:scale-105'}`}>
                  {isAudioLoading ? <div className="w-6 h-6 border-4 border-white border-t-transparent animate-spin rounded-full"></div> : audioState === 'playing' ? <Pause className="text-white" size={24} /> : <Play className="text-white ml-1" size={24} />}
                </button>
              </div>
              <div className="bg-orange-50/40 p-6 md:p-10 rounded-[2rem] md:rounded-[3rem] border-4 border-dashed border-orange-100">
                <p className="text-xl md:text-3xl font-black leading-[1.8] text-slate-800 text-justify tracking-tight">
                  <span className="text-blue-600 italic underline decoration-blue-200 decoration-4">{presentation.intro}</span>{' '}
                  <span className="text-slate-800">{presentation.points.join(' ')}</span>{' '}
                  <span className="text-pink-600 italic underline decoration-pink-200 decoration-4">{presentation.conclusion}</span>
                </p>
              </div>
            </div>

            <div className="space-y-10">
              <div className="bg-white rounded-[2.5rem] md:rounded-[3.5rem] p-6 md:p-10 shadow-xl border-4 border-slate-50 space-y-6">
                <h5 className="font-black uppercase text-xs text-slate-400 tracking-[0.3em] flex items-center gap-3 italic"><Star className="text-orange-400 fill-orange-400" size={18} /> Vocabulary Booster</h5>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
                  {presentation.lessonVocab.map((v, i) => (
                    <div key={i} className="flex flex-col items-center gap-2 p-3 md:p-4 bg-slate-50 rounded-[2rem] md:rounded-[2.5rem] hover:bg-white hover:shadow-lg transition-all cursor-pointer border-2 border-transparent hover:border-orange-100" onClick={() => toggleTeacherVoice(v.word)}>
                      <span className="text-3xl md:text-4xl mb-1">{v.icon}</span>
                      <div className="text-center">
                        <p className="text-base md:text-lg font-black text-slate-800 leading-none mb-1">{v.word}</p>
                        <p className="text-[9px] md:text-[10px] font-black text-orange-500 uppercase tracking-tighter">{v.translation}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {!presentation.imageUri && (
                <div className="bg-slate-900 rounded-[2.5rem] md:rounded-[3.5rem] p-6 md:p-10 text-white shadow-2xl flex flex-col md:flex-row items-center gap-6 md:gap-8 relative overflow-hidden group">
                  <div className="flex-1 space-y-4 relative z-10">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center"><ImageIcon className="text-blue-400" size={20} /></div>
                      <h5 className="font-black uppercase italic tracking-tighter text-base md:text-lg">AI Photo Prompt (Tạo ảnh mẫu của bé)</h5>
                    </div>
                    <div className="p-4 md:p-6 bg-white/5 rounded-[1.5rem] md:rounded-[2rem] border border-white/10 shadow-inner">
                      <p className="text-sm md:text-base font-medium italic text-blue-100 leading-relaxed">"{presentation.imagePrompt}"</p>
                    </div>
                  </div>
                  <div className="w-full md:w-auto relative z-10">
                    <button onClick={() => { navigator.clipboard.writeText(presentation.imagePrompt); alert("Đã chép!"); }} className="w-full md:w-auto px-8 md:px-10 py-4 md:py-5 bg-blue-600 text-white rounded-[2rem] font-black text-base md:text-lg hover:bg-blue-500 transition-all shadow-xl flex items-center justify-center gap-3"><Copy size={20} /> Chép Prompt</button>
                  </div>
                </div>
              )}
            </div>

            <div className="fixed bottom-6 md:bottom-10 left-1/2 -translate-x-1/2 z-[100] w-full max-w-lg px-4 md:px-6">
              {status === AppStatus.READY && (
                <button onClick={startRecording} className="w-full py-5 md:py-6 bg-gradient-to-r from-red-500 to-pink-600 text-white rounded-full font-black text-xl md:text-2xl shadow-[0_15px_40px_rgba(239,68,68,0.3)] flex items-center justify-center gap-3 md:gap-4 hover:translate-y-[-4px] active:scale-95 border-4 border-white transition-all uppercase italic tracking-tighter">
                  <Mic size={28} className="animate-pulse" /> Nhấn để ghi âm!
                </button>
              )}
              {status === AppStatus.RECORDING && (
                <div className="bg-white/95 backdrop-blur-md px-6 md:px-10 py-5 md:py-6 rounded-full shadow-2xl border-4 border-red-100 flex items-center justify-between animate-in zoom-in">
                  <div className="flex items-center gap-3 md:gap-4">
                    <div className="w-6 md:w-8 h-6 md:h-8 bg-red-600 rounded-full animate-ping"></div>
                    <p className="text-lg md:text-xl font-black text-red-600 uppercase italic tracking-tighter">Ghi âm... {formatTime(recordingTime)}</p>
                  </div>
                  <button onClick={stopRecording} className="bg-red-600 text-white px-6 md:px-8 py-2.5 md:py-3 rounded-full font-black text-base md:text-lg hover:bg-red-700 active:scale-95 shadow-lg border-2 border-red-400">Xong ✅</button>
                </div>
              )}
              {status === AppStatus.REVIEWING && (
                <div className="bg-white p-3 md:p-4 rounded-[2rem] md:rounded-[2.5rem] shadow-2xl border-4 border-blue-100 grid grid-cols-4 gap-2 animate-in slide-in-from-bottom-6">
                  <button onClick={playRecordedAudio} className={`py-3 md:py-4 rounded-xl md:rounded-2xl flex flex-col items-center justify-center gap-1 font-black text-[8px] md:text-[9px] uppercase ${isPlayingRecorded ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 hover:bg-slate-200'}`}>{isPlayingRecorded ? <Pause size={16} /> : <Play size={16} />} {isPlayingRecorded ? 'Dừng' : 'Nghe'}</button>
                  <button onClick={downloadAudio} className="py-3 md:py-4 bg-slate-100 rounded-xl md:rounded-2xl flex flex-col items-center justify-center gap-1 font-black text-[8px] md:text-[9px] uppercase hover:bg-slate-200 text-blue-600"><Download size={16} /> Tải về</button>
                  <button onClick={startRecording} className="py-3 md:py-4 bg-pink-50 text-pink-600 rounded-xl md:rounded-2xl flex flex-col items-center justify-center gap-1 font-black text-[8px] md:text-[9px] uppercase hover:bg-pink-100"><RotateCcw size={16} /> Thử lại</button>
                  <button onClick={handleEvaluate} className="py-3 md:py-4 bg-orange-500 text-white rounded-xl md:rounded-2xl flex flex-col items-center justify-center gap-1 font-black text-[8px] md:text-[9px] uppercase shadow-xl hover:scale-105"><CheckCircle2 size={16} /> Chấm</button>
                </div>
              )}
            </div>
          </div>
        )}

        {status === AppStatus.EVALUATING && (
          <div className="flex flex-col items-center justify-center min-h-[50vh] gap-8">
            <div className="w-20 h-20 border-[8px] border-orange-500 border-t-transparent rounded-full animate-spin"></div>
            <h3 className="text-xl md:text-2xl font-black text-slate-800 uppercase italic animate-pulse text-center">Ms Ly AI đang nghe lại bài nói của bé... <br /> Chờ tí nhé!</h3>
            <p className="text-sm text-slate-400 font-bold">Quá trình này có thể mất 30-60 giây</p>
            <button
              onClick={() => {
                setStatus(AppStatus.REVIEWING);
                setAppError(null);
              }}
              className="px-8 py-3 bg-slate-200 text-slate-600 rounded-full font-black text-sm uppercase hover:bg-slate-300 transition-all flex items-center gap-2"
            >
              <X size={16} /> Huỷ chấm bài
            </button>
          </div>
        )}

        {status === AppStatus.RESULT && result && (
          <div className="space-y-16 pb-40 animate-in zoom-in duration-700">
            <div className="bg-white rounded-[3rem] md:rounded-[5rem] shadow-2xl border-[12px] md:border-[20px] border-orange-50 overflow-hidden text-center transition-all hover:border-orange-100">
              <div className="p-12 md:p-20 bg-gradient-to-br from-orange-400 via-orange-500 to-yellow-500 text-white space-y-8 md:space-y-10">
                <Trophy size={120} className="mx-auto drop-shadow-2xl animate-bounce" />
                <div className="space-y-4">
                  <h2 className="text-7xl md:text-9xl font-black italic uppercase tracking-tighter drop-shadow-lg">{result.score}/10</h2>
                  <p className="text-xl md:text-3xl font-bold italic opacity-95">"{result.teacherPraise}"</p>
                </div>
              </div>

              {result.mistakes && result.mistakes.length > 0 && (
                <div className="mx-6 md:mx-12 mt-8 md:mt-12 bg-red-50 p-6 md:p-10 rounded-[2rem] md:rounded-[3rem] border-4 border-dashed border-red-200 text-left space-y-6">
                  <h5 className="text-xl md:text-2xl font-black text-red-600 flex items-center gap-3 uppercase italic"><AlertCircle /> Lỗi bé cần sửa</h5>
                  <div className="grid gap-4">
                    {result.mistakes.map((m, i) => (
                      <div key={i} className="bg-white p-4 md:p-6 rounded-2xl md:rounded-3xl shadow-sm flex items-start gap-3 md:gap-4 border-l-8 border-red-500">
                        <span className="w-8 h-8 md:w-10 md:h-10 bg-red-100 text-red-600 rounded-full flex items-center justify-center font-black text-sm">{i + 1}</span>
                        <div className="flex-1">
                          <p className="text-lg md:text-xl font-black text-slate-800 mb-1">Từ/Câu: <span className="text-red-600 uppercase tracking-tighter">"{m.word}"</span></p>
                          <p className="text-base md:text-lg font-bold text-slate-500 italic">💡 Nhận xét: {m.feedback}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 md:grid-cols-5 gap-3 md:gap-4 p-6 md:p-8 bg-slate-50 mt-8 md:mt-12">
                {[
                  { label: 'Phát âm', score: result.pronunciation, color: 'text-blue-500' },
                  { label: 'Trôi chảy', score: result.fluency, color: 'text-pink-500' },
                  { label: 'Ngữ điệu', score: result.intonation, color: 'text-orange-500' },
                  { label: 'Từ vựng', score: result.vocabulary, color: 'text-indigo-500' },
                  { label: 'Hoàn thành', score: result.taskFulfillment, color: 'text-green-500' }
                ].map((s, i) => (
                  <div key={i} className="bg-white p-4 md:p-5 rounded-[1.5rem] md:rounded-[2rem] shadow-sm border-2 border-slate-100">
                    <p className="text-[9px] md:text-[10px] font-black uppercase text-slate-400 mb-1 leading-none">{s.label}</p>
                    <p className={`text-3xl md:text-4xl font-black ${s.color}`}>{s.score}</p>
                  </div>
                ))}
              </div>
              <div className="p-8 md:p-16 flex flex-wrap justify-center gap-4 md:gap-8">
                <button onClick={playRecordedAudio} className="px-6 md:px-12 py-4 md:py-6 bg-slate-100 text-slate-600 rounded-full font-black text-lg md:text-2xl shadow-xl hover:bg-slate-200 transition-all uppercase italic flex items-center gap-3 md:gap-4"><Play size={24} /> Nghe lại</button>
                <button onClick={downloadAudio} className="px-6 md:px-12 py-4 md:py-6 bg-slate-100 text-blue-600 rounded-full font-black text-lg md:text-2xl shadow-xl hover:bg-blue-50 transition-all uppercase italic flex items-center gap-3 md:gap-4"><Download size={24} /> Tải giọng bé</button>
                <button onClick={() => setShowCertificate(true)} className="px-6 md:px-12 py-4 md:py-6 bg-blue-600 text-white rounded-full font-black text-lg md:text-2xl shadow-2xl hover:scale-105 transition-all uppercase italic flex items-center gap-3 md:gap-4 border-b-8 border-blue-800"><Award size={24} /> Xem Giấy Khen</button>
                <button onClick={() => window.location.reload()} className="px-6 md:px-12 py-4 md:py-6 bg-slate-800 text-white rounded-full font-black text-lg md:text-2xl shadow-2xl hover:scale-105 transition-all uppercase italic flex items-center gap-3 md:gap-4"><Home size={24} /> Bài học mới</button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* GIẤY KHEN - KHUNG NGANG CHUYÊN NGHIỆP */}
      {showCertificate && result && (
        <div className="fixed inset-0 z-[1000] bg-slate-900/90 backdrop-blur-2xl flex items-center justify-center p-4 md:p-6 animate-in fade-in" onClick={() => setShowCertificate(false)}>
          <div className="bg-white w-full max-w-[1120px] md:h-[780px] rounded-[2rem] md:rounded-[3rem] border-[15px] md:border-[30px] border-yellow-50 p-8 md:p-16 text-center flex flex-col justify-between relative overflow-hidden certificate-content shadow-2xl" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowCertificate(false)} className="absolute top-4 md:top-8 right-4 md:right-8 p-4 md:p-6 bg-red-100 text-red-600 rounded-full no-print shadow-lg z-50 hover:bg-red-200 transition-all"><X size={24} strokeWidth={4} /></button>

            <div className="absolute top-0 left-0 w-32 md:w-64 h-32 md:h-64 border-t-[10px] md:border-t-[16px] border-l-[10px] md:border-l-[16px] border-orange-400 rounded-tl-[1rem]" />
            <div className="absolute bottom-0 right-0 w-32 md:w-64 h-32 md:h-64 border-b-[10px] md:border-b-[16px] border-r-[10px] md:border-r-[16px] border-blue-500 rounded-br-[1rem]" />

            <div className="space-y-3 md:space-y-4 relative">
              <div className="flex justify-center gap-3 md:gap-4 items-center mb-4 md:mb-6">
                <Building className="text-orange-500" size={32} />
                <h5 className="text-xl md:text-3xl font-black uppercase tracking-[0.15em] md:tracking-[0.2em] text-orange-500">Speakpro Lab English Center</h5>
              </div>
              <div className="relative inline-block">
                <Award size={70} className="mx-auto text-yellow-500 drop-shadow-xl animate-pulse" />
                <Sparkles className="absolute -top-3 -right-3 text-orange-400" size={24} />
              </div>
              <h2 className="text-6xl md:text-[100px] font-black uppercase italic tracking-tighter text-slate-800 leading-none">Certificate</h2>
              <p className="text-blue-500 font-black tracking-[0.3em] md:tracking-[0.5em] uppercase text-lg md:text-2xl italic leading-none">Of Presentation Excellence</p>
            </div>

            <div className="py-6 md:py-10 border-y-4 md:border-y-8 border-dashed border-yellow-200 space-y-4 md:space-y-8 relative">
              <p className="text-slate-300 font-black uppercase text-xs md:text-base tracking-[0.3em] md:tracking-[0.4em] italic leading-none">This award is proudly presented to</p>
              <h1 className="text-5xl md:text-[110px] font-black text-blue-950 tracking-tighter italic uppercase drop-shadow-sm leading-none break-words underline decoration-yellow-300 decoration-4 md:decoration-8 underline-offset-[8px] md:underline-offset-[12px]">{childName}</h1>
              <div className="flex flex-wrap justify-center gap-4 md:gap-12 text-lg md:text-3xl font-bold text-slate-600 italic">
                <p className="flex items-center gap-2"><ImageIcon size={20} className="text-slate-400" /> Topic: <span className="text-orange-500 font-black uppercase tracking-tight">{customThemeLabel || selectedTheme?.label}</span></p>
                <p className="flex items-center gap-2"><Award size={20} className="text-slate-400" /> Score: <span className="text-orange-500 font-black">{result.score}/10</span></p>
                <p className="flex items-center gap-2"><Star size={20} className="text-slate-400" /> CEFR: <span className="text-blue-600 font-black uppercase">{level}</span></p>
              </div>
            </div>

            <div className="flex flex-col md:flex-row items-center md:items-end justify-between px-4 md:px-10 relative gap-4">
              <div className="text-left space-y-2 md:space-y-4">
                <div className="flex items-center gap-3 text-slate-400 font-black uppercase text-xs md:text-sm tracking-widest leading-none">
                  <Calendar size={20} className="text-blue-400" />
                  DATE: {result.evaluationDate}
                </div>
                <p className="text-slate-400 font-bold italic text-lg md:text-2xl mt-2 tracking-tight">"A little speaker with a big dream"</p>
              </div>
              <div className="text-right flex flex-col items-center">
                <div className="w-20 md:w-32 h-20 md:h-32 bg-slate-50 border-[6px] md:border-[10px] border-yellow-100 rounded-full flex items-center justify-center mb-2 md:mb-4 shadow-inner">
                  <ShieldCheck className="text-yellow-400" size={50} />
                </div>
                <p className="text-2xl md:text-4xl font-black italic tracking-tighter text-slate-800 leading-none">Ms Ly AI</p>
                <p className="text-[9px] md:text-[10px] font-black text-slate-300 uppercase tracking-widest mt-1 md:mt-2">Certified Speaking Coach</p>
              </div>
            </div>

            <div className="pt-4 md:pt-8 flex justify-center gap-4 md:gap-8 no-print relative z-50">
              <button onClick={() => window.print()} className="px-8 md:px-14 py-4 md:py-6 bg-slate-900 text-white rounded-[2rem] md:rounded-[3rem] font-black text-lg md:text-2xl flex items-center gap-3 md:gap-4 hover:bg-black transition-all shadow-2xl uppercase italic tracking-tighter border-b-4 md:border-b-8 border-slate-700 active:border-b-0 active:translate-y-2"><Download size={24} /> Tải về / In</button>
              <button onClick={() => setShowCertificate(false)} className="px-6 md:px-10 py-4 md:py-6 bg-red-600 text-white rounded-[2rem] md:rounded-[3rem] font-black text-lg md:text-2xl flex items-center gap-3 md:gap-4 hover:bg-red-700 transition-all uppercase italic shadow-xl border-b-4 md:border-b-8 border-red-800 active:border-b-0 active:translate-y-2"><X size={20} strokeWidth={4} /> Đóng</button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => apiKey ? setShowSettings(false) : null}
        onSave={handleSaveSettings}
        currentApiKey={apiKey}
        currentModel={selectedModel}
      />

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 10px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #fee2e2; border-radius: 20px; border: 3px solid #fffcf5; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; margin: 0 !important; padding: 0 !important; }
          .certificate-content { 
            border: 20px solid #fef9c3 !important; box-shadow: none !important; 
            width: 100% !important; height: 100vh !important;
            position: fixed !important; top: 0 !important; left: 0 !important;
            padding: 40px !important; margin: 0 !important;
            transform: none !important; overflow: hidden !important;
            display: flex !important; flex-direction: column !important; justify-content: space-between !important;
          }
          header, main { display: none !important; }
        }
      `}</style>
    </div>
  );
};

export default App;
