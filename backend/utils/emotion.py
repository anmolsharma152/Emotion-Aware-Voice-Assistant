from typing import Dict, Any
from rapidfuzz import process, fuzz

def analyze_emotion(text: str) -> Dict[str, Any]:
    text_lower = text.lower().strip()
    print(f"🔍 Analyzing: '{text_lower}'")

    if not text_lower:
        return {"emotion": "neutral", "confidence": 0.0, "emotions_breakdown": {}}

    negators = {"not", "don't", "dont", "cant", "can't", "stop", "never", "no", "isn't", "won't"}
    boosters = {"very": 1.5, "extremely": 2.0, "totally": 1.8, "so": 1.4, "really": 1.5, "super": 1.5}
    
    slang_map = {
        "fire": "happy", "lit": "happy", "dope": "happy", "sick": "happy",
        "bummed": "sad", "trash": "disgusted", "cap": "disgusted",
        "shook": "surprised", "mindblown": "surprised", "dead": "surprised"
    }

    emotion_patterns = {
        "happy": ["happy", "great", "excited", "wonderful", "amazing", "love", "joy", "good"],
        "sad": ["sad", "disappointed", "upset", "depressed", "lonely", "hurt", "unhappy", "cry"],
        "angry": ["angry", "mad", "furious", "annoyed", "frustrated", "hate", "irritated", "stupid"],
        "fearful": ["scared", "worried", "afraid", "terrified", "anxious", "nervous", "panic"],
        "surprised": ["wow", "incredible", "shocking", "unexpected", "surprised", "omg"],
        "disgusted": ["gross", "disgusting", "sick", "ugh", "eww", "nasty"]
    }

    scores = {emotion: 0.0 for emotion in emotion_patterns}
    words = text_lower.split()

    for i, word in enumerate(words):
        # --- FIX: Ignore words with less than 3 letters ---
        if len(word) < 3: 
            continue

        if word in slang_map:
            scores[slang_map[word]] += 2.0
            continue

        for emotion, keywords in emotion_patterns.items():
            best_match = process.extractOne(word, keywords, scorer=fuzz.WRatio)
            if best_match and best_match[1] > 90:
                weight = 1.0
                
                # Negation Logic
                if i > 0 and words[i-1] in negators:
                    print(f"   -> Negation: '{words[i-1]} {word}'")
                    weight = -2.0
                elif i > 1 and words[i-2] in negators:
                     print(f"   -> Negation: '{words[i-2]} {words[i-1]} {word}'")
                     weight = -2.0
                
                if i > 0 and words[i-1] in boosters:
                    weight *= boosters[words[i-1]]
                
                scores[emotion] += weight

    positive_scores = {k: v for k, v in scores.items() if v > 0}
    
    if not positive_scores:
        return {"emotion": "neutral", "confidence": 0.8, "emotions_breakdown": scores}

    max_val = max(positive_scores.values())
    normalized = {k: round(v / max_val, 2) for k, v in positive_scores.items()}
    dominant = max(normalized, key=normalized.get)
    
    return {
        "emotion": dominant, 
        "confidence": normalized[dominant], 
        "emotions_breakdown": normalized
    }