package main

import (
	"fmt"
	"strings"
)

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

// validate rejects slides that normalize would otherwise silently rewrite,
// so API clients such as AI agents learn what they got wrong.
func (s *Slide) validate(i int) error {
	at := fmt.Sprintf("Slide %d", i+1)
	if !slideTypes[s.Type] {
		return fmt.Errorf("%s has unknown type %q, use poll, quiz, wordcloud, open, scale or qa", at, s.Type)
	}
	if strings.TrimSpace(s.Question) == "" {
		return fmt.Errorf("%s needs a question", at)
	}
	if len(s.Options) > 8 {
		return fmt.Errorf("%s has %d options, the limit is 8", at, len(s.Options))
	}
	if (s.Type == SlidePoll || s.Type == SlideQuiz) && len(s.Options) < 2 {
		return fmt.Errorf("%s is a %s and needs at least 2 options", at, s.Type)
	}
	for _, c := range s.Correct {
		if c < 0 || c >= len(s.Options) {
			return fmt.Errorf("%s has correct index %d but only %d options, indexes start at 0", at, c, len(s.Options))
		}
	}
	if s.Type == SlideQuiz && len(s.Correct) == 0 {
		return fmt.Errorf("%s is a quiz and needs at least one correct option index", at)
	}
	return nil
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
