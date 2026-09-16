FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py agent.py db.py ./

EXPOSE 8000

# --proxy-headers/--forwarded-allow-ips=* trust X-Forwarded-For from
# nginx.conf's proxy_pass so main.py's per-client-IP rate limiter sees real
# client IPs instead of the nginx container's -- safe only because
# docker-compose.yml exposes this port to the internal network alone (no
# host port mapping), so nginx is the only thing that can ever call it.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*"]
