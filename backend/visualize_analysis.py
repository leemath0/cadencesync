import librosa
import librosa.display
import matplotlib.pyplot as plt
import numpy as np
import os
import glob

def visualize_analysis(audio_file="temp.wav"):
    if not os.path.exists(audio_file):
        print(f"File {audio_file} not found.")
        return

    print(f"Visualizing: {audio_file}")

    # Load entire audio (for 1m-2m count)
    y, sr = librosa.load(audio_file)
    duration = librosa.get_duration(y=y, sr=sr)
    
    # Simple beat tracking
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    tempo, beats = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr)
    beat_times = librosa.frames_to_time(beats, sr=sr)

    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(14, 10))
    
    # 1. Overview (0-60s or full)
    librosa.display.waveshow(y, sr=sr, alpha=0.5, ax=ax1)
    ax1.vlines(beat_times, -1, 1, color='r', linestyle='--', alpha=0.3, label='Beats')
    ax1.set_title(f"Full Overview (Duration: {duration:.1f}s)")
    ax1.set_xlim(0, min(duration, 60))
    ax1.legend()

    # 2. Focus Window (60s - 120s or end)
    if duration > 60:
        win_start = 60
        win_end = min(120, duration)
        beats_in_win = [b for b in beat_times if win_start <= b <= win_end]
        
        librosa.display.waveshow(y, sr=sr, alpha=0.5, ax=ax2)
        ax2.vlines(beat_times, -1, 1, color='g', linestyle='-', label=f'Beats in window ({len(beats_in_win)})')
        ax2.set_xlim(win_start, win_end)
        ax2.set_title(f"Focus Window: 1m to 2m (Detected Beats: {len(beats_in_win)})")
        ax2.legend()
    else:
        ax2.text(0.5, 0.5, "Audio shorter than 60s - No window available", ha='center')

    plt.tight_layout()
    output_path = "analysis_result.png"
    plt.savefig(output_path)
    print(f"Saved visualization to {output_path}")

if __name__ == "__main__":
    visualize_analysis()
