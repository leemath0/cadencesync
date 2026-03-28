import librosa
import yt_dlp
import os
import glob
import uuid

def test_analyze(url):
    uniq_id = str(uuid.uuid4())[:8]
    out_tmpl = f"test_temp_{uniq_id}.%(ext)s"
    
    ydl_opts = {
        'format': 'bestaudio/best',
        'quiet': False,
        'noplaylist': True,
        'outtmpl': out_tmpl,
        'postprocessors': [{'key': 'FFmpegExtractAudio', 'preferredcodec': 'mp3', 'preferredquality': '192'}],
        'external_downloader': 'ffmpeg',
        'external_downloader_args': ['-ss', '00:00:10', '-t', '00:00:10'],
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
        
        files = glob.glob(f"test_temp_{uniq_id}.*")
        if files:
            path = files[0]
            print(f"File downloaded: {path}")
            y, sr = librosa.load(path, duration=10)
            tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
            bpm = tempo[0] if hasattr(tempo, '__len__') else tempo
            print(f"BPM detected: {bpm}")
            os.remove(path)
            return bpm
        else:
            print("No file downloaded.")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_analyze("https://www.youtube.com/watch?v=dQw4w9WgXcQ") # Rick Roll for testing
