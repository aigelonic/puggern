# Dockerfile for React frontend with Yarn Berry
FROM node:latest as build

# Set working directory
WORKDIR /app

# Install Yarn
RUN npm install -g yarn

# Copy the Yarn configuration files
COPY .yarn ./.yarn
COPY .yarnrc.yml ./.yarnrc.yml
COPY package.json ./
COPY yarn.lock ./

# Install dependencies
RUN yarn install

# Copy the rest of the application
COPY . .

# Build the application
RUN yarn build

# Serve the build with Nginx
FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
