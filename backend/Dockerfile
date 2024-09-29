# --- Stage 1: Build React Frontend ---
FROM node:22-alpine AS build-frontend

# Set working directory for the frontend build
WORKDIR /build

COPY client/package.json client/yarn.lock client/.yarnrc.yml client/.yarn ./
RUN corepack enable \
    && yarn set version berry \ 
    && yarn install

# Copy the rest of the frontend code
COPY client/ .

# Build the frontend for production
RUN yarn build

# --- Stage 2: Build Python Dependencies ---
FROM python:3.12-slim AS build-deps

# Set working directory for the backend
WORKDIR /app

# Install build dependencies for Python
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# --- Stage 3: Create Final Image ---
FROM python:3.12-slim AS runtime

# Set working directory for the backend
WORKDIR /app

# Copy Python dependencies from build stage
COPY --from=build-deps /usr/local/lib/python3.12 /usr/local/lib/python3.12
COPY --from=build-deps /usr/local/bin /usr/local/bin

# Create a non-root user for security
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Copy backend code to the image
COPY api/ ./

# TODO: Investigate if the final image now contains the frontend source code

# Copy React build from Stage 1 to the Flask backend's static folder
COPY --from=build-frontend /build /app/client/build

# Change ownership to the non-root user
RUN chown -R appuser:appuser /app

# Use non-root user
USER appuser

# Set environment variables
ENV FLASK_APP=app.py
ENV FLASK_ENV=production

# Expose the Flask port
EXPOSE 5000

# Command to run the Flask app
CMD ["flask", "run", "--host=0.0.0.0"]
