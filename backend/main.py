import os
import sys

# ✅ 한글/일본어 등 유니코드 문자 출력 에러 방지
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import subprocess
import librosa
import yt_dlp
from fastapi import FastAPI, HTTPException, Request, Response, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse
from pydantic import BaseModel
import numpy as np
import uuid
import glob
import musicbrainzngs
import re
import traceback
import json
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2.credentials import Credentials
from dotenv import load_dotenv
import isodate
import requests
from urllib.parse import quote
import spotipy
from spotipy.oauth2 import SpotifyClientCredentials

load_dotenv()

# GetSongBPM API Setup
GETSONGBPM_API_KEY = os.getenv("GETSONGBPM_API_KEY")

# Spotify API Setup (Priority 1)
SPOTIFY_CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID")
SPOTIFY_CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET")

def get_spotify_bpm(title, artist):
    """Fetch BPM from Spotify Audio Features API (Priority 1)"""
    if not SPOTIFY_CLIENT_ID or not SPOTIFY_CLIENT_SECRET:
        print("Spotify API Credentials missing. Skipping...")
        return None
    try:
        import re
        auth_manager = SpotifyClientCredentials(client_id=SPOTIFY_CLIENT_ID, client_secret=SPOTIFY_CLIENT_SECRET)
        sp = spotipy.Spotify(auth_manager=auth_manager)
        
        def clean_text(text):
            # Remove brackets/parentheses contents
            c = re.sub(r'[\(\[].*?[\)\]]', '', text)
            # Remove common suffixes like " - Official Audio"
            c = re.sub(r'(?i)\s*-\s*(official|audio|video|lyric|mv|remaster|radio|edit).*', '', c)
            return c.strip()

        cleaned_title = clean_text(title)
        cleaned_artist = clean_text(artist)
        
        # Test queries from most specific to broadest
        queries = [
            f"track:{title} artist:{artist}",
            f"{title} {artist}",
            f"track:{cleaned_title} artist:{cleaned_artist}",
            f"{cleaned_title} {cleaned_artist}",
            f"{cleaned_title} {artist}",
            f"track:{cleaned_title}",
            f"{cleaned_title}"
        ]
        
        seen_queries = set()
        for q in queries:
            q = q.strip()
            # Avoid redundant searches explicitly
            if not q or q in seen_queries or q == "track: artist:":
                continue
            seen_queries.add(q)
            
            print(f"Spotify Searching: {q}")
            results = sp.search(q=q, limit=1, type='track')
            tracks = results.get('tracks', {}).get('items', [])
            
            if tracks:
                track_id = tracks[0]['id']
                features = sp.audio_features([track_id])
                if features and features[0]:
                    tempo = features[0].get('tempo')
                    if tempo:
                        print(f"Spotify Found: {tempo} BPM (Query: '{q}')")
                        return float(tempo)
                
    except Exception as e:
        print(f"Spotify API error: {e}")
    return None

def get_getsongbpm_bpm(title, artist):
    """Fetch BPM from GetSongBPM API (Priority 2)"""
    if not GETSONGBPM_API_KEY:
        print("GetSongBPM API Key missing. Skipping...")
        return None
    try:
        url = "https://api.getsong.co/search/"
        # Use title only for lookup as combining artist sometimes causes 'Bad query'
        params = {
            "api_key": GETSONGBPM_API_KEY,
            "type": "song",
            "lookup": title
        }
        
        print(f"GetSongBPM Searching: {title} (Artist: {artist})")
        response = requests.get(url, params=params, timeout=10)
        
        if response.status_code != 200:
            return None
            
        data = response.json()
        
        # API often returns a list under the 'search' key
        search_results = data.get('search', [])
        if search_results and isinstance(search_results, list) and len(search_results) > 0:
            tempo = search_results[0].get('tempo')
            if tempo:
                print(f"GetSongBPM Found: {tempo}")
                return float(tempo)
    except Exception as e:
        print(f"GetSongBPM API error: {e}")
    return None

# Session file path
SESSIONS_FILE = "sessions.json"

def load_sessions():
    if os.path.exists(SESSIONS_FILE):
        try:
            with open(SESSIONS_FILE, "r") as f:
                return json.load(f)
        except:
            return {}
    return {}

def save_sessions(sessions):
    with open(SESSIONS_FILE, "w") as f:
        json.dump(sessions, f)

user_credentials = load_sessions()

# BPM Cache file path
BPM_CACHE_FILE = "bpm_cache.json"

