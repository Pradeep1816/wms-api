# syntax=docker/dockerfile:1.7
# Use the existing Node.js runtime with Yarn for dependency management.
FROM node:20-alpine AS builder

# Add bash for better scripting capabilities
RUN apk add --no-cache bash

# Set working directory
WORKDIR /apps

# Copy necessary files for package installation
COPY package.json ./
COPY yarn.lock ./
COPY tsconfig.json ./

# Install dependencies while skipping scripts to avoid running package hooks in the image build
RUN yarn install --frozen-lockfile --ignore-scripts

# Copy the web app source code
COPY . .

# Persist the workflow-generated .env in the image, then build with it.
RUN --mount=type=secret,id=app_env,target=/tmp/app.env \
    cp /tmp/app.env /apps/.env && \
    yarn build

FROM node:20-alpine

RUN apk add --no-cache bash

WORKDIR /apps

COPY --from=builder /apps/package.json ./
COPY --from=builder /apps/yarn.lock ./
COPY --from=builder /apps/tsconfig.json ./
COPY --from=builder /apps/node_modules ./node_modules
COPY --from=builder /apps/dist ./dist
COPY --from=builder /apps/src ./src
COPY --from=builder /apps/.env ./.env

# Expose the port your app runs on
EXPOSE 3000

# Run migrations and start the built application
CMD ["sh", "-c", "yarn migration:run && yarn start:prod"]
