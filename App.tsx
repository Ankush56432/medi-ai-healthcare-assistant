
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Mic, MicOff, Volume2, VolumeX, Activity, Heart, Clock, User, 
  Settings, FileText, TrendingUp, Calendar, Pill, AlertCircle, 
  ChevronRight, Brain, Shield, MessageCircle, X, 
  Menu, Plus, Trash2, HeartPulse, Thermometer, Weight, Sparkles,
  RefreshCw, Sun, Moon, Zap, Coffee, Search, Stethoscope, Info, MapPin, ExternalLink,
  Send, Keyboard, AudioLines, Waves, StopCircle, UserCheck, Baby, UserRound, GraduationCap,
  Key, LogOut, CheckCircle2, UserCircle2, Venus, Mars, Transgender, Sparkle,
  Clock3, Map as MapIcon, Navigation, Loader2, Save
} from 'lucide-react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { getGeminiResponse, getDailyWellnessTips, checkSymptoms, searchNearbyHospitals } from './services/geminiService';
import { encode, decode, decodeAudioData } from './services/audioUtils';
import FaceAvatar from './components/FaceAvatar';
import { VitalSigns, Medication, Appointment, HealthRecord, ChatMessage, UserProfile, AppTab, HealthTip, SymptomAnalysis } from './types';

const INITIAL_VITALS: VitalSigns = {
  heartRate: 72,
  temperature: 98.6,
  bp: '120/80',
  weight: 70,
  updatedAt: new Date().toISOString()
};

type VoiceProfile = 'man' | 'woman' | 'boy' | 'girl' | 'old_doctor';

const VOICE_MAP: Record<VoiceProfile, { label: string, voice: string, icon: any, instruction: string, placeholder: string, welcome: string }> = {
  man: { 
    label: 'Man', 
    voice: 'Zephyr', 
    icon: UserRound, 
    instruction: 'You are a professional male medical assistant named Zephyr. Be direct, logical, and helpful.',
    placeholder: 'Ask Zephyr a clinical question...',
    welcome: 'Clinical Assistant Zephyr ready. How can I assist with your data today?'
  },
  woman: { 
    label: 'Woman', 
    voice: 'Kore', 
    icon: User, 
    instruction: 'You are a professional female medical assistant named Kore. Be warm, empathetic, and clear.',
    placeholder: 'How can Kore support your health today?',
    welcome: 'Hello! I\'m Kore. I\'m here to listen and support your wellness journey.'
  },
  boy: { 
    label: 'Boy', 
    voice: 'Puck', 
    icon: Baby, 
    instruction: 'You are a young, energetic medical assistant named Puck. Be curious, enthusiastic, and encouraging.',
    placeholder: 'Hey! What health adventures are we having?',
    welcome: 'Hi there! I\'m Puck! Want to check your vitals or tell me something cool?'
  },
  girl: { 
    label: 'Girl', 
    voice: 'Kore', 
    icon: Baby, 
    instruction: 'You are a kind, gentle young medical assistant. Be soft-spoken, patient, and reassuring.',
    placeholder: 'Tell me how you\'re feeling today...',
    welcome: 'Hello. I\'m here to help you feel better. What\'s on your mind?'
  },
  old_doctor: { 
    label: 'Old Doctor', 
    voice: 'Charon', 
    icon: GraduationCap, 
    instruction: 'You are a highly experienced, mature doctor named Charon. Be calm, wise, authoritative, and patient.',
    placeholder: 'Describe your condition, I\'m here to listen...',
    welcome: 'Greetings. I am Dr. Charon. Please, tell me about your symptoms in your own time.'
  }
};

