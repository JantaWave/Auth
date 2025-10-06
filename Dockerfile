FROM node:20-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the code
COPY . .

# Expose port
EXPOSE 8000

# Start server using nodemon for dev, or node for prod
CMD ["npm", "run", "dev"]

