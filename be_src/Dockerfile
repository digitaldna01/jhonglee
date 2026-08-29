FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download the retrieval embedding model so the Pi never pulls model
# weights at runtime. EMBED_MODEL becomes the runtime default too, so the
# baked model and app/core/config.py cannot drift.
ARG EMBED_MODEL=Xenova/paraphrase-multilingual-MiniLM-L12-v2-q8
ENV EMBED_MODEL=${EMBED_MODEL}
COPY app/chat/embedding.py app/chat/embedding.py
RUN python app/chat/embedding.py "${EMBED_MODEL}"

COPY alembic.ini docker-entrypoint.sh ./
COPY migrations ./migrations
COPY app ./app

EXPOSE 8000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
