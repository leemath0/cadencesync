import librosa
import numpy as np
import os
import yt_dlp
import traceback

def analyze_track_test(url):
    print(f"Testing URL: {url}")
    # 1. Info extraction
    ydl_opts_info = {'quiet': True, 'nocheckcertificate': True}
    with yt_dlp.YoutubeDL(ydl_opts_info) as ydl:
        try:
            info = ydl.extract_info(url, download=False)
            duration = info.get('duration', 0)
            title = info.get('title', 'Unknown')
            print(f"Title: {title}, Duration: {duration}s")
        except Exception as e:
            print(f"Extraction failed: {e}")
            return None

    # 2. Multi-point sampling
    if duration == 0: duration = 240
    sample_pts = [int(duration * 0.3), int(duration * 0.5), int(duration * 0.7)]
    detected_bpms = []
    
    ydl_opts_dl = {
        'format': 'bestaudio/best',
        'postprocessors': [{'key': 'FFmpegExtractAudio', 'preferredcodec': 'mp3', 'preferredquality': '128'}],
        'external_downloader': 'ffmpeg',
        'quiet': True,
        'nocheckcertificate': True
    }
    
    for idx, start_sec in enumerate(sample_pts):
        temp_file_base = f"test_sample_{idx}"
        temp_file = f"{temp_file_base}.mp3"
        c_opts = ydl_opts_dl.copy()
        c_opts['outtmpl'] = temp_file_base
        c_opts['external_downloader_args'] = ['-ss', str(start_sec), '-t', '00:00:15', '-loglevel', 'error']
        
        try:
            with yt_dlp.YoutubeDL(c_opts) as ydl:
                ydl.download([url])
            
            if os.path.exists(temp_file):
                y, sr = librosa.load(temp_file, sr=22050)
                _, y_perc = librosa.effects.hpss(y)
                # Use librosa.beat.tempo (v0.11 compatibility)
                tempo = librosa.beat.tempo(y=y_perc, sr=sr)
                bpm_val = float(tempo[0])
                detected_bpms.append(bpm_val)
                os.remove(temp_file)
        except Exception as e:
            print(f"Sample {idx} failed: {e}")
            if os.path.exists(temp_file): os.remove(temp_file)

    if detected_bpms:
        final_bpm = np.median(detected_bpms)
        print(f"Detected BPMs: {detected_bpms}")
        print(f"Final Median BPM: {final_bpm:.2f}")
        return final_bpm
    return None

test_tracks = [
    "https://music.youtube.com/watch?v=ucE3CgJBGNE",
    "https://music.youtube.com/watch?v=QYG7_HrTD8I",
    "https://music.youtube.com/watch?v=VhEoCOWUtcU"
]

for t in test_tracks:
    analyze_track_test(t)
    print("-" * 20)
