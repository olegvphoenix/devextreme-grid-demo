FROM node:24-slim AS client
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY angular.json tsconfig.json tsconfig.app.json ./
COPY src ./src
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS server
WORKDIR /src
COPY server ./server
RUN dotnet publish server/MockServer/MockServer.csproj -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=server /app ./
COPY --from=client /src/dist/devextreme-grid-demo ./wwwroot
ENV DOTNET_gcServer=0
EXPOSE 5080
ENTRYPOINT ["dotnet", "MockServer.dll", "--urls", "http://0.0.0.0:5080"]
