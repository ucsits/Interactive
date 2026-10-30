package main

import "strings"

const (
	SlidePoll      = "poll"
	SlideQuiz      = "quiz"
	SlideWordCloud = "wordcloud"
	SlideOpen      = "open"
	SlideScale     = "scale"
	SlideQA        = "qa"
)

var slideTypes = map[string]bool{
	SlidePoll: true, SlideQuiz: true, SlideWordCloud: true,
	SlideOpen: true, SlideScale: true, SlideQA: true,
}

type Slide struct {
	ID         string   `json:"id"`
	Type       string   `json:"type"`
	Question   string   `json:"question"`
	Options    []string `json:"options"`
	Correct    []int    `json:"correct"`
	TimeLimit  int      `json:"timeLimit"`
	ScaleMin   int      `json:"scaleMin"`
	ScaleMax   int      `json:"scaleMax"`
	MinLabel   string   `json:"minLabel"`
	MaxLabel   string   `json:"maxLabel"`
	MaxEntries int      `json:"maxEntries"`
}

// normalize clamps user supplied slide settings into sane ranges.
func (s *Slide) normalize() {
	if !slideTypes[s.Type] {
		s.Type = SlidePoll
	}
	s.Question = truncate(strings.TrimSpace(s.Question), 300)
	if s.Options == nil {
		s.Options = []string{}
	}
	if len(s.Options) > 8 {
		s.Options = s.Options[:8]
	}
	for i := range s.Options {
		s.Options[i] = truncate(strings.TrimSpace(s.Options[i]), 120)
	}
	valid := []int{}
	for _, c := range s.Correct {
		if c >= 0 && c < len(s.Options) {
			valid = append(valid, c)
		}
	}
	s.Correct = valid
	if s.TimeLimit < 0 {
		s.TimeLimit = 0
	}
	if s.TimeLimit > 300 {
		s.TimeLimit = 300
	}
	if s.Type == SlideScale {
		if s.ScaleMin == 0 && s.ScaleMax == 0 {
			s.ScaleMin, s.ScaleMax = 1, 5
		}
		if s.ScaleMax <= s.ScaleMin {
			s.ScaleMax = s.ScaleMin + 1
		}
		if s.ScaleMax-s.ScaleMin > 10 {
			s.ScaleMax = s.ScaleMin + 10
		}
	}
	s.MinLabel = truncate(s.MinLabel, 40)
	s.MaxLabel = truncate(s.MaxLabel, 40)
	if s.MaxEntries <= 0 {
		s.MaxEntries = 3
	}
	if s.MaxEntries > 10 {
		s.MaxEntries = 10
	}
}

// public strips the answer key so it can be sent to students.
func (s Slide) public(reveal bool) Slide {
	if !reveal {
		s.Correct = []int{}
	}
	return s
}

type Deck struct {
	ID         string  `json:"id"`
	Title      string  `json:"title"`
	Slides     []Slide `json:"slides"`
	SlideCount int     `json:"slideCount"`
	LiveCode   string  `json:"liveCode,omitempty"`
	UpdatedAt  int64   `json:"updatedAt"`
}

func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) > n {
		return string(r[:n])
	}
	return s
}
