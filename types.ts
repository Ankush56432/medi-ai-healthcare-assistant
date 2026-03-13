
export type AppTab = 'chat' | 'symptom-checker' | 'wellness' | 'vitals' | 'medications' | 'records' | 'appointments';

export interface VitalSigns {
  heartRate: number;
  temperature: number;
  bp: string;
  weight: number;
  updatedAt: string;
}

export interface Medication {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  startDate: string;
}

export interface Appointment {
  id: string;
  doctor: string;
  specialty: string;
  date: string;
  time: string;
  reason: string;
}

export interface HealthRecord {
  id: string;
  title: string;
  date: string;
  description: string;
  category: 'symptom' | 'lab' | 'visit';
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface HealthTip {
  title: string;
  description: string;
  category: string;
  impact: 'low' | 'medium' | 'high';
}

export interface SymptomAnalysis {
  potentialCauses: string[];
  urgency: 'low' | 'high' | 'emergency';
  selfCareAdvice: string[];
  whenToSeeDoctor: string;
}

export interface UserProfile {
  name: string;
  age?: number;
  gender?: string;
  medicalHistory?: string[];
}
