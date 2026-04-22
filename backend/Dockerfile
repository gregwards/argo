FROM python:3.12-slim

WORKDIR /app

# System dependencies for audio processing (daily-python, pipecat audio filters)
RUN apt-get update && apt-get install -y \
    gcc \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN chmod +x start.sh

EXPOSE 8000

CMD ["sh", "-c", "./start.sh"]