const App: React.FC = () => {
  // --- Auth/Key State ---
  const [hasKey, setHasKey] = useState<boolean | null>(null);

  // --- UI State ---
  const [activeTab, setActiveTab] = useState<AppTab>('chat');
  const [showSettings, setShowSettings] = useState(false);
  const [showAddMedModal, setShowAddMedModal] = useState(false);
  const [showAddApptModal, setShowAddApptModal] = useState(false);
  const [showEditVitalsModal, setShowEditVitalsModal] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile>({
    name: 'John Doe',
    age: 30,
    gender: 'Male'
  });
  const [selectedVoice, setSelectedVoice] = useState<VoiceProfile>('old_doctor');

  // --- Chat/Input State ---
  const [chatInputValue, setChatInputValue] = useState('');
  const [chatInputMode, setChatInputMode] = useState<'text' | 'voice'>('text');
  const [isDictating, setIsDictating] = useState(false);
  const recognitionRef = useRef<any>(null);

  // --- Health Data State ---
  const [vitals, setVitals] = useState<VitalSigns>(INITIAL_VITALS);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [healthTips, setHealthTips] = useState<HealthTip[]>([]);
  
  // --- Feature State ---
  const [loadingTips, setLoadingTips] = useState(false);
  const [symptomInput, setSymptomInput] = useState('');
  const [symptomResult, setSymptomResult] = useState<SymptomAnalysis | null>(null);
  const [isAnalyzingSymptoms, setIsAnalyzingSymptoms] = useState(false);
  const [isSearchingHospitals, setIsSearchingHospitals] = useState(false);
  const [hospitalSearchRes, setHospitalSearchRes] = useState<{ text: string; sources: any[] } | null>(null);

  // --- Form States ---
  const [newMed, setNewMed] = useState({ name: '', dosage: '', frequency: '' });
  const [newAppt, setNewAppt] = useState({ doctor: '', specialty: '', date: '', time: '', reason: '' });
  const [vitalsForm, setVitalsForm] = useState<VitalSigns>(INITIAL_VITALS);

  // --- Voice Engine State (Live AI) ---
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [mouthLevel, setMouthLevel] = useState(0);
  const [muted, setMuted] = useState(false);

  // --- Refs ---
  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const animationFrameRef = useRef<number | null>(null);

  // --- Initial Key Check ---
  useEffect(() => {
    const checkKey = async () => {
      const selected = await (window as any).aistudio.hasSelectedApiKey();
      setHasKey(selected);
    };
    checkKey();
  }, []);

  const handleOpenKeySelection = async () => {
    await (window as any).aistudio.openSelectKey();
    setHasKey(true); 
  };

  // --- Initial Load & Persistence ---
  useEffect(() => {
    const saved = localStorage.getItem('medi_ai_pro_state_v6');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.vitals) {
          setVitals(parsed.vitals);
          setVitalsForm(parsed.vitals);
        }
        if (parsed.medications) setMedications(parsed.medications);
        if (parsed.appointments) setAppointments(parsed.appointments);
        if (parsed.chatHistory) setChatHistory(parsed.chatHistory);
        if (parsed.userProfile) setUserProfile(parsed.userProfile);
        if (parsed.selectedVoice) setSelectedVoice(parsed.selectedVoice);
      } catch (e) { console.error("Error loading state", e); }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('medi_ai_pro_state_v6', JSON.stringify({
      vitals, medications, appointments, chatHistory, userProfile, selectedVoice
    }));
  }, [vitals, medications, appointments, chatHistory, userProfile, selectedVoice]);

  // --- Speech Recognition ---
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; ++i) {
          transcript += event.results[i][0].transcript;
        }
        setChatInputValue(transcript);
      };
      recognition.onerror = () => setIsDictating(false);
      recognitionRef.current = recognition;
    }
  }, []);

  const toggleDictation = () => {
    if (!recognitionRef.current) return;
    if (isDictating) {
      recognitionRef.current.stop();
      setIsDictating(false);
    } else {
      setChatInputValue(''); 
      recognitionRef.current.start();
      setIsDictating(true);
      setChatInputMode('voice');
    }
  };

  // --- Audio Logic ---
  const startMouthAnalysis = (analyser: AnalyserNode) => {
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const analyze = () => {
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
      setMouthLevel(Math.min(1, (sum / dataArray.length) / 40));
      animationFrameRef.current = requestAnimationFrame(analyze);
    };
    analyze();
  };

  const cleanupAudio = () => {
    if (audioStreamRef.current) audioStreamRef.current.getTracks().forEach(t => t.stop());
    if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    sourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
    sourcesRef.current.clear();
    nextStartTimeRef.current = 0;
    setMouthLevel(0);
  };

  const getContextString = useCallback(() => {
    return `User: ${userProfile.name}, Age: ${userProfile.age}, Gender: ${userProfile.gender}. HR: ${vitals.heartRate}, BP: ${vitals.bp}. Medications: ${medications.map(m => m.name).join(', ') || 'None'}.`.trim();
  }, [userProfile, vitals, medications]);

  const startLiveSession = async () => {
    if (sessionRef.current) return;
    setIsProcessing(true);
    cleanupAudio();

    try {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      const inputCtx = new AudioCtx({ sampleRate: 16000 });
      const outputCtx = new AudioCtx({ sampleRate: 24000 });
      audioContextRef.current = outputCtx;
      const analyser = outputCtx.createAnalyser();
      analyser.connect(outputCtx.destination);
      startMouthAnalysis(analyser);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const voice = VOICE_MAP[selectedVoice];
      
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice.voice } } },
          systemInstruction: `You are Dr. MediAI. ${voice.instruction} IDENTITY: Created by MediAI Pro Development Team. Context: ${getContextString()}`,
        },
        callbacks: {
          onopen: () => { 
            setIsListening(true); 
            setIsProcessing(false); 
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              sessionPromise.then(s => {
                if (muted) return;
                const inputData = e.inputBuffer.getChannelData(0);
                const int16 = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) int16[i] = inputData[i] * 32768;
                s.sendRealtimeInput({
                  media: { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' }
                });
              });
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (msg: LiveServerMessage) => {
            const data = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (data && !muted) {
              setIsSpeaking(true);
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
              const buf = await decodeAudioData(decode(data), outputCtx, 24000, 1);
              const src = outputCtx.createBufferSource();
              src.buffer = buf;
              src.connect(analyser);
              src.onended = () => {
                sourcesRef.current.delete(src);
                if (sourcesRef.current.size === 0) setIsSpeaking(false);
              };
              src.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buf.duration;
              sourcesRef.current.add(src);
            }
          },
          onerror: () => { setHasKey(false); stopLiveSession(); },
          onclose: () => { setIsListening(false); sessionRef.current = null; setIsProcessing(false); }
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (err) {
      setIsProcessing(false);
      setHasKey(false);
    }
  };

  const stopLiveSession = () => {
    if (sessionRef.current) try { sessionRef.current.close(); } catch(e) {}
    sessionRef.current = null;
    cleanupAudio();
    setIsListening(false);
    setIsSpeaking(false);
  };

  const handleSendMessage = async () => {
    if (!chatInputValue.trim()) return;
    const text = chatInputValue.trim();
    setChatInputValue('');
    setChatHistory(prev => [...prev, { role: 'user', content: text, timestamp: new Date().toISOString() }]);
    setIsProcessing(true);
    try {
      const res = await getGeminiResponse(text, getContextString());
      setChatHistory(prev => [...prev, { role: 'assistant', content: res, timestamp: new Date().toISOString() }]);
    } finally { setIsProcessing(false); }
  };

  const handleAddMed = () => {
    if (!newMed.name) return;
    const med: Medication = {
      id: Math.random().toString(36).substr(2, 9),
      name: newMed.name,
      dosage: newMed.dosage,
      frequency: newMed.frequency,
      startDate: new Date().toISOString()
    };
    setMedications([...medications, med]);
    setNewMed({ name: '', dosage: '', frequency: '' });
    setShowAddMedModal(false);
  };

  const handleAddAppt = () => {
    if (!newAppt.doctor || !newAppt.date) return;
    const appt: Appointment = {
      id: Math.random().toString(36).substr(2, 9),
      doctor: newAppt.doctor,
      specialty: newAppt.specialty,
      date: newAppt.date,
      time: newAppt.time,
      reason: newAppt.reason
    };
    setAppointments([...appointments, appt]);
    setNewAppt({ doctor: '', specialty: '', date: '', time: '', reason: '' });
    setShowAddApptModal(false);
  };

  const handleUpdateVitals = () => {
    setVitals({ ...vitalsForm, updatedAt: new Date().toISOString() });
    setShowEditVitalsModal(false);
  };

  const handleHospitalSearch = () => {
    setIsSearchingHospitals(true);
    setHospitalSearchRes(null);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const res = await searchNearbyHospitals(pos.coords.latitude, pos.coords.longitude);
        setHospitalSearchRes(res);
      } catch (e) {
        alert("Search failed. Please try again.");
      } finally {
        setIsSearchingHospitals(false);
      }
    }, (err) => {
      setIsSearchingHospitals(false);
      alert("Location permission is needed to find nearby hospitals.");
    }, { timeout: 10000 });
  };

  if (hasKey === false) {
    return (
      <div className="min-h-[100dvh] bg-slate-900 flex items-center justify-center p-6 text-white text-center">
        <div className="max-w-md w-full space-y-6">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-2xl mx-auto"><Shield size={32}/></div>
          <h1 className="text-2xl font-bold">Connection Required</h1>
          <p className="text-slate-400 text-sm">Link your medical project to access real-time intelligence.</p>
          <button onClick={handleOpenKeySelection} className="w-full py-4 bg-blue-600 rounded-xl font-bold shadow-xl shadow-blue-900/40">Connect Project</button>
        </div>
      </div>
    );
  }

  const navItems = [
    { id: 'chat', label: 'Chat', icon: MessageCircle },
    { id: 'symptom-checker', label: 'Symptoms', icon: Stethoscope },
    { id: 'wellness', label: 'Wellness', icon: Sparkles },
    { id: 'vitals', label: 'Vitals', icon: Activity },
    { id: 'medications', label: 'Meds', icon: Pill },
    { id: 'appointments', label: 'Appts', icon: Calendar },
  ];

  return (
    <div className="flex flex-col lg:flex-row h-[100dvh] bg-slate-50 text-slate-900 overflow-hidden font-sans">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 xl:w-72 glass m-4 rounded-[32px] p-6 space-y-8 shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white"><Brain size={24}/></div>
          <h1 className="text-lg font-black tracking-tight">MediAI Pro</h1>
        </div>
        <nav className="flex-1 space-y-1">
          {navItems.map(item => (
            <button key={item.id} onClick={() => setActiveTab(item.id as AppTab)} className={`w-full flex items-center gap-4 px-4 py-3 rounded-2xl transition-all font-bold group ${activeTab === item.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'text-slate-500 hover:bg-white hover:text-slate-900'}`}><item.icon size={18} /><span className="text-sm">{item.label}</span></button>
          ))}
        </nav>
        <button onClick={() => setShowSettings(true)} className="p-4 bg-white/50 border border-white/30 rounded-2xl hover:bg-white transition-all text-left flex items-center gap-3">
          <UserCircle2 className="text-blue-600" size={24}/>
          <div className="flex-1 overflow-hidden"><p className="text-[10px] font-bold uppercase text-slate-400">Profile</p><p className="text-xs font-bold truncate">{userProfile.name}</p></div>
          <Settings size={14} className="text-slate-400" />
        </button>
      </aside>

      {/* Main Container */}
      <main className="flex-1 flex flex-col relative overflow-hidden h-full">
        {/* Mobile Header */}
        <header className="lg:hidden flex items-center justify-between px-6 py-4 bg-white border-b sticky top-0 z-40 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white"><Brain size={18}/></div>
            <span className="font-bold text-sm">MediAI Pro</span>
          </div>
          <button onClick={() => setShowSettings(true)} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center"><User size={20}/></button>
        </header>

        {/* Content Area */}
        <div className="flex-1 grid grid-cols-1 xl:grid-cols-12 overflow-hidden h-full">
          {/* Avatar Section */}
          <section className="xl:col-span-4 p-4 lg:p-6 flex flex-col items-center justify-center border-b xl:border-b-0 xl:border-r bg-white/40 glass shrink-0">
            <div className="flex flex-col items-center justify-center w-full max-sm:max-w-xs space-y-6 lg:space-y-10">
              <div className="hidden lg:block text-center space-y-1"><h2 className="text-xl font-bold">Health Companion</h2><p className="text-[10px] uppercase font-black text-slate-400 tracking-widest">Active Voice Mode</p></div>
              <div className="scale-75 lg:scale-100">
                <FaceAvatar 
                  isSpeaking={isSpeaking} 
                  isListening={isListening} 
                  isProcessing={isProcessing} 
                  mouthLevel={mouthLevel} 
                  selectedVoice={selectedVoice}
                />
              </div>
              <div className="flex items-center gap-4 lg:gap-8 w-full justify-center">
                <button onClick={() => setMuted(!muted)} className={`p-3 lg:p-4 rounded-2xl glass transition-all ${muted ? 'text-rose-500' : 'text-slate-500 hover:bg-white shadow-sm'}`}>{muted ? <VolumeX size={20}/> : <Volume2 size={20}/>}</button>
                <button onClick={isListening ? stopLiveSession : startLiveSession} className={`w-16 h-16 lg:w-20 lg:h-20 rounded-full flex items-center justify-center shadow-xl transition-all active:scale-95 ${isListening ? 'bg-rose-500 text-white animate-pulse' : 'bg-blue-600 text-white hover:scale-105 shadow-blue-200'}`}>{isListening ? <MicOff size={32}/> : <Mic size={32}/>}</button>
                <button onClick={() => setShowSettings(true)} className="p-3 lg:p-4 rounded-2xl glass text-slate-500 hover:bg-white shadow-sm"><Settings size={20}/></button>
              </div>
            </div>
          </section>

          {/* Tab Content Section */}
          <section className="xl:col-span-8 overflow-hidden relative flex flex-col bg-white h-full">
            <div className="flex-1 overflow-y-auto scrollbar-hide p-4 lg:p-8">
              {activeTab === 'chat' && (
                <div className="space-y-4 max-w-4xl mx-auto min-h-full">
                  {chatHistory.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center py-20 opacity-60 text-center space-y-6">
                      <div className="relative">
                        <div className="p-8 bg-blue-50 rounded-[40px] animate-float">
                          <MessageCircle size={64} className="text-blue-600" />
                        </div>
                        <div className="absolute -top-2 -right-2 bg-amber-400 text-white p-2 rounded-full shadow-lg">
                          <Sparkle size={20} />
                        </div>
                      </div>
                      <div className="space-y-2 px-6">
                        <h3 className="text-xl font-black text-slate-800 tracking-tight">How can I help, {userProfile.name}?</h3>
                        <p className="text-sm text-slate-500 font-medium max-w-xs leading-relaxed italic mx-auto">
                          "{VOICE_MAP[selectedVoice].welcome}"
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 justify-center pt-4 max-w-md mx-auto">
                        {['Check my vitals', 'Analyze a symptom', 'Wellness tips'].map(t => (
                          <button key={t} onClick={() => { setChatInputValue(t); }} className="px-4 py-2 bg-white border border-slate-200 rounded-full text-xs font-bold text-slate-600 hover:border-blue-400 hover:text-blue-600 transition-all shadow-sm">
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {chatHistory.map((m, i) => (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2`}>
                      <div className={`group relative max-w-[90%] lg:max-w-[75%] px-5 py-3 rounded-[24px] text-sm leading-relaxed shadow-sm transition-all ${
                        m.role === 'user' 
                          ? 'bg-blue-600 text-white shadow-blue-100' 
                          : 'bg-slate-100 text-slate-800 hover:bg-slate-200/70'
                      }`}>
                        {m.role === 'assistant' && (
                          <div className="flex items-center gap-1.5 mb-1 opacity-50">
                            {React.createElement(VOICE_MAP[selectedVoice].icon, { size: 12 })}
                            <span className="text-[10px] font-black uppercase tracking-widest">{VOICE_MAP[selectedVoice].label}</span>
                          </div>
                        )}
                        <p className="whitespace-pre-wrap">{m.content}</p>
                        <span className="block text-[9px] mt-1.5 opacity-40 text-right font-medium">
                          {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  ))}
                  {isProcessing && (
                    <div className="flex justify-start">
                      <div className="bg-slate-100 px-5 py-3 rounded-full flex gap-1.5 items-center">
                        <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]"/>
                        <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]"/>
                        <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce"/>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'wellness' && (
                <div className="space-y-6 max-w-5xl mx-auto">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold flex items-center gap-2"><Sparkles className="text-teal-500"/> Daily Tips</h2>
                    <button onClick={() => { setLoadingTips(true); getDailyWellnessTips(getContextString()).then(res => {setHealthTips(res); setLoadingTips(false);}); }} disabled={loadingTips} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors"><RefreshCw size={18} className={loadingTips ? 'animate-spin' : ''}/></button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {healthTips.map((tip, i) => (
                      <div key={i} className="p-6 rounded-3xl border border-slate-100 bg-white hover:shadow-lg transition-shadow">
                        <span className="text-[10px] font-black uppercase text-teal-600 tracking-widest">{tip.category}</span>
                        <h3 className="text-lg font-bold mt-2">{tip.title}</h3>
                        <p className="text-sm text-slate-500 mt-2 leading-relaxed">{tip.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'vitals' && (
                <div className="max-w-5xl mx-auto space-y-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold flex items-center gap-2"><Activity className="text-emerald-500"/> Health Vitals</h2>
                    <button onClick={() => setShowEditVitalsModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all">
                      <Plus size={18}/> Update Vitals
                    </button>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-4">
                    {[
                      { label: 'Heart Rate', value: vitals.heartRate, unit: 'bpm', icon: Heart, color: 'text-rose-500' },
                      { label: 'Temp', value: vitals.temperature, unit: '°F', icon: Thermometer, color: 'text-amber-500' },
                      { label: 'Blood Pressure', value: vitals.bp, unit: '', icon: Activity, color: 'text-blue-500' },
                      { label: 'Weight', value: vitals.weight, unit: 'kg', icon: Weight, color: 'text-emerald-500' },
                    ].map(v => (
                      <div key={v.label} className="p-5 rounded-3xl bg-white border border-slate-100 shadow-sm flex flex-col justify-between h-36 hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start">
                          <v.icon className={v.color} size={24}/>
                          <button onClick={() => setShowEditVitalsModal(true)} className="text-[10px] font-black uppercase text-blue-500 tracking-widest">Edit</button>
                        </div>
                        <div>
                          <p className="text-2xl font-black">{v.value}<span className="text-xs font-medium text-slate-400 ml-1">{v.unit}</span></p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{v.label}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-center text-slate-400 font-bold uppercase tracking-[0.2em] mt-8">Last updated: {new Date(vitals.updatedAt).toLocaleString()}</p>
                </div>
              )}

              {activeTab === 'symptom-checker' && (
                <div className="max-w-3xl mx-auto space-y-6">
                   <div className="p-6 bg-indigo-50 rounded-[32px] border border-indigo-100">
                    <h2 className="text-lg font-bold text-indigo-900 mb-2 flex items-center gap-2"><Stethoscope size={20}/> Symptom Analysis</h2>
                    <p className="text-xs text-indigo-700/70 mb-4">Describe how you're feeling in detail for the best triage.</p>
                    <textarea value={symptomInput} onChange={e => setSymptomInput(e.target.value)} placeholder="Describe symptoms..." className="w-full h-32 p-4 rounded-2xl border-0 ring-1 ring-indigo-200 focus:ring-2 focus:ring-indigo-500 outline-none resize-none text-sm bg-white" />
                    <button onClick={() => { if(!symptomInput.trim()) return; setIsAnalyzingSymptoms(true); checkSymptoms(symptomInput, getContextString()).then(res => {setSymptomResult(res); setIsAnalyzingSymptoms(false);}); }} disabled={isAnalyzingSymptoms || !symptomInput.trim()} className="w-full mt-4 py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-colors">{isAnalyzingSymptoms ? 'Analyzing...' : 'Analyze Symptoms'}</button>
                   </div>
                   {symptomResult && (
                     <div className="p-6 rounded-[32px] border-2 border-slate-100 space-y-4 animate-in fade-in zoom-in-95">
                        <div className="flex justify-between items-center"><span className="text-xs font-bold uppercase tracking-widest text-slate-400">AI Report</span><span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${symptomResult.urgency === 'emergency' ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-600'}`}>Urgency: {symptomResult.urgency}</span></div>
                        <p className="text-sm font-bold text-slate-800">{symptomResult.whenToSeeDoctor}</p>
                        <ul className="space-y-2">{symptomResult.selfCareAdvice.map(a => <li key={a} className="text-xs text-slate-500 flex gap-2 items-start"><CheckCircle2 size={14} className="text-emerald-500 shrink-0 mt-0.5" /> {a}</li>)}</ul>
                     </div>
                   )}
                </div>
              )}

              {activeTab === 'medications' && (
                <div className="max-w-4xl mx-auto space-y-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold flex items-center gap-2"><Pill className="text-rose-500"/> Medications</h2>
                    <button onClick={() => setShowAddMedModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all">
                      <Plus size={18}/> Add Med
                    </button>
                  </div>
                  {medications.length === 0 ? (
                    <div className="py-20 text-center opacity-40">
                      <Pill size={48} className="mx-auto mb-4" />
                      <p className="font-bold">No medications recorded yet.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {medications.map(med => (
                        <div key={med.id} className="p-6 rounded-3xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                          <div className="flex justify-between items-start mb-4">
                            <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-500"><Pill size={24}/></div>
                            <button onClick={() => setMedications(medications.filter(m => m.id !== med.id))} className="text-slate-300 hover:text-rose-500 transition-colors"><Trash2 size={18}/></button>
                          </div>
                          <h3 className="text-lg font-bold">{med.name}</h3>
                          <p className="text-sm text-slate-500">{med.dosage} • {med.frequency}</p>
                          <p className="text-[10px] text-slate-400 mt-4 uppercase tracking-widest font-bold">Started {new Date(med.startDate).toLocaleDateString()}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'appointments' && (
                <div className="max-w-4xl mx-auto space-y-8">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <h2 className="text-2xl font-bold flex items-center gap-2"><Calendar className="text-blue-500"/> Appointments</h2>
                    <div className="flex gap-2">
                      <button onClick={handleHospitalSearch} disabled={isSearchingHospitals} className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-xl font-bold shadow-lg shadow-teal-100 hover:bg-teal-700 transition-all disabled:opacity-50">
                        {isSearchingHospitals ? <Loader2 className="animate-spin" size={18}/> : <MapIcon size={18}/>}
                        {isSearchingHospitals ? 'Searching...' : 'Find Nearby'}
                      </button>
                      <button onClick={() => setShowAddApptModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all">
                        <Plus size={18}/> Schedule
                      </button>
                    </div>
                  </div>

                  {hospitalSearchRes && (
                    <div className="p-6 bg-teal-50 rounded-[32px] border border-teal-100 space-y-4 animate-in slide-in-from-top-4">
                      <div className="flex justify-between items-center">
                        <h3 className="text-teal-900 font-bold flex items-center gap-2"><Navigation size={18}/> Nearby Health Facilities</h3>
                        <button onClick={() => setHospitalSearchRes(null)} className="text-teal-600 hover:text-teal-800"><X size={18}/></button>
                      </div>
                      <div className="text-sm text-teal-800 leading-relaxed whitespace-pre-wrap">{hospitalSearchRes.text}</div>
                      <div className="flex flex-wrap gap-2">
                        {hospitalSearchRes.sources?.map((chunk: any, i: number) => (
                          chunk.maps && (
                            <a key={i} href={chunk.maps.uri} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-teal-200 rounded-full text-[10px] font-bold text-teal-700 hover:bg-teal-100 transition-colors">
                              <ExternalLink size={12}/> {chunk.maps.title || "View on Maps"}
                            </a>
                          )
                        ))}
                      </div>
                    </div>
                  )}

                  {appointments.length === 0 ? (
                    <div className="py-20 text-center opacity-40">
                      <Calendar size={48} className="mx-auto mb-4" />
                      <p className="font-bold">No appointments scheduled.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {appointments.map(appt => (
                        <div key={appt.id} className="p-6 rounded-[32px] bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow flex items-center gap-6">
                          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex flex-col items-center justify-center text-blue-600 shrink-0">
                            <span className="text-[10px] font-black uppercase">{new Date(appt.date).toLocaleString('default', { month: 'short' })}</span>
                            <span className="text-xl font-black">{new Date(appt.date).getDate()}</span>
                          </div>
                          <div className="flex-1">
                            <h3 className="font-bold text-lg">{appt.doctor}</h3>
                            <p className="text-sm text-slate-500 font-medium">{appt.specialty} • {appt.time}</p>
                            {appt.reason && <p className="text-xs text-slate-400 mt-1 italic">"{appt.reason}"</p>}
                          </div>
                          <button onClick={() => setAppointments(appointments.filter(a => a.id !== appt.id))} className="text-slate-300 hover:text-rose-500 transition-colors"><Trash2 size={18}/></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Chat Input Bar */}
            {activeTab === 'chat' && (
              <div className="p-4 lg:p-6 border-t bg-white sticky bottom-0 z-30 shadow-[0_-10px_30px_-15px_rgba(0,0,0,0.05)] shrink-0">
                <div className="max-w-4xl mx-auto flex gap-3 items-end">
                  <div className="flex-1 relative flex flex-col gap-2">
                    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-fit self-center lg:self-start border border-slate-200 shadow-inner">
                      <button onClick={() => setChatInputMode('text')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black tracking-widest transition-all ${chatInputMode === 'text' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>TEXT</button>
                      <button onClick={() => setChatInputMode('voice')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black tracking-widest transition-all ${chatInputMode === 'voice' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>VOICE</button>
                    </div>
                    {chatInputMode === 'text' ? (
                      <textarea 
                        value={chatInputValue} 
                        onChange={e => setChatInputValue(e.target.value)} 
                        placeholder={VOICE_MAP[selectedVoice].placeholder} 
                        className="w-full px-5 py-3.5 rounded-[24px] border border-slate-200 bg-slate-50 focus:bg-white outline-none resize-none text-sm h-14 scrollbar-hide focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-medium" 
                        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSendMessage())} 
                      />
                    ) : (
                      <div onClick={toggleDictation} className={`group w-full py-3.5 px-6 rounded-[24px] border flex items-center gap-4 cursor-pointer transition-all duration-300 ${isDictating ? 'bg-blue-600 border-blue-600 shadow-lg shadow-blue-200' : 'bg-slate-50 border-slate-200 hover:border-blue-400'}`}>
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${isDictating ? 'bg-white text-blue-600' : 'bg-blue-100 text-blue-600 group-hover:bg-blue-200'}`}>
                          {isDictating ? <AudioLines className="animate-pulse" size={18}/> : <Mic size={18}/>}
                        </div>
                        <div className="flex-1 overflow-hidden">
                          <span className={`text-sm font-bold truncate block ${isDictating ? 'text-white' : 'text-slate-600'}`}>
                            {chatInputValue || (isDictating ? "I'm listening..." : "Tap to start dictation")}
                          </span>
                        </div>
                        {isDictating && <div className="flex gap-0.5"><div className="w-1 h-3 bg-white/40 rounded-full animate-bounce [animation-delay:-0.3s]"/><div className="w-1 h-3 bg-white/40 rounded-full animate-bounce [animation-delay:-0.15s]"/><div className="w-1 h-3 bg-white/40 rounded-full animate-bounce"/></div>}
                      </div>
                    )}
                  </div>
                  <button 
                    onClick={handleSendMessage} 
                    disabled={!chatInputValue.trim()} 
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg transition-all active:scale-90 mb-0.5 ${
                      chatInputValue.trim() 
                        ? 'bg-blue-600 text-white shadow-blue-200 hover:scale-105' 
                        : 'bg-slate-100 text-slate-300 shadow-none'
                    }`}
                  >
                    <Send size={24}/>
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Mobile Bottom Navigation */}
        <nav className="lg:hidden flex border-t bg-white h-16 safe-bottom shrink-0 overflow-x-auto scrollbar-hide">
          {navItems.map(item => (
            <button key={item.id} onClick={() => setActiveTab(item.id as AppTab)} className={`flex-1 min-w-[64px] flex flex-col items-center justify-center gap-1 ${activeTab === item.id ? 'text-blue-600' : 'text-slate-400'}`}>
              <item.icon size={20} className={activeTab === item.id ? 'scale-110 transition-transform' : ''}/>
              <span className="text-[9px] font-black tracking-tight">{item.label}</span>
            </button>
          ))}
        </nav>
      </main>

      {/* Settings / Profile Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white w-full max-w-xl rounded-[40px] p-6 lg:p-8 space-y-8 shadow-2xl overflow-y-auto max-h-[90vh] scrollbar-hide relative border border-slate-100">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-black tracking-tight">Patient Profile</h3>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-widest mt-1">MediAI Health Passport</p>
              </div>
              <button onClick={() => setShowSettings(false)} className="p-2.5 bg-slate-100 rounded-full hover:rotate-90 transition-all text-slate-500 hover:bg-slate-200"><X size={20}/></button>
            </div>
            <div className="space-y-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Full Name</label>
                  <input type="text" value={userProfile.name} onChange={e => setUserProfile({...userProfile, name: e.target.value})} className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-500 outline-none transition-all font-bold" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Age</label>
                  <input type="number" value={userProfile.age} onChange={e => setUserProfile({...userProfile, age: parseInt(e.target.value) || 0})} className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-500 outline-none transition-all font-bold" />
                </div>
              </div>
              <div className="space-y-3">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Gender Identity</label>
                <div className="grid grid-cols-3 gap-3">
                  {['Male', 'Female', 'Other'].map(g => (
                    <button key={g} onClick={() => setUserProfile({...userProfile, gender: g})} className={`py-3.5 rounded-2xl border-2 font-black text-xs transition-all flex items-center justify-center gap-2 ${userProfile.gender === g ? 'bg-blue-600 text-white border-blue-600 shadow-xl shadow-blue-100' : 'bg-slate-50 border-slate-50 text-slate-500 hover:border-slate-200'}`}>
                      {g === 'Male' ? <Mars size={14}/> : g === 'Female' ? <Venus size={14}/> : <Transgender size={14}/>}
                      {g}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-4">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">AI Voice Personality</label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {(Object.keys(VOICE_MAP) as VoiceProfile[]).map(v => (
                    <button 
                      key={v} 
                      onClick={() => setSelectedVoice(v)} 
                      className={`flex flex-col items-center gap-2.5 p-3.5 rounded-2xl border-2 transition-all ${
                        selectedVoice === v ? 'border-blue-600 bg-blue-50 shadow-md' : 'border-slate-50 hover:border-slate-200'
                      }`}
                    >
                      <div className={`p-2.5 rounded-xl transition-all ${selectedVoice === v ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                        {React.createElement(VOICE_MAP[v].icon, { size: 20 })}
                      </div>
                      <span className="text-[9px] font-black text-center uppercase leading-tight tracking-tighter">{VOICE_MAP[v].label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="pt-4 space-y-3">
                <button onClick={handleOpenKeySelection} className="w-full py-4 text-xs font-black text-slate-500 bg-slate-100 rounded-2xl flex items-center justify-center gap-2 hover:bg-slate-200 transition-all uppercase tracking-widest"><Key size={16}/> Link Medical Project</button>
                <button onClick={() => setShowSettings(false)} className="w-full py-4.5 bg-blue-600 text-white rounded-2xl font-black shadow-2xl shadow-blue-200 hover:bg-blue-700 transition-all uppercase tracking-widest">Update Health Profile</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Vitals Modal */}
      {showEditVitalsModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in zoom-in-95">
          <div className="bg-white w-full max-w-md rounded-[40px] p-8 shadow-2xl relative border border-slate-100 overflow-y-auto max-h-[90vh] scrollbar-hide">
            <h3 className="text-2xl font-black mb-6 flex items-center gap-2"><Activity className="text-emerald-500"/> Update Vitals</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Heart Rate (bpm)</label>
                  <input type="number" value={vitalsForm.heartRate} onChange={e => setVitalsForm({...vitalsForm, heartRate: parseInt(e.target.value) || 0})} className="w-full px-5 py-3 rounded-2xl bg-slate-50 border border-slate-200 outline-none focus:border-blue-500 font-bold" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Temp (°F)</label>
                  <input type="number" step="0.1" value={vitalsForm.temperature} onChange={e => setVitalsForm({...vitalsForm, temperature: parseFloat(e.target.value) || 0})} className="w-full px-5 py-3 rounded-2xl bg-slate-50 border border-slate-200 outline-none focus:border-blue-500 font-bold" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Blood Pressure</label>
                  <input type="text" value={vitalsForm.bp} onChange={e => setVitalsForm({...vitalsForm, bp: e.target.value})} className="w-full px-5 py-3 rounded-2xl bg-slate-50 border border-slate-200 outline-none focus:border-blue-500 font-bold" placeholder="120/80" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Weight (kg)</label>
                  <input type="number" value={vitalsForm.weight} onChange={e => setVitalsForm({...vitalsForm, weight: parseInt(e.target.value) || 0})} className="w-full px-5 py-3 rounded-2xl bg-slate-50 border border-slate-200 outline-none focus:border-blue-500 font-bold" />
                </div>
              </div>
              <div className="pt-6 flex gap-3">
                <button onClick={() => setShowEditVitalsModal(false)} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-bold">Cancel</button>
                <button onClick={handleUpdateVitals} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-100 flex items-center justify-center gap-2">
                  <Save size={18}/> Save Vitals
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Medication Modal */}
      {showAddMedModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in zoom-in-95">
          <div className="bg-white w-full max-w-md rounded-[40px] p-8 shadow-2xl relative border border-slate-100">
            <h3 className="text-2xl font-black mb-6 flex items-center gap-2"><Pill className="text-rose-500"/> Add Medication</h3>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Medicine Name</label>
                <input type="text" value={newMed.name} onChange={e => setNewMed({...newMed, name: e.target.value})} className="w-full px-5 py-3 rounded-2xl bg-slate-50 border border-slate-200 outline-none focus:border-blue-500 font-bold" placeholder="e.g. Paracetamol" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Dosage</label>
                  <input type="text" value={newMed.dosage} onChange={e => setNewMed({...newMed, dosage: e.target.value})} className="w-full px-5 py-3 rounded-2xl bg-slate-50 border border-slate-200 outline-none focus:border-blue-500 font-bold" placeholder="e.g. 500mg" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Frequency</label>
                  <input type="text" value={newMed.frequency} onChange={e => setNewMed({...newMed, frequency: e.target.value})} className="w-full px-5 py-3 rounded-2xl bg-slate-50 border border-slate-200 outline-none focus:border-blue-500 font-bold" placeholder="e.g. 2x Daily" />
                </div>
              </div>
              <div className="pt-6 flex gap-3">
                <button onClick={() => setShowAddMedModal(false)} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-bold">Cancel</button>
                <button onClick={handleAddMed} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-100">Save Med</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Appointment Modal */}
      {showAddApptModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in zoom-in-95">
          <div className="bg-white w-full max-w-md rounded-[40px] p-8 shadow-2xl relative border border-slate-100 overflow-y-auto max-h-[90vh] scrollbar-hide">
            <h3 className="text-2xl font-black mb-6 flex items-center gap-2"><Calendar className="text-blue-500"/> New Appointment</h3>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Doctor Name</label>
                <input type="text" value={newAppt.doctor} onChange={e => setNewAppt({...newAppt, doctor: e.target.value})} className="w-full px-5 py-3 rounded-2xl bg-slate-50 border border-slate-200 outline-none focus:border-blue-500 font-bold" placeholder="Dr. Smith" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Specialty</label>
                <input type="text" value={newAppt.specialty} onChange={e => setNewAppt({...newAppt, specialty: e.target.value})} className="w-full px-5 py-3 rounded-2xl bg-slate-50 border border-slate-200 outline-none focus:border-blue-500 font-bold" placeholder="Cardiology" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Date</label>
                  <input type="date" value={newAppt.date} onChange={e => setNewAppt({...newAppt, date: e.target.value})} className="w-full px-5 py-3 rounded-2xl bg-slate-50 border border-slate-200 outline-none focus:border-blue-500 font-bold" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Time</label>
                  <input type="time" value={newAppt.time} onChange={e => setNewAppt({...newAppt, time: e.target.value})} className="w-full px-5 py-3 rounded-2xl bg-slate-50 border border-slate-200 outline-none focus:border-blue-500 font-bold" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Reason</label>
                <textarea value={newAppt.reason} onChange={e => setNewAppt({...newAppt, reason: e.target.value})} className="w-full px-5 py-3 rounded-2xl bg-slate-50 border border-slate-200 outline-none focus:border-blue-500 font-bold h-24 resize-none" placeholder="General Checkup" />
              </div>
              <div className="pt-6 flex gap-3">
                <button onClick={() => setShowAddApptModal(false)} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-bold">Cancel</button>
                <button onClick={handleAddAppt} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-100">Schedule</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
