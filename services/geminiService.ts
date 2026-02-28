
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { CEFRLevel, EvaluationResult } from "../types";

// =============================================
// API KEY & MODEL MANAGEMENT
// =============================================

const FALLBACK_MODELS = [
  'gemini-3-flash-preview',
  'gemini-3-pro-preview',
  'gemini-2.5-flash',
];

export function getApiKey(): string {
  const key = localStorage.getItem('gemini_api_key') || '';
  if (!key) {
    throw new Error('CHƯA CÓ API KEY: Bé vui lòng nhấn nút ⚙️ Settings để nhập API Key nhé!');
  }
  return key;
}

export function getSelectedModel(): string {
  return localStorage.getItem('selected_model') || 'gemini-3-flash-preview';
}

function getFallbackModels(): string[] {
  const primary = getSelectedModel();
  const others = FALLBACK_MODELS.filter(m => m !== primary);
  return [primary, ...others];
}

// =============================================
// RETRY WITH MODEL FALLBACK
// =============================================

function withTimeout<T>(promise: Promise<T>, ms: number, label = 'API call'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`⏱️ ${label} quá thời gian (${Math.round(ms / 1000)}s). Bé hãy thử lại nhé!`));
    }, ms);

    promise
      .then(val => { clearTimeout(timer); resolve(val); })
      .catch(err => { clearTimeout(timer); reject(err); });
  });
}

