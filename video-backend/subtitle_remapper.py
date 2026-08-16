def remap_subtitles(transcript, segments):
    """
    Remaps a raw word-level Whisper transcript to match a new continuous timeline
    formed by concatenating specific segments of the original video.
    """
    if not segments:
        return {'segments': [{'words': []}]}

    # 1. Calculate final start/end for each segment
    final_segments = []
    current_time = 0.0
    for seg in segments:
        orig_duration = seg['end'] - seg['start']
        speed = seg.get('speed', 1.0)
        final_duration = orig_duration / speed
        final_segments.append({
            'orig_start': seg['start'],
            'orig_end': seg['end'],
            'final_start': current_time,
            'final_end': current_time + final_duration,
            'orig_duration': orig_duration,
            'final_duration': final_duration,
            'speed': speed
        })
        current_time += final_duration

    # 2. Extract words
    words = []
    for s in transcript.get('segments', []):
        words.extend(s.get('words', []))

    remapped_words = []
    
    # 3. Process each word
    for word in words:
        w_start = word.get('start', 0.0)
        w_end = word.get('end', 0.0)
        w_dur = w_end - w_start
        if w_dur <= 0:
            continue

        best_seg = None
        best_overlap = 0.0
        
        for fseg in final_segments:
            overlap_start = max(w_start, fseg['orig_start'])
            overlap_end = min(w_end, fseg['orig_end'])
            overlap = max(0.0, overlap_end - overlap_start)
            
            if overlap > best_overlap:
                best_overlap = overlap
                best_seg = fseg

        if best_seg is not None and (best_overlap / w_dur) > 0.5:
            # Word belongs to this segment
            speed = best_seg['speed']
            orig_rel_start = w_start - best_seg['orig_start']
            orig_rel_end = w_end - best_seg['orig_start']
            
            final_rel_start = orig_rel_start / speed
            final_rel_end = orig_rel_end / speed
            
            new_start = best_seg['final_start'] + final_rel_start
            new_end = best_seg['final_start'] + final_rel_end
            
            # Clamp to segment boundaries (Requirement 5)
            new_start = max(best_seg['final_start'], min(new_start, best_seg['final_end']))
            new_end = max(best_seg['final_start'], min(new_end, best_seg['final_end']))
            
            # Avoid 0-duration words after clamping
            if new_end > new_start:
                new_word = dict(word)
                new_word['start'] = new_start
                new_word['end'] = new_end
                remapped_words.append(new_word)

    # 4. Sort words chronologically by new_start
    remapped_words.sort(key=lambda x: x['start'])

    return {'segments': [{'words': remapped_words}]}


