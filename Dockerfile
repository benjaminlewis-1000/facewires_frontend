# Updated to modern LTS Alpine release
FROM node:22-alpine

# Create app directory
WORKDIR /app

ENV PATH /app/node_modules/.bin:$PATH

# Install app dependencies
COPY package*.json ./

RUN npm install

# Bundle app source
COPY . .

# Expose Vite's default port mapped in docker-compose
EXPOSE 3000

# Execute Vite via npm start
CMD ["npm", "start"]