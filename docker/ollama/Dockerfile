# Ollama with the model of the Judge inside the image, so the lab network does not need the
# internet and the attendees download it once with docker compose pull.
# Build context: docker/ollama.
FROM ollama/ollama:0.40.13 AS model

ARG MODEL=llama3.2:3b
# The digest that Ollama shows for the model of the benchmark (experiments/models). If the
# registry serves something else under the same tag, the build fails.
ARG MODEL_ID=a80c4f17acd5
ENV OLLAMA_MODELS=/models

RUN ollama serve >/tmp/serve.log 2>&1 & \
    until ollama list >/dev/null 2>&1; do sleep 1; done \
 && ollama pull "$MODEL" \
 && ollama list | awk -v m="$MODEL" '$1 == m { print $2 }' | grep -qx "$MODEL_ID" \
 || { echo "$MODEL is not $MODEL_ID"; ollama list; exit 1; }

# The official image carries the CUDA libraries, about 3.6 GB, that a CPU in Docker does not use
RUN rm -rf /usr/lib/ollama/cuda_*

# The final image keeps the binary, the CPU libraries and the model on the same Ubuntu
FROM ubuntu:noble-20260930.1

COPY --from=model /usr/bin/ollama /usr/bin/ollama
COPY --from=model /usr/lib/ollama /usr/lib/ollama
COPY --from=model /models /models

# OLLAMA_NO_CLOUD: the lab network has no internet, so no lookups on ollama.com
ENV OLLAMA_HOST=0.0.0.0:11434 OLLAMA_MODELS=/models OLLAMA_NO_CLOUD=1
USER ubuntu
EXPOSE 11434
HEALTHCHECK --interval=2s --timeout=2s --retries=15 CMD ["ollama", "list"]
ENTRYPOINT ["/usr/bin/ollama"]
CMD ["serve"]