def run_tests():
    def make_transcript(*word_tuples):
        return {'segments': [{'words': [{'word': w, 'start': s, 'end': e} for w, s, e in word_tuples]}]}

    # Test 1: One segment
    t1 = make_transcript(("hello", 1.0, 2.0), ("world", 3.0, 4.0))
    s1 = [{"start": 0.0, "end": 5.0}]
    r1 = remap_subtitles(t1, s1)['segments'][0]['words']
    assert len(r1) == 2
    assert r1[0]['start'] == 1.0 and r1[0]['end'] == 2.0
    assert r1[1]['start'] == 3.0 and r1[1]['end'] == 4.0
    print("Test 1 passed")

    # Test 2: Three segments with gaps
    t2 = make_transcript(("A", 1.0, 2.0), ("B", 6.0, 7.0), ("C", 11.0, 12.0))
    s2 = [{"start": 0.0, "end": 5.0}, {"start": 10.0, "end": 15.0}]
    r2 = remap_subtitles(t2, s2)['segments'][0]['words']
    assert len(r2) == 2
    assert r2[0]['word'] == "A"
    assert r2[0]['start'] == 1.0 and r2[0]['end'] == 2.0
    assert r2[1]['word'] == "C"
    # C was at 11.0. Segment 2 starts at 10.0 and maps to 5.0. Offset is 5.0 - 10.0 = -5.0.
    # C's new start is 11.0 - 5.0 = 6.0
    assert r2[1]['start'] == 6.0 and r2[1]['end'] == 7.0
    print("Test 2 passed")

    # Test 3: Word exactly at segment start
    t3 = make_transcript(("edge", 10.0, 11.0))
    s3 = [{"start": 10.0, "end": 15.0}]
    r3 = remap_subtitles(t3, s3)['segments'][0]['words']
    assert len(r3) == 1
    assert r3[0]['start'] == 0.0 and r3[0]['end'] == 1.0
    print("Test 3 passed")

    # Test 4: Word exactly at segment end
    t4 = make_transcript(("edge", 4.0, 5.0))
    s4 = [{"start": 0.0, "end": 5.0}]
    r4 = remap_subtitles(t4, s4)['segments'][0]['words']
    assert len(r4) == 1
    assert r4[0]['start'] == 4.0 and r4[0]['end'] == 5.0
    print("Test 4 passed")

    # Test 5: Word outside selected segments
    t5 = make_transcript(("out", 5.1, 6.0))
    s5 = [{"start": 0.0, "end": 5.0}, {"start": 10.0, "end": 15.0}]
    r5 = remap_subtitles(t5, s5)['segments'][0]['words']
    assert len(r5) == 0
    print("Test 5 passed")

    # Test 6: Multiple words spanning a selected segment
    t6 = make_transcript(
        ("straddle_in", 9.6, 10.5), # keeps (mapped to 0.0 - 0.5 because it's clamped to segment start)
        ("straddle_out", 9.4, 10.5) # drops
    )
    s6 = [{"start": 10.0, "end": 15.0}]
    r6 = remap_subtitles(t6, s6)['segments'][0]['words']
    assert len(r6) == 1
    assert r6[0]['word'] == "straddle_in"
    assert round(r6[0]['start'], 2) == 0.0  # clamped from -0.4
    assert round(r6[0]['end'], 2) == 0.5   # 10.5 - 10.0 = 0.5
    print("Test 6 passed")

    # Test 7: Segments out of chronological order
    t7 = make_transcript(("result", 100.0, 101.0), ("demo", 50.0, 51.0))
    # output timeline: result -> demo
    s7 = [{"start": 100.0, "end": 110.0}, {"start": 50.0, "end": 60.0}]
    r7 = remap_subtitles(t7, s7)['segments'][0]['words']
    assert len(r7) == 2
    assert r7[0]['word'] == "result"
    assert r7[0]['start'] == 0.0 and r7[0]['end'] == 1.0
    assert r7[1]['word'] == "demo"
    assert r7[1]['start'] == 10.0 and r7[1]['end'] == 11.0
    print("Test 7 passed")

    # Test 8: Speed ramping
    t8 = make_transcript(("fast", 10.0, 12.0), ("slow", 20.0, 21.0))
    s8 = [{"start": 10.0, "end": 20.0, "speed": 2.0}, {"start": 20.0, "end": 25.0, "speed": 0.5}]
    r8 = remap_subtitles(t8, s8)['segments'][0]['words']
    assert len(r8) == 2
    assert r8[0]['word'] == "fast"
    # orig_rel_start = 0, scaled = 0, final = 0
    # orig_rel_end = 2.0, scaled = 1.0, final = 1.0
    assert r8[0]['start'] == 0.0 and r8[0]['end'] == 1.0
    assert r8[1]['word'] == "slow"
    # starts at orig_rel_start = 0, scaled = 0. segment 2 starts at final_start = 5.0 (since segment 1 duration was 10 / 2 = 5)
    # orig_rel_end = 1.0, scaled = 2.0, final_end = 7.0
    assert r8[1]['start'] == 5.0 and r8[1]['end'] == 7.0
    print("Test 8 passed")

    print("All tests passed successfully!")

if __name__ == "__main__":
    run_tests()
