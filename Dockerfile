# 1. Build React App
FROM node:20-slim AS frontend-builder
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build

# 2. Run Python Server
FROM python:3.11-slim
WORKDIR /app

# Install system dependencies (ffmpeg is needed for librosa/yt-dlp)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy backend code and built frontend
COPY backend/ ./backend/
COPY --from=frontend-builder /app/dist ./dist

# Default port
ENV PORT 8123
EXPOSE 8123

# Start the server
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port $PORT"]