def load_bpm_cache():
    if os.path.exists(BPM_CACHE_FILE):
        try:
            with open(BPM_CACHE_FILE, "r") as f:
                return json.load(f)
        except:
            return {}
    return {}

def save_bpm_cache(cache):
    try:
        with open(BPM_CACHE_FILE, "w") as f:
            json.dump(cache, f)
    except Exception as e:
        print(f"Error saving BPM cache: {e}")

bpm_cache = load_bpm_cache()

# --- OAuth Refinement (Store verifiers to fix PKCE issue) ---
oauth_states = {} # {state: code_verifier}

# Local test settings
os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'

# MusicBrainz init
musicbrainzngs.set_useragent("CadenceSync", "1.0.0", "https://github.com/leemath0/cadencesync")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class AnalyzeRequest(BaseModel):
    url: str
    title: str = None
    artist: str = None

class YouTubeManager:
    """Class to manage YouTube Data API v3"""
    def __init__(self, credentials):
        self.youtube = build('youtube', 'v3', credentials=credentials)

    def get_user_playlists(self):
        request = self.youtube.playlists().list(
            part="snippet,contentDetails",
            mine=True,
            maxResults=50
        )
        return request.execute()

    def create_playlist(self, title, description=""):
        request = self.youtube.playlists().insert(
            part="snippet,status",
            body={
                "snippet": {
                    "title": title,
                    "description": description
                },
                "status": {
                    "privacyStatus": "private"
                }
            }
        )
        return request.execute()

    def add_video_to_playlist(self, playlist_id, video_id):
        request = self.youtube.playlistItems().insert(
            part="snippet",
            body={
                "snippet": {
                    "playlistId": playlist_id,
                    "resourceId": {
                        "kind": "youtube#video",
                        "videoId": video_id
                    }
                }
            }
        )
        return request.execute()

# --- OAuth Configuration ---
CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:5173/auth/callback")
SCOPES = [
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/youtube'
]

def parse_duration(duration_str):
    """Parse ISO 8601 duration string (PT3M45S) to seconds"""
    try:
        dur = isodate.parse_duration(duration_str)
        return int(dur.total_seconds())
    except:
        return 0


