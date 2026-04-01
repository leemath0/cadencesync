import sys
import os
from dotenv import load_dotenv

# Add the current directory to path so we can import main
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

from main import get_spotify_bpm

def test_query(title, artist):
    print(f"\n====================================")
    print(f"Testing => Title: '{title}', Artist: '{artist}'")
    bpm = get_spotify_bpm(title, artist)
    if bpm is not None:
        print(f"✅ Success! BPM: {bpm}")
    else:
        print(f"❌ Failed to find BPM")

if __name__ == "__main__":
    test_cases = [
        ("VVS (Feat. JUSTHIS) (Prod. GroovyRoom)", "Mirani, Munchman, Khundi Panda, MUSHVENOM"),
        ("MIC Drop (Steve Aoki Remix) [Full Length Edition]", "BTS"),
        ("Shivers", "Ed Sheeran"),
        ("Supernova - Official Audio", "aespa")
    ]
    
    for t, a in test_cases:
        test_query(t, a)