async function callWithRetry<T>(
  fn: (model: string) => Promise<T>,
  maxRetriesPerModel = 1,
  timeoutMs = 60000
): Promise<T> {
  const models = getFallbackModels();
  let lastError: any;

  for (const model of models) {
    let delay = 1500;
    for (let attempt = 0; attempt < maxRetriesPerModel; attempt++) {
      try {
        console.log(`[SpeakPro] Trying model: ${model} (attempt ${attempt + 1}/${maxRetriesPerModel})...`);
        return await withTimeout(fn(model), timeoutMs, `Model ${model}`);
      } catch (err: any) {
        lastError = err;
        const errorStr = (err?.message || JSON.stringify(err) || '').toLowerCase();
        const isQuotaError = err?.status === 429 || errorStr.includes('quota') || errorStr.includes('resource_exhausted');
        const isTimeoutError = errorStr.includes('quá thời gian');

        if (isTimeoutError) {
          console.warn(`[SpeakPro] Model ${model} timed out, trying next model...`);
          break; // Skip to next model immediately on timeout
        }

        if (isQuotaError && attempt < maxRetriesPerModel - 1) {
          console.warn(`[SpeakPro] Model ${model} quota hit, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2.5;
          continue;
        }
        // Move to next model
        console.warn(`[SpeakPro] Model ${model} failed:`, err?.message || err);
        break;
      }
    }
  }

  // All models failed
  const errMsg = lastError?.message || JSON.stringify(lastError);
  throw new Error(`TẤT CẢ MODEL ĐỀU LỖI: ${errMsg}\n\nBé hãy kiểm tra API Key hoặc chờ 30 giây rồi thử lại nhé!`);
}

// =============================================
// API FUNCTIONS
// =============================================

export const generateImagePrompt = async (theme: string): Promise<string> => {
  return callWithRetry(async (model) => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const response = await ai.models.generateContent({
      model,
      contents: `Tạo một câu lệnh (prompt) tiếng Anh cực kỳ chi tiết cho AI tạo ảnh (DALL-E/Midjourney) với phong cách Pixar 3D. 
      Chủ đề: ${theme}. 
      Mô tả ánh sáng cinematic, màu sắc rực rỡ, nhân vật dễ thương, bối cảnh rõ ràng. 
      Chỉ trả về câu lệnh tiếng Anh.`
    });
    return response.text?.trim() || `A professional cinematic 3D Pixar style illustration of ${theme}, high detail, vibrant colors.`;
  });
};

export const generatePresentationScript = async (imagePrompt: string, userText: string, level: CEFRLevel, childName: string, themeLabel: string): Promise<any> => {
  return callWithRetry(async (model) => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });

    const levelInstructions: Record<string, string> = {
      'Starters': 'Trình độ Pre-A1: 25-30 từ. Cấu trúc: "This is a...", "It has got...", "A ... can ...", "I like/don\'t like...". Từ vựng cụ thể, hữu hình.',
      'Movers': 'Trình độ early A1: 45-55 từ. Mô tả môi trường sống (habitat), thức ăn (food), ngoại hình. Sử dụng thì hiện tại đơn, mô tả thói quen.',
      'Flyers': 'Trình độ A2 Bridge: 70-90 từ. Sử dụng câu so sánh (faster than, more intelligent than), trạng từ, mô tả hành vi (behaviour).',
      'A1': 'Trình độ Elementary: 60-80 từ. Nói về việc chăm sóc (care, feed, clean), thói quen hàng ngày, khu vực rừng/nông thôn.',
      'A2': 'Trình độ Pre-Intermediate: 90-120 từ. Nói về nguyên nhân/hậu quả: endangered, habitat loss, climate change, deforestation.',
      'B1': 'Trình độ Intermediate: 120-160 từ. Sử dụng câu bị động, cấu trúc cause-effect phức tạp, từ vựng chuyên môn về bảo tồn (biodiversity, ecological balance).',
      'B2': 'Trình độ Upper-Intermediate: 160-220 từ. Phân tích, đánh giá, lập luận. Cấu trúc phức tạp như "Not only... but also", "Unless...", "From an ethical perspective".'
    };

    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          {
            text: `Bạn là chuyên gia soạn kịch bản thuyết trình tiếng Anh cho trẻ em tại Speakpro Lab. 
                   Hãy soạn bài nói cho bé "${childName}" trình độ ${level}.
                   
                   QUY TẮC CẦN TUÂN THỦ:
                   1. NỘI DUNG: Miêu tả bức ảnh sau: "${imagePrompt}". 
                   2. TỪ KHÓA BÉ MUỐN DÙNG: "${userText}".
                   3. CHUẨN ĐẦU RA (QUAN TRỌNG): 
                   ${levelInstructions[level] || 'Chuẩn CEFR.'}
                   
                   Trả về JSON:
                   {
                     "intro": "Mở đầu chuyên nghiệp",
                     "points": ["Các câu thân bài miêu tả trực tiếp chi tiết trong ảnh"],
                     "conclusion": "Kết thúc ấn tượng",
                     "lessonVocab": [{"word": "Từ vựng chính", "ipa": "IPA", "translation": "Nghĩa tiếng Việt", "icon": "Emoji"}]
                   }` }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            intro: { type: Type.STRING },
            points: { type: Type.ARRAY, items: { type: Type.STRING } },
            conclusion: { type: Type.STRING },
            lessonVocab: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  word: { type: Type.STRING },
                  ipa: { type: Type.STRING },
                  translation: { type: Type.STRING },
                  icon: { type: Type.STRING }
                },
                required: ["word", "ipa", "translation", "icon"]
              }
            }
          },
          required: ["intro", "points", "conclusion", "lessonVocab"]
        }
      }
    });

    return JSON.parse(response.text || '{"intro":"", "points":[], "conclusion":"", "lessonVocab":[]}');
  });
};

export const generateScriptFromImage = async (imageBase64: string, imageMimeType: string, level: CEFRLevel, childName: string): Promise<any> => {
  return callWithRetry(async (model) => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });

    const levelInstructions: Record<string, string> = {
      'Starters': 'Trình độ Pre-A1: 25-30 từ. Cấu trúc: "This is a...", "It has got...", "A ... can ...", "I like/don\'t like...". Từ vựng cụ thể, hữu hình.',
      'Movers': 'Trình độ early A1: 45-55 từ. Mô tả môi trường sống (habitat), thức ăn (food), ngoại hình. Sử dụng thì hiện tại đơn, mô tả thói quen.',
      'Flyers': 'Trình độ A2 Bridge: 70-90 từ. Sử dụng câu so sánh (faster than, more intelligent than), trạng từ, mô tả hành vi (behaviour).',
      'A1': 'Trình độ Elementary: 60-80 từ. Nói về việc chăm sóc (care, feed, clean), thói quen hàng ngày, khu vực rừng/nông thôn.',
      'A2': 'Trình độ Pre-Intermediate: 90-120 từ. Nói về nguyên nhân/hậu quả: endangered, habitat loss, climate change, deforestation.',
      'B1': 'Trình độ Intermediate: 120-160 từ. Sử dụng câu bị động, cấu trúc cause-effect phức tạp, từ vựng chuyên môn về bảo tồn (biodiversity, ecological balance).',
      'B2': 'Trình độ Upper-Intermediate: 160-220 từ. Phân tích, đánh giá, lập luận. Cấu trúc phức tạp như "Not only... but also", "Unless...", "From an ethical perspective".'
    };

    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          { inlineData: { mimeType: imageMimeType, data: imageBase64 } },
          {
            text: `Bạn là chuyên gia soạn kịch bản thuyết trình tiếng Anh cho trẻ em tại Speakpro Lab. 
                   Hãy nhìn vào bức ảnh này và soạn bài nói cho bé "${childName}" trình độ ${level}.
                   
                   QUY TẮC CẦN TUÂN THỦ (QUAN TRỌNG):
                   1. NẾU ẢNH CÓ CHỨA VĂN BẢN/KỊCH BẢN (ví dụ: khung chữ "Hello everyone...", "Today I will talk about..."): Hãy trích xuất và giữ nguyên nội dung văn bản đó để làm kịch bản. Đừng tự ý thay đổi nội dung nếu nó đã có sẵn trên ảnh.
                   2. NẾU ẢNH KHÔNG CÓ VĂN BẢN: Hãy miêu tả chi tiết những gì đang diễn ra trong bức ảnh theo trình độ của bé.
                   3. CHUẨN ĐẦU RA: 
                   ${levelInstructions[level] || 'Chuẩn CEFR.'}
                   
                   Trả về JSON:
                   {
                     "intro": "Mở đầu (nếu trích xuất từ ảnh thì lấy phần mở đầu trong ảnh)",
                     "points": ["Các câu thân bài (nếu trích xuất từ ảnh thì lấy các câu trong ảnh)"],
                     "conclusion": "Kết thúc (nếu trích xuất từ ảnh thì lấy phần kết thúc trong ảnh)",
                     "lessonVocab": [{"word": "Từ vựng chính", "ipa": "IPA", "translation": "Nghĩa tiếng Việt", "icon": "Emoji"}]
                   }` }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            intro: { type: Type.STRING },
            points: { type: Type.ARRAY, items: { type: Type.STRING } },
            conclusion: { type: Type.STRING },
            lessonVocab: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  word: { type: Type.STRING },
                  ipa: { type: Type.STRING },
                  translation: { type: Type.STRING },
                  icon: { type: Type.STRING }
                },
                required: ["word", "ipa", "translation", "icon"]
              }
            }
          },
          required: ["intro", "points", "conclusion", "lessonVocab"]
        }
      }
    });

    return JSON.parse(response.text || '{"intro":"", "points":[], "conclusion":"", "lessonVocab":[]}');
  });
};

export const generateTeacherVoice = async (text: string): Promise<AudioBuffer> => {
  return callWithRetry(async (_model) => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
      },
    });
    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    return await decodeAudioData(decode(base64Audio!), audioContext, 24000, 1);
  });
};

export const evaluatePresentation = async (originalScript: string, audioBase64: string, audioMimeType: string, level: CEFRLevel): Promise<EvaluationResult> => {
  return callWithRetry(async (model) => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          { inlineData: { mimeType: audioMimeType, data: audioBase64 } },
          {
            text: `Bạn là giám khảo Cambridge chuyên chấm Speaking. Hãy nghe và chấm điểm bài nói của bé.
                   Kịch bản mục tiêu: "${originalScript}".
                   
                   YÊU CẦU CHẤM ĐIỂM NGHIÊM TÚC VÀ CÔNG BẰNG:
                   1. ĐỌC HẾT (TASK FULFILLMENT): Kiểm tra xem bé có bỏ sót câu nào không. Nếu bỏ sót nhiều câu, điểm Task Fulfillment phải thấp.
                   2. ĐỌC ĐÚNG: So sánh từng từ bé nói với kịch bản. Phát hiện từ đọc sai, đọc ngọng hoặc đọc thiếu âm cuối.
                   3. NHẬN XÉT LỖI (TIẾNG VIỆT): Liệt kê danh sách các lỗi cụ thể bé mắc phải. Ví dụ: "Từ 'elephant' bé quên phát âm âm 't' ở cuối".
                   
                   Trả về JSON:
                   {
                     "transcript": "Văn bản bé thực tế đã nói",
                     "pronunciation": 0.0,
                     "fluency": 0.0,
                     "intonation": 0.0,
                     "vocabulary": 0.0,
                     "grammar": 0.0,
                     "taskFulfillment": 0.0,
                     "feedback": "Nhận xét tổng quát bằng tiếng Việt",
                     "teacherPraise": "Lời khen khích lệ bé",
                     "mistakes": [{"word": "Từ bị sai", "type": "mispronunciation", "feedback": "Nhận xét tiếng Việt cụ thể về lỗi này"}],
                     "suggestions": ["3 Gợi ý để bé cải thiện"]
                   }` }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            transcript: { type: Type.STRING },
            pronunciation: { type: Type.NUMBER },
            fluency: { type: Type.NUMBER },
            intonation: { type: Type.NUMBER },
            vocabulary: { type: Type.NUMBER },
            grammar: { type: Type.NUMBER },
            taskFulfillment: { type: Type.NUMBER },
            feedback: { type: Type.STRING },
            teacherPraise: { type: Type.STRING },
            mistakes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  word: { type: Type.STRING },
                  type: { type: Type.STRING },
                  feedback: { type: Type.STRING }
                },
                required: ["word", "type", "feedback"]
              }
            },
            suggestions: { type: Type.ARRAY, items: { type: Type.STRING } }
          }
        }
      }
    });

    const raw = JSON.parse(response.text || '{}');
    const normalize = (val: number | undefined) => {
      let v = val || 0;
      if (v > 0 && v <= 1) v = v * 10;
      return Math.min(10, Math.max(0, Math.round(v * 10) / 10));
    };

    const scores = {
      pronunciation: normalize(raw.pronunciation),
      fluency: normalize(raw.fluency),
      intonation: normalize(raw.intonation),
      vocabulary: normalize(raw.vocabulary),
      grammar: normalize(raw.grammar),
      taskFulfillment: normalize(raw.taskFulfillment),
    };

    const avg = (scores.pronunciation + scores.fluency + scores.intonation + scores.vocabulary + scores.grammar + scores.taskFulfillment) / 6;
    return {
      ...raw,
      ...scores,
      score: normalize(avg),
      perceivedLevel: level,
      keyVocabulary: [],
      evaluationDate: new Date().toLocaleDateString('vi-VN')
    };
  });
};

export function decode(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

export async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
  }
  return buffer;
}