def get_video_id(url):
    """Extract Video ID from YouTube URL"""
    patterns = [
        r'(?:v=|\/)([0-9A-Za-z_-]{11}).*',
        r'(?:embed\/|v\/|youtu.be\/)([0-9A-Za-z_-]{11})'
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None

@app.get("/api/youtube/playlists")
async def get_playlists(session_id: str = Header(None)):
    """Fetch user's playlists"""
    if not session_id or session_id not in user_credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    creds_data = user_credentials[session_id]
    creds = Credentials(**creds_data)
    
    # Check and refresh tokens
    if creds.expired and creds.refresh_token:
        creds.refresh(GoogleRequest())
        user_credentials[session_id].update({
            'token': creds.token,
            'refresh_token': creds.refresh_token
        })
        save_sessions(user_credentials)
    
    manager = YouTubeManager(creds)
    try:
        playlists = manager.get_user_playlists()
        return playlists
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/youtube/playlists/{playlist_id}/tracks")
async def get_playlist_tracks(playlist_id: str, session_id: str = Header(None)):
    """Fetch tracks from a specific playlist (Official API version)"""
    # 1. Determine if we use User Creds or Public API Key
    youtube_client = None
    if session_id and session_id in user_credentials:
        creds_data = user_credentials[session_id]
        creds = Credentials(**creds_data)
        
        # Token refresh logic
        if creds.expired and creds.refresh_token:
            creds.refresh(GoogleRequest())
            user_credentials[session_id].update({
                'token': creds.token,
                'refresh_token': creds.refresh_token
            })
            save_sessions(user_credentials)
        
        youtube_client = build('youtube', 'v3', credentials=creds)
    else:
        # Fallback to Public API Key if provided in environment
        api_key = os.getenv("YOUTUBE_API_KEY")
        if not api_key:
            # If no API Key, we might still try yt-dlp for just the basics,
            # but for now let's require either a session or an API Key.
            raise HTTPException(status_code=401, detail="Authentication required or provide a YouTube API Key for public playlists")
        youtube_client = build('youtube', 'v3', developerKey=api_key)

    try:
        # 0. Fetch playlist metadata for title
        plist_request = youtube_client.playlists().list(
            part="snippet",
            id=playlist_id
        )
        plist_response = plist_request.execute()
        playlist_title = "Sync Playlist"
        if plist_response.get('items'):
            playlist_title = plist_response['items'][0]['snippet'].get('title', playlist_title)

        # 1. Fetch playlist items
        request = youtube_client.playlistItems().list(
            part="snippet,contentDetails",
            playlistId=playlist_id,
            maxResults=50
        )
        response = request.execute()
        
        items = response.get('items', [])
        if not items:
            return {"title": playlist_title, "tracks": []}

        # 2. Extract video IDs for batch lookup
        video_ids = [item['contentDetails']['videoId'] for item in items]
        
        # 3. Batch lookup for video durations and details
        video_request = youtube_client.videos().list(
            part="contentDetails,snippet",
            id=",".join(video_ids)
        )
        video_response = video_request.execute()
        
        video_details = {v['id']: v for v in video_response.get('items', [])}
        
        tracks = []
        for item in items:
            # ... (rest of processing same)
            v_id = item['contentDetails']['videoId']
            snippet = item.get('snippet', {})
            details = video_details.get(v_id, {})
            
            thumbs = details.get('snippet', {}).get('thumbnails', {}) or snippet.get('thumbnails', {})
            thumb_url = thumbs.get('high', {}).get('url') or thumbs.get('medium', {}).get('url') or thumbs.get('default', {}).get('url')
            
            duration_iso = details.get('contentDetails', {}).get('duration', 'PT0S')
            duration_sec = parse_duration(duration_iso)

            tracks.append({
                'id': v_id,
                'title': snippet.get('title'),
                'thumbnail': thumb_url,
                'artist': details.get('snippet', {}).get('channelTitle', snippet.get('videoOwnerChannelTitle', 'Unknown')),
                'duration': duration_sec,
                'url': f"https://www.youtube.com/watch?v={v_id}"
            })
        return {"title": playlist_title, "tracks": tracks}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/auth/url")
async def get_auth_url():
    """Return Google OAuth Authorization URL"""
    if not CLIENT_ID or not CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Google API Credentials not configured.")
    
    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": CLIENT_ID,
                "client_secret": CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        },
        scopes=SCOPES
    )
    flow.redirect_uri = REDIRECT_URI
    
    authorization_url, state = flow.authorization_url(
        access_type='offline',
        include_granted_scopes='true',
        prompt='consent'
    )
    
    # Store code_verifier associated with state (Needed for PKCE / fetch_token)
    if hasattr(flow, 'code_verifier'):
        oauth_states[state] = flow.code_verifier
        
    return {"url": authorization_url}

