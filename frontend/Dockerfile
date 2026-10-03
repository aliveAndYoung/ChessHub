# starting the build stage with a js runtime 
FROM node:22-alpine AS build

# the main working directory 
WORKDIR /app

# stating all the packages needed and their dependencies
COPY package*.json ./

# gets the exact dependency versions recorded 
RUN npm ci

# copies the source code needed
COPY . .

# buildtime and runtime variables 
ARG VITE_API_URL=http://127.0.0.1:8000
ENV VITE_API_URL=$VITE_API_URL

# builds a production ready version @/app/dist
RUN npm run build

# new build stage for nginx
FROM nginx:alpine

# getting the nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# coping the production-ready built version to the nginx's build
COPY --from=build /app/dist /usr/share/nginx/html

# exposing port 80 inside the container
EXPOSE 80

# running the mgimx app as a foreground process 
CMD ["nginx", "-g", "daemon off;"]
