export interface CourseWithCounts {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  _count: {
    materials: number;
    chunks: number;
    weeks: number;
  };
  totalWords: number;
}

export interface WeekWithMaterials {
  id: string;
  number: number;
  label: string | null;
  materials: MaterialMeta[];
}

export interface MaterialMeta {
  id: string;
  title: string;
  wordCount: number;
  sourceType: string;
  createdAt: string;
  weekId: string | null;
}

export interface PerfEntry {
  topic: string;
  question: string;
  correct: boolean;
  score: string;
  createdAt: string;
}

export interface PodcastLine {
  host: "PROF" | "ALEX";
  text: string;
}

export interface FlashcardData {
  id: string;
  front: string;
  back: string;
  topic: string | null;
}