@app.post("/api/auth/callback")
async def auth_callback(payload: dict):
    """Process OAuth callback and exchange tokens"""
    code = payload.get("code")
    if not code:
        raise HTTPException(status_code=400, detail="Code missing")

    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": CLIENT_ID,
                "client_secret": CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        },
        scopes=SCOPES
    )
    flow.redirect_uri = REDIRECT_URI
    
    print(f"DEBUG: Using REDIRECT_URI: {REDIRECT_URI}")
    print(f"DEBUG: Received code: {code[:10]}...")
    
    # Retrieve stored verifier for this state if it exists (Optional state param in payload)
    state = payload.get("state")
    code_verifier = oauth_states.get(state) if state else None

    # Fetch token with verifier if we have it
    try:
        if code_verifier:
            flow.fetch_token(code=code, code_verifier=code_verifier)
        else:
            # Fallback for flows without PKCE or if verifier is missing
            flow.fetch_token(code=code)
    except Exception as e:
        print(f"DEBUG: Auth Error: {str(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=401, detail=f"Authentication failed: {str(e)}")
    
    creds = flow.credentials
    user_cred_data = {
        'token': creds.token,
        'refresh_token': creds.refresh_token,
        'token_uri': creds.token_uri,
        'client_id': creds.client_id,
        'client_secret': creds.client_secret,
        'scopes': creds.scopes
    }
    
    session_id = str(uuid.uuid4())
    user_credentials[session_id] = user_cred_data
    save_sessions(user_credentials)
    
    return {"session_id": session_id, "user_info": {"name": "YouTube User"}}


@app.post("/api/youtube/sync")
async def sync_to_youtube(payload: dict):
    session_id = payload.get("session_id")
    playlist_id = payload.get("playlist_id")
    video_url = payload.get("video_url")
    
    if session_id not in user_credentials:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    video_id = get_video_id(video_url)
    if not video_id:
        raise HTTPException(status_code=400, detail="Invalid YouTube URL")

    creds = Credentials(**user_credentials[session_id])
    manager = YouTubeManager(creds)
    try:
        return manager.add_video_to_playlist(playlist_id, video_id)
    except Exception as e:
        error_msg = str(e)
        print(f"YouTube Sync Error: {error_msg}")
        return {"error": error_msg, "status": "failed"}

@app.post("/api/playlist")
async def get_playlist(request: AnalyzeRequest):
    """Analyze playlist structure and return track info"""
    ydl_opts = {
        'extract_flat': True,
        'quiet': True,
        'no_warnings': True,
        'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'geo_bypass': True,
        'nocheckcertificate': True,
        'ignoreerrors': True,
        'playlist_items': '1-100', # Limit to first 100 items for stability
        'extractor_args': {'youtube': {'player_client': ['android', 'web']}},
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # First, check if it's a playlist or a single video
            try:
                raw_info = ydl.extract_info(request.url, download=False)
            except Exception as e:
                print(f"yt-dlp extraction error: {e}")
                raise HTTPException(status_code=400, detail=f"YouTube extraction failed: {str(e)}")

            if not raw_info:
                print("yt-dlp returned no info for URL")
                raise HTTPException(status_code=400, detail="Could not find any info for the provided URL. Make sure the playlist is Public or Unlisted.")

            entries = []
            
            def get_thumb(e):
                t = e.get('thumbnail', '')
                if not t and e.get('thumbnails'):
                    # Check if list is not empty before accessing [-1]
                    thumbs = e.get('thumbnails', [])
                    if thumbs:
                        t = thumbs[-1].get('url', '')
                return t

            # Handle both playlists and single video results
            raw_entries = raw_info.get('entries', [])
            if raw_entries:
                for idx, e in enumerate(raw_entries):
                    if e:
                        v_id = e.get('id') or get_video_id(e.get('url', ''))
                        if not v_id: continue
                        
                        entries.append({
                            'id': v_id,
                            'title': e.get('title') or 'Unknown Title',
                            'artist': e.get('uploader') or e.get('channel') or 'Unknown Artist',
                            'url': f"https://www.youtube.com/watch?v={v_id}",
                            'thumbnail': get_thumb(e)
                        })
            else:
                # Single video info
                v_id = raw_info.get('id') or get_video_id(request.url)
                if v_id:
                    entries.append({
                        'id': v_id,
                        'title': raw_info.get('title') or 'Unknown Title',
                        'artist': raw_info.get('uploader') or raw_info.get('channel') or 'Unknown Artist',
                        'url': request.url,
                        'thumbnail': get_thumb(raw_info)
                    })
                
            if not entries:
                raise HTTPException(status_code=400, detail="No tracks found in the provided URL")

            playlist_title = raw_info.get('title') or 'Target Playlist'
            return {"title": playlist_title, "tracks": entries}
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Backend processing error: {str(e)}")

# 1. Popular songs mapping (ID based takes priority)
popular_map = {
    # Video ID based mappings
    "0_Y78Bv6G3o": 165, # Digimon Butter-Fly (User preference)
    "70pYp6In4iQ": 165, # Butterfly (Wada Kouji) - Sync both to 165
    "dQw4w9WgXcQ": 110, # Never Gonna Give You Up (Test)
    
    # Keyword based mappings
    "super shy": 150, "hype boy": 100, "ditto": 110, "omg": 127, 
    "attention": 105, "eta": 135, "cool with you": 120, "new jeans": 105,
    "gods": 150, "cookie": 157, "hurt": 130, "blue": 110, "asap": 120,
    "get up": 100, "bubble gum": 110, "how sweet": 115,
    "seven": 125, "dynamite": 114, "butter": 110, "idol": 126, "boy with luv": 120,
    "drama": 122, "supernova": 124, "armageddon": 125, "savage": 147, "next level": 109,
    "magnetic": 131, "sheesh": 140, "batter up": 100,
    "smart": 113, "perfect night": 110, "unforgiven": 104, "antifragile": 105,
    "butter-fly": 165, "butterfly": 165,
    "kick back": 170, "idol": 166, "bling-bang-bang-born": 160
}
    
def get_bpm_fallback(title, artist, video_id=None):
    """BPM priority: 1. Spotify, 2. GetSongBPM, 3. Popular Map, 4. MusicBrainz, 5. librosa"""
    safe_title = title.encode('utf-8', errors='replace').decode('utf-8')
    safe_artist = artist.encode('utf-8', errors='replace').decode('utf-8')
    print(f"BPM Search Hierarchy for: {safe_title} by {safe_artist}")
    
    # 1. Spotify Audio Features API (Priority 1)
    spotify_bpm = get_spotify_bpm(title, artist)
    if spotify_bpm:
        return spotify_bpm

    # 2. GetSongBPM API (Priority 2)
    getsongbpm_bpm = get_getsongbpm_bpm(title, artist)
    if getsongbpm_bpm:
        return getsongbpm_bpm

    # 3. Popular songs mapping (Priority 3) - ID based then Keyword
    if video_id and video_id in popular_map:
        print(f"Direct ID match success: {video_id} -> {popular_map[video_id]}")
        return popular_map[video_id]

    search_q = f"{title} {artist}".lower()
    for key, bpm in popular_map.items():
        # Skip video IDs (11 chars, no spaces) for keyword matching
        if len(key) == 11 and " " not in key:
            continue
        if key in search_q:
            print(f"Intelligent keyword match success: {key} -> {bpm}")
            return bpm

    # 4. MusicBrainz API search (Priority 4)
    try:
        query = f'recording:"{title}" AND artist:"{artist}"'
        result = musicbrainzngs.search_recordings(query=query, limit=3)
        for rec in result.get('recording-list', []):
            bpm = rec.get('bpm')
            if bpm:
                return float(bpm)
    except Exception as e:
        print(f"MusicBrainz search error: {e}")
        
    return None

@app.post("/api/analyze")
async def analyze_track(request: AnalyzeRequest, response: Response):
    """Analyze a single track (Cache -> File -> Fallback -> Random)"""
    v_id = get_video_id(request.url)
    
    # 0. Check Cache First
    if v_id and v_id in bpm_cache:
        print(f"BPM Cache Hit: {v_id}")
        res = bpm_cache[v_id].copy()
        res['cached'] = True
        return res

    uniq_id = str(uuid.uuid4())[:8]
    out_tmpl = f"temp_{uniq_id}.%(ext)s"
    info = None
    
    ydl_opts = {
        'format': 'bestaudio/best',
        'quiet': True,
        'noplaylist': True,
        'outtmpl': out_tmpl,
        'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'geo_bypass': True,
        'nocheckcertificate': True,
        'http_headers': {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-us,en;q=0.5',
            'Sec-Fetch-Mode': 'navigate',
        },
        'extractor_args': {'youtube': {'player_client': ['android', 'web']}},
        'postprocessors': [{'key': 'FFmpegExtractAudio', 'preferredcodec': 'mp3', 'preferredquality': '128'}],
        'external_downloader': 'ffmpeg',
        # Default sampling window, will be overridden
        'external_downloader_args': ['-t', '00:00:20', '-loglevel', 'error'],
    }
    
    title = request.title or "Unknown"
    artist = request.artist or "Unknown"
    
    try:
        # 1. Info extraction
        try:
            with yt_dlp.YoutubeDL({'quiet': True, 'nocheckcertificate': True}) as ydl:
                info = ydl.extract_info(request.url, download=False)
                if info:
                    title = info.get('title', title)
                    artist = info.get('uploader', artist)
        except Exception as e:
            print(f"Info extraction failed for {request.url}: {e}")
            
        safe_title = title.encode('utf-8', errors='replace').decode('utf-8')
        print(f"Analyzing Track: {safe_title}")
        
        # 1.5. Check Priority Fallback (Popular Map / MusicBrainz)
        v_id = get_video_id(request.url)
        fallback_bpm = get_bpm_fallback(title, artist, v_id)
        if fallback_bpm:
            print(f"Priority fallback successful: {fallback_bpm} BPM")
            return {"bpm": round(fallback_bpm), "firstBeatOffset": 0.0, "note": "priority fallback", "title": title}

        # 2. Download and Analyze (Reduced-point sampling for stability on Render)
        duration = info.get('duration', 0) if info else 0
        if duration == 0: duration = 240 # Fallback
        
        # Sample points: 10s and mid-point (Reduced from 4 points to 2 to save memory)
        sample_pts = [10, int(duration * 0.5)]
        detected_bpms = []
        detected_beat_times = [] 
        
        for idx, start_sec in enumerate(sample_pts):
            temp_file = f"temp_{uniq_id}_{idx}.mp3"
            c_ydl_opts = ydl_opts.copy()
            c_ydl_opts['outtmpl'] = temp_file
            sample_dur = 20
            c_ydl_opts['external_downloader_args'] = ['-ss', str(start_sec), '-t', f'00:00:{sample_dur}', '-loglevel', 'error']
            
            try:
                with yt_dlp.YoutubeDL(c_ydl_opts) as ydl:
                    ydl.download([request.url])
                
                if os.path.exists(temp_file):
                    y, sr = librosa.load(temp_file, sr=22050)
                    # Harmonic-Percussive Source Separation
                    _, y_percussive = librosa.effects.hpss(y)
                    
                    # Beat tracking with 50-250 BPM priority
                    bpm_val, beat_frames = librosa.beat.beat_track(y=y_percussive, sr=sr, start_bpm=120, tightness=100)
                    
                    # Ensure bpm_val is a float
                    if isinstance(bpm_val, np.ndarray):
                        bpm_val = float(bpm_val[0])
                    else:
                        bpm_val = float(bpm_val)
                        
                    detected_bpms.append(bpm_val)
                    
                    if len(beat_frames) > 0:
                        # Convert beat frames to absolute times
                        times = librosa.frames_to_time(beat_frames, sr=sr)
                        for t in times:
                            detected_beat_times.append(start_sec + t)
                            
                    os.remove(temp_file)
            except Exception as e:
                print(f"Sample {idx} failed: {e}")
                if os.path.exists(temp_file): os.remove(temp_file)

        if detected_bpms:
            # --- Grid-Fitting Refinement ---
            # Initial estimate
            initial_bpm = float(np.median(detected_bpms))
            beat_duration_est = 60.0 / initial_bpm
            
            best_bpm = initial_bpm
            best_offset = 0.0
            min_error = float('inf')
            
            # Search around the estimate (+/- 2% or +/- 5 BPM)
            search_range = np.arange(initial_bpm * 0.98, initial_bpm * 1.02, 0.05)
            
            for test_bpm in search_range:
                dur = 60.0 / test_bpm
                # For this BPM, find the best offset by testing multiple phases
                # Or use the median of (beat % dur) as a candidate offset
                potential_offsets = [bt % dur for bt in detected_beat_times]
                # Test a few candidate offsets (median, and spread)
                test_offsets = [float(np.median(potential_offsets))]
                
                for off in test_offsets:
                    error = 0.0
                    for bt in detected_beat_times:
                        # Distance to nearest beat on the grid
                        diff = (bt - off + dur/2) % dur - dur/2
                        error += diff * diff
                    
                    if error < min_error:
                        min_error = error
                        best_bpm = test_bpm
                        best_offset = off

            final_bpm = float(best_bpm)
            final_offset = float(best_offset)

            # --- Validation (Priority 4: librosa is last resort, filter by range) ---
            if 50 <= final_bpm <= 250:
                print(f"Grid-Fitting Success: {final_bpm:.4f} BPM, Offset: {final_offset:.4f}s (Error: {min_error:.4f})")
                
                result = {
                    "bpm": final_bpm, 
                    "firstBeatOffset": final_offset,
                    "samples": [float(b) for b in detected_bpms], 
                    "title": title,
                    "confidence": 1.0 / (1.0 + min_error / len(detected_beat_times)) if detected_beat_times else 0.0,
                    "cached": False
                }

                # Save to cache
                if v_id:
                    bpm_cache[v_id] = result
                    save_bpm_cache(bpm_cache)
                    
                return result
            else:
                print(f"librosa BPM out of range (50-250): {final_bpm}. Discarding analysis.")
            
    except Exception as e:
        error_msg = str(e)
        print(f"Analysis failed for {title}: {error_msg}")
        response.status_code = 500
        return {"bpm": 0, "firstBeatOffset": 0.0, "note": f"Error: {error_msg}", "title": title}

    finally:
        # Final cleanup for any leaked temp files from this run
        for f in glob.glob(f"temp_{uniq_id}*"):
            try:
                os.remove(f)
            except:
                pass

    # 3. Final Fallback (Random BPM between 120-130)
    import random
    final_fallback = float(random.randint(120, 130))
    print(f"Applied fallback random BPM: {final_fallback}")
    return {"bpm": final_fallback, "firstBeatOffset": 0.0, "note": "fallback used"}

dist_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "dist")

@app.get("/health")
async def health_check():
    return {"status": "ok"}

if os.path.exists(dist_path):
    app.mount("/", StaticFiles(directory=dist_path, html=True), name="static")
    @app.exception_handler(404)
    async def not_found_handler(request, exc):
        return FileResponse(os.path.join(dist_path, "index.html"))

if __name__ == "__main__":
    import uvicorn
    # Use 127.0.0.1 explicitly for local testing on Windows
    uvicorn.run(app, host="127.0.0.1", port=8123)
