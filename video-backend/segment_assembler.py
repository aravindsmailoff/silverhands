import os
import subprocess
import tempfile
import time

from ffmpeg_utils import video_encode_args, audio_encode_args, QUALITY, METADATA_SCRUB
import reframe_v2

def _run_cmd(cmd):
    """Helper to run a subprocess command and print it."""
    print(f"   Running: {' '.join(cmd)}")
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)

def build_intermediate_video(input_video, segments, output_path):
    """
    Extracts multiple segments from input_video, concatenates them, and applies global loudnorm.
    """
    print(f"🎬 Building intermediate video from {len(segments)} segments...")
    workdir = tempfile.mkdtemp(prefix="silverhands_")
    segment_paths = []
    
    try:
        # Step 1: Extract
        for idx, seg in enumerate(segments):
            start = seg['start']
            end = seg['end']
            dur = end - start
            speed = seg.get('speed', 1.0)
            seg_path = os.path.join(workdir, f"seg_{idx:03d}.mp4")
            
            print(f"   ✂️ Extracting segment {idx+1}/{len(segments)} ({start}s -> {end}s, speed={speed}x)")
            cmd = [
                "ffmpeg", "-y", "-loglevel", "error",
                "-ss", str(start), "-t", str(dur), "-i", input_video
            ]
            
            if speed != 1.0:
                video_filter = f"setpts={(1.0 / speed):.4f}*PTS"
                audio_filter = f"atempo={speed:.4f}"
                cmd.extend(["-filter:v", video_filter, "-filter:a", audio_filter])
                
            cmd.extend([
                *video_encode_args(QUALITY),
                "-c:a", "aac", # DO NOT apply loudnorm per segment
                seg_path
            ])
            _run_cmd(cmd)
            segment_paths.append(seg_path)
            
        # Step 2 & 3: Concatenate and Global Loudnorm
        list_path = os.path.join(workdir, "concat.txt")
        with open(list_path, "w") as f:
            for p in segment_paths:
                f.write(f"file '{p}'\n")
                
        print(f"   🔗 Concatenating {len(segment_paths)} segments and applying global loudnorm...")
        concat_cmd = [
            "ffmpeg", "-y", "-loglevel", "error",
            "-f", "concat", "-safe", "0", "-i", list_path,
            "-c:v", "copy",
            *audio_encode_args(), # Applies loudnorm=I=-14:TP=-2.0:LRA=11 globally
            *METADATA_SCRUB,
            output_path
        ]
        _run_cmd(concat_cmd)
        print(f"   ✅ Intermediate video saved to {output_path}")
        
    finally:
        import shutil
        shutil.rmtree(workdir, ignore_errors=True)
        
    return output_path

if __name__ == "__main__":
    import sys
    import subtitles
    from subtitle_remapper import remap_subtitles

    # Hardcoded test
    # Find a valid test video in the directory.
    test_video = None
    for file in os.listdir("."):
        if file.endswith(".mp4") and "intermediate" not in file and "final" not in file:
            test_video = file
            break
            
    if not test_video:
        print("❌ No test video found in current directory.")
        sys.exit(1)
        
    print(f"🎥 Using test video: {test_video}")
    
    segments = [
        {"role": "intro", "start": 12.0, "end": 21.8},
        {"role": "demonstration", "start": 64.7, "end": 81.6, "speed": 1.5},
        {"role": "result", "start": 139.8, "end": 151.9}
    ]
    
    intermediate_path = "silverhands_intermediate.mp4"
    final_output_path = "silverhands_final.mp4"
    final_subtitled_path = "silverhands_final_with_subs.mp4"
    subs_path = "subs.ass"
    
    t0 = time.time()
    build_intermediate_video(test_video, segments, intermediate_path)
    
    # Check intermediate duration
    result = subprocess.run(["ffprobe", "-v", "error", "-show_entries",
                             "format=duration", "-of",
                             "default=noprint_wrappers=1:nokey=1", intermediate_path],
                            stdout=subprocess.PIPE, text=True)
    duration = float(result.stdout.strip())
    print(f"   ⏱️ Intermediate Duration: {duration:.2f}s (Expected ~38.8s)")
    
    print("\n🚀 Passing intermediate video to existing reframe_v2...")
    aspect_ratio = 9/16
    reframe_v2.render(intermediate_path, final_output_path, aspect_ratio)
    
    print("\n📝 Transcribing original video...")
    import json; transcript = json.load(open('dummy_transcript.json'))

    print("\n🔄 Remapping subtitles...")
    remapped_transcript = remap_subtitles(transcript, segments)
    
    print("\n💾 Generating ASS file...")
    style_kwargs = dict(subtitles.AUTO_CAPTION_STYLE)
    style_kwargs.pop('style', None)
    if 'font_size' in style_kwargs:
        style_kwargs['fontsize'] = style_kwargs.pop('font_size')

    subtitles.generate_ass(
        remapped_transcript, 
        0, 
        duration, 
        subs_path,
        **style_kwargs
    )
    
    print("\n🔥 Burning subtitles...")
    burn_kwargs = {k: v for k, v in style_kwargs.items() if k in ['alignment', 'fontsize', 'font_name', 'font_color', 'border_color', 'border_width', 'bg_color', 'bg_opacity']}
    subtitles.burn_subtitles(
        final_output_path, 
        subs_path, 
        final_subtitled_path,
        **burn_kwargs
    )

    print(f"\n🎉 Test complete in {time.time() - t0:.1f}s")
    print(f"Intermediate: {intermediate_path}")
    print(f"Final: {final_subtitled_path}")
