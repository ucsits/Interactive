export type SlideType = "poll" | "quiz" | "wordcloud" | "open" | "scale" | "qa"

export interface Slide {
  id: string
  type: SlideType
  question: string
  options: string[]
  correct: number[]
  timeLimit: number
  scaleMin: number
  scaleMax: number
  minLabel: string
  maxLabel: string
  maxEntries: number
}

export interface Deck {
  id: string
  title: string
  slides?: Slide[]
  slideCount: number
  liveCode?: string
  updatedAt: number
}

export interface Entry {
  id: string
  text: string
  votes: number
  mine?: boolean
  voted?: boolean
}

export interface Results {
  counts: number[]
  total: number
  average: number
  words: { text: string; count: number }[]
  entries: Entry[]
}

export interface Player {
  id: string
  nickname: string
  score: number
  online: boolean
}

export interface Me {
  id: string
  nickname: string
  score: number
  rank: number
  responses: { id: string; value: string; score: number }[]
}

export interface RoomState {
  type: "state"
  role: "host" | "player"
  code: string
  title: string
  status: "live" | "ended"
  index: number
  total: number
  reveal: boolean
  showLeaderboard: boolean
  hasQuiz: boolean
  slideStartedAt: number
  serverNow: number
  slide: Slide | null
  slides?: Slide[]
  participantCount: number
  answeredCount: number
  participants?: Player[]
  results: Results | null
  leaderboard: Player[]
  me?: Me
}
