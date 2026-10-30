import {
  BarChart3,
  Circle,
  Cloud,
  Diamond,
  Gauge,
  Heart,
  Hexagon,
  MessageCircleQuestion,
  MessageSquareText,
  Pentagon,
  Square,
  Star,
  Triangle,
  Trophy,
  type LucideIcon,
} from "lucide-react"
import type { Slide, SlideType } from "./types"

export interface SlideMeta {
  label: string
  blurb: string
  icon: LucideIcon
  color: string
}

export const SLIDE_META: Record<SlideType, SlideMeta> = {
  poll: { label: "Poll", blurb: "Ask a quick multiple choice question", icon: BarChart3, color: "blurple" },
  quiz: { label: "Quiz", blurb: "Race the clock for points", icon: Trophy, color: "sun" },
  wordcloud: { label: "Word cloud", blurb: "Collect short words and watch them grow", icon: Cloud, color: "pink" },
  open: { label: "Open ended", blurb: "Gather longer thoughts and ideas", icon: MessageSquareText, color: "lime" },
  scale: { label: "Scale", blurb: "Rate confidence or opinions on a scale", icon: Gauge, color: "tangerine" },
  qa: { label: "Q&A", blurb: "Students ask and upvote questions", icon: MessageCircleQuestion, color: "sky" },
}

export const SLIDE_ORDER: SlideType[] = ["poll", "quiz", "wordcloud", "open", "scale", "qa"]

export const OPTION_COLORS = ["tangerine", "blurple", "sun", "lime", "pink", "sky", "mint", "tomato"]
export const OPTION_SHAPES: LucideIcon[] = [Triangle, Diamond, Circle, Square, Star, Hexagon, Heart, Pentagon]

function tempId() {
  return `tmp${Math.random().toString(36).slice(2, 12)}`
}

export function blankSlide(type: SlideType): Slide {
  const base: Slide = {
    id: tempId(),
    type,
    question: "",
    options: [],
    correct: [],
    timeLimit: 0,
    scaleMin: 1,
    scaleMax: 5,
    minLabel: "",
    maxLabel: "",
    maxEntries: 3,
  }
  switch (type) {
    case "poll":
      return { ...base, options: ["", ""] }
    case "quiz":
      return { ...base, options: ["", "", "", ""], correct: [0], timeLimit: 20 }
    case "scale":
      return { ...base, minLabel: "Not at all", maxLabel: "Totally" }
    case "open":
      return { ...base, maxEntries: 1 }
    default:
      return base
  }
}

/** Switching a slide's type keeps the question and any options that still make sense. */
export function convertSlide(slide: Slide, type: SlideType): Slide {
  const fresh = blankSlide(type)
  const keepOptions = (type === "poll" || type === "quiz") && slide.options.length >= 2
  return {
    ...fresh,
    id: slide.id,
    question: slide.question,
    options: keepOptions ? slide.options : fresh.options,
    correct: type === "quiz" ? (slide.correct.length ? slide.correct : [0]) : [],
  }
}

export function duplicateSlide(slide: Slide): Slide {
  return { ...slide, id: tempId(), options: [...slide.options], correct: [...slide.correct] }
}

export const TEMPLATES: { title: string; blurb: string; color: string; slides: Partial<Slide>[] }[] = [
  {
    title: "Class warm up",
    blurb: "Check the mood and wake up brains",
    color: "pink",
    slides: [
      { type: "scale", question: "How much energy do you have right now?", minLabel: "Running on empty", maxLabel: "Fully charged" },
      { type: "wordcloud", question: "Describe your weekend in one word", maxEntries: 2 },
      { type: "poll", question: "What should we start with today?", options: ["Quick review", "Something new", "A group challenge"] },
    ],
  },
  {
    title: "Quick quiz",
    blurb: "A fast, competitive check for understanding",
    color: "sun",
    slides: [
      { type: "quiz", question: "Which planet is closest to the sun?", options: ["Venus", "Mercury", "Mars", "Earth"], correct: [1], timeLimit: 20 },
      { type: "quiz", question: "What is 7 times 8?", options: ["54", "56", "64", "48"], correct: [1], timeLimit: 15 },
      { type: "quiz", question: "Which of these is a mammal?", options: ["Shark", "Penguin", "Dolphin", "Salmon"], correct: [2], timeLimit: 20 },
    ],
  },
  {
    title: "Exit ticket",
    blurb: "Find out what landed before the bell",
    color: "lime",
    slides: [
      { type: "scale", question: "How confident do you feel about today's topic?", minLabel: "Lost", maxLabel: "I could teach it" },
      { type: "open", question: "What is one thing you learned today?", maxEntries: 1 },
      { type: "qa", question: "What questions do you still have?", maxEntries: 3 },
    ],
  },
]

export function templateSlides(partials: Partial<Slide>[]): Slide[] {
  return partials.map((p) => ({ ...blankSlide(p.type ?? "poll"), ...p }))
}
