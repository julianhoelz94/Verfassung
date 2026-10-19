FROM caddy:2.9
RUN apk add --no-cache python3
COPY Caddyfile /etc/caddy/Caddyfile
COPY transport.py /usr/local/bin/atlas-transport.py
ENTRYPOINT ["python3", "/usr/local/bin/atlas-transport.py"]
