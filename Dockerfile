FROM node:22-bullseye

RUN apt-get update && apt-get install -y \
    ffmpeg \
    build-essential \
    python3 \
    python3-pip \
    net-tools \
    iproute2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

RUN npm install

# 4. Copy Application Code
COPY . .

# 5. Documentation ports (Host networking ignores this, but good for docs)
EXPOSE 8000
EXPOSE 10000-20000/udp

# 6. Start the application
CMD ["npm", "start"]
